'use client'

// The v1 Folio rail on Pascal's IconRail: a stroke icon above an 11px label (Pascal renders only `icon`, so the label
// rides inside it; pascal-theme.css widens the rail to 72px). The editor opens on the designer, like v1.
import { useEditor, useSidebarStore } from '@pascal-app/editor'
import type { LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { hasPlanHandoff } from '@/lib/plan-handoff'

/** v1's left column is 340px beside the 72px rail. */
export const FOLIO_SIDEBAR_WIDTH = 340
const PASCAL_DEFAULT_WIDTH = 288

export function railIcon(Icon: LucideIcon, label: string) {
  return (
    <span className="folio-rail-item">
      <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
      <span className="folio-rail-label">{label}</span>
    </span>
  )
}

/** On open: the designer column, expanded at v1's width (a plan handed over from the portal opens Plan instead). */
export function useFolioRailDefaults(sceneId: string) {
  useEffect(() => {
    const sidebar = useSidebarStore.getState()
    if (sidebar.isCollapsed) sidebar.setIsCollapsed(false)
    if (sidebar.width < 300 || sidebar.width === PASCAL_DEFAULT_WIDTH) sidebar.setWidth(FOLIO_SIDEBAR_WIDTH)
    // After the sidebar has registered its tabs (its own effect resets an unknown panel to the first tab).
    const timer = setTimeout(() => useEditor.getState().setActiveSidebarPanel(hasPlanHandoff(sceneId) ? 'architect' : 'designer'), 0)
    return () => clearTimeout(timer)
  }, [sceneId])
}
