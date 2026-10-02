'use client'

// Docked under Pascal's inspector (`inspectorFooter`): v1's finish swatches for the selected wall (each side), floor
// or ceiling, and "Ask the designer about this", which puts a question about the selection in the designer's box.
import { getCatalogMaterialById, toLibraryMaterialRef } from '@pascal-app/core'
import { useScene, useViewer } from '@pascal-app/editor'
import { getChatSession, prefillChat } from '@/components/designer/agent-chat-store'
import { openSidebar } from './folio-actions'
import { FolioIcon } from './folio-icon'
import { useSceneEditor } from './scene-editor-store'

/** Library material ids (Pascal presets and the v1 finishes viewer-look registers as `varpet-*`). */
const WALL_FINISHES = ['preset-softwhite', 'preset-white', 'preset-cream', 'preset-greige', 'preset-sage', 'preset-olive', 'preset-paleteal', 'varpet-travertine', 'varpet-marble-white-alt']
const FLOOR_FINISHES = ['varpet-oak', 'varpet-ash-light', 'varpet-walnut', 'wood-woodplank48', 'varpet-travertine', 'varpet-marble-white-alt']
const CEILING_FINISHES = ['preset-white', 'preset-softwhite', 'preset-cream', 'preset-lightgrey']

type Surface = { slot: string; label: string; finishes: string[] }

const SURFACES: Record<string, Surface[]> = {
  wall: [
    { slot: 'interior', label: 'Room side', finishes: WALL_FINISHES },
    { slot: 'exterior', label: 'Other side', finishes: WALL_FINISHES },
  ],
  slab: [{ slot: 'surface', label: 'Floor', finishes: FLOOR_FINISHES }],
  ceiling: [{ slot: 'surface', label: 'Ceiling', finishes: CEILING_FINISHES }],
}

const KIND: Record<string, string> = { wall: 'wall', slab: 'floor', ceiling: 'ceiling', item: 'piece', door: 'door', window: 'window', zone: 'room' }

type SlotNode = { id: string; type: string; name?: string; slots?: Record<string, string> }

function Swatch({ id, current, onPick }: { id: string; current: boolean; onPick: () => void }) {
  const material = getCatalogMaterialById(id)
  if (!material) return null
  const image = material.previewThumbnailUrl
  return (
    <button aria-pressed={current} className="folio-swatch" onClick={onPick} title={material.label} type="button">
      <span
        aria-hidden="true"
        className="folio-swatch-chip"
        style={{ backgroundColor: material.previewColor ?? '#ddd', backgroundImage: image ? `url(${image})` : undefined }}
      />
      <span className="folio-swatch-name">{material.label}</span>
    </button>
  )
}

export function InspectorFooter() {
  const selectedId = useViewer((s) => (s.selection.selectedIds.length === 1 ? s.selection.selectedIds[0] : null))
  const node = useScene((s) => (selectedId ? (s.nodes[selectedId as keyof typeof s.nodes] as unknown as SlotNode | undefined) : undefined))
  const sceneId = useSceneEditor((s) => s.sceneId)
  if (!node) return null
  const surfaces = SURFACES[node.type] ?? []
  const kind = KIND[node.type] ?? node.type
  const name = node.name?.trim() || `this ${kind}`

  const paint = (slot: string, materialId: string) => {
    const slots = { ...(node.slots ?? {}), [slot]: toLibraryMaterialRef(materialId) }
    useScene.getState().updateNode(node.id as never, { slots } as never)
  }
  const ask = () => {
    if (!sceneId) return
    prefillChat(getChatSession('designer', sceneId), `About the ${kind} "${name}": `)
    openSidebar('designer')
  }

  return (
    <div className="folio-inspector-footer">
      {surfaces.map((surface, index) => {
        const current = node.slots?.[surface.slot]
        // The first surface open; a wall's other side folds away so Pascal's own fields keep their room.
        return (
          <details className="folio-finishes" key={surface.slot} open={index === 0}>
            <summary>{surface.label}</summary>
            <div className="folio-swatches">
              {surface.finishes.map((id) => (
                <Swatch current={current === toLibraryMaterialRef(id)} id={id} key={id} onPick={() => paint(surface.slot, id)} />
              ))}
            </div>
          </details>
        )
      })}
      <button className="folio-ask" disabled={!sceneId} onClick={ask} type="button">
        <FolioIcon name="sparkles" size={16} />
        <span>Ask the designer about this</span>
      </button>
    </div>
  )
}
