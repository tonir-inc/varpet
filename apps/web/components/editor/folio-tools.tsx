'use client'

// v1's edit tool row (top-left of the stage) on Pascal's editor: select, box select, move, rotate, delete; the flat's
// list and Frame; the Snap chip; the Properties toggle. Pascal has no persistent move/rotate/resize modes: Move picks
// the selected piece up (its floating menu's Move) and Rotate turns it a step (Pascal's rotateSelection, the R key).
import { useEditor, useViewer } from '@pascal-app/editor'
import { type ReactNode, useEffect, useState } from 'react'
import { FolioIcon, type FolioIconName } from './folio-icon'
import { frame, inspectorToggle, moveSelection, openSidebar, rotate, selectTool } from './folio-actions'

function ToolButton({ icon, label, shortcut, active, disabled, onClick, children }: {
  icon: FolioIconName
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children?: ReactNode
}) {
  const title = shortcut ? `${label} (${shortcut})` : label
  return (
    <button aria-label={label} aria-pressed={active} className="folio-tool" disabled={disabled} onClick={onClick} title={title} type="button">
      <FolioIcon name={icon} />
      {shortcut ? <span className="folio-tool-key" aria-hidden="true">{shortcut}</span> : null}
      {children}
    </button>
  )
}

/** Whether Pascal's inspector is expanded (it keeps that state private, so read its button). */
function useInspectorOpen(hasSelection: boolean) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!hasSelection) { setOpen(false); return }
    const read = () => setOpen(inspectorToggle()?.getAttribute('aria-expanded') === 'true')
    read()
    const observer = new MutationObserver(read)
    const bounds = document.querySelector('[data-viewer-bounds]')
    if (bounds) observer.observe(bounds, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] })
    return () => observer.disconnect()
  }, [hasSelection])
  return open
}

export function FolioTools() {
  const mode = useEditor((s) => s.mode)
  const selectionTool = useEditor((s) => s.floorplanSelectionTool)
  const snapStep = useEditor((s) => s.gridSnapStep)
  const cycleSnap = useEditor((s) => s.cycleGridSnapStep)
  const panel = useEditor((s) => s.activeSidebarPanel)
  const selected = useViewer((s) => s.selection.selectedIds.length)
  const inspectorOpen = useInspectorOpen(selected > 0)

  return (
    <div className="folio-tools" role="toolbar" aria-label="Edit tools" data-folio-tools>
      <ToolButton active={mode === 'select' && selectionTool === 'click'} icon="select" label="Select" onClick={() => selectTool('select')} shortcut="V" />
      <ToolButton active={mode === 'select' && selectionTool === 'marquee'} icon="marquee" label="Box select" onClick={() => selectTool('marquee')} />
      <ToolButton disabled={selected !== 1} icon="move" label="Move the selection" onClick={moveSelection} />
      <ToolButton disabled={selected === 0} icon="rotate" label="Turn the selection" onClick={rotate} shortcut="R" />
      <ToolButton active={mode === 'delete'} icon="trash" label="Delete by clicking" onClick={() => selectTool('delete')} shortcut="X" />
      <span className="folio-tools-gap" aria-hidden="true" />
      <ToolButton active={panel === 'site'} icon="layers" label="Everything in the flat" onClick={() => openSidebar('site')} />
      <ToolButton icon="focus" label="Frame" onClick={frame} />
      <span className="folio-tools-gap" aria-hidden="true" />
      <button aria-label={`Snap to ${snapStep} m; change the step`} className="folio-snap" onClick={() => cycleSnap()} title="Snap step" type="button">
        <FolioIcon name="grid" />
        <span>Snap · {snapStep} m</span>
      </button>
      <span className="folio-tools-gap" aria-hidden="true" />
      <ToolButton active={inspectorOpen} disabled={selected === 0} icon="properties" label="Properties" onClick={() => inspectorToggle()?.click()} />
    </div>
  )
}
