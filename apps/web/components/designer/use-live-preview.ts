'use client'

import { useEffect, useRef } from 'react'
import type { ChatState } from '../../lib/agent-stream'

/** While a turn runs, show the scene the agent edits (its proposal copy) so the flat changes live. When the turn
 * ends, keep showing it only if the turn produced a proposal for it. */
export function useLivePreview(state: ChatState, previewing: string | null, preview: (id: string | null, working?: boolean) => void) {
  const busy = state.turn !== null
  const live = state.turn?.workSceneId ?? null
  const auto = useRef<string | null>(null)
  useEffect(() => {
    if (busy) {
      if (live && previewing !== live) { auto.current = live; preview(live, true) }
      else if (!live && previewing) preview(null)
      return
    }
    const shown = auto.current
    auto.current = null
    // The turn is over: keep showing the proposal (now ready to apply) or leave it when nothing was proposed.
    if (shown && previewing === shown) preview(state.messages.at(-1)?.proposal?.proposalSceneId === shown ? shown : null, false)
  }, [busy, live]) // eslint-disable-line react-hooks/exhaustive-deps
}
