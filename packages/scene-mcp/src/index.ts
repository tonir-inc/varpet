export { createMcpCatalog, toProduct } from './catalog.ts'
export type { Catalog, ProductHit, ProductQuery, ProductSearch, RawCatalogItem } from './catalog.ts'
export {
  BUILTIN_CATALOG_TOOLS,
  FINISH_TOOLS,
  HIDDEN_TOOLS,
  PRODUCT_TOOLS,
  VIEW_TOOLS,
  createSceneServer,
  productItemNode,
  publishSnapshot,
} from './server.ts'
export { httpRenderer, planView, registerViewSceneTool, VIEWS, ViewError } from './view-scene.ts'
export type { Renderer, View, ViewPlan } from './view-scene.ts'
