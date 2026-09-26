import * as THREE from 'three';
import type { OpeningDimensions, OpeningTransformMode } from '../core/opening-transform';
import type { Wall } from '../contracts';
import './opening-handles.css';

const controls: [OpeningTransformMode, string][] = [
  ['move', 'Move window'], ['move-x', 'Move window sideways'], ['move-y', 'Move window vertically'],
  ['left', 'Resize window left edge'], ['right', 'Resize window right edge'],
  ['top', 'Resize window top edge'], ['bottom', 'Resize window bottom edge'],
  ['top-left', 'Resize window top left corner'], ['top-right', 'Resize window top right corner'],
  ['bottom-left', 'Resize window bottom left corner'], ['bottom-right', 'Resize window bottom right corner'],
];

/** Screen-sized hit targets anchored to the actual 3D opening, at every zoom. */
export class OpeningHandles {
  readonly element = document.createElement('div');
  private readonly buttons = new Map<OpeningTransformMode, HTMLButtonElement>();
  private readonly readout = document.createElement('output');
  private readonly point = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  constructor(container: HTMLElement, start: (event: PointerEvent, mode: OpeningTransformMode) => void) {
    this.element.className = 'opening-drag-controls'; this.element.hidden = true;
    this.element.setAttribute('role', 'group'); this.element.setAttribute('aria-label', 'Window move and resize handles');
    for (const [mode, label] of controls) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `opening-drag-knob ${mode.startsWith('move') ? 'opening-drag-move' : 'opening-drag-resize'}`;
      button.dataset.openingHandle = mode; button.setAttribute('aria-label', label); button.title = `${label} · drag to adjust`;
      button.textContent = mode === 'move' ? '✥' : mode === 'move-x' ? '↔' : mode === 'move-y' ? '↕' : '';
      button.style.cursor = mode.startsWith('move') ? 'grab' : mode === 'left' || mode === 'right' ? 'ew-resize' : mode === 'top' || mode === 'bottom' ? 'ns-resize' : mode === 'top-left' || mode === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
      button.onpointerdown = event => start(event, mode);
      this.buttons.set(mode, button); this.element.append(button);
    }
    this.readout.className = 'opening-drag-readout'; this.readout.hidden = true; this.element.append(this.readout);
    container.append(this.element);
  }

  hide(): void { this.element.hidden = true; }

  update(wall: Wall, dimensions: OpeningDimensions, elevation: number, camera: THREE.Camera, width: number, height: number, vertical: boolean, active?: OpeningTransformMode): void {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    const position = (along: number, up: number) => {
      this.point.set(wall.start[0] + dx / length * along, elevation + up, wall.start[1] + dz / length * along);
      this.projected.copy(this.point).project(camera);
      return { x: (this.projected.x + 1) * width / 2, y: (1 - this.projected.y) * height / 2, visible: this.projected.z >= -1 && this.projected.z <= 1 };
    };
    const { offset, width: w, height: h, sill } = dimensions;
    const center = position(offset + w / 2, sill + h / 2);
    this.element.hidden = !center.visible;
    if (this.element.hidden) return;
    const alongScreen = position(offset + w / 2 + 1, sill + h / 2);
    const screenLength = Math.hypot(alongScreen.x - center.x, alongScreen.y - center.y) || 1;
    const edgePoints = controls.filter(([mode]) => !mode.startsWith('move') && (vertical || mode === 'left' || mode === 'right')).map(([mode]) =>
      position(mode.includes('left') ? offset : mode.includes('right') ? offset + w : offset + w / 2,
        mode.includes('top') ? sill + h : mode.includes('bottom') ? sill : sill + h / 2));
    const occupied = [...edgePoints, center];
    const axisPoint = (dx: number, dy: number) => {
      // Never put a move arrow on an edge handle: at smaller zoom levels they
      // would otherwise share the same hit target and moving would resize.
      for (const distance of [42, -42, 78, -78, 114, -114, 150, -150, 186, -186]) {
        const point = { ...center, x: center.x + dx * distance, y: center.y + dy * distance };
        if (point.x < 16 || point.x > width - 16 || point.y < 16 || point.y > height - 16) continue;
        if (occupied.every(other => Math.abs(point.x - other.x) >= 32 || Math.abs(point.y - other.y) >= 32)) {
          occupied.push(point); return point;
        }
      }
      return undefined;
    };
    const horizontalArrow = vertical ? axisPoint((alongScreen.x - center.x) / screenLength, (alongScreen.y - center.y) / screenLength) : center;
    const verticalArrow = vertical ? axisPoint(0, -1) : undefined;
    for (const [mode, button] of this.buttons) {
      const isMove = mode.startsWith('move');
      button.hidden = !vertical && mode !== 'move-x' && mode !== 'left' && mode !== 'right';
      if (button.hidden) continue;
      const x = mode.includes('left') ? offset : mode.includes('right') ? offset + w : offset + w / 2;
      const y = mode.includes('top') ? sill + h : mode.includes('bottom') ? sill : sill + h / 2;
      const point = mode === 'move-x' ? horizontalArrow : mode === 'move-y' ? verticalArrow : isMove ? center : position(x, y);
      if (!point) { button.hidden = true; continue; }
      button.style.left = `${point.x}px`; button.style.top = `${point.y}px`;
      button.classList.toggle('is-dragging', active === mode);
    }
    this.readout.hidden = !active;
    if (active) {
      this.readout.value = `${w.toFixed(2)} × ${h.toFixed(2)} m · sill ${sill.toFixed(2)} m`;
      this.readout.style.left = `${center.x}px`; this.readout.style.top = `${center.y + 44}px`;
    }
  }

  dispose(): void { this.element.remove(); }
}
