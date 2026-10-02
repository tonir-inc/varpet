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
import { httpModelBounds, type Bounds, type ModelBounds } from './model-bounds.ts'
import { ceilingPose, defaultWallBottom, MOUNTS, nearestWall, wallPose, windowHang, type Mount } from './mount.ts'

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
  /** Reads a model's box so hung pieces sit right whatever their origin (default: fetch the GLB). */
  modelBounds?: ModelBounds
}

/** Load the scene, bind Pascal's operations to it and build the server. Throws when the scene does not exist. */
export async function createSceneServer({ store, sceneId, catalog, publicOrigin, render, modelBounds = httpModelBounds() }: SceneServerOptions): Promise<{
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
  const server = createPascalMcpServer({
    bridge,
    store,
    operations,
    name: 'varpet-scene',
    hiddenTools: HIDDEN_TOOLS,
    registerHostTools: (host) => {
      registerProductTools(host, operations, catalog, modelBounds)
      registerFinishTools(host, operations, publishSnapshot)
      if (render) registerViewSceneTool(host, operations, render)
    },
  })
  return { server, operations }
}

let finishesRegistered = false
/** varpet's own finishes as Pascal library materials, so `library:varpet-*` refs resolve outside the browser too. */
function registerVarpetFinishes(origin = '') {
  if (finishesRegistered) return
  finishesRegistered = true
  registerLibraryMaterials(finishMaterialItems(origin) as never)
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

/** How place_product hangs a piece: Pascal's wall-side pose (on a face, in the wall's frame) or under a ceiling. */
export type ItemMounting = (
  | { attachTo: 'wall-side'; wallId: string; side: 'front' | 'back'; wallT: number }
  | { attachTo: 'ceiling' }
) & { bounds?: Bounds | null }

/**
 * The model offset that puts a hung piece where Pascal expects it: a wall-side piece spans z 0..d from the wall face
 * (back on the wall), a ceiling piece y 0..h up to the ceiling, both centred. From the model's measured box; without
 * one, catalog models are assumed to stand centred on their origin.
 */
export function mountOffset(mounting: ItemMounting, depth: number): [number, number, number] {
  const r = (v: number) => Math.round(v * 1000) / 1000 || 0
  const b = mounting.bounds
  if (!b) return [0, 0, mounting.attachTo === 'wall-side' ? r(depth / 2) : 0]
  const cx = -(b.min[0] + b.max[0]) / 2
  const cz = mounting.attachTo === 'wall-side' ? -b.min[2] : -(b.min[2] + b.max[2]) / 2
  return [r(cx), r(-b.min[1]), r(cz)]
}

/**
 * The item node place_product writes: the product's model at its real size, with what a quote needs. Mounted
 * pieces carry Pascal's `asset.attachTo` so the editor moves them along their wall or ceiling; catalog models are
 * centred in depth, so a wall piece's model is pushed out by half its depth to put its back on the wall face
 * (Pascal's wall-side box spans z 0..d from the face).
 */
export function productItemNode(
  product: ProductHit,
  position: [number, number, number],
  rotationY: number,
  mounting?: ItemMounting,
) {
  const depth = product.dimensions[2]
  return ItemNode.parse({
    name: product.name,
    position,
    rotation: [0, rotationY, 0],
    ...(mounting?.attachTo === 'wall-side' ? { wallId: mounting.wallId, wallT: mounting.wallT, side: mounting.side } : {}),
    asset: {
      id: product.id,
      category: product.kind,
      name: product.name,
      thumbnail: product.thumbnailUrl ?? '',
      src: product.glbUrl,
      dimensions: product.dimensions,
      // Catalog models are floor-centred, in metres, Y up.
      offset: mounting ? mountOffset(mounting, depth) : [0, 0, 0],
      ...(mounting ? { attachTo: mounting.attachTo } : {}),
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

function registerProductTools(server: McpServer, operations: SceneOperations, catalog: Catalog, modelBounds: ModelBounds) {
  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description:
        'Search the whole catalog of real, purchasable products. kind, max sizes, min sizes and price_max are hard ' +
        'filters; text, colors, styles, materials and target_size rank. Sizes are in metres; max_w/max_d/max_h allow ' +
        'rotation, min_w/min_d/min_h are the piece\'s own width, depth, height (a 1.2 m wide wall needs art with ' +
        'min_w ~0.8). Each result has dimensions [width, height, depth], priceAmd, shop, mount (floor | surface | ' +
        'wall | ceiling: how it goes up; place_product hangs wall and ceiling pieces) and flags when something is ' +
        'known to be off (size_conflict, model_sideways, no_price). Up to 20 per page; use offset/nextOffset. Kinds ' +
        'include bed, nightstand, wardrobe, dresser, sofa, chair, table, desk, cabinet, shelf, rug, lamp (floor, ' +
        'table and wall lamps), light (pendants, chandeliers, ceiling and wall lights), wall_art, mirror, clock, ' +
        'wall_hanging, curtain, blind, tv, plant, decor.',
      inputSchema: {
        text: z.string().optional().describe('Free text, e.g. "oak double bed low headboard".'),
        kind: z.string().optional(),
        colors: z.array(z.string()).optional(),
        styles: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        max_w: z.number().positive().optional(),
        max_d: z.number().positive().optional(),
        max_h: z.number().positive().optional(),
        min_w: z.number().positive().optional(),
        min_d: z.number().positive().optional(),
        min_h: z.number().positive().optional(),
        target_size: z
          .array(z.number().positive())
          .min(3)
          .max(3)
          .optional()
          .describe('[width, height, depth] in metres, the size you want; closer sizes rank higher (art: a thin depth like 0.04).'),
        price_max: z.number().int().positive().optional().describe('AMD'),
        exclude_ids: z.array(z.string()).optional(),
        room_items: z.array(z.string()).optional().describe('Product ids already in the flat, to match their look.'),
        limit: z.number().int().min(1).max(20).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ target_size, ...query }) => {
      try {
        const found = await catalog.search({
          ...query,
          ...(target_size ? { targetSize: target_size as [number, number, number] } : {}),
          limit: query.limit ?? 8,
        })
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
      description:
        'One catalog product by id: name, kind, dimensions [width, height, depth] in metres, priceAmd, shop, mount ' +
        '(floor | surface | wall | ceiling) and flags.',
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
        'Place a real catalog product, mounted the way it goes up (the product\'s mount, or `mount` to override, ' +
        'e.g. a TV on a wall or a leaning mirror on the floor). ' +
        'Floor and surface pieces: target_id is a level, zone (room) or slab; position is the footprint centre ' +
        '[x, y, z] in level coordinates, metres, y = 0 on the floor (a surface piece: y = the top of what it stands ' +
        'on); rotation is about the vertical axis in radians, at 0 width along x and the front facing +z; ' +
        'rotation = atan2(dx, dz) turns the front toward (dx, dz). ' +
        'Wall pieces (art, mirrors, wall lamps, wall shelves, curtains, blinds) hang on a wall face, back on the ' +
        'wall, facing the room: give wall_id with along (metres from the wall\'s start to the piece\'s centre) and ' +
        'height (bottom edge above the floor), or just position = a point in the room by the wall (y = bottom edge) ' +
        'and it snaps to the nearest wall; target_id = the zone picks the room side; window_id (or a window as ' +
        'target_id) centres curtains and blinds on that window at a sensible height. Without a height art and ' +
        'mirrors centre near 1.5 m. ' +
        'Ceiling pieces (pendants, chandeliers, ceiling lights) hang from the room\'s ceiling, top at the ceiling: ' +
        'position = the floor point under it (y ignored), or a zone alone for its middle. ' +
        'Returns the item id, its footprint or wall/ceiling pose, and notes (clamped, covers a window, hangs low). ' +
        'Move a floor piece with apply_patch; re-place a hung piece (delete_node, then place_product) to move it.',
      inputSchema: {
        product_id: z.string().min(1),
        target_id: z.string().min(1).optional().describe('Level, zone or slab; for hung pieces also a wall, window or ceiling id.'),
        position: vec3.optional(),
        rotation: z.number().optional(),
        mount: z.enum(MOUNTS).optional().describe("Override the product's mount."),
        wall_id: z.string().min(1).optional(),
        along: z.number().optional().describe("Wall pieces: metres from the wall's start to the piece's centre."),
        height: z.number().optional().describe('Wall pieces: bottom edge above the floor, metres.'),
        window_id: z.string().min(1).optional().describe('Curtains and blinds: the window to hang over.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const { product_id, target_id, position, rotation } = args
      const target = target_id ? (operations.getNode(target_id as never) as unknown as AnyNode | null) : null
      if (target_id && !target) return failure(`target_not_found: ${target_id}`)
      let product: ProductHit | null
      try {
        product = await catalog.get(product_id)
      } catch (error) {
        return failure(`catalog_unavailable: ${String(error)}`)
      }
      if (!product) return failure(`product_not_found: ${product_id}`)
      const mount: Mount = args.mount ?? product.mount
      const placed = { productId: product.id, name: product.name, dimensions: product.dimensions, priceAmd: product.priceAmd, shop: product.shop, mount }
      const flags = product.flags?.length ? { flags: product.flags } : {}

      if (mount === 'floor' || mount === 'surface') {
        if (!target) return failure('target_required: a floor or surface piece needs target_id (a level, zone or slab)')
        if (!['level', 'zone', 'slab'].includes(target.type)) {
          return failure(`bad_target: ${target_id} is a ${target.type}; use a level, zone or slab (or mount: 'wall' / 'ceiling')`)
        }
        if (!position) return failure('position_required: a floor or surface piece needs position [x, y, z]')
        const levelId = target.type === 'level' ? target_id : operations.resolveLevelId(target_id as never)
        if (!levelId) return failure(`no_level_for_target: ${target_id}`)
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
          ...placed,
          footprint: { x: round(w * cos + d * sin), z: round(w * sin + d * cos), center: [position[0], position[2]] },
          ...flags,
        })
      }

      const nodes = operations.getNodes() as unknown as Record<string, AnyNode>
      const point = position ? ([position[0], position[2]] as [number, number]) : undefined
      const zone = target?.type === 'zone' ? target : point ? zoneAt(nodes, point) : null
      const levelOfTarget = () => {
        if (target) return target.type === 'level' ? target.id : (operations.resolveLevelId(target.id as never) as string | null)
        return (operations.findNodes({ type: 'level' })[0]?.id as string | undefined) ?? null
      }

      if (mount === 'wall') {
        const windowNode = args.window_id ? nodes[args.window_id] : target?.type === 'window' ? target : null
        if (args.window_id && !windowNode) return failure(`window_not_found: ${args.window_id}`)
        if (windowNode && windowNode.type !== 'window') return failure(`bad_window: ${windowNode.id} is a ${windowNode.type}`)
        let wall = args.wall_id ? nodes[args.wall_id] : target?.type === 'wall' ? target : windowNode?.parentId ? nodes[windowNode.parentId] : null
        if (args.wall_id && !wall) return failure(`wall_not_found: ${args.wall_id}`)
        if (wall && wall.type !== 'wall') return failure(`bad_wall: ${wall.id} is a ${wall.type}`)
        const notes: string[] = []
        if (!wall) {
          if (!point) return failure('wall_required: give wall_id (with along and height), window_id, or position near the wall')
          const levelId = levelOfTarget()
          const hit = levelId ? nearestWall(nodes, levelId, point, zone) : null
          if (!hit) return failure(`no_wall_near: no wall${zone ? ` of ${zone.id}` : ''} near (${point[0]}, ${point[1]})`)
          wall = hit.wall
          if (hit.distance > 0.6) notes.push(`snapped ${round(hit.distance)} m to wall ${wall.id}`)
        }
        const size = product.dimensions
        let along = args.along
        let bottom = args.height ?? (position && !windowNode ? position[1] : undefined)
        if (windowNode) {
          const hang = windowHang(windowNode, wall, product, size)
          along ??= hang.along
          bottom ??= hang.bottom
          notes.push(...hang.notes)
        }
        bottom ??= defaultWallBottom(product.kind, product.name, size, (wall.height as number | undefined) ?? 2.5)
        const textile = product.kind === 'curtain' || product.kind === 'blind'
        const pose = wallPose(nodes, wall, { along, bottom, point: windowNode ? undefined : point, zone, size, coversOpening: windowNode?.id, windowsAllowed: textile })
        if ('error' in pose) return failure(pose.error)
        if (rotation) notes.push('rotation ignored: a wall piece faces the room')
        const bounds = await modelBounds(product.glbUrl)
        const node = productItemNode(product, pose.position, pose.rotationY, { attachTo: 'wall-side', wallId: pose.wallId, side: pose.side, wallT: pose.wallT, bounds })
        const itemId = operations.createNode(node as never, pose.wallId as never)
        await publishSnapshot(operations, 'place_product')
        return text({
          itemId,
          levelId: operations.resolveLevelId(pose.wallId as never),
          ...placed,
          wall: { id: pose.wallId, side: pose.side, along: pose.along, bottom: pose.bottom, top: pose.top, facing: pose.facing },
          center: pose.center,
          ...flags,
          ...(notes.length + pose.notes.length ? { notes: [...notes, ...pose.notes] } : {}),
        })
      }

      // ceiling
      const levelId = levelOfTarget()
      if (!levelId) return failure('no_level: pass target_id (a zone or ceiling)')
      if (target && !['level', 'zone', 'slab', 'ceiling'].includes(target.type)) {
        return failure(`bad_target: ${target_id} is a ${target.type}; a ceiling piece takes a zone, ceiling or level`)
      }
      if (!point && !zone && target?.type !== 'ceiling') return failure('position_required: give position (the floor point under it) or a zone')
      // The model's own height (Amazon lights include the cord or chain) decides how low it hangs.
      const bounds = await modelBounds(product.glbUrl)
      const [w, catalogHeight, d] = product.dimensions
      const height = bounds ? Math.round((bounds.max[1] - bounds.min[1]) * 1000) / 1000 : catalogHeight
      const pose = ceilingPose(nodes, levelId, point ?? null, zone, [w, height, d], target?.type === 'ceiling' ? target.id : undefined)
      if ('error' in pose) return failure(pose.error)
      const node = productItemNode(product, pose.position, rotation ?? 0, { attachTo: 'ceiling', bounds })
      const itemId = operations.createNode(node as never, pose.ceilingId as never)
      await publishSnapshot(operations, 'place_product')
      return text({
        itemId,
        levelId,
        ...placed,
        ceiling: { id: pose.ceilingId, height: pose.ceilingHeight },
        bottom: pose.bottom,
        center: [pose.position[0], round(pose.bottom + height / 2), pose.position[2]],
        ...flags,
        ...(pose.notes.length ? { notes: pose.notes } : {}),
      })
    },
  )
}

type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }

const OUTDOOR = /balcon|loggia|terrace|patio/i

/** The room a floor point is in, indoor rooms first. */
function zoneAt(nodes: Record<string, AnyNode>, [x, z]: [number, number]): AnyNode | null {
  const inside = Object.values(nodes).filter((n) => {
    if (n.type !== 'zone' || !Array.isArray(n.polygon)) return false
    const polygon = n.polygon as Array<[number, number]>
    let hit = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i]!
      const [xj, zj] = polygon[j]!
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
    }
    return hit
  })
  return inside.find((n) => !OUTDOOR.test(String(n.name ?? ''))) ?? inside[0] ?? null
}

const round = (value: number) => Math.round(value * 1000) / 1000
