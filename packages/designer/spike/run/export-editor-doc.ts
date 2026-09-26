/** Write a finished spike workspace as an editor document the editor can load (File > Load / Import).
 * Usage: tsx run/export-editor-doc.ts <workspace dir> <out.json>  (also writes <out>.catalog.json) */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editorDocument } from '../lib/view/document.ts';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: export-editor-doc.ts <workspace> <out.json>'); process.exit(2); }
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const doc = await editorDocument(read('scene.json'), read('draft.json'), existsSync(join(dir, 'source.json')) ? read('source.json') : undefined);
writeFileSync(out, JSON.stringify(doc.scene));
writeFileSync(out.replace(/\.json$/, '.catalog.json'), JSON.stringify(doc.catalog));
console.log(out, `${doc.scene.objects.length} objects, ${doc.catalog.length} catalog assets`);
