import type { CatalogAsset, SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import type { StageAsset, StageEvent } from '../ui/architect-stage';
import type { startBlueprintBuild } from './blueprint-build';
import { createInitialScene } from '../core/initial-scene';
import { parseScene } from '../core/persistence';
import planUrl from '../../../../packages/designer/eval/vision-fixtures/avani-plan.png?url';
import sideboardUrl from '../../../buyer/public/fixtures/sideboard.glb?url';
import bookshelfUrl from '../../../buyer/public/fixtures/bookshelf.glb?url';

/** Explicit local test data; none of these checkpoints submits a plan to the architect. */
export const BLUEPRINT_TEST_STATES = [
  { id: 'upload', label: 'Upload', description: 'An empty sheet, ready for a blueprint.' },
  { id: 'selected', label: 'Plan selected', description: 'The sample blueprint is ready to submit.' },
  { id: 'reading', label: 'Read', description: 'The blueprint is being read, before geometry arrives.' },
  { id: 'walls', label: 'Draw', description: 'The returned shell is drawn and its walls rise.' },
  { id: 'building', label: 'Build', description: 'Two local furniture models assemble on the workbench.' },
  { id: 'placing', label: 'Place', description: 'The furniture moves into the apartment.' },
  { id: 'checking', label: 'Review', description: 'The furnished apartment waits for its final check.' },
  { id: 'complete', label: 'Complete', description: 'The validated apartment is ready to open in the editor.' },
  { id: 'error', label: 'Error', description: 'A simulated failure keeps the selected plan ready to retry.' },
] as const;

export type BlueprintTestState = typeof BLUEPRINT_TEST_STATES[number]['id'];
export function getBlueprintTestState(value: string | null): BlueprintTestState | undefined {
  return BLUEPRINT_TEST_STATES.find(state => state.id === value)?.id;
}

export interface BlueprintTestData {
  plan: File;
  photos: File[];
  catalog: CatalogProduct[];
  project: SceneDocument;
  checkpoints: Record<BlueprintTestState, StageEvent[]>;
}

/** Load only the bundled source image. GLBs load through the normal stage/editor asset renderers. */
export async function loadBlueprintTestData(): Promise<BlueprintTestData> {
  const response = await fetch(planUrl);
  if (!response.ok) throw new Error(`The local sample blueprint could not be loaded (HTTP ${response.status}).`);
  const plan = new File([await response.blob()], 'Avani sample blueprint.png', { type: 'image/png', lastModified: 0 });
  const furniture: (CatalogAsset & StageAsset)[] = [
    { id: 'blueprint-test-sideboard', name: 'Sample oak sideboard', category: 'Blueprint test furniture', kind: 'cabinet',
      dimensions: [1.8, 0.75, 0.45], color: '#CFCAC6', price: 0, source: { type: 'gltf', url: sideboardUrl } },
    { id: 'blueprint-test-bookshelf', name: 'Sample oak bookshelf', category: 'Blueprint test furniture', kind: 'shelf',
      dimensions: [0.8, 2, 0.35], color: '#CFCAC6', price: 0, source: { type: 'gltf', url: bookshelfUrl } },
  ];
  const catalog = furniture.map(asset => ({ asset, priceSource: 'test data · not priced',
    sizeStatus: 'sample dimensions', attribution: 'Bundled Varpet demonstration model' }));
  const project = createInitialScene();
  project.id = 'blueprint-test-avani';
  project.name = 'Avani blueprint test apartment';
  project.project!.metadata['door-entry'] = { role: 'entrance', phase: 'existing', review: 'unreviewed' };
  project.objects = [
    { id: 'blueprint-test-sideboard-1', name: furniture[0]!.name, assetId: furniture[0]!.id,
      position: [-3, 0, -1], rotation: 0, scale: [1, 1, 1] },
    { id: 'blueprint-test-bookshelf-1', name: furniture[1]!.name, assetId: furniture[1]!.id,
      position: [-1.6, 0, 1], rotation: 0, scale: [1, 1, 1] },
  ];
  // Exercise the same authoritative boundary that a completed architect response must pass.
  const checked = parseScene(JSON.stringify(project), furniture);
  const reading: StageEvent[] = [{ type: 'progress', message: 'Reading the plan' }];
  const walls: StageEvent[] = [...reading,
    { type: 'progress', message: 'Drawing the apartment walls' },
    { type: 'shell', rooms: checked.rooms, walls: checked.walls, metadata: checked.project!.metadata, components: [] },
  ];
  const building: StageEvent[] = [...walls,
    { type: 'pieces', pieces: furniture.map(asset => ({ id: asset.id,
      size: [asset.dimensions[0], asset.dimensions[2], asset.dimensions[1]], count: 1 })) },
    ...furniture.flatMap((asset): StageEvent[] => [
      { type: 'progress', message: `Building ${asset.name}` },
      { type: 'piece', piece: asset.id, count: 1, asset },
    ]),
  ];
  const placing: StageEvent[] = [...building,
    { type: 'progress', message: 'Placing furniture in your apartment' },
    { type: 'placements', objects: checked.objects.map(({ id, name, assetId, position, rotation }) => ({ id, name, assetId, position, rotation })) },
  ];
  const checking: StageEvent[] = [...placing, { type: 'progress', message: 'Checking the apartment details' }];
  return { plan, photos: [], catalog, project: checked,
    checkpoints: structuredClone({ upload: [], selected: [], reading, walls, building, placing, checking,
      complete: checking, error: reading }) };
}

/** Same lifecycle as an uploaded build, held at a chosen checkpoint until cancelled. */
export function createBlueprintTestBuild(data: BlueprintTestData, state: BlueprintTestState): typeof startBlueprintBuild {
  return (plan, photos, onSettled) => {
    const controller = new AbortController();
    const pending = structuredClone(data.checkpoints[state]);
    const project = structuredClone(data.project);
    let status: 'reading' | 'ready' | 'failed' = 'reading';
    let attached = false, settled = false;
    type Result = Awaited<ReturnType<typeof startBlueprintBuild>['result']>;
    let resolve!: (value: Result) => void;
    const result = new Promise<Result>(done => { resolve = done; });
    const settle = (value: Result) => {
      if (settled) return;
      settled = true;
      status = value.ok ? 'ready' : 'failed';
      resolve(value);
      if (!controller.signal.aborted) queueMicrotask(() => { if (!controller.signal.aborted) onSettled(); });
    };
    return {
      plan, photos: [...photos], started: performance.now(), result,
      get status() { return status; },
      get signal() { return controller.signal; },
      attach(onProgress, onEvent) {
        if (controller.signal.aborted || attached) return;
        attached = true;
        for (const event of pending.splice(0)) {
          if (controller.signal.aborted) return;
          if (event.type === 'progress') onProgress(event.message);
          else onEvent(event);
        }
        if (controller.signal.aborted) return;
        if (state === 'complete') settle({ ok: true, project });
        else if (state === 'error') settle({ ok: false, error: new Error('This is a simulated blueprint build failure. Choose another test state or retry this checkpoint.') });
      },
      cancel() {
        controller.abort(); pending.length = 0;
        settle({ ok: false, error: controller.signal.reason });
      },
    };
  };
}
