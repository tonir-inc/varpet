'use client'

// v1's bottom dock on Pascal's stage (mounted through `viewerBanner`, inside the viewer overlay band): the views
// (3D, Top, Inside, Plan), the light, "Add furniture" and the More menu. Pascal's own action bar is hidden in CSS.
import { emitter } from '@pascal-app/core'
import { useCommandPalette, useEditor, useViewer, ViewerToolbarLeft } from '@pascal-app/editor'
import { SCENE_THEMES } from '@pascal-app/viewer'
import { useEffect, useRef, useState } from 'react'
import { FolioIcon, type FolioIconName } from './folio-icon'
import { openSidebar, pressKey } from './folio-actions'

type View = '3d' | 'top' | 'inside' | 'plan'

const WALL_MODES = [
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'up', label: 'Full height' },
  { id: 'down', label: 'Low' },
  { id: 'translucent', label: 'See-through' },
] as const

function DockButton({ icon, label, active, onClick, strong }: { icon: FolioIconName; label: string; active?: boolean; onClick: () => void; strong?: boolean }) {
  return (
    <button aria-pressed={active} className={`folio-dock-button${strong ? ' folio-dock-strong' : ''}`} onClick={onClick} type="button">
      <FolioIcon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function useCurrentView(): [View, (view: View) => void] {
  const viewMode = useEditor((s) => s.viewMode)
  const firstPerson = useEditor((s) => s.isFirstPersonMode)
  // Top is a camera move inside 3D, so it is remembered here until the view changes again.
  const [top, setTop] = useState(false)
  useEffect(() => { if (viewMode !== '3d' || firstPerson) setTop(false) }, [viewMode, firstPerson])
  const current: View = firstPerson ? 'inside' : viewMode === '2d' ? 'plan' : top ? 'top' : '3d'
  const choose = (view: View) => {
    const editor = useEditor.getState()
    if (view !== 'inside' && editor.isFirstPersonMode) editor.setFirstPersonMode(false)
    if (view === 'plan') { editor.setViewMode('2d'); return }
    if (editor.viewMode !== '3d') editor.setViewMode('3d')
    if (view === 'inside') { editor.setFirstPersonMode(true); return }
    setTop(view === 'top')
    if (view === 'top') emitter.emit('camera-controls:top-view' as never)
  }
  return [current, choose]
}

function MoreMenu({ onClose }: { onClose: () => void }) {
  const wallMode = useViewer((s) => s.wallMode)
  const setWallMode = useViewer((s) => s.setWallMode)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (ref.current && target && !ref.current.contains(target) && !target.closest('[data-folio-more]') && !target.closest('[data-radix-popper-content-wrapper]')) onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey) }
  }, [onClose])
  const wallIndex = Math.max(0, WALL_MODES.findIndex((mode) => mode.id === wallMode))
  const run = (action: () => void) => () => { action(); onClose() }
  return (
    <div className="folio-more" ref={ref} role="menu" aria-label="More">
      <button className="folio-more-row" onClick={run(() => openSidebar('site'))} role="menuitem" type="button">
        <FolioIcon name="properties" /><span>Everything in the flat</span>
      </button>
      <button className="folio-more-row" onClick={run(() => openSidebar('catalog'))} role="menuitem" type="button">
        <FolioIcon name="sofa" /><span>Furniture</span>
      </button>
      <button className="folio-more-row" onClick={run(() => openSidebar('architect'))} role="menuitem" type="button">
        <FolioIcon name="plan" /><span>Walls from a plan</span>
      </button>
      <button className="folio-more-row" onClick={() => setWallMode(WALL_MODES[(wallIndex + 1) % WALL_MODES.length]!.id)} role="menuitem" type="button">
        <FolioIcon name="walls" /><span>Wall visibility · {WALL_MODES[wallIndex]!.label}</span>
      </button>
      <button className="folio-more-row" onClick={run(() => pressKey('m'))} role="menuitem" type="button">
        <FolioIcon name="ruler" /><span>Measure</span>
      </button>
      <button className="folio-more-row" onClick={run(() => useCommandPalette.getState().setOpen(true))} role="menuitem" type="button">
        <FolioIcon name="search" /><span>Commands and shortcuts</span>
      </button>
      {/* Pascal's level, wall and guide toggles, kept for the cases our rows do not cover. */}
      <div className="folio-more-pascal" aria-label="Levels, walls and guides">
        <ViewerToolbarLeft />
      </div>
    </div>
  )
}

export function FolioDock() {
  const [view, setView] = useCurrentView()
  const sceneTheme = useViewer((s) => s.sceneTheme)
  const setSceneTheme = useViewer((s) => s.setSceneTheme)
  const [more, setMore] = useState(false)

  return (
    <div className="folio-dock pointer-events-auto" data-folio-dock>
      <div className="folio-dock-segment" role="group" aria-label="View">
        <DockButton active={view === '3d'} icon="cube" label="3D" onClick={() => setView('3d')} />
        <DockButton active={view === 'top'} icon="top" label="Top" onClick={() => setView('top')} />
        <DockButton active={view === 'inside'} icon="eye" label="Inside" onClick={() => setView('inside')} />
        <DockButton active={view === 'plan'} icon="plan" label="Plan" onClick={() => setView('plan')} />
      </div>
      <div className="folio-dock-segment" role="group" aria-label="Light">
        <label className="folio-dock-light">
          <FolioIcon name="sun" />
          <span className="folio-visually-hidden">Light</span>
          <select onChange={(event) => setSceneTheme(event.target.value)} value={sceneTheme}>
            {SCENE_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </select>
        </label>
      </div>
      <div className="folio-dock-segment" role="group" aria-label="Furniture and more">
        <button className="folio-dock-button folio-dock-strong" data-folio-action="add-furniture" onClick={() => openSidebar('catalog')} type="button">
          <FolioIcon name="plus" />
          <span>Add furniture</span>
        </button>
        <button aria-expanded={more} aria-label="More" className="folio-dock-icon" data-folio-more onClick={() => setMore(!more)} title="More" type="button">
          <FolioIcon name="more" />
        </button>
      </div>
      {more ? <MoreMenu onClose={() => setMore(false)} /> : null}
    </div>
  )
}
