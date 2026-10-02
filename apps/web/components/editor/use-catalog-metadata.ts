'use client'

import { useScene } from '@pascal-app/editor'
import { useEffect } from 'react'
import { productMetadata } from '@/lib/scenes/catalog'

type Meta = Record<string, unknown>
const metaOf = (node: { metadata?: unknown }): Meta =>
  node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata) ? (node.metadata as Meta) : {}

/** Items placed from the catalog tab get `metadata: {productId, priceAmd, shop}`, as the agent's `place_product`
 * writes them. Pascal's placement keeps only the asset, so the stamp follows the commit, outside undo history. */
export function useCatalogMetadata() {
  useEffect(() => useScene.subscribe((state, prev) => {
    if (state.nodes === prev.nodes) return
    const stamps: [string, Meta][] = []
    for (const node of Object.values(state.nodes)) {
      if (node.type !== 'item' || prev.nodes[node.id] === node) continue
      const meta = metaOf(node)
      if (meta.isTransient || typeof meta.productId === 'string') continue
      const product = productMetadata((node as { asset?: { id?: unknown } }).asset?.id)
      if (product) stamps.push([node.id, { ...meta, ...product }])
    }
    if (!stamps.length) return
    queueMicrotask(() => {
      const temporal = useScene.temporal.getState()
      const tracking = temporal.isTracking
      if (tracking) temporal.pause()
      try {
        for (const [id, metadata] of stamps) {
          if (useScene.getState().nodes[id as keyof typeof state.nodes]) useScene.getState().updateNode(id as never, { metadata } as never)
        }
      } finally {
        if (tracking) temporal.resume()
      }
    })
  }), [])
}
