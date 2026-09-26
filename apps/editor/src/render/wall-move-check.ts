/** Real camera/raycast controller checks; WebGL projection rendering needs browser QA. */
import * as THREE from 'three';
import type { SceneDocument, Vec2, Wall } from '../contracts';
import { createWallMove } from './wall-move';

let assertions = 0;
function assert(condition: unknown, message: string): void {
  assertions++;
  if (!condition) throw new Error(`Wall controller: ${message}`);
}
const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-7;
type Patch = { start: Vec2; end: Vec2 };
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let currentStatus: { hidden: boolean; removed: boolean };
const globals = new Map(['document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

// The controller only needs its status element and canvas capture. Frames remain
// queued deliberately: these checks exercise input without pretending to render.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(tag: string) {
    if (tag !== 'div') throw new Error(`Unexpected DOM element: ${tag}`);
    const status = { hidden: true, removed: false, style: {}, textContent: '', setAttribute() {}, remove() { this.removed = true; } };
    currentStatus = status;
    return status;
  },
} });
Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => {
  const id = ++nextFrame; frames.set(id, callback); return id;
} });
Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => { frames.delete(id); } });

try {
  const directions: Vec2[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
  for (const top of [true, false]) for (const [dx, dz] of directions) {
    const label = `${top ? 'Top' : '3D'} (${dx}, ${dz})`;
    const world = new THREE.Scene();
    const camera = top ? new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100) : new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(...(top ? [0, 10, 0] : [8, 10, 12]) as [number, number, number]);
    if (top) camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const originX = top && dx === 0 && dz === 1 ? 0.6 : 0;
    const wall: Wall = { id: 'wall', start: [originX - 2 * dx, -2 * dz], end: [originX + 2 * dx, 2 * dz], height: 2.7, thickness: 0.16, color: '#ffffff', openings: [] };
    const source: SceneDocument = {
      format: 'varpet.editor', version: 1, id: 'controller-check', name: 'Controller check', units: 'm', upAxis: 'Y',
      rooms: [{ id: 'room', name: 'Room', polygon: [[-5, -5], [5, -5], [5, 5], [-5, 5]], color: '#eeeeee' }], walls: [wall], objects: [],
    };
    const original = JSON.stringify(source);
    const captures = new Set<number>();
    const canvas = {
      parentElement: { append() {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      setPointerCapture: (id: number) => { captures.add(id); },
      hasPointerCapture: (id: number) => captures.has(id),
      releasePointerCapture: (id: number) => { captures.delete(id); },
    } as unknown as HTMLCanvasElement;
    const finishes: { id: string; patch: Patch | null }[] = [];
    let starts = 0;
    let enabled = true;
    let snap = true;
    const controller = createWallMove({
      world, canvas, getCamera: () => camera, getScene: () => source, getCatalog: () => [], getWall: () => wall,
      enabled: () => enabled, snap: () => snap, wallMode: () => 'full', topView: () => top,
      onStart() { starts++; }, onFinish(id, patch) { finishes.push({ id, patch }); },
      onPreview(shell, services) { assert(shell === null && services === null, `${label}: cleanup removes the preview`); },
      requestRender() {},
    });
    controller.refresh();
    const normal = new THREE.Vector3(-dz, 0, dx).normalize();
    const origin = new THREE.Vector3(originX, 0.2, 0);
    const pointer = (point: THREE.Vector3, pointerId = 1, button = 0): PointerEvent => {
      const screen = point.clone().project(camera);
      return { clientX: (screen.x + 1) * 200, clientY: (1 - screen.y) * 200, pointerId, button, stopImmediatePropagation() {} } as PointerEvent;
    };
    const shifted = (distance: number) => pointer(origin.clone().addScaledVector(normal, distance));
    const begin = () => {
      const before = starts;
      assert(controller.pointerDown(pointer(origin)) && controller.active && captures.has(1) && starts === before + 1, `${label}: handle starts one captured gesture`);
    };
    const expectShift = (patch: Patch | null | undefined, distance: number) => {
      assert(patch && (['start', 'end'] as const).every(side => near(patch[side][0], wall[side][0] + normal.x * distance) && near(patch[side][1], wall[side][1] + normal.z * distance)), `${label}: both endpoints move ${distance} m perpendicular to the wall`);
    };

    const handleAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(world.children[0]!.quaternion);
    assert(handleAxis.dot(normal) > 0.999999, `${label}: arrows align with movement`);
    enabled = false;
    assert(!controller.pointerDown(pointer(origin)) && starts === 0, `${label}: disabled wall cannot start`);
    enabled = true;
    assert(!controller.pointerDown(pointer(origin, 1, 2)) && starts === 0, `${label}: right button cannot start`);

    begin();
    const click = pointer(origin);
    controller.finish(false, { ...click, clientX: click.clientX + 1 } as PointerEvent);
    assert(finishes.length === 1 && finishes[0]!.patch === null, `${label}: click does not produce an edit`);

    begin();
    const beforeMove = finishes.length;
    assert(!controller.pointerMove(pointer(origin.clone().addScaledVector(normal, 3), 2)) && frames.size === 0, `${label}: another pointer cannot move the wall`);
    controller.pointerMove(shifted(0.5)); controller.pointerMove(shifted(0.5));
    assert(frames.size === 1 && finishes.length === beforeMove, `${label}: pointer moves coalesce preview work without committing`);
    assert(!controller.finish(false, pointer(origin, 2)) && controller.active, `${label}: another pointer cannot finish`);
    controller.finish(false, shifted(0.6));
    expectShift(finishes.at(-1)?.patch, 0.6);
    assert(finishes.length === beforeMove + 1 && finishes.at(-1)!.id === wall.id && !controller.finish(false), `${label}: release samples its final position and calls finish exactly once`);
    assert(!controller.active && captures.size === 0 && frames.size === 0, `${label}: release clears gesture, capture and queued preview`);

    begin(); controller.finish(false, shifted(-0.47)); expectShift(finishes.at(-1)?.patch, -0.45);
    snap = false;
    begin(); controller.finish(false, shifted(0.473)); expectShift(finishes.at(-1)?.patch, 0.473);
    snap = true;

    if (originX === 0.6) {
      begin(); controller.finish(false, shifted(0.15));
      const patch = finishes.at(-1)?.patch;
      assert(patch?.start[0] === 0.45 && patch.end[0] === 0.45, `${label}: snapped 0.6 - 0.15 stores clean decimal coordinates 0.45`);
    }

    begin(); controller.pointerMove(shifted(0.5)); controller.pointerMove(pointer(origin)); controller.finish(false, pointer(origin));
    assert(finishes.at(-1)!.patch === null && frames.size === 0, `${label}: returning to origin does not produce an edit`);

    const bodyOrigin = new THREE.Vector3(originX + dx, 1.5, dz);
    assert(controller.pointerDown(pointer(bodyOrigin), wall.id, bodyOrigin), `${label}: selected wall body also starts a gesture`);
    controller.finish(false, pointer(bodyOrigin.clone().addScaledVector(normal, 0.5)));
    expectShift(finishes.at(-1)?.patch, 0.5);

    begin(); controller.pointerMove(shifted(0.5));
    const beforeCancel = finishes.length;
    controller.finish(true);
    assert(finishes.length === beforeCancel + 1 && finishes.at(-1)!.patch === null && !controller.active && captures.size === 0 && frames.size === 0, `${label}: cancellation clears the gesture without an edit`);
    assert(JSON.stringify(source) === original, `${label}: gestures never mutate the source document`);

    begin(); controller.pointerMove(shifted(0.5));
    const beforeDispose = finishes.length;
    controller.dispose();
    assert(finishes.length === beforeDispose + 1 && finishes.at(-1)!.patch === null && captures.size === 0 && frames.size === 0, `${label}: disposing an active controller cancels once`);
    assert(world.children.length === 0 && currentStatus!.removed, `${label}: disposal removes handles and status element`);
  }
  console.log(`Wall controller checks passed (${assertions} assertions; 6 wall directions in Top and 3D). Preview rendering requires browser verification.`);
} finally {
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
