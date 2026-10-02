'use client'

// Cut-away walls in Pascal are drawn as a 24% dotted film. Seen from a 3/4 angle that film lies over the whole room
// and speckles it, so we stop drawing it (colour writes off) except on the wall under the cursor, which keeps
// Pascal's hover highlight. The walls stay in the scene: they still take clicks and cast shadows.
// Pascal leaves a cut wall's doors and windows standing in mid-air (they are children of the wall mesh and the
// cutaway code never touches them), so they go with their wall. And the editor's ceiling corner brackets (a select
// affordance at every ceiling corner, drawn at ceiling height over the wall tops) read as white caps on every wall
// junction; they are drawn only while a ceiling is hovered or selected, and still take the pointer otherwise.
// Last, the site's ground does not take the building's shadow: under the studio key light that shadow is a dark slab
// as large as the flat beside it. Rooms keep their shadows, and Pascal's contact vignette still grounds the flat.
import { sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Material, Mesh, Object3D } from 'three'

function setFilm(object: Object3D, visible: boolean) {
  let hidden = false
  object.traverse((child: Object3D) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || mesh.userData.wallHidden === undefined) return
    hidden ||= mesh.userData.wallHidden === true
    const meshHidden = mesh.userData.wallHidden === true
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
    for (const material of materials) {
      // Only the see-through variants; opaque wall materials are shared with visible walls.
      if (!material || !material.transparent || material.depthWrite) continue
      const write = !meshHidden || visible
      if (material.colorWrite !== write) material.colorWrite = write
    }
  })
  return hidden
}

type Nodes = ReturnType<typeof useScene.getState>['nodes']

/** Whether each opening was last shown, so a change marks it dirty once. */
const openingShown = new Map<string, boolean>()

/**
 * Doors and windows of a cut wall follow it. R3F only re-applies `visible` on re-render, so set it every frame.
 * Pascal also draws settled openings from shared batches under the level, which ignore the source's visibility;
 * marking the opening dirty when it changes makes the batch let it go and re-collect it, and the batch skips
 * invisible subtrees.
 */
function setOpenings(wall: object, nodes: Nodes, show: boolean) {
  const children = (wall as { children?: unknown }).children
  if (!Array.isArray(children)) return
  for (const childId of children as string[]) {
    const child = nodes[childId as keyof Nodes] as { type?: string; visible?: boolean } | undefined
    if (child?.type !== 'door' && child?.type !== 'window') continue
    const object = sceneRegistry.nodes.get(childId)
    const visible = show && child.visible !== false
    if (object && object.visible !== visible) object.visible = visible
    if (openingShown.get(childId) !== show) {
      const first = !openingShown.has(childId)
      openingShown.set(childId, show)
      if (!(first && show)) useScene.getState().markDirty(childId as never)
    }
  }
}

function setCeilingBrackets(show: boolean) {
  for (const levelId of sceneRegistry.byType.level ?? []) {
    const level = sceneRegistry.nodes.get(levelId)
    for (const root of level?.children ?? []) {
      for (const child of root.children) {
        if (child.name !== 'ceiling-brackets-normal') continue
        const material = (child as Mesh).material as Material
        if (material.colorWrite !== show) material.colorWrite = show
      }
    }
  }
}

/** The site renders its ground and horizon as direct mesh children; R3F sets receiveShadow only on re-render. */
function unshadowGround() {
  for (const siteId of sceneRegistry.byType.site ?? []) {
    for (const child of sceneRegistry.nodes.get(siteId)?.children ?? []) {
      const mesh = child as Mesh
      if (!mesh.isMesh || !mesh.receiveShadow) continue
      mesh.receiveShadow = false
      for (const material of [mesh.material].flat() as Material[]) material.needsUpdate = true
    }
  }
}

export function ClearCutaway() {
  const cutting = useRef(false)
  useFrame(() => {
    const { wallMode, hoveredId, selection } = useViewer.getState()
    const nodes = useScene.getState().nodes
    unshadowGround()
    const isCeiling = (id: string | null | undefined) => !!id && nodes[id as keyof Nodes]?.type === 'ceiling'
    setCeilingBrackets(isCeiling(hoveredId) || (selection.selectedIds ?? []).some(isCeiling))
    const walls = sceneRegistry.byType.wall
    if (!walls) return
    if (wallMode !== 'cutaway' && wallMode !== 'down') {
      // Back to walls up: give the openings back once.
      if (cutting.current) for (const id of walls) setOpenings(nodes[id as keyof Nodes] ?? {}, nodes, true)
      cutting.current = false
      return
    }
    cutting.current = true
    for (const id of walls) {
      const object = sceneRegistry.nodes.get(id)
      const wall = nodes[id as keyof Nodes]
      if (!object || !wall) continue
      const hovered = hoveredId === id
      const hidden = setFilm(object, hovered)
      setOpenings(wall, nodes, !hidden || hovered)
    }
  })
  return null
}

export default ClearCutaway
