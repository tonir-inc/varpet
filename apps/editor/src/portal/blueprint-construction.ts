import * as THREE from 'three';
import { createViewport, type FinishViewport, type FinishViewportCallbacks } from '../render/viewport';
import type { SceneNormalizer } from '../core/store';
import type { BlueprintGround, SheetRect } from '../render/blueprint-ground';
import { registerPlan } from '../ui/plan-registration';
import { migrateScene } from '../core/renovation';
import type { BuildingComponent, CatalogAsset, Room, SceneDocument, SceneObject, Vec3, Wall } from '../contracts';
import type { StageEvent, StagePhase } from '../ui/architect-stage';
import type { BlueprintInk } from './blueprint-ink';
import '../ui/architect-stage.css';

/**
 * The construction view, drawn by the editor's own viewport: the same lighting, cutaway walls and
 * door and window models the person will edit, standing on their blueprint instead of a pedestal.
 * It is look-only (orbit, pan, zoom, move) while the architect works; the editor takes over from
 * exactly this picture when the build is done.
 */
export interface BlueprintConstruction {
  start(): void;
  /** Where the flat plan sheet sits on screen (viewport pixels), for the 2D handoff. */
  planRect(): { left: number; top: number; width: number; height: number } | undefined;
  /** Tilt from the flat sheet into the 3D view. */
  enter(): void;
  event(event: StageEvent): void;
  progress(message: string): void;
  /** Load a recorded checkpoint without replaying its animation. */
  hydrate(events: StageEvent[], phase: StagePhase): Promise<void>;
  /** Show the checked result, lift the source sheet off the ground and frame the apartment. */
  finish(scene: SceneDocument, catalog: CatalogAsset[]): Promise<void>;
  /** The live camera, for the editor's first frame. */
  pose(): { position: Vec3; target: Vec3; fov: number } | null;
  /** Transfer this exact world to the editor once; disposing the stage then leaves it alive. */
  takeViewport(): FinishViewport | null;
  /** Put a transferred world back on the completion screen if editor initialization fails. */
  reclaimViewport(): void;
  dispose(): void;
}

export interface BlueprintConstructionOptions {
  /** An existing editor world can host construction; take it back before disposing this stage. */
  viewport?: FinishViewport;
  normalizeScene?: SceneNormalizer;
  onPhase?(phase: StagePhase): void;
  ink: BlueprintInk;
  /** The traced plan: ink coverage in alpha and pen order in red. */
  sheet: HTMLCanvasElement;
  paper: string;
  /** Screen space kept clear of the overlaid heading and progress, in CSS pixels. */
  insets?: () => { top: number; bottom: number };
}

const PHASES: StagePhase[] = ['reading', 'walls', 'building', 'placing', 'checking', 'done'];
const LIVE_ID = 'blueprint-construction';
const NOMINAL_WIDTH = 10;
/** The editor's own 3/4 bearing, a little higher so the rooms read from above while they fill. */
const AZIMUTH = Math.atan2(0.95, 1.35), ELEVATION = THREE.MathUtils.degToRad(40);
const TRACE_PERIOD = 5200;
/** The reading band passes down the sheet every few seconds while the architect works. */
const SCAN_PASS = 3800, SCAN_REST = 1700;
/** A slow drift keeps the waiting view alive, in radians per second, after the tilt settles. */
const DRIFT = 0.025, TILT = 1900;
/** How long the walls take to rise out of the sheet. */
const RISE = 1700;
interface Box { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export function createBlueprintConstruction(host: HTMLElement, options: BlueprintConstructionOptions): BlueprintConstruction {
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'as-stage is-blueprint bc-stage';
  root.innerHTML = `<div class="bc-viewport"></div>`;
  const navigation = document.createElement('div');
  navigation.className = 'as-navigation'; navigation.hidden = true;
  navigation.setAttribute('role', 'group'); navigation.setAttribute('aria-label', 'Explore your space');
  const legend = (rows: [string, string][]) => rows.map(([key, action]) => `<div><dt>${key}</dt><dd>${action}</dd></div>`).join('');
  navigation.innerHTML = `<dl class="as-mouse-help">${legend([['Drag', 'orbit'], ['Scroll', 'zoom'], ['Space + drag', 'pan'], ['WASD', 'move']])}</dl>
    <dl class="as-touch-help">${legend([['Drag', 'orbit'], ['Pinch', 'zoom'], ['Two fingers', 'pan']])}</dl>
    <button type="button" title="Frame your space and follow the build"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.5 2v3.2h3.2"/></svg>Reset view</button>`;
  root.append(navigation);
  host.append(root);
  const container = root.querySelector<HTMLElement>('.bc-viewport')!;

  const callbacks: FinishViewportCallbacks = {
    onSelect() {}, onTransform() {}, onInteraction() {},
    onError(message) { console.warn('[blueprint-construction]', message); },
  };
  const viewport = options.viewport ?? createViewport(container, callbacks, options.normalizeScene);
  if (options.viewport) viewport.attach(container, callbacks, options.normalizeScene);
  viewport.setWalls('cutaway');
  viewport.setLocked(true);
  const ground: BlueprintGround | null = viewport.setBackdrop({ paper: options.paper });
  if (ground) {
    // A borrowed world may have completed an earlier build's sheet erase.
    ground.erase = 0; ground.trace = null; ground.scan = null;
    ground.gridOpacity = 1; ground.sheetOpacity = 1;
  }
  ground?.setSheet(options.sheet);
  const aspect = options.ink.height / Math.max(1, options.ink.width);

  let disposed = false, entered = false, phase = -1, shellSeen = false, following = true;
  let rooms: Room[] = [], walls: Wall[] = [], components: BuildingComponent[] = [], lights: BuildingComponent[] = [];
  let objects: SceneObject[] | null = null;
  const assets = new Map<string, CatalogAsset>();
  let traceFrame = 0, traceStart = 0, finished = false;
  /** The camera move under way before the walls arrive, so re-anchoring the sheet can carry it on. */
  let cameraGoal: { position: Vec3; target: Vec3; until: number } | null = null;
  const tweens = new Map<number, () => void>(), timers = new Set<number>();
  let transferred = false;

  const insets = () => options.insets?.() ?? { top: 0, bottom: 0 };
  // The legend sits just above the flow's own progress, whatever it currently shows.
  const placeNavigation = () => { if (!disposed) navigation.style.bottom = `${insets().bottom + 12}px`; };
  const resizing = new ResizeObserver(placeNavigation); resizing.observe(host);
  const setPhase = (next: StagePhase) => {
    const index = PHASES.indexOf(next);
    if (index <= phase) return;
    phase = index; options.onPhase?.(next);
    requestAnimationFrame(placeNavigation);
  };

  // A press on the canvas is the person taking the camera: stop following the build until Reset view.
  const onPress = () => { following = false; };
  container.addEventListener('pointerdown', onPress, true);
  container.addEventListener('keydown', onPress, true);
  container.addEventListener('wheel', onPress, { capture: true, passive: true });
  navigation.querySelector('button')!.onclick = () => { following = true; frameBuild(1200); };

  /** A pose that fits the box in the part of the screen the overlaid text leaves free. */
  function framing(box: Box, elevation: number, margin = 1.12, azimuth = AZIMUTH): { position: Vec3; target: Vec3 } {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const { top, bottom } = insets();
    const free = Math.max(0.35, (height - top - bottom) / height);
    const fov = viewport.cameraPose()?.fov ?? 32;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * width / height;
    const direction = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const centre = new THREE.Vector3((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
    let distance = 2;
    for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) for (const z of [box.minZ, box.maxZ]) {
      const offset = new THREE.Vector3(x, y, z).sub(centre);
      distance = Math.max(distance, offset.dot(direction) + Math.abs(offset.dot(right)) / tanH, offset.dot(direction) + Math.abs(offset.dot(up)) / (tanV * free));
    }
    distance *= margin;
    // Centre the box in the free band, not the whole screen.
    const shift = (top - bottom) / 2 / height * 2 * distance * tanV;
    const target = centre.clone().addScaledVector(up, shift);
    return { position: target.clone().addScaledVector(direction, distance).toArray(), target: target.toArray() };
  }
  const sheetBox = (rect: SheetRect): Box => {
    const floor = ground?.floorLevel ?? 0;
    return { minX: rect.x - rect.width / 2, maxX: rect.x + rect.width / 2, minY: floor, maxY: floor, minZ: rect.z - rect.depth / 2, maxZ: rect.z + rect.depth / 2 };
  };
  function buildBox(): Box | undefined {
    const points = [...rooms.flatMap(room => room.polygon), ...walls.flatMap(wall => [wall.start, wall.end])];
    if (!points.length) return undefined;
    const height = Math.max(2.4, ...walls.map(wall => wall.height ?? 2.7));
    return { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: 0, maxY: height,
      minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])) };
  }
  function frameBuild(duration: number) {
    const box = buildBox();
    if (box) viewport.setCameraPose(framing(box, ELEVATION, 1.1), reduced() ? 0 : duration);
    else if (ground) viewport.setCameraPose(framing(sheetBox(ground.sheetRect), ELEVATION, 1.05), reduced() ? 0 : duration);
  }

  function tween(duration: number, apply: (k: number) => void): Promise<void> {
    if (reduced() || duration <= 0) { apply(1); viewport.redraw(); return Promise.resolve(); }
    return new Promise(resolve => {
      const started = performance.now();
      const step = (now: number) => {
        tweens.delete(frame);
        if (disposed) { resolve(); return; }
        const t = reduced() ? 1 : Math.min(1, (now - started) / duration);
        apply(t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); viewport.redraw();
        if (t < 1) { frame = requestAnimationFrame(step); tweens.set(frame, resolve); } else resolve();
      };
      let frame = requestAnimationFrame(step); tweens.set(frame, resolve);
    });
  }

  /**
   * While the architect works and no walls have arrived: light runs along the plan's lines, a
   * reading band passes down the sheet, and the camera drifts until the person takes it.
   */
  function startTrace(driftAfter = TILT) {
    if (reduced() || traceFrame || !ground || shellSeen) return;
    traceStart = performance.now();
    const step = (now: number) => {
      traceFrame = 0;
      if (disposed || shellSeen || !ground) return;
      const elapsed = now - traceStart;
      ground.trace = (elapsed % TRACE_PERIOD) / TRACE_PERIOD * 1.35 - 0.2;
      const pass = elapsed % (SCAN_PASS + SCAN_REST);
      ground.scan = pass < SCAN_PASS ? -0.1 + 1.2 * pass / SCAN_PASS : null;
      if (following && elapsed > driftAfter) {
        viewport.setCameraPose(framing(sheetBox(ground.sheetRect), ELEVATION, 1.02, AZIMUTH + DRIFT * (elapsed - driftAfter) / 1000), 0);
      }
      viewport.redraw();
      traceFrame = requestAnimationFrame(step);
    };
    traceFrame = requestAnimationFrame(step);
  }
  function stopTrace() { cancelAnimationFrame(traceFrame); traceFrame = 0; if (ground) { ground.trace = null; ground.scan = null; } }

  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionPreference = () => {
    if (disposed) return;
    if (motionPreference.matches) { stopTrace(); viewport.redraw(); }
    else if (entered && !shellSeen) startTrace(0);
  };
  motionPreference.addEventListener('change', onMotionPreference);

  function releasePresentation() {
    disposed = true; stopTrace(); resizing.disconnect();
    for (const [frame, resolve] of tweens) { cancelAnimationFrame(frame); resolve(); }
    tweens.clear(); timers.forEach(clearTimeout); timers.clear();
    motionPreference.removeEventListener('change', onMotionPreference);
    container.removeEventListener('pointerdown', onPress, true);
    container.removeEventListener('keydown', onPress, true);
    container.removeEventListener('wheel', onPress, true);
  }

  /** The flat as streamed so far; pieces not placed yet wait in a line beside it. */
  function liveScene(): SceneDocument {
    let placed = objects;
    if (!placed && rooms.length) {
      const xs = rooms.flatMap(r => r.polygon.map(p => p[0])), zs = rooms.flatMap(r => r.polygon.map(p => p[1]));
      let z = Math.min(...zs);
      const x0 = Math.max(...xs) + 1.2;
      placed = [...assets.values()].map(asset => {
        const [w, , d] = asset.dimensions;
        const object: SceneObject = { id: `waiting-${asset.id}`, name: asset.name, assetId: asset.id, position: [x0 + w / 2, 0, z + d / 2], rotation: 0, scale: [1, 1, 1] };
        z += d + 0.35;
        return object;
      });
    }
    const scene = migrateScene({ format: 'varpet.editor', version: 1, id: LIVE_ID, name: 'Your apartment', units: 'm', upAxis: 'Y',
      rooms: structuredClone(rooms), walls: structuredClone(walls), objects: (placed ?? []).filter(o => assets.has(o.assetId)) });
    scene.project!.components = [...components, ...lights].map(c => ({ ...structuredClone(c), phase: 'existing' as const }));
    return scene;
  }
  const show = () => viewport.setScene(liveScene(), [...assets.values()]);

  /** Size and place the plan so its own lines sit under the returned walls; fall back to the rooms' extent. */
  function registeredSheet(): SheetRect | undefined {
    const box = buildBox();
    if (!box) return undefined;
    const matched = registerPlan(options.ink.alpha, options.ink.width, options.ink.height, walls);
    if (matched) {
      const wx = Math.min(...walls.flatMap(w => [w.start[0], w.end[0]])), wz = Math.min(...walls.flatMap(w => [w.start[1], w.end[1]]));
      const width = options.ink.width / matched.scale, depth = options.ink.height / matched.scale;
      return { x: wx - matched.x / matched.scale + width / 2, z: wz - matched.y / matched.scale + depth / 2, width, depth };
    }
    const spanX = box.maxX - box.minX, spanZ = box.maxZ - box.minZ;
    const width = Math.max(spanX, spanZ / aspect) * 1.08;
    return { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2, width, depth: width * aspect };
  }

  /**
   * Until the walls arrive the sheet has a placeholder size. When they do, the sheet takes its real
   * size and place and the camera moves with it by the same scale and offset, so the picture does
   * not change: the plan stays where it is on screen and the apartment rises onto it, untouched.
   */
  function anchorSheet(from: SheetRect, fromFloor: number, target: SheetRect) {
    if (!ground) return;
    const s = target.width / from.width, floor = ground.floorLevel;
    const map = ([x, y, z]: Vec3): Vec3 => [target.x + (x - from.x) * s, floor + (y - fromFloor) * s, target.z + (z - from.z) * s];
    ground.sheetRect = target;
    ground.sheetOpacity = 1;
    ground.gridOpacity = 0;
    const pose = viewport.cameraPose();
    if (pose) viewport.setCameraPose({ position: map(pose.position), target: map(pose.target) }, 0);
    // A camera move still under way (the tilt into 3D) carries on towards the same view.
    const remaining = cameraGoal ? cameraGoal.until - performance.now() : 0;
    if (cameraGoal && remaining > 0) viewport.setCameraPose({ position: map(cameraGoal.position), target: map(cameraGoal.target) }, remaining);
    cameraGoal = null;
  }

  function onShell(animate: boolean) {
    const first = !shellSeen;
    shellSeen = true; stopTrace();
    const from = ground?.sheetRect, fromFloor = ground?.floorLevel ?? 0;
    show();
    setPhase('walls');
    if (!first || !ground || !from) return;
    const target = registeredSheet();
    if (target) anchorSheet(from, fromFloor, target);
    if (!animate) { ground.gridOpacity = 1; if (following) frameBuild(0); return; }
    viewport.riseStructure(RISE);
    // The grid is in metres, the placeholder sheet was not: fade it back in at its true spacing.
    void tween(RISE, k => { ground.gridOpacity = k; });
    // Hold still while the walls rise, then frame the apartment.
    const settle = window.setTimeout(() => { timers.delete(settle); if (!disposed && following && !finished) frameBuild(1600); }, RISE);
    timers.add(settle);
  }

  function apply(event: StageEvent, animate: boolean) {
    if (disposed) return;
    const record = event as unknown as Record<string, unknown>;
    if (event.type === 'shell') {
      rooms = record.rooms as Room[]; walls = record.walls as Wall[];
      components = (record.components as BuildingComponent[] | undefined) ?? [];
      onShell(animate);
    } else if (event.type === 'pieces') setPhase('building');
    else if (event.type === 'piece') {
      assets.set(event.asset.id, event.asset as unknown as CatalogAsset);
      setPhase('building');
      if (shellSeen) { show(); if (animate && !objects) viewport.animateAssembly(`waiting-${event.asset.id}`); }
    } else if (event.type === 'placements') {
      const before = new Set(objects?.map(o => o.id));
      // Streamed placements are partial objects: give them the editor's defaults.
      objects = event.objects.map(o => ({ ...(o as unknown as Partial<SceneObject>), id: o.id, assetId: o.assetId, name: o.name ?? assets.get(o.assetId)?.name ?? o.assetId,
        position: o.position, rotation: o.rotation ?? 0, scale: (o as unknown as Partial<SceneObject>).scale ?? [1, 1, 1] }));
      lights = (record.lights as BuildingComponent[] | undefined) ?? [];
      setPhase('placing');
      if (shellSeen) {
        show();
        if (animate) objects.filter(o => !before.has(o.id)).forEach(o => viewport.animatePlacement(o.id));
      }
    } else if (event.type === 'project') setPhase('checking');
    else if (event.type === 'progress') {
      // Announce the work when it starts, before the corresponding geometry arrives.
      // Initial plan validation and checks of individual pieces are not final review.
      const message = event.message.trim();
      if (/^Building\b/i.test(message)) setPhase('building');
      else if (/^Placing (?:the )?furniture\b/i.test(message)) setPhase('placing');
      else if (/^Checking (?:the result|your apartment)\b/i.test(message)) setPhase('checking');
    }
  }

  return {
    start() {
      if (disposed || !ground) return;
      // An empty scene first: the viewport's own first framing must not replace the sheet's.
      viewport.setScene(liveScene(), []);
      ground.sheetRect = { x: 0, z: 0, width: NOMINAL_WIDTH, depth: NOMINAL_WIDTH * aspect };
      ground.sheetOpacity = 1;
      const box = sheetBox(ground.sheetRect);
      viewport.setCameraPose(framing(box, Math.PI / 2 - 0.002, 1.04), 0);
      setPhase('reading');
    },
    planRect() {
      if (disposed || !ground) return undefined;
      const rect = container.getBoundingClientRect(), { x, z, width, depth } = ground.sheetRect, y = ground.floorLevel;
      const corners = [[x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2], [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]]
        .map(([cx, cz]) => viewport.project([cx!, y, cz!])).filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (corners.length < 4) return undefined;
      const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
      return { left: rect.left + left, top: rect.top + top, width: Math.max(...corners.map(p => p.x)) - left, height: Math.max(...corners.map(p => p.y)) - top };
    },
    enter() {
      if (disposed || entered) return;
      entered = true; navigation.hidden = false; placeNavigation();
      if (shellSeen) return;
      startTrace();
      if (!ground) return;
      const pose = framing(sheetBox(ground.sheetRect), ELEVATION, 1.02), duration = reduced() ? 0 : TILT;
      cameraGoal = { ...pose, until: performance.now() + duration };
      viewport.setCameraPose(pose, duration);
    },
    event(event) { apply(event, true); },
    progress(message) { apply({ type: 'progress', message }, true); },
    async hydrate(events, next) {
      for (const event of events) apply(event, false);
      setPhase(next);
      if (!entered) { entered = true; navigation.hidden = false; placeNavigation(); }
      if (!shellSeen) startTrace(0);
    },
    async finish(scene, catalog) {
      if (disposed) return;
      stopTrace(); shellSeen = true; finished = true;
      rooms = scene.rooms; walls = scene.walls;
      // Same document id as the live view: arriving pieces fade in rather than pop.
      viewport.setScene({ ...structuredClone(scene), id: LIVE_ID }, catalog);
      setPhase('checking');
      const box = buildBox();
      const sweep = ground ? tween(1500, k => { ground.erase = k; }) : Promise.resolve();
      if (box && following) viewport.setCameraPose(framing(box, ELEVATION, 1.1), reduced() ? 0 : 1400);
      await sweep;
      if (disposed) return;
      ground?.setSheet(null); viewport.redraw();
      // Give the arriving models a moment to land before the editor copies this picture.
      const waitUntil = performance.now() + 2500;
      while (!disposed && viewport.loading() && performance.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 60));
    },
    pose() {
      const pose = viewport.cameraPose();
      return pose ? { position: pose.position, target: pose.target, fov: pose.fov } : null;
    },
    takeViewport() {
      if (disposed || transferred) return null;
      transferred = true;
      releasePresentation();
      return viewport;
    },
    reclaimViewport() {
      if (!transferred) return;
      viewport.attach(container, callbacks, options.normalizeScene);
      viewport.setLocked(true);
      transferred = false; disposed = false;
      resizing.observe(host);
      container.addEventListener('pointerdown', onPress, true);
      container.addEventListener('keydown', onPress, true);
      container.addEventListener('wheel', onPress, { capture: true, passive: true });
      motionPreference.addEventListener('change', onMotionPreference);
    },
    dispose() {
      if (!disposed) releasePresentation();
      if (!transferred) viewport.dispose();
      root.remove();
    },
  };
}
