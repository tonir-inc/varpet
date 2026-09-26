// Turn an architect run into a project file the editor opens (Import project JSON / Load saved scene).
//   node scripts/architect-project.mjs <export.v1.json> <components.json> <assets.json> <out.json>
// components.json: BuildingComponent[] (or a shell.json with a "components" array).
// assets.json: CatalogAsset[] from GET http://127.0.0.1:8788/pieces?run=<run>.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const [v1Path, componentsPath, assetsPath, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: node scripts/architect-project.mjs <export.v1.json> <components.json> <assets.json> <out.json>');
  process.exit(2);
}
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const v1 = await readJson(v1Path);
const componentsInput = await readJson(componentsPath);
const components = Array.isArray(componentsInput) ? componentsInput : componentsInput.components ?? [];
const assets = await readJson(assetsPath);

// Reuse the editor's own TypeScript through the project's bundler.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-architect-project-'));
try {
  await build({
    root, configFile: false, publicDir: false, logLevel: 'error',
    build: {
      ssr: true, target: 'node22', outDir: output, emptyOutDir: false, minify: false,
      rolldownOptions: {
        input: { entry: join(root, 'src/adapters/architect-project.ts'), persistence: join(root, 'src/core/persistence.ts') },
        output: { entryFileNames: '[name].mjs' },
      },
    },
  });
  const { architectProject } = await import(pathToFileURL(join(output, 'entry.mjs')).href);
  const { serializeScene } = await import(pathToFileURL(join(output, 'persistence.mjs')).href);
  let project;
  try { project = architectProject(v1, components, assets); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  if (project) {
    await writeFile(outPath, serializeScene(project));
    console.log(`${project.rooms.length} rooms, ${project.walls.length} walls, ${project.project.components.length} fixtures, ${project.objects.length} pieces -> ${outPath}`);
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
