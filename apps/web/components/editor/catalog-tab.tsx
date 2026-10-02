'use client'

import type { AssetInput } from '@pascal-app/core'
import { ItemsPanel } from '@pascal-app/editor'
import { useCallback, useEffect, useRef, useState } from 'react'
import { productToAsset, searchProducts } from '@/lib/scenes/catalog'

const SEARCH_DEBOUNCE_MS = 250

/** `?catalog=fixture` serves a local fixture instead of `/api/catalog/search` (until lane B's route lands). */
function useFixtureFlag() {
  const [fixture, setFixture] = useState(false)
  useEffect(() => {
    setFixture(new URLSearchParams(window.location.search).get('catalog') === 'fixture')
  }, [])
  return fixture
}

function toAssets(products: Awaited<ReturnType<typeof searchProducts>>): AssetInput[] {
  const fallback = `${window.location.origin}/pascal/icons/couch.webp`
  return products.map((product) => productToAsset(product, fallback))
}

/** Pascal's Items panel fed from our catalog: browse by category, server-side search. */
export function CatalogTab() {
  const fixture = useFixtureFlag()
  const [items, setItems] = useState<AssetInput[] | null>(null)
  const [searchResults, setSearchResults] = useState<AssetInput[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const abort = new AbortController()
    searchProducts({ limit: 120 }, { fixture, signal: abort.signal })
      .then((products) => {
        setItems(toAssets(products))
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

  const onSearchChange = useCallback(
    (query: string) => {
      clearTimeout(searchTimer.current)
      searchAbort.current?.abort()
      if (!query.trim()) {
        setSearchResults(null)
        return
      }
      setSearchResults(null) // spinner while the request is in flight
      searchTimer.current = setTimeout(() => {
        const abort = new AbortController()
        searchAbort.current = abort
        searchProducts({ q: query.trim(), limit: 60 }, { fixture, signal: abort.signal })
          .then((products) => setSearchResults(toAssets(products)))
          .catch(() => {
            if (!abort.signal.aborted) setSearchResults([])
          })
      }, SEARCH_DEBOUNCE_MS)
    },
    [fixture],
  )

  if (items === null) return <div className="varpet-panel-note">Loading the catalog…</div>

  return (
    <ItemsPanel
      emptyState={<div className="varpet-panel-note">{error ? 'The catalog is not reachable right now.' : 'Nothing here yet.'}</div>}
      items={items}
      onSearchChange={onSearchChange}
      searchResults={searchResults}
      showSourceFilter={false}
      showTagFilters={false}
    />
  )
}
