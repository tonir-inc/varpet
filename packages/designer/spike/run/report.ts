/** Human report angles for a finished draft: tsx run/report.ts <scene.json> <draft.json> <outDir> <roomId> */
import { loadDraft, loadScene } from '../lib/scene.ts';
import { renderViewsForReport } from '../lib/render-view.ts';

const [scenePath, draftPath, outDir, roomId] = process.argv.slice(2);
if (!scenePath || !draftPath || !outDir || !roomId) { console.error('usage: report.ts scene draft outDir roomId'); process.exit(2); }
renderViewsForReport(loadScene(scenePath), loadDraft(draftPath), outDir, roomId)
  .then(paths => { for (const path of paths) console.log(path); process.exit(0); },
        error => { console.error(`error: ${error instanceof Error ? error.message : error}`); process.exit(1); });
