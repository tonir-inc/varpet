import {expect,test} from 'vitest';
import type {AgentProposal} from '../../../apps/editor/src/contracts.js';
import type {CatalogProduct} from '../../../apps/editor/src/adapters/database-catalog.js';
import {createInitialScene} from '../../../apps/editor/src/core/initial-scene.js';
import {createApartmentStore} from '../../../apps/editor/src/core/apartment-store.js';
import {buildInput,checkReply,REQUESTS} from './latest-editor-smoke.js';

// Actual /api/catalog/search records measured 2026-09-26; no network or model in tests.
const products:CatalogProduct[]=[
  {
    "asset": {
      "id": "abo:B07BW8P2F7",
      "name": "Amazon Brand – Rivet Edgewest Low Back Modern Loveseat, 65\"W, Beige",
      "kind": "sofa",
      "category": "sofa",
      "dimensions": [
        1.651,
        0.8119,
        0.8385
      ],
      "color": "#d9cfbf",
      "price": 254000,
      "source": {
        "type": "gltf",
        "url": "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/7/B07BW8P2F7.glb"
      }
    },
    "priceSource": "mock",
    "sizeStatus": "confirmed",
    "attribution": "Amazon Berkeley Objects · CC BY 4.0 (Amazon Berkeley Objects)"
  },
  {
    "asset": {
      "id": "abo:B07DBFQFGS",
      "name": "Amazon Brand – Ravenna Home Dora Classic Shelf Storage Wood Coffee Table, 37\"W, Dark Cherry",
      "kind": "table",
      "category": "table",
      "dimensions": [
        0.9427,
        0.4556,
        0.5327
      ],
      "color": "#571a08",
      "price": 72000,
      "source": {
        "type": "gltf",
        "url": "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/S/B07DBFQFGS.glb"
      }
    },
    "priceSource": "mock",
    "sizeStatus": "confirmed",
    "attribution": "Amazon Berkeley Objects · CC BY 4.0 (Amazon Berkeley Objects)"
  },
  {
    "asset": {
      "id": "abo:B07HPFP4SZ",
      "name": "Movian Andre Accent Chair - Light Grey",
      "kind": "chair",
      "category": "chair",
      "dimensions": [
        0.59,
        0.84,
        0.6101
      ],
      "color": "#919598",
      "price": 58000,
      "source": {
        "type": "gltf",
        "url": "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/Z/B07HPFP4SZ.glb"
      }
    },
    "priceSource": "mock",
    "sizeStatus": "confirmed",
    "attribution": "Amazon Berkeley Objects · CC BY 4.0 (Amazon Berkeley Objects)"
  },
  {
    "asset": {
      "id": "abo:B07B4Y45H5",
      "name": "Amazon Brand – Rivet Fisher Rustic Wood King Bed, 79\"W, Reclaimed-Look Wood",
      "kind": "bed",
      "category": "bed",
      "dimensions": [
        2.0126,
        1.2953,
        2.1837
      ],
      "color": "#8f6446",
      "price": 253000,
      "source": {
        "type": "gltf",
        "url": "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/5/B07B4Y45H5.glb"
      }
    },
    "priceSource": "mock",
    "sizeStatus": "confirmed",
    "attribution": "Amazon Berkeley Objects · CC BY 4.0 (Amazon Berkeley Objects)"
  },
  {
    "asset": {
      "id": "abo:B074KLJQKV",
      "name": "Amazon Brand – Stone & Beam Fremont Slatted 2-Door Cabinet, 31.5\"W, Ash",
      "kind": "cabinet",
      "category": "cabinet",
      "dimensions": [
        0.7959,
        0.7854,
        0.4116
      ],
      "color": "#724934",
      "price": 121000,
      "source": {
        "type": "gltf",
        "url": "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/V/B074KLJQKV.glb"
      }
    },
    "priceSource": "mock",
    "sizeStatus": "confirmed",
    "attribution": "Amazon Berkeley Objects · CC BY 4.0 (Amazon Berkeley Objects)"
  }
];
const proposal=(operations:AgentProposal['command']['operations']):AgentProposal=>({id:'checked',title:'A checked update',description:'Update the room.',command:{id:'checked',label:'Apply update',source:'designer',baseRevision:0,operations}});

test('latest smoke preserves exact customer prompts',()=>expect(REQUESTS.map(row=>row.request)).toEqual(['paint the bedroom walls sage','make the living room feel bigger','add an armchair for reading by the window']));
test('furnished input uses the current normalized shell and only registered database assets',()=>{
  const input=buildInput(products),shell=createApartmentStore(createInitialScene(),[]).scene;
  expect(input.scene.walls).toEqual(shell.walls);expect(input.scene.rooms).toEqual(shell.rooms);expect(input.scene.walls).toHaveLength(13);
  expect(input.scene.objects).toHaveLength(5);expect(input.scene.objects.every(object=>products.some(product=>product.asset.id===object.assetId))).toBe(true);
  expect(input.scene.version).toBe(2);expect(input.scene.project!.metadata['room-living']!.ceilingDesign?.style).toBe('soft-glow');
  expect(input.scene.project!.baseline).toBeDefined();expect(input.scene.project!.options).toHaveLength(1);
  expect(input.scene.objects.every(object=>object.scale.every(value=>value===1))).toBe(true);
});
test('missing real products cannot silently produce a procedural or incomplete fixture',()=>{
  expect(()=>buildInput(products.slice(0,2))).toThrow();
  const wrong=structuredClone(products);wrong[0]!.asset.source={type:'procedural'};expect(()=>buildInput(wrong)).toThrow();
});
test('accepted wall paint preserves ceiling designs and archived v2 data',()=>{
  const input=buildInput(products),wall=input.scene.walls.find(wall=>wall.id==='wall-bedroom')!;
  const checked=checkReply('paint',input.scene,input.products,proposal([{type:'update-wall',id:wall.id,patch:{color:'#9eae98'}}]));
  expect(checked.pass).toBe(true);expect(checked.preservation.ceiling_designs).toBe(true);expect(checked.preservation.archived_options).toBe(true);
});
test('a valid editor command still fails evidence if it drops ceiling metadata',()=>{
  const input=buildInput(products),checked=checkReply('paint',input.scene,input.products,proposal([{type:'update-wall',id:'wall-bedroom',patch:{color:'#9eae98'}},{type:'set-metadata',id:'room-living',patch:{ceilingDesign:null}}]));
  expect(checked.store_result?.ok).toBe(true);expect(checked.preservation.ceiling_designs).toBe(false);expect(checked.pass).toBe(false);
});
