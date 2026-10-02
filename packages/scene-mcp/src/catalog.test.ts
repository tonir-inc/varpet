import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toProduct } from './catalog.ts'

test('toProduct converts [w, d, h] to Pascal [w, h, d] and serves the model from the public origin', () => {
  const product = toProduct(
    {
      id: 'abo:B013OWRNDC',
      source_id: 'B013OWRNDC',
      name: 'Corona bedside chest',
      kind: 'nightstand',
      size_m: [0.6599, 0.4999, 0.8128],
      price: 42000,
      glb_url: 'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/C/B013OWRNDC.glb',
      main_image_url: 'https://amazon-berkeley-objects.s3.amazonaws.com/images/small/x.jpg',
      colors_astra: ['brown', 'brown'],
    },
    'http://localhost:3010/',
  )
  assert.deepEqual(product.dimensions, [0.66, 0.813, 0.5])
  assert.equal(product.glbUrl, 'http://localhost:3010/api/catalog/models/B013OWRNDC.glb')
  assert.equal(product.thumbnailUrl, 'https://amazon-berkeley-objects.s3.amazonaws.com/images/small/x.jpg')
  assert.equal(product.priceAmd, 42000)
  assert.equal(product.shop, null)
  assert.deepEqual(product.colors, ['brown'])
})

test('toProduct derives the model file from the id when source_id is missing', () => {
  const product = toProduct({ id: 'abo:X1', name: 'x', kind: 'rug', size_m: [1, 2, 0.01] }, 'https://v.example')
  assert.equal(product.glbUrl, 'https://v.example/api/catalog/models/X1.glb')
  assert.equal(product.priceAmd, null)
})

test('toProduct uses the model file the catalog serves for generated items, not one rebuilt from the id', () => {
  const product = toProduct(
    {
      id: 'extra:bpy-deco:channel-tufted-velvet-sofa-deep-green',
      source: 'extra',
      source_id: 'channel-tufted-velvet-sofa-deep-green',
      name: 'Sofa',
      kind: 'sofa',
      size_m: [2.1, 0.9, 0.8],
      glb_url: 'http://100.107.246.46:8765/models/extra-bpy-deco-channel-tufted-velvet-sofa-deep-green.glb',
    },
    'http://localhost:3010',
  )
  assert.equal(product.glbUrl, 'http://localhost:3010/api/catalog/models/extra-bpy-deco-channel-tufted-velvet-sofa-deep-green.glb')
})
