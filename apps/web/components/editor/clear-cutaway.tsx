'use client'

// Cut-away walls in Pascal are drawn as a 24% dotted film. Seen from a 3/4 angle that film lies over the whole room
// and speckles it, so we stop drawing it (colour writes off) except on the wall under the cursor, which keeps
// Pascal's hover highlight. The walls stay in the scene: they still take clicks and cast shadows.
import { sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import type { Material, Mesh, Object3D } from 'three'

function setFilm(object: Object3D, visible: boolean) {
  object.traverse((child: Object3D) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || mesh.userData.wallHidden === undefined) return
    const hidden = mesh.userData.wallHidden === true
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
    for (const material of materials) {
      // Only the see-through variants; opaque wall materials are shared with visible walls.
      if (!material || !material.transparent || material.depthWrite) continue
      const write = !hidden || visible
      if (material.colorWrite !== write) material.colorWrite = write
    }
  })
}

export function ClearCutaway() {
  useFrame(() => {
    const { wallMode, hoveredId } = useViewer.getState()
    if (wallMode !== 'cutaway' && wallMode !== 'down') return
    const walls = sceneRegistry.byType.wall
    if (!walls) return
    const nodes = useScene.getState().nodes
    for (const id of walls) {
      const object = sceneRegistry.nodes.get(id)
      if (object && nodes[id as keyof typeof nodes]) setFilm(object, hoveredId === id)
    }
  })
  return null
}

export default ClearCutaway
