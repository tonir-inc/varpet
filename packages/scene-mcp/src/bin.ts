#!/usr/bin/env node
// Stdio MCP server for one agent run: Pascal's tools plus varpet's product tools, bound to VARPET_SCENE_ID.
// Env: PASCAL_DB_PATH, VARPET_SCENE_ID, VARPET_CATALOG_URL, VARPET_PUBLIC_ORIGIN; view_scene renders through
// VARPET_RENDER_URL (default <VARPET_PUBLIC_ORIGIN>/api/render; on a server use the app's loopback address) with
// VARPET_RENDER_TOKEN when set; VARPET_RENDER_URL=off drops the tool.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { createMcpCatalog } from './catalog.ts'
import { createSceneServer } from './server.ts'
import { httpRenderer, warmRenderer } from './view-scene.ts'

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

try {
  const sceneId = required('VARPET_SCENE_ID')
  required('PASCAL_DB_PATH')
  const publicOrigin = required('VARPET_PUBLIC_ORIGIN')
  const catalog = createMcpCatalog(required('VARPET_CATALOG_URL'), publicOrigin)
  const store = await createSceneStore(process.env)
  const renderUrl = process.env.VARPET_RENDER_URL ?? `${publicOrigin.replace(/\/$/, '')}/api/render`
  const renderToken = process.env.VARPET_RENDER_TOKEN || undefined
  const render = renderUrl === 'off' ? undefined : httpRenderer(renderUrl, { token: renderToken })
  const { server } = await createSceneServer({ store, sceneId, catalog, publicOrigin, render })
  await server.connect(new StdioServerTransport())
  console.error(`[varpet-scene-mcp] bound to scene ${sceneId}`)
  if (render) warmRenderer(renderUrl, renderToken)
} catch (error) {
  console.error('[varpet-scene-mcp] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
}
