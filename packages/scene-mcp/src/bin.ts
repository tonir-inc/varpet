#!/usr/bin/env node
// Stdio MCP server for one agent run: Pascal's tools plus varpet's product tools, bound to VARPET_SCENE_ID.
// Env: PASCAL_DB_PATH, VARPET_SCENE_ID, VARPET_CATALOG_URL, VARPET_PUBLIC_ORIGIN.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { createMcpCatalog } from './catalog.ts'
import { createSceneServer } from './server.ts'

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

try {
  const sceneId = required('VARPET_SCENE_ID')
  required('PASCAL_DB_PATH')
  const catalog = createMcpCatalog(required('VARPET_CATALOG_URL'), required('VARPET_PUBLIC_ORIGIN'))
  const store = await createSceneStore(process.env)
  const { server } = await createSceneServer({ store, sceneId, catalog })
  await server.connect(new StdioServerTransport())
  console.error(`[varpet-scene-mcp] bound to scene ${sceneId}`)
} catch (error) {
  console.error('[varpet-scene-mcp] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
}
