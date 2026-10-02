'use client'

import { useEffect, useRef } from 'react'
import type { ChatState } from '../../lib/agent-stream'

/** While a turn runs, show the scene the agent edits (its proposal copy) so the flat changes live. When the turn
 * ends, keep showing it only if the turn produced a proposal for it. */
export function useLivePreview(state: ChatState, previewing: string | null, preview: (id: string | null) => void) {
  const busy = state.turn !== null
  const live = state.turn?.workSceneId ?? null
  const auto = useRef<string | null>(null)
  useEffect(() => {
    if (busy) {
      if (live && previewing !== live) { auto.current = live; preview(live) }
      else if (!live && previewing) preview(null)
      return
    }
    const shown = auto.current
    auto.current = null
    if (shown && previewing === shown && state.messages.at(-1)?.proposal?.proposalSceneId !== shown) preview(null)
  }, [busy, live]) // eslint-disable-line react-hooks/exhaustive-deps
}
