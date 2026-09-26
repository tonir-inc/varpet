import type { CatalogAsset, Room, SceneDocument, SceneObject, Vec2, Vec3, Wall } from '../contracts';

const asset = (id: string, name: string, category: string, kind: CatalogAsset['kind'], dimensions: Vec3, color: string, price: number): CatalogAsset =>
  ({ id, name, category, kind, dimensions, color, price, source: { type: 'procedural' } });

export const localCatalog: CatalogAsset[] = [
  asset('sofa-sage', 'Sage linen sofa', 'Living', 'sofa', [2.35, 0.82, 0.92], '#889987', 1280),
  asset('chair-clay', 'Terracotta lounge chair', 'Living', 'chair', [0.82, 0.8, 0.84], '#be775d', 420),
  asset('table-coffee', 'Walnut coffee table', 'Living', 'table', [1.12, 0.38, 0.65], '#795840', 285),
  asset('rug-woven', 'Natural woven rug', 'Textiles', 'rug', [3.35, 0.025, 2.45], '#d8c6a7', 240),
  asset('lamp-brass', 'Arc floor lamp', 'Lighting', 'lamp', [0.42, 1.65, 0.42], '#b3945f', 185),
  asset('console-oak', 'Low oak console', 'Storage', 'cabinet', [1.6, 0.65, 0.4], '#a78059', 390),
  asset('table-dining', 'Gather dining table', 'Dining', 'table', [1.8, 0.75, 0.9], '#947151', 680),
  asset('chair-dining', 'Oak dining chair', 'Dining', 'chair', [0.5, 0.8, 0.55], '#b89a73', 145),
  asset('kitchen-base', 'Sage kitchen sideboard', 'Kitchen', 'cabinet', [2.25, 0.91, 0.65], '#8d9b89', 890),
  asset('kitchen-island', 'Stone kitchen island', 'Kitchen', 'cabinet', [1.55, 0.92, 0.72], '#e2d9c6', 720),
  asset('bath-vanity', 'Oak bathroom vanity', 'Bathroom', 'cabinet', [1.0, 0.82, 0.55], '#a28d72', 460),
  asset('bed-linen', 'Linen platform bed', 'Bedroom', 'bed', [1.9, 0.67, 2.15], '#d9c6af', 1190),
  asset('nightstand', 'Walnut bedside table', 'Bedroom', 'cabinet', [0.6, 0.5, 0.6], '#8b694e', 175),
  asset('wardrobe', 'Oak wardrobe', 'Storage', 'cabinet', [1.4, 2.05, 0.55], '#c1a580', 840),
  asset('rug-bedroom', 'Soft sand bedroom rug', 'Textiles', 'rug', [2.6, 0.02, 3.0], '#ded1bc', 260),
  asset('plant-olive', 'Indoor olive tree', 'Greenery', 'plant', [0.58, 1.42, 0.58], '#758164', 125),
  asset('plant-small', 'Potted fern', 'Greenery', 'plant', [0.42, 0.9, 0.42], '#789075', 65),
  asset('shelf-walnut', 'Open walnut bookshelf', 'Storage', 'shelf', [1.0, 1.8, 0.35], '#8a6749', 340),
];

const room = (id: string, name: string, bounds: [number, number, number, number], color: string): Room => {
  const [x1, z1, x2, z2] = bounds;
  return { id, name, color, polygon: [[x1, z1], [x2, z1], [x2, z2], [x1, z2]] };
};
const wall = (id: string, start: Vec2, end: Vec2, openings: Wall['openings'] = []): Wall =>
  ({ id, start, end, height: 2.7, thickness: 0.16, color: '#f0ebe1', openings });
const object = (id: string, assetId: string, name: string, x: number, z: number, rotation = 0): SceneObject =>
  ({ id, assetId, name, position: [x, 0, z], rotation, scale: [1, 1, 1] });

export const demoScene: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'apartment-avani', name: 'The Avani Apartment', units: 'm', upAxis: 'Y',
  rooms: [
    room('room-living', 'Living & dining', [-5, -4, 0.6, 4], '#ddcfb9'),
    room('room-kitchen', 'Kitchen', [0.6, -4, 3.4, 0.4], '#e5ddcc'),
    room('room-bath', 'Bathroom', [3.4, -4, 5, 0.4], '#cbd3c8'),
    room('room-bedroom', 'Bedroom', [0.6, 0.4, 5, 4], '#d9c6ad'),
  ],
  walls: [
    wall('wall-west', [-5, -4], [-5, 4], [{ id: 'window-west', kind: 'window', offset: 4.5, width: 2.4, height: 1.45, sill: 0.85 }]),
    wall('wall-east', [5, -4], [5, 4], [
      { id: 'window-bath', kind: 'window', offset: 1.2, width: 1.0, height: 0.8, sill: 1.5 },
      { id: 'window-bedroom', kind: 'window', offset: 5.5, width: 1.7, height: 1.45, sill: 0.85 },
    ]),
    wall('wall-south', [-5, -4], [5, -4], [
      { id: 'door-entry', kind: 'door', offset: 0.7, width: 1.05, height: 2.2, sill: 0 },
      { id: 'window-kitchen', kind: 'window', offset: 6.0, width: 1.8, height: 1.2, sill: 1.15 },
    ]),
    wall('wall-north', [-5, 4], [5, 4], [{ id: 'window-living', kind: 'window', offset: 0.9, width: 2.7, height: 1.45, sill: 0.85 }]),
    wall('wall-spine', [0.6, -4], [0.6, 4], [
      { id: 'door-kitchen', kind: 'door', offset: 1.9, width: 1.1, height: 2.2, sill: 0 },
      { id: 'door-bedroom', kind: 'door', offset: 5.0, width: 1.1, height: 2.2, sill: 0 },
    ]),
    wall('wall-bedroom', [0.6, 0.4], [5, 0.4]),
    wall('wall-bath', [3.4, -4], [3.4, 0.4], [{ id: 'door-bath', kind: 'door', offset: 3.15, width: 0.9, height: 2.15, sill: 0 }]),
  ],
  objects: [
    object('living-rug', 'rug-woven', 'Woven living rug', -3.15, 1.95),
    object('sofa', 'sofa-sage', 'Sage linen sofa', -3.25, 2.8, Math.PI),
    object('coffee-table', 'table-coffee', 'Walnut coffee table', -3.25, 1.48),
    object('lounge-chair', 'chair-clay', 'Terracotta lounge chair', -1.15, 1.95, -Math.PI / 2),
    object('floor-lamp', 'lamp-brass', 'Brass reading lamp', -4.66, 2.85),
    object('media-console', 'console-oak', 'Oak media console', -4.6, -0.05, Math.PI / 2),
    object('dining-table', 'table-dining', 'Gather dining table', -2.65, -2.35),
    object('dining-chair-north', 'chair-dining', 'Dining chair · north', -2.65, -1.45, Math.PI),
    object('dining-chair-south', 'chair-dining', 'Dining chair · south', -2.65, -3.25),
    object('dining-chair-west', 'chair-dining', 'Dining chair · west', -3.85, -2.35, Math.PI / 2),
    object('dining-chair-east', 'chair-dining', 'Dining chair · east', -1.45, -2.35, -Math.PI / 2),
    object('kitchen-sideboard', 'kitchen-base', 'Sage kitchen sideboard', 1.98, -3.54),
    object('kitchen-island', 'kitchen-island', 'Stone kitchen island', 2.0, -1.85),
    object('bathroom-vanity', 'bath-vanity', 'Oak bathroom vanity', 4.2, -3.48),
    object('bathroom-fern', 'plant-small', 'Bathroom fern', 4.45, -1.3),
    object('bedroom-rug', 'rug-bedroom', 'Soft bedroom rug', 2.8, 2.25),
    object('bed', 'bed-linen', 'Linen platform bed', 2.8, 2.5, Math.PI),
    object('bedside-table', 'nightstand', 'Walnut bedside table', 4.2, 3.05),
    object('bedroom-wardrobe', 'wardrobe', 'Oak bedroom wardrobe', 4.55, 1.35, -Math.PI / 2),
    object('living-olive', 'plant-olive', 'Living room olive tree', -0.22, 3.35),
  ],
};
