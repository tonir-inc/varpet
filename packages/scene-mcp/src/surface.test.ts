import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { glbHeightMap, restHeight } from './surface.ts'

/** A binary glTF with one indexed triangle mesh (float positions, uint16 indices). */
function glb(positions: number[], indices: number[]) {
  const pos = new Float32Array(positions)
  const idx = new Uint16Array(indices)
  const idxBytes = Math.ceil(idx.byteLength / 4) * 4
  const binLength = pos.byteLength + idxBytes
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [0, 0.1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  }
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const out = new Uint8Array(12 + 8 + text.length + 8 + binLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, out.byteLength, true)
  view.setUint32(12, text.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(new TextEncoder().encode(text), 20)
  const bin = 20 + text.length
  view.setUint32(bin, binLength, true)
  view.setUint32(bin + 4, 0x004e4942, true)
  out.set(new Uint8Array(pos.buffer), bin + 8)
  out.set(new Uint8Array(idx.buffer), bin + 8 + pos.byteLength)
  return out
}

test('the height map keeps the highest surface per cell; the median over a footprint skips a headboard band', () => {
  // A 1.6 x 2 m mattress top at y 0.4 and a headboard 0.1 m deep at the back (z -1..-0.9) rising to 1.0; the node lifts all by 0.1.
  const quad = (x0: number, x1: number, z0: number, z1: number, y: number) => [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]
  const positions = [...quad(-0.8, 0.8, -1, 1, 0.4), ...quad(-0.8, 0.8, -1, -0.9, 1.0)]
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]
  const map = glbHeightMap(glb(positions, indices))!
  assert.ok(map)
  const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-4, `${a} vs ${b}`)
  near(restHeight(map, [0, 0], [0.85, 1.02]), 0.5)
  near(restHeight(map, [0, -0.95], [0.3, 0.02]), 1.1)
  assert.equal(restHeight(map, [5, 5], [0.1, 0.1]), null)
})
