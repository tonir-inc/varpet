/** Human report angles for a finished draft: tsx run/report.ts <scene.json> <draft.json> <outDir> [roomId ...]
 * Rooms default to every room with draft items; each gets overview, eye and evening, and the whole flat gets an
 * overview and a top view. source.json next to scene.json (if any) is the flat's editor document. */
import { loadDraft, loadScene, loadSource } from '../lib/scene.ts';
import { renderFlatForReport, renderViewsForReport } from '../lib/render-view.ts';

const [scenePath, draftPath, outDir, ...rooms] = process.argv.slice(2);
if (!scenePath || !draftPath || !outDir) { console.error('usage: report.ts scene draft outDir [roomId ...]'); process.exit(2); }

async function main(): Promise<string[]> {
  const scene = loadScene(scenePath!), draft = loadDraft(draftPath!), source = loadSource(scenePath!);
  const ids = rooms.length ? rooms : scene.rooms.map(room => room.id).filter(id => draft.items.some(item => item.room_id === id));
  const paths: string[] = [];
  for (const id of ids) paths.push(...await renderViewsForReport(scene, draft, outDir!, id, source));
  paths.push(...await renderFlatForReport(scene, draft, outDir!, source));
  return paths;
}
main().then(paths => { for (const path of paths) console.log(path); process.exit(0); },
  error => { console.error(`error: ${error instanceof Error ? error.message : error}`); process.exit(1); });
