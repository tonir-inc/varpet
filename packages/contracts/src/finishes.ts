// Every finish a wall or a floor can take, shared by the web app (registers varpet's own finishes with Pascal so
// their ids resolve in the browser) and the scene MCP (list_finishes, set_wall_finish, set_floor_finish).
// A finish id is a Pascal material-library id; walls and slabs store it as `library:<id>` in their slots.
// No imports: the scene MCP loads this file directly under node --experimental-strip-types.

export type FinishFamily = 'paint' | 'wood' | 'stone' | 'tile' | 'brick' | 'concrete' | 'wallpaper'
export type FinishSurface = 'wall' | 'floor'

export interface Finish {
  /** Pascal material-library id, e.g. `preset-forest`, `varpet-oak`. */
  id: string
  /** What a wall or slab slot stores: `library:<id>`. */
  ref: string
  label: string
  family: FinishFamily
  /** Surfaces it suits. Any finish renders anywhere; this is advice. */
  surfaces: FinishSurface[]
  /** Representative colour (#rrggbb). */
  color: string
  /** Swatch image: absolute for Pascal's CDN, origin-relative (`/finishes/...`) for varpet's; null for paint. */
  preview: string | null
  keywords: string[]
  /** `pascal`: built into Pascal's library. `varpet`: registered by us (see finishMaterialItems). */
  source: 'pascal' | 'varpet'
}

/** Where Pascal's viewer loads its library textures from (NEXT_PUBLIC_ASSETS_CDN_URL default). */
export const PASCAL_ASSET_ORIGIN = 'https://editor.pascal.app'
export const LIBRARY_PREFIX = 'library:'

type Row = [id: string, label: string, family: FinishFamily, surfaces: FinishSurface[], color: string, keywords?: string]
const W: FinishSurface[] = ['wall']
const F: FinishSurface[] = ['floor']
const WF: FinishSurface[] = ['wall', 'floor']

/** Pascal's paint presets (flat colours, matte). */
const PASCAL_PAINTS: Row[] = [
  ['preset-white', 'White', 'paint', W, '#e9e9e9', 'neutral'],
  ['preset-softwhite', 'Soft white', 'paint', W, '#ebe7df', 'neutral warm default'],
  ['preset-cream', 'Cream', 'paint', W, '#efe3cc', 'neutral warm'],
  ['preset-beige', 'Beige', 'paint', W, '#d9c7ad', 'neutral warm'],
  ['preset-lightgrey', 'Light grey', 'paint', W, '#d8d6d1', 'neutral gray'],
  ['preset-greige', 'Greige', 'paint', W, '#c8c1b8', 'neutral gray'],
  ['preset-midgrey', 'Mid grey', 'paint', W, '#8b8a86', 'gray'],
  ['preset-charcoal', 'Charcoal', 'paint', W, '#4e5257', 'dark gray'],
  ['preset-nearblack', 'Near-black', 'paint', W, '#232322', 'dark black'],
  ['preset-blush', 'Blush', 'paint', W, '#e8c6c0', 'pink pale'],
  ['preset-tomato', 'Tomato', 'paint', W, '#c0594f', 'red'],
  ['preset-brickred', 'Brick red', 'paint', W, '#9e3b34', 'red'],
  ['preset-oxblood', 'Oxblood', 'paint', W, '#6f2c2a', 'red dark burgundy'],
  ['preset-peach', 'Peach', 'paint', W, '#f0c3a0', 'orange pale'],
  ['preset-terracotta', 'Terracotta', 'paint', W, '#c86f4c', 'orange earthy'],
  ['preset-burntorange', 'Burnt orange', 'paint', W, '#b25a2c', 'orange'],
  ['preset-clay', 'Clay', 'paint', W, '#8f4a2e', 'brown orange earthy'],
  ['preset-paleyellow', 'Pale yellow', 'paint', W, '#f2e3b3', 'yellow'],
  ['preset-mustard', 'Mustard', 'paint', W, '#c8a449', 'yellow'],
  ['preset-ochre', 'Ochre', 'paint', W, '#b8852f', 'yellow earthy'],
  ['preset-gold', 'Gold', 'paint', W, '#9c7320', 'yellow'],
  ['preset-mint', 'Mint', 'paint', W, '#cfe0cf', 'green pale'],
  ['preset-sage', 'Sage', 'paint', W, '#bcc5b2', 'green muted'],
  ['preset-olive', 'Olive', 'paint', W, '#8d9368', 'green'],
  ['preset-forest', 'Forest', 'paint', W, '#4f6b57', 'green deep muted'],
  ['preset-paleteal', 'Pale teal', 'paint', W, '#b9d2cf', 'teal blue green pale'],
  ['preset-teal', 'Teal', 'paint', W, '#4f8a86', 'teal blue green'],
  ['preset-deepteal', 'Deep teal', 'paint', W, '#2f5f5c', 'teal blue green deep dark'],
  ['preset-powderblue', 'Powder blue', 'paint', W, '#cddce8', 'blue pale'],
  ['preset-softblue', 'Soft blue', 'paint', W, '#c7d6e3', 'blue pale'],
  ['preset-sky', 'Sky', 'paint', W, '#8fb4d4', 'blue'],
  ['preset-slateblue', 'Slate blue', 'paint', W, '#6f87a4', 'blue gray'],
  ['preset-royalblue', 'Royal blue', 'paint', W, '#3a5a9c', 'blue strong'],
  ['preset-navy', 'Navy', 'paint', W, '#2f4865', 'blue dark deep'],
  ['preset-lavender', 'Lavender', 'paint', W, '#c9c2da', 'purple pale'],
  ['preset-plum', 'Plum', 'paint', W, '#6d4a63', 'purple deep'],
  ['preset-aubergine', 'Aubergine', 'paint', W, '#594354', 'purple dark'],
  ['preset-petal', 'Petal', 'paint', W, '#f0d3da', 'pink pale'],
  ['preset-rose', 'Rose', 'paint', W, '#cf8fa6', 'pink'],
  ['preset-dustyrose', 'Dusty rose', 'paint', W, '#c48a8d', 'pink muted'],
  ['preset-berry', 'Berry', 'paint', W, '#8f4a5a', 'pink red deep'],
  ['preset-sand', 'Sand', 'paint', W, '#ddccae', 'neutral warm'],
  ['preset-tan', 'Tan', 'paint', W, '#c4a87f', 'brown warm'],
  ['preset-taupe', 'Taupe', 'paint', W, '#8f7a64', 'brown'],
  ['preset-espresso', 'Espresso', 'paint', W, '#4a382c', 'brown dark'],
]

/** Strong colours Pascal's presets lack; registered by us like the v1 finishes. */
const VARPET_PAINTS: Row[] = [
  ['varpet-paint-emerald', 'Emerald', 'paint', W, '#1f6b50', 'green deep jewel strong'],
  ['varpet-paint-bottlegreen', 'Bottle green', 'paint', W, '#1f4535', 'green deep dark jewel'],
  ['varpet-paint-pistachio', 'Pistachio', 'paint', W, '#b9c995', 'green pale'],
  ['varpet-paint-inkblue', 'Ink blue', 'paint', W, '#1d2a44', 'blue deep dark'],
  ['varpet-paint-cobalt', 'Cobalt', 'paint', W, '#2a4fa0', 'blue strong jewel'],
  ['varpet-paint-midnight', 'Midnight', 'paint', W, '#1b1f2b', 'blue black dark'],
  ['varpet-paint-fuchsia', 'Fuchsia', 'paint', W, '#b03a72', 'pink magenta strong'],
  ['varpet-paint-coral', 'Coral', 'paint', W, '#e2725b', 'orange pink'],
  ['varpet-paint-saffron', 'Saffron', 'paint', W, '#e0a030', 'yellow strong'],
  ['varpet-paint-lilac', 'Lilac', 'paint', W, '#b7a1d1', 'purple pale'],
  ['varpet-paint-mauve', 'Mauve', 'paint', W, '#9a7486', 'purple pink muted'],
  ['varpet-paint-chocolate', 'Chocolate', 'paint', W, '#4a2c22', 'brown dark'],
]

/** Pascal's textured finishes that suit walls or floors, with the thumbnail path on its CDN. */
const PASCAL_TEXTURED: Array<[...Row, string]> = [
  ['wood-hungarianparquet10', 'Oak chevron parquet', 'wood', F, '#a87d51', 'herringbone chevron hungarian oak light parquet', 'wood/hungarian_parquet_10/hungarian_parquet_10'],
  ['wood-hungarianparquet2', 'Mahogany chevron parquet', 'wood', F, '#663020', 'herringbone chevron hungarian red dark parquet', 'wood/hungarian_parquet_2/hungarian_parquet_2'],
  ['wood-squareparquet21', 'Dark square parquet', 'wood', F, '#3e220d', 'parquet dark walnut', 'wood/square_parquet_21/square_parquet_21'],
  ['wood-squareparquet23', 'Brown square parquet', 'wood', F, '#7e410a', 'parquet warm', 'wood/square_wood_parquet_23/square_wood_parquet_23'],
  ['wood-woodparquet14', 'Pale plank floor', 'wood', F, '#e4d4c2', 'planks white washed light scandinavian', 'wood/wood_parquet_14/wood_parquet_14'],
  ['wood-woodenparquet11', 'Dark red wood floor', 'wood', F, '#59382c', 'planks dark cherry', 'wood/wooden_parquet_11/wooden_parquet_11'],
  ['wood-woodparquet121', 'Smoked oak floor', 'wood', F, '#907148', 'planks oak', 'wood/woodparquet_121/woodparquet_121'],
  ['wood-woodparquet56', 'Hexagon parquet', 'wood', F, '#ba8b5e', 'parquet hex pattern', 'wood/woodparquet_56/woodparquet_56'],
  ['wood-woodparquet65', 'Basket-weave parquet', 'wood', F, '#9f7842', 'parquet basketweave pattern', 'wood/woodparquet_65/woodparquet_65'],
  ['wood-woodparquet99', 'Light square parquet', 'wood', F, '#b69472', 'parquet light', 'wood/woodparquet_99/woodparquet_99'],
  ['flooring-woodparquet76', 'Wood parquet', 'wood', F, '#bfa27e', 'parquet planks', 'flooring/woodparquet/woodparquet'],
  ['wood-floorplank1', 'Floor planks', 'wood', F, '#9a7450', 'planks', 'wood/floor_plank_1/floor_plank_1'],
  ['wood-woodplank19', 'Grey wood planks', 'wood', WF, '#907a60', 'planks cladding', 'wood/woodplank_19/woodplank_19'],
  ['wood-woodplank48', 'Brown wood planks', 'wood', WF, '#88654c', 'planks cladding', 'wood/woodplank_48/woodplank_48'],
  ['wood-finewood27', 'Fine wood 27', 'wood', WF, '#a77440', 'veneer panelling', 'wood/finewood_27/finewood_27'],
  ['wood-woodfine1', 'Fine wood 1', 'wood', WF, '#a0764e', 'veneer panelling', 'wood/wood_fine/wood_fine'],
  ['wood-woodfine2', 'Fine wood 2', 'wood', WF, '#9c7048', 'veneer panelling', 'wood/wood_fine_2/wood_fine_2'],
  ['wood-woodfine11', 'Fine wood 11', 'wood', WF, '#a57a52', 'veneer panelling', 'wood/wood_fine_11/wood_fine_11'],
  ['wood-woodfine13', 'Fine wood 13', 'wood', WF, '#8a6040', 'veneer panelling', 'wood/wood_fine_13/wood_fine_13'],
  ['wood-woodfine22', 'Fine wood 22', 'wood', WF, '#b08860', 'veneer panelling', 'wood/wood_fine_22/wood_fine_22'],
  ['wood-woodfine24', 'Fine wood 24', 'wood', WF, '#7a5236', 'veneer panelling', 'wood/wood_fine_24/wood_fine_24'],
  ['flooring-statuarettowhite', 'Statuaretto white marble', 'stone', WF, '#e6e4e0', 'marble white veined', 'flooring/statuaretto/statuaretto'],
  ['flooring-greenlabradorite', 'Green labradorite', 'stone', WF, '#3f5a50', 'green stone dark', 'flooring/green_labradorite/green_labradorite'],
  ['flooring-greenquartzitea', 'Green quartzite', 'stone', WF, '#6f8f7f', 'green stone', 'flooring/green_glass_quartzite/green_glass_quartzite'],
  ['flooring-terrazzo19', 'Terrazzo', 'stone', WF, '#929f9f', 'terrazzo speckled', 'flooring/terrazzo/terrazzo'],
  ['flooring-tile79', 'Stone tile', 'stone', WF, '#d1d0ca', 'stone tile light', 'flooring/tile_stone/tile_stone'],
  ['flooring-wallstone1', 'Stone wall', 'stone', WF, '#8a8278', 'rubble rustic', 'flooring/stone_wall/stone_wall'],
  ['flooring-ceramic53', 'Ceramic mosaic', 'tile', WF, '#b8b6ad', 'mosaic bathroom', 'flooring/ceramic_mosaic/ceramic_mosaic'],
  ['flooring-tile20', 'Mosaic tile', 'tile', WF, '#d0ccbe', 'mosaic bathroom', 'flooring/tile_mosaic/tile_mosaic'],
  ['flooring-tile68', 'Pattern tile', 'tile', WF, '#999288', 'patterned encaustic', 'flooring/tile_pattern/tile_pattern'],
  ['flooring-tile86', 'Terracotta tile', 'tile', F, '#6f6a64', 'terracotta', 'flooring/tile_terracotta/tile_terracotta'],
  ['flooring-tile85a', 'Quarry tile', 'tile', F, '#484845', 'dark', 'flooring/tile_quarry/tile_quarry'],
  ['flooring-tiles3', 'Checker tiles', 'tile', F, '#9a9a9a', 'checkerboard black white', 'flooring/tiles_checker/tiles_checker'],
  ['flooring-tiles4', 'Grid tiles', 'tile', F, '#c8c8c4', 'square', 'flooring/tiles_grid/tiles_grid'],
  ['flooring-lightceramic24', 'Light ceramic', 'tile', F, '#9c9b96', 'porcelain bathroom wet', 'flooring/light_ceramic_grunge/light_ceramic_grunge'],
  ['flooring-darkceramic22', 'Dark ceramic', 'tile', F, '#535351', 'porcelain balcony outdoor', 'flooring/dark_ceramic_grunge/dark_ceramic_grunge'],
  ['flooring-woodenceramic2', 'Wood-look ceramic 2', 'tile', F, '#a07e5c', 'wood look porcelain', 'flooring/wooden_ceramic_2/wooden_ceramic_2'],
  ['flooring-woodenceramic3', 'Wood-look ceramic 3', 'tile', F, '#8e6e50', 'wood look porcelain', 'flooring/wooden_ceramic_3/wooden_ceramic_3'],
  ['flooring-pooltiles', 'Pool tiles', 'tile', WF, '#6fa8c0', 'blue small', 'flooring/pool_tiles/pool_tiles'],
  ['flooring-rusticbrick', 'Rustic brick', 'brick', WF, '#9b6f57', 'exposed brick', 'flooring/brick_wall_rustic/brick_wall_rustic'],
  ['flooring-agedbrick', 'Aged brick', 'brick', WF, '#be9877', 'exposed brick light', 'flooring/brick_wall_aged/brick_wall_aged'],
  ['flooring-weatheredbrick', 'Weathered brick', 'brick', WF, '#86513b', 'exposed brick red', 'flooring/brick_wall_weathered/brick_wall_weathered'],
  ['concrete-plaster', 'Painted plaster', 'concrete', W, '#c8c5be', 'plaster limewash textured', 'concrete/plaster_painted/plaster_painted'],
  ['concrete-stucco', 'White stucco', 'concrete', W, '#cccccc', 'render textured', 'concrete/white_stucco/white_stucco'],
  ['concrete-drywall', 'Prepared drywall', 'concrete', W, '#b1b1b1', 'unpainted', 'concrete/prepared_drywall/prepared_drywall'],
  ['concrete-raw', 'Raw concrete', 'concrete', WF, '#a5a5a5', 'board formed industrial', 'concrete/concrete_raw/concrete_raw'],
  ['concrete-plate', 'Concrete plate', 'concrete', WF, '#ababab', 'smooth industrial', 'concrete/concrete_plate/concrete_plate'],
  ['concrete-polished', 'Polished concrete', 'concrete', F, '#6c6b6a', 'microcement industrial', 'concrete/concrete_polished/concrete_polished'],
]

/**
 * varpet's textured finishes, served from apps/web/public/finishes/<dir>: v1's (tile size in metres from v1
 * material.json) and the wallpapers. `roughness` the finish's (even) roughness; `tint` the colour three multiplies
 * the albedo map by (default the finish's representative colour, as v1 did; white keeps the texture's own colours).
 */
const VARPET_TEXTURED: Array<[...Row, { dir: string; tileM: number; roughness: number; tint?: string }]> = [
  ['varpet-oak', 'Oak', 'wood', F, '#a27f58', 'oak planks natural', { dir: 'oak', tileM: 1.83, roughness: 0.55 }],
  ['varpet-ash-light', 'Light ash', 'wood', F, '#ac957d', 'ash planks light', { dir: 'ash-light', tileM: 1, roughness: 0.55 }],
  ['varpet-walnut', 'Walnut', 'wood', F, '#aa8a72', 'walnut planks', { dir: 'walnut', tileM: 1, roughness: 0.5 }],
  ['varpet-travertine', 'Travertine', 'stone', WF, '#dfccac', 'travertine beige', { dir: 'travertine', tileM: 1.2, roughness: 0.7 }],
  ['varpet-marble-white-alt', 'White marble', 'stone', WF, '#adaeb7', 'marble white', { dir: 'marble-white-alt', tileM: 1, roughness: 0.35 }],
  // Wallpapers: one tile is a 53 cm roll width (apps/web/scripts/make-wallpapers.py draws them seamless).
  ['varpet-wallpaper-botanical', 'Botanical leaf wallpaper', 'wallpaper', W, '#d2d2c0', 'botanical leaves green cream pattern floral', { dir: 'wallpaper-botanical', tileM: 0.53, roughness: 0.85, tint: '#ffffff' }],
  ['varpet-wallpaper-botanical-night', 'Dark botanical wallpaper', 'wallpaper', W, '#2d473b', 'botanical leaves green dark deep moody pattern', { dir: 'wallpaper-botanical-night', tileM: 0.53, roughness: 0.85, tint: '#ffffff' }],
  ['varpet-wallpaper-stripe-sage', 'Sage stripe wallpaper', 'wallpaper', W, '#cfd1bd', 'stripe striped regency sage green cream pattern', { dir: 'wallpaper-stripe-sage', tileM: 0.53, roughness: 0.85, tint: '#ffffff' }],
  ['varpet-wallpaper-trellis', 'Gold trellis wallpaper', 'wallpaper', W, '#e8e0ce', 'geometric trellis lattice gold cream pattern', { dir: 'wallpaper-trellis', tileM: 0.53, roughness: 0.8, tint: '#ffffff' }],
  ['varpet-wallpaper-grasscloth', 'Natural grasscloth', 'wallpaper', W, '#d0b78d', 'grasscloth woven natural texture beige sisal', { dir: 'wallpaper-grasscloth', tileM: 0.53, roughness: 0.9, tint: '#ffffff' }],
]

const PAINT_ROUGHNESS = 0.9

function entry([id, label, family, surfaces, color, keywords]: Row, source: Finish['source'], preview: string | null): Finish {
  return { id, ref: LIBRARY_PREFIX + id, label, family, surfaces, color, preview, keywords: keywords ? keywords.split(' ') : [], source }
}

export const FINISHES: readonly Finish[] = [
  ...PASCAL_PAINTS.map((row) => entry(row, 'pascal', null)),
  ...VARPET_PAINTS.map((row) => entry(row, 'varpet', null)),
  ...VARPET_TEXTURED.map(([...row]) => entry(row.slice(0, 6) as Row, 'varpet', `/finishes/${row[6].dir}/basecolor.jpg`)),
  ...PASCAL_TEXTURED.map(([...row]) => entry(row.slice(0, 6) as Row, 'pascal', `${PASCAL_ASSET_ORIGIN}/material/${row[6]}_thumb.webp`)),
]

const BY_ID = new Map(FINISHES.map((finish) => [finish.id, finish]))

/** A finish by id or slot ref (`oak`, `varpet-oak`, `library:varpet-oak`); undefined when unknown. */
export function getFinish(idOrRef: string): Finish | undefined {
  const id = idOrRef.trim().replace(/^library:/, '')
  return BY_ID.get(id)
}

/** The slot ref of a known finish; throws on an unknown id (for code that hard-codes finishes). */
export function finishRef(id: string): string {
  const finish = getFinish(id)
  if (!finish) throw new Error(`unknown finish: ${id}`)
  return finish.ref
}

export function listFinishes(filter: { surface?: FinishSurface; family?: FinishFamily } = {}): Finish[] {
  return FINISHES.filter(
    (finish) => (!filter.surface || finish.surfaces.includes(filter.surface)) && (!filter.family || finish.family === filter.family),
  )
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1)

/** Finishes closest to a free-text query or a mistyped id, best first (for "did you mean"). */
export function suggestFinishes(query: string, surface?: FinishSurface, limit = 6): Finish[] {
  const wanted = words(query.replace(/^library:/, '').replace(/^(preset|varpet|paint|wood|flooring|concrete)-/, ''))
  if (wanted.length === 0) return []
  const scored = FINISHES.map((finish) => {
    const have = new Set([...words(finish.id), ...words(finish.label), ...finish.keywords, finish.family])
    let score = 0
    for (const word of wanted) {
      if (have.has(word)) score += 2
      else if ([...have].some((h) => h.length > 3 && (h.startsWith(word) || word.startsWith(h)))) score += 1
    }
    if (surface && finish.surfaces.includes(surface)) score += 0.5
    return { finish, score }
  })
  return scored
    .filter(({ score }) => score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ finish }) => finish)
}

/** Pascal's MaterialCatalogItem, structurally (this file imports nothing). */
export interface FinishMaterialItem {
  id: string
  label: string
  category: 'colors' | FinishFamily
  source: 'workspace'
  surfaces: FinishSurface[]
  description: string
  previewThumbnailUrl?: string
  previewColor: string
  preset: { maps: Record<string, string>; mapProperties: Record<string, unknown> }
}

const MAP_PROPERTIES = {
  metalness: 0,
  rotation: 0,
  wrapS: 'Repeat',
  wrapT: 'Repeat',
  normalScaleX: 1,
  normalScaleY: 1,
  emissiveIntensity: 1,
  transparent: false,
  flipY: true,
  bumpScale: 1,
  emissiveColor: '#000000',
  aoMapIntensity: 1,
  side: 0,
  opacity: 1,
  lightMapIntensity: 1,
}

/**
 * varpet's own finishes as Pascal library materials, for registerLibraryMaterials. `origin` makes texture URLs
 * absolute (window.location.origin in the browser, VARPET_PUBLIC_ORIGIN elsewhere); '' keeps them origin-relative.
 */
export function finishMaterialItems(origin = ''): FinishMaterialItem[] {
  const base = origin.replace(/\/$/, '')
  const textured = new Map(VARPET_TEXTURED.map((row) => [row[0], row[6]]))
  return FINISHES.filter((finish) => finish.source === 'varpet').map((finish): FinishMaterialItem => {
    const texture = textured.get(finish.id)
    const common = { id: finish.id, label: finish.label, source: 'workspace' as const, surfaces: finish.surfaces, previewColor: finish.color }
    if (!texture) {
      return {
        ...common,
        category: 'colors' as const,
        description: `${finish.label} painted finish`,
        preset: {
          maps: {},
          mapProperties: { ...MAP_PROPERTIES, color: finish.color, roughness: PAINT_ROUGHNESS, repeatX: 1, repeatY: 1, displacementScale: 0.02 },
        },
      }
    }
    const url = `${base}/finishes/${texture.dir}`
    // Pascal maps one texture repeat per metre at repeat 1.
    const repeat = 1 / texture.tileM
    // No roughness map: v1 used roughness.jpg only to vary the finish's roughness by ±25%; three multiplies the map
    // in at full contrast (oak's spans 0.07-0.94), which drew grey glinting streaks across sunlit floors and, under
    // 0.55, glossy glare (0.29 on average). The grain lives in the albedo and normal maps.
    return {
      ...common,
      category: finish.family,
      description: 'Varpet finish',
      previewThumbnailUrl: `${url}/basecolor.jpg`,
      preset: {
        maps: { albedoMap: `${url}/basecolor.jpg`, normalMap: `${url}/normal.jpg` },
        mapProperties: { ...MAP_PROPERTIES, color: texture.tint ?? finish.color, roughness: texture.roughness, repeatX: repeat, repeatY: repeat, displacementScale: 0 },
      },
    }
  })
}
