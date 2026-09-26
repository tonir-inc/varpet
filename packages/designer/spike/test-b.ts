import { readFile } from 'node:fs/promises';
import { renderPlan } from './lib/render-plan.js';
import type { Scene, Item } from '../src/scene.js';

const scene: Scene = JSON.parse(await readFile(new URL('./fixtures/avani-empty.json', import.meta.url), 'utf8'));

const draft: { items: Item[] } = {
  items: [
    { id: 'sofa-1', room_id: 'room-living', kind: 'sofa', name: 'Sofa', pos: [-3, 0], rot: 0, size: [2.2, 0.9, 0.8], keep: false },
    { id: 'bed-1', room_id: 'room-bedroom', kind: 'bed', name: 'Bed', pos: [2.8, -2], rot: 90, size: [1.6, 2.0, 0.5], keep: false },
    { id: 'table-1', room_id: 'room-living', kind: 'table', name: 'Dining table', pos: [-1.5, -2], rot: 45, size: [1.4, 0.8, 0.75], keep: false },
  ],
};

const outFull = new URL('./plan-full.png', import.meta.url).pathname;
const outRoom = new URL('./plan-bedroom.png', import.meta.url).pathname;

await renderPlan(scene, draft, outFull);
console.log('wrote', outFull);

await renderPlan(scene, draft, outRoom, { roomId: 'room-bedroom' });
console.log('wrote', outRoom);
