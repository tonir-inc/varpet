import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneBridge } from './bridge/scene-bridge'
import { createSceneOperations, type SceneOperations } from './operations'
import { registerPrompts } from './prompts'
import { registerResources } from './resources'
import type { SceneStore } from './storage/types'
import { registerTools } from './tools'
import { normalizeToolSchemaDialect } from './tools/normalize-schema-dialect'
import { registerVisionTools } from './tools/vision'
import { version } from './version'

export type PascalMcpToolExecutor = <Result>(input: {
  name: string
  signal: AbortSignal
  execute: () => Promise<Result>
}) => Promise<Result>

export type CreatePascalMcpServerOptions = {
  bridge: SceneBridge
  operations?: SceneOperations
  /** Required for persistence tools. Hosted apps and CLIs inject their own store. */
  store?: SceneStore
  name?: string
  version?: string
  /**
   * Wrap every regular tool handler, including callback updates.
   * Tool renames fail closed because the SDK registration lifecycle cannot safely rename twice.
   * Experimental task-based tool registrations are outside this hook.
   */
  executeTool?: PascalMcpToolExecutor
  /**
   * Built-in tools to leave out (e.g. scene lifecycle tools for a server bound to one scene).
   * Unknown names are ignored. A host tool registered through `registerHostTools` may reuse a hidden name.
   */
  hiddenTools?: readonly string[]
  /**
   * Register the host's own tools on the same server, after Pascal's built-ins and with the same
   * operations, so they share `executeTool` wrapping and the tools/list schema normalisation.
   */
  registerHostTools?: (server: McpServer, operations: SceneOperations) => void
}

export function createPascalMcpServer(opts: CreatePascalMcpServerOptions): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'pascal-mcp-server',
    version: opts.version ?? version,
  })
  if (opts.executeTool) installToolExecutor(server, opts.executeTool)
  const operations =
    opts.operations ?? createSceneOperations({ bridge: opts.bridge, store: opts.store })
  const builtins = captureToolRegistrations(server, () => {
    registerTools(server, operations)
    registerVisionTools(server, operations)
  })
  for (const name of opts.hiddenTools ?? []) builtins.get(name)?.remove()
  registerResources(server, operations)
  registerPrompts(server, operations)
  opts.registerHostTools?.(server, operations)
  normalizeToolSchemaDialect(server)
  return server
}

/** Runs `register` and returns every tool it registered (through `registerTool` or `tool`), by name. */
function captureToolRegistrations(
  server: McpServer,
  register: () => void,
): Map<string, RegisteredTool> {
  const registered = new Map<string, RegisteredTool>()
  const registerTool = server.registerTool
  const tool = server.tool
  server.registerTool = ((name: string, ...args: unknown[]) => {
    const registration = Reflect.apply(registerTool, server, [name, ...args]) as RegisteredTool
    registered.set(name, registration)
    return registration
  }) as McpServer['registerTool']
  server.tool = ((name: string, ...args: unknown[]) => {
    const registration = Reflect.apply(tool, server, [name, ...args]) as RegisteredTool
    registered.set(name, registration)
    return registration
  }) as McpServer['tool']
  try {
    register()
  } finally {
    server.registerTool = registerTool
    server.tool = tool
  }
  return registered
}

function installToolExecutor(server: McpServer, executeTool: PascalMcpToolExecutor): void {
  const registerTool = server.registerTool.bind(server)
  const wrappedRegisterTool: McpServer['registerTool'] = (name, config, callback) => {
    const runtimeCallback = callback as unknown as RuntimeToolCallback
    const registration = registerTool(
      name,
      config,
      wrapToolCallback(name, runtimeCallback, executeTool) as typeof callback,
    )
    return wrapRegisteredTool(registration, name, runtimeCallback, executeTool)
  }
  server.registerTool = wrappedRegisterTool

  const tool = server.tool.bind(server)
  server.tool = ((name: string, ...args: unknown[]) => {
    const callback = args.at(-1)
    if (typeof callback !== 'function') {
      return Reflect.apply(tool, undefined, [name, ...args])
    }
    const runtimeCallback = callback as RuntimeToolCallback
    args[args.length - 1] = wrapToolCallback(name, runtimeCallback, executeTool)
    const registration = Reflect.apply(tool, undefined, [name, ...args]) as RegisteredTool
    return wrapRegisteredTool(registration, name, runtimeCallback, executeTool)
  }) as McpServer['tool']
}

type RuntimeToolCallback = (...args: unknown[]) => unknown

function wrapToolCallback(
  name: string,
  callback: RuntimeToolCallback,
  executeTool: PascalMcpToolExecutor,
): RuntimeToolCallback {
  return (...args) =>
    executeTool({
      name,
      signal: toolRequestSignal(args),
      execute: () => Promise.resolve(Reflect.apply(callback, undefined, args)),
    })
}

function wrapRegisteredTool(
  registration: RegisteredTool,
  initialName: string,
  initialCallback: RuntimeToolCallback,
  executeTool: PascalMcpToolExecutor,
): RegisteredTool {
  let currentCallback = initialCallback
  const update = registration.update.bind(registration) as (
    updates: Record<string, unknown>,
  ) => void
  registration.update = ((updates: Record<string, unknown>) => {
    if (typeof updates.name === 'string') {
      throw new Error('MCP tool renaming is unsupported when executeTool is configured')
    }
    const callbackUpdate = updates.callback
    if (typeof callbackUpdate === 'function') {
      currentCallback = callbackUpdate as RuntimeToolCallback
    }
    update({
      ...updates,
      ...(typeof callbackUpdate === 'function'
        ? { callback: wrapToolCallback(initialName, currentCallback, executeTool) }
        : {}),
    })
  }) as RegisteredTool['update']
  return registration
}

function toolRequestSignal(args: readonly unknown[]): AbortSignal {
  return (args.at(-1) as { signal: AbortSignal }).signal
}
