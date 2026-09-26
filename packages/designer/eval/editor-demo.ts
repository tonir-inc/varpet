/** The benchmark imports the editor's current source; no copied furniture or shell fixture. */
import { pathToFileURL } from 'node:url';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { migrateScene } from '../../../apps/editor/src/core/renovation.js';
import { editorToDesigner } from '../src/editor-bridge.js';

export type EditorDemoVariant = 'original' | 'grouped-v2';

export function createEditorDemoInput(variant: EditorDemoVariant = 'original') {
  if (variant !== 'original' && variant !== 'grouped-v2') throw new Error(`Unknown editor demo variant: ${variant}`);
  const editor_scene = variant === 'grouped-v2' ? migrateScene(structuredClone(demoScene)) : structuredClone(demoScene);
  const catalog = structuredClone(localCatalog);
  if (variant === 'grouped-v2') {
    for (const id of ['lounge-chair', 'living-rug']) {
      const member = editor_scene.objects.find(item => item.id === id);
      if (!member) throw new Error(`Editor demo group member missing: ${id}`);
      member.groupId = 'living-group';
    }
  }
  return { editor_scene, catalog, scene: editorToDesigner(editor_scene, { catalog, groupPolicy: 'move-together' }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), bundle = args.includes('--bundle');
    const variant = args.filter(arg => arg !== '--bundle');
    if (variant.length > 1) throw new Error('Usage: editor-demo.ts [original|grouped-v2] [--bundle]');
    const input = createEditorDemoInput((variant[0] ?? 'original') as EditorDemoVariant);
    process.stdout.write(JSON.stringify(bundle ? input : input.scene) + '\n');
  } catch (error) {
    process.stderr.write(`Editor demo export failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
