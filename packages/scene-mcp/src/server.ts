// Pascal's MCP server bound to one stored scene, plus varpet's product and finish tools.
// SceneBridge must load before any other @pascal-app import: it installs the requestAnimationFrame shim core needs.
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createPascalMcpServer } from '@pascal-app/mcp/server'
import { createSceneOperations, type SceneOperations } from '@pascal-app/mcp/operations'
import type { SceneStore } from '@pascal-app/mcp/storage'
import { ItemNode } from '@pascal-app/core/schema'
import { registerLibraryMaterials } from '@pascal-app/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Catalog, ProductHit } from './catalog.ts'
import { finishMaterialItems } from '../../contracts/src/finishes.ts'
import { registerFinishTools } from './finishes.ts'
import { registerViewSceneTool, type Renderer } from './view-scene.ts'

/** Tools that would rebind or delete scenes. The agent is bound to one scene for its whole run. */
export const HIDDEN_TOOLS = [
  'load_scene',
  'save_scene',
  'delete_scene',
  'rename_scene',
  'list_scenes',
  'create_project',
  'get_project_status',
] as const

/** Pascal's built-in demo catalog: reachable, but not purchasable; the prompts steer agents to place_product. */
export const BUILTIN_CATALOG_TOOLS = ['place_item', 'search_assets', 'furnish_room'] as const

/** Our tools, added next to Pascal's. */
export const PRODUCT_TOOLS = ['search_products', 'get_product', 'show_products', 'place_product'] as const

export { FINISH_TOOLS } from './finishes.ts'

/** The agent's eyes: renders of its own work scene (needs a renderer, see view-scene.ts). */
export const VIEW_TOOLS = ['view_scene'] as const

export interface SceneServerOptions {
  store: SceneStore
  sceneId: string
  catalog: Catalog
  /** Makes varpet's finish textures absolute here (VARPET_PUBLIC_ORIGIN); without it they stay origin-relative. */
  publicOrigin?: string
  /** Draws the work scene for view_scene (the web app's POST /api/render); without it the tool is not offered. */
  render?: Renderer
}

/** Load the scene, bind Pascal's operations to it and build the server. Throws when the scene does not exist. */
export async function createSceneServer({ store, sceneId, catalog, publicOrigin, render }: SceneServerOptions): Promise<{
  server: McpServer
  operations: SceneOperations
}> {
  const scene = await store.load(sceneId)
  if (!scene) throw new Error(`scene_not_found: ${sceneId}`)
  const bridge = new SceneBridge()
  const operations = createSceneOperations({ bridge, store })
  registerVarpetFinishes(publicOrigin)
  operations.loadJSON(scene.graph)
  operations.clearHistory()
  operations.setActiveScene(scene)
  const server = createPascalMcpServer({ bridge, store, operations, name: 'varpet-scene' })
  hideTools(server, HIDDEN_TOOLS)
  registerProductTools(server, operations, catalog)
  registerFinishTools(server, operations, publishSnapshot)
  if (render) registerViewSceneTool(server, operations, render)
  return { server, operations }
}

let finishesRegistered = false
/** varpet's own finishes as Pascal library materials, so `library:varpet-*` refs resolve outside the browser too. */
function registerVarpetFinishes(origin = '') {
  if (finishesRegistered) return
  finishesRegistered = true
  registerLibraryMaterials(finishMaterialItems(origin) as never)
}

function hideTools(server: McpServer, names: readonly string[]) {
  const registered = (server as unknown as { _registeredTools: Record<string, { remove(): void }> })._registeredTools
  for (const name of names) registered?.[name]?.remove()
}

/**
 * Persist the bound scene and append a live event so open editors update. Mirrors Pascal's
 * publishLiveSceneSnapshot (not exported in @pascal-app/mcp 1.0.3).
 */
export async function publishSnapshot(operations: SceneOperations, kind: string) {
  const active = operations.getActiveScene()
  if (!active) throw new Error('scene_unbound')
  const graph = operations.exportSceneGraph()
  const meta = await operations.saveScene({
    id: active.id,
    name: active.name,
    projectId: active.projectId,
    ownerId: active.ownerId,
    thumbnailUrl: active.thumbnailUrl,
    graph,
    expectedVersion: active.version,
    saveMode: 'draft',
    publish: false,
    operation: kind,
  })
  operations.setActiveScene(meta)
  await operations.appendSceneEvent({ sceneId: meta.id, version: meta.version, kind, graph })
  return meta
}

/** The item node place_product writes: the product's model at its real size, with what a quote needs. */
export function productItemNode(
  product: ProductHit,
  position: [number, number, number],
  rotationY: number,
) {
  return ItemNode.parse({
    name: product.name,
    position,
    rotation: [0, rotationY, 0],
    asset: {
      id: product.id,
      category: product.kind,
      name: product.name,
      thumbnail: product.thumbnailUrl ?? '',
      src: product.glbUrl,
      dimensions: product.dimensions,
      // Catalog models are floor-centred, in metres, Y up.
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      tags: [product.kind],
    },
    metadata: { productId: product.id, priceAmd: product.priceAmd, shop: product.shop },
  })
}

const vec3 = z.array(z.number()).min(3).max(3)

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function registerProductTools(server: McpServer, operations: SceneOperations, catalog: Catalog) {
  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description:
        'Search the catalog of real, purchasable furniture. kind, max sizes and price_max are hard filters; text, colors, ' +
        'styles and materials rank. Sizes are in metres; max_w/max_d/max_h allow rotation. Each result has ' +
        'dimensions [width, height, depth] in metres, priceAmd and shop. Up to 20 per page; use offset/nextOffset. ' +
        'Kinds include bed, nightstand, wardrobe, dresser, sofa, chair, table, desk, cabinet, shelf, rug, lamp.',
      inputSchema: {
        text: z.string().optional().describe('Free text, e.g. "oak double bed low headboard".'),
        kind: z.string().optional(),
        colors: z.array(z.string()).optional(),
        styles: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        max_w: z.number().positive().optional(),
        max_d: z.number().positive().optional(),
        max_h: z.number().positive().optional(),
        price_max: z.number().int().positive().optional().describe('AMD'),
        exclude_ids: z.array(z.string()).optional(),
        room_items: z.array(z.string()).optional().describe('Product ids already in the flat, to match their look.'),
        limit: z.number().int().min(1).max(20).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (query) => {
      try {
        const found = await catalog.search({ ...query, limit: query.limit ?? 8 })
        return text({
          ...found,
          results: found.results.map(({ glbUrl: _glb, thumbnailUrl: _thumb, ...rest }) => rest),
        })
      } catch (error) {
        return failure(`catalog_unavailable: ${String(error)}`)
      }
    },
  )

  server.registerTool(
    'get_product',
    {
      title: 'Get product',
      description: 'One catalog product by id: name, kind, dimensions [width, height, depth] in metres, priceAmd, shop.',
      inputSchema: { product_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ product_id }) => {
      try {
        const product = await catalog.get(product_id)
        return product ? text(product) : failure(`product_not_found: ${product_id}`)
      } catch (error) {
        return failure(`catalog_unavailable: ${String(error)}`)
      }
    },
  )

  if (catalog.show) {
    const show = catalog.show.bind(catalog)
    server.registerTool(
      'show_products',
      {
        title: 'Show products',
        description:
          'Look before choosing: one numbered image of the exact 3D models of up to 16 products, with a legend. ' +
          'Use it on your shortlist to judge shape, colour and visual weight; reject broken or unsuitable models.',
        inputSchema: { product_ids: z.array(z.string()).min(1).max(16) },
        annotations: { readOnlyHint: true },
      },
      async ({ product_ids }) => {
        try {
          return { content: await show(product_ids) }
        } catch (error) {
          return failure(`catalog_unavailable: ${String(error)}`)
        }
      },
    )
  }

  server.registerTool(
    'place_product',
    {
      title: 'Place product',
      description:
        'Place a real catalog product on the floor. target_id is a level, zone (room) or slab id. position is the ' +
        'footprint centre [x, y, z] in level coordinates, metres, y = 0 on the floor. rotation is about the vertical ' +
        'axis in radians; at 0 the product is width along x and depth along z, its front facing +z; ' +
        'rotation = atan2(dx, dz) turns the front toward direction (dx, dz). Returns the new ' +
        'item id and its footprint. Move or turn it later with apply_patch, remove it with delete_node.',
      inputSchema: {
        product_id: z.string().min(1),
        target_id: z.string().min(1),
        position: vec3,
        rotation: z.number().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ product_id, target_id, position, rotation }) => {
      const target = operations.getNode(target_id as never)
      if (!target) return failure(`target_not_found: ${target_id}`)
      if (!['level', 'zone', 'slab'].includes(target.type)) {
        return failure(`bad_target: ${target_id} is a ${target.type}; use a level, zone or slab`)
      }
      const levelId = target.type === 'level' ? target_id : operations.resolveLevelId(target_id as never)
      if (!levelId) return failure(`no_level_for_target: ${target_id}`)
      let product: ProductHit | null
      try {
        product = await catalog.get(product_id)
      } catch (error) {
        return failure(`catalog_unavailable: ${String(error)}`)
      }
      if (!product) return failure(`product_not_found: ${product_id}`)
      const angle = rotation ?? 0
      const node = productItemNode(product, position as [number, number, number], angle)
      const itemId = operations.createNode(node as never, levelId as never)
      await publishSnapshot(operations, 'place_product')
      const [w, , d] = product.dimensions
      const cos = Math.abs(Math.cos(angle))
      const sin = Math.abs(Math.sin(angle))
      return text({
        itemId,
        levelId,
        productId: product.id,
        name: product.name,
        dimensions: product.dimensions,
        priceAmd: product.priceAmd,
        shop: product.shop,
        footprint: {
          x: round(w * cos + d * sin),
          z: round(w * sin + d * cos),
          center: [position[0], position[2]],
        },
      })
    },
  )
}

const round = (value: number) => Math.round(value * 1000) / 1000
