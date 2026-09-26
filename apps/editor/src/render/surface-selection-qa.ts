/** Isolated GPU verification; never loads or writes the user's saved apartment. */
import * as THREE from 'three';
import { SelectionOutline } from './selection-outline';
import { SelectionFrame } from './selection-style';
import { createViewport } from './viewport';
import { makeStructure } from './structure';
import { makeServices } from './services';
import { disposeObject } from './assets';
import { demoScene, localCatalog } from '../core/demo';
import { migrateScene } from '../core/renovation';

const output = document.querySelector<HTMLPreElement>('#result')!;
const errors: string[] = [];
const observedFrames: { id: string; frames: number }[] = [];
const originalRender = SelectionOutline.prototype.render;
SelectionOutline.prototype.render = function (...args) {
  let frames = 0;
  this.renderScene.traverseVisible(object => { if (object instanceof SelectionFrame) frames++; });
  observedFrames.push({ id: this.selectedObjects[0]?.userData.entityId ?? this.selectedObjects[0]?.userData.objectId, frames });
  originalRender.apply(this, args);
};
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect: id => viewport.setSelection(id), onInteraction() {}, onTransform() {},
  onError: message => errors.push(message),
});
viewport.setScene(demoScene, localCatalog); viewport.setTool('move'); viewport.setSelection('room-bedroom');
document.querySelectorAll<HTMLButtonElement>('[data-id]').forEach(button => {
  button.onclick = () => viewport.setSelection(button.dataset.id!);
});
document.querySelector<HTMLButtonElement>('#clear')!.onclick = () => viewport.setSelection(null);
let top = false;
document.querySelector<HTMLButtonElement>('#top')!.onclick = () => { top = !top; viewport.setView(top ? 'top' : 'perspective'); };

document.querySelector<HTMLButtonElement>('#run')!.onclick = () => {
  const results: string[] = [];
  const check = (ok: unknown, label: string) => {
    if (!ok) throw new Error(label);
    results.push(`PASS ${label}`); output.textContent = results.join('\n');
  };
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(256, 256); renderer.setPixelRatio(1);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202127');
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 100); camera.position.set(8, 7, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const document = migrateScene(structuredClone(demoScene));
  document.objects = [];
  document.project!.components.push({ id: 'ceiling-slab', name: 'Ceiling slab', kind: 'ceiling', position: [0, 3, 0], dimensions: [2, .25, 2], rotation: 0, color: '#ddd', phase: 'existing' });
  const originalDocument = JSON.stringify(document);
  const structure = makeStructure(document), services = makeServices(document);
  scene.add(structure.group, structure.ceilings, services.group);
  structure.updateWalls(camera, 'full', false, 0, true);
  structure.ceilings.visible = false;
  const pass = new SelectionOutline(scene, camera); pass.setSize(256, 256);
  const read = new THREE.WebGLRenderTarget(256, 256), write = read.clone();
  const originalGeometries = new Map<THREE.Mesh, THREE.BufferGeometry>();
  const originalVisibility = new Map<THREE.Object3D, boolean>();
  const samples: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry }[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    originalGeometries.set(object, object.geometry);
    object.onBeforeRender = (_r, _s, _c, geometry, material) => {
      if (material === pass.prepareMaskMaterial && geometry.getAttribute('position').count) samples.push({ mesh: object, geometry });
    };
  });
  const draw = (roots: THREE.Object3D[]) => {
    samples.length = 0; originalVisibility.clear();
    scene.traverse(object => originalVisibility.set(object, object.visible));
    pass.setSelection(roots);
    renderer.setRenderTarget(read); renderer.render(scene, pass.renderCamera);
    if (pass.enabled) pass.render(renderer, write, read, 0, false);
    return [...samples];
  };
  const bounds = (geometry: THREE.BufferGeometry) => { geometry.computeBoundingBox(); return geometry.boundingBox!; };
  try {
    const floor = structure.entities.get('room-bedroom')!;
    let drawn = draw([floor]);
    check(drawn.length > 0 && drawn.every(({ geometry }) => bounds(geometry).max.z - bounds(geometry).min.z < 1e-6), 'floor mask contains only its top surface');
    const wall = structure.entities.get('wall-spine')!;
    drawn = draw([wall]);
    check(drawn.length > 0 && drawn.every(({ mesh }) => mesh.userData.finishEntityId === 'wall-spine'), 'wall mask excludes doors, window frames and skirting');
    check(drawn.every(({ geometry }) => geometry.groups.every(group => group.materialIndex === 4 || group.materialIndex === 5)), 'wall mask excludes top, bottom and end caps');
    check(new Set(drawn.flatMap(({ geometry }) => geometry.groups.map(group => group.materialIndex))).size === 1, 'wall mask selects one broad face');
    const originalSide = drawn[0]!.geometry.groups[0]!.materialIndex;
    camera.position.set(-8, 7, -10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    drawn = draw([wall]);
    check(drawn.length > 0 && drawn[0]!.geometry.groups[0]!.materialIndex !== originalSide, 'orbiting to the other side follows its visible face');
    const ceiling = services.entities.get('ceiling-slab')!;
    camera.position.set(5, 1, 5); camera.lookAt(0, 3, 0); camera.updateMatrixWorld();
    drawn = draw([ceiling]);
    check(drawn.length > 0 && drawn.every(({ geometry }) => Math.abs(bounds(geometry).max.y + .125) < 1e-6 && bounds(geometry).max.y === bounds(geometry).min.y), 'ceiling slab mask contains only the underside');
    const roomCeiling = structure.ceilings.children.find(object => object.userData.entityId === 'room-bedroom')!;
    structure.ceilings.visible = true; roomCeiling.visible = true;
    camera.position.set(2, 1, 2); camera.lookAt(2, 3, 2); camera.updateMatrixWorld();
    drawn = draw([roomCeiling]);
    check(drawn.length > 0 && drawn.every(({ mesh }) => mesh === roomCeiling), 'room ceiling outlines its own surface');
    camera.position.set(2, 5, 2); camera.lookAt(2, 3, 2); camera.updateMatrixWorld();
    drawn = draw([roomCeiling]);
    check(drawn.length === 0, 'ceiling underside does not glow through its hidden back face');
    structure.ceilings.visible = false;
    camera.position.set(2, -2, 2); camera.lookAt(2, 0, 2); camera.updateMatrixWorld();
    drawn = draw([floor]);
    check(drawn.length === 0, 'floor top does not glow through its underside');
    const ortho = new THREE.OrthographicCamera(-7, 7, 7, -7, .1, 100); ortho.position.set(0, 15, 0); ortho.lookAt(0, 0, 0); ortho.updateMatrixWorld();
    pass.renderCamera = ortho;
    drawn = draw([floor]);
    check(drawn.length > 0 && pass.prepareMaskMaterial.uniforms.selectionOrthographic!.value, 'Top view renders the floor surface');
    drawn = draw([wall]);
    check(drawn.length > 0 && drawn.every(({ geometry }) => geometry.groups.every(group => group.materialIndex === 2)), 'Top view outlines the wall top surface');
    drawn = draw([floor, wall]);
    check(drawn.some(({ mesh }) => mesh.userData.finishEntityId === 'room-bedroom') && drawn.some(({ mesh }) => mesh.userData.finishEntityId === 'wall-spine'), 'multiple selected surfaces reach the GPU');
    floor.visible = false; drawn = draw([floor]);
    check(drawn.length === 0 && !floor.visible, 'hidden surfaces produce no mask'); floor.visible = true;
    draw([]); check(!pass.enabled, 'clearing selection disables the outline');
    check([...originalGeometries].every(([mesh, geometry]) => mesh.geometry === geometry), 'all authored geometry identities are restored');
    check([...originalVisibility].every(([object, visible]) => object.visible === visible), 'exact object visibility is restored');
    check(JSON.stringify(document) === originalDocument, 'selection leaves the document unchanged');
    check(observedFrames.some(sample => sample.id === 'room-bedroom' && sample.frames === 0), 'Move mode floor selection has no block-corner frame');
    check(errors.length === 0, 'real viewport reports no rendering errors');
    output.textContent += `\nCOMPLETE ${results.length} surface selection checks.`;
  } catch (error) {
    output.textContent += `\nFAIL ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    pass.dispose(); read.dispose(); write.dispose(); disposeObject(structure.group); disposeObject(structure.ceilings); disposeObject(structure.dimensions); disposeObject(services.group); renderer.dispose();
  }
};
