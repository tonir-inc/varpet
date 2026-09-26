import * as THREE from 'three';

/** Text is a label inside the shared 3D scene, not an alternate plan/image preview. */
export function label3d(text: string, color = '#334155', background = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 768; canvas.height = 96;
  if (context) {
    context.font = '600 34px system-ui, sans-serif';
    const width = Math.min(canvas.width - 16, context.measureText(text).width + 36);
    context.fillStyle = background; context.globalAlpha = 0.94;
    context.beginPath(); context.roundRect((canvas.width - width) / 2, 14, width, 64, 13); context.fill();
    context.globalAlpha = 1; context.fillStyle = color; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, 47, canvas.width - 40);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(2.8, 0.35, 1); sprite.renderOrder = 800;
  return sprite;
}

export function dimension3d(start: THREE.Vector3, end: THREE.Vector3, text?: string): THREE.Group {
  const group = new THREE.Group();
  const direction = end.clone().sub(start); const distance = direction.length();
  if (distance < 0.001) return group;
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(0.075);
  const points = [start, end, start.clone().sub(perpendicular), start.clone().add(perpendicular), end.clone().sub(perpendicular), end.clone().add(perpendicular)];
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#536b79', transparent: true, opacity: 0.75, depthTest: false }));
  line.renderOrder = 700; group.add(line);
  const label = label3d(text ?? `${distance.toFixed(2)} m`);
  label.position.copy(start).lerp(end, 0.5).add(new THREE.Vector3(0, 0.08, 0)); group.add(label);
  return group;
}
