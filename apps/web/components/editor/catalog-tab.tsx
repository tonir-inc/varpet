'use client'

// The furniture drawer in Folio (v1's Furniture panel): a serif title with the count, a search field, a category
// select and 2-column product cards (picture, name, size, serif price, shop). A click arms Pascal's item tool with the
// product; the next click in the flat places it.
import { activateCatalogItem, isCatalogItemSelected, useEditor } from '@pascal-app/editor'
import type { Product } from '@varpet/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { amd } from '@/lib/agent-stream'
import { productToAsset, rememberProducts, searchProducts } from '@/lib/scenes/catalog'
import { FolioIcon } from './folio-icon'

const SEARCH_DEBOUNCE_MS = 250

/** `?catalog=fixture` serves a local fixture instead of `/api/catalog/search`. */
function useFixtureFlag() {
  const [fixture, setFixture] = useState(false)
  useEffect(() => {
    setFixture(new URLSearchParams(window.location.search).get('catalog') === 'fixture')
  }, [])
  return fixture
}

const sizeOf = ([w, h, d]: Product['dimensions']) => `${w.toFixed(2)} × ${d.toFixed(2)} × ${h.toFixed(2)} m`
const kindLabel = (kind: string) => kind.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

function ProductCard({ product, selected, onPick }: { product: Product; selected: boolean; onPick: () => void }) {
  return (
    <button aria-pressed={selected} className="folio-product" onClick={onPick} title={`Add ${product.name}`} type="button">
      <span className="folio-product-image">
        {product.thumbnailUrl ? <img alt="" loading="lazy" src={product.thumbnailUrl} /> : <FolioIcon name="sofa" size={28} />}
      </span>
      <span className="folio-product-name">{product.name}</span>
      <span className="folio-product-size">{sizeOf(product.dimensions)}</span>
      <span className="folio-product-price">
        <span className="folio-num">{product.priceAmd === null ? 'No price' : amd(product.priceAmd)}</span>
        {product.shop ? <small>{product.shop}</small> : null}
      </span>
    </button>
  )
}

export function CatalogTab() {
  const fixture = useFixtureFlag()
  const [items, setItems] = useState<Product[] | null>(null)
  const [results, setResults] = useState<Product[] | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [error, setError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const selectedItem = useEditor((s) => (s.mode === 'build' ? s.selectedItem : null))

  useEffect(() => {
    const abort = new AbortController()
    searchProducts({ limit: 120 }, { fixture, signal: abort.signal })
      .then((products) => {
        rememberProducts(products)
        setItems(products)
        setError(null)
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return
        setItems([])
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => abort.abort()
  }, [fixture])

  useEffect(() => () => {
    clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
  }, [])

  const onSearch = (value: string) => {
    setQuery(value)
    clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
    if (!value.trim()) { setResults(null); return }
    setResults(null)
    searchTimer.current = setTimeout(() => {
      const abort = new AbortController()
      searchAbort.current = abort
      searchProducts({ q: value.trim(), limit: 60 }, { fixture, signal: abort.signal })
        .then((products) => { rememberProducts(products); setResults(products) })
        .catch(() => { if (!abort.signal.aborted) setResults([]) })
    }, SEARCH_DEBOUNCE_MS)
  }

  const kinds = useMemo(() => [...new Set((items ?? []).map((p) => p.kind).filter(Boolean))].sort(), [items])
  const searching = query.trim() !== ''
  const source = searching ? results : items
  const shown = (source ?? []).filter((p) => !kind || p.kind === kind)

  const pick = (product: Product) => {
    // Pascal prefixes relative thumbnails with its CDN, so the fallback is absolute.
    activateCatalogItem(productToAsset(product, `${window.location.origin}/pascal/icons/couch.webp`))
  }

  return (
    <section className="folio-furniture" aria-label="Furniture">
      <header className="folio-panel-header">
        <h2>Furniture</h2>
        {items ? <span className="folio-count">{shown.length}</span> : null}
      </header>
      <label className="folio-search">
        <FolioIcon name="search" size={16} />
        <span className="folio-visually-hidden">Search furniture</span>
        <input onChange={(event) => onSearch(event.target.value)} placeholder="Search furniture…" type="search" value={query} />
      </label>
      <label className="folio-field-label" htmlFor="folio-furniture-kind">Category</label>
      <select className="folio-select" id="folio-furniture-kind" onChange={(event) => setKind(event.target.value)} value={kind}>
        <option value="">All furniture</option>
        {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
      </select>
      <p className="folio-help">Click a piece, then click in the flat to place it.</p>
      {items === null || (searching && results === null) ? (
        <p className="folio-help">Loading the catalog…</p>
      ) : shown.length === 0 ? (
        <p className="folio-help">{error ? 'The catalog is not reachable right now.' : searching ? 'Nothing matches that search.' : 'Nothing here yet.'}</p>
      ) : (
        <div className="folio-products">
          {shown.map((product) => (
            <ProductCard key={product.id} onPick={() => pick(product)} product={product} selected={isCatalogItemSelected(product, selectedItem)} />
          ))}
        </div>
      )}
      <p className="folio-source-note">Prices in AMD as listed by each shop. Sizes are width × depth × height.</p>
    </section>
  )
}
