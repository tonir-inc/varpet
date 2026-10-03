/** The design's problems before a follow-up request: a request is judged against where it started, not against a
 * perfect flat. baseline.json beside scene.json ({ problems: string[] }, the `check --final` lines before the turn)
 * makes `check` block only problems the request added or made worse; the rest are the flat's existing problems,
 * offered to the customer as optional suggestions only when they ask (`suggestions`). */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Baseline = { problems: string[] };

export function loadBaseline(scenePath: string): Baseline | undefined {
  const path = join(dirname(scenePath), 'baseline.json');
  if (!existsSync(path)) return undefined;
  const data = JSON.parse(readFileSync(path, 'utf8')) as Baseline;
  return Array.isArray(data.problems) ? { problems: data.problems.map(String) } : undefined;
}

/** A problem without its numbers: the same problem after a piece moved a little keeps its key. */
export const problemKey = (line: string) => line.replace(/-?\d+(?:\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();

/** The clearance a walkway or bed-side line reports (smaller is worse), else undefined. */
function clearance(line: string): number | undefined {
  const m = line.match(/: (\d+(?:\.\d+)?) m path;/) ?? line.match(/has only (\d+(?:\.\d+)?) m beside/);
  return m ? Number(m[1]) : undefined;
}

/** Problems now, split into ones the request added or worsened and ones that were already there. */
export function splitByBaseline(problems: string[], baseline: Baseline): { added: string[]; existing: string[] } {
  const before = new Map<string, string[]>();
  for (const line of baseline.problems) {
    const key = problemKey(line);
    before.set(key, [...(before.get(key) ?? []), line]);
  }
  const added: string[] = [], existing: string[] = [];
  for (const line of problems) {
    const match = before.get(problemKey(line));
    const old = match?.shift();
    if (old === undefined) { added.push(line); continue; }
    const was = clearance(old), now = clearance(line);
    (was !== undefined && now !== undefined && now < was - 0.01 ? added : existing).push(line);
  }
  return { added, existing };
}

export type SuggestionGroup = { id: string; title: string; chip: string; lines: string[] };

const GROUPS: { id: string; title: string; chip: string; test: (line: string) => boolean }[] = [
  { id: 'space', title: 'Room to move', chip: 'Suggestion: clear the walkways',
    test: line => line.startsWith('walkway:') || /has only [\d.]+ m beside/.test(line) },
  { id: 'lighting', title: 'Lighting', chip: 'Suggestion: add the lighting',
    test: line => line.startsWith('lighting:') || /\b(lamp|light|pendant|sconce)/.test(line) },
  { id: 'textiles', title: 'Rugs, curtains and cushions', chip: 'Suggestion: add rugs, curtains and cushions',
    test: line => /\b(rug|curtain|blind|cushion|throw)/.test(line) },
  { id: 'walls', title: 'Art, plants and wall colour', chip: 'Suggestion: add art, plants and wall colour',
    test: () => true },
];

/** The existing problems in at most four groups, each one optional; a chip is the customer's words for applying it. */
export function suggestionGroups(problems: string[]): SuggestionGroup[] {
  const groups = GROUPS.map(g => ({ id: g.id, title: g.title, chip: g.chip, lines: [] as string[] }));
  for (const line of problems) groups[GROUPS.findIndex(g => g.test(line))].lines.push(line);
  return groups.filter(g => g.lines.length);
}

/** One plain line per problem for the customer: no ./varpet commands, helper calls, ids of walls or coordinates. */
export function plainSuggestion(line: string): string {
  const walk = line.match(/^walkway: (.+?) to (.+?): ([\d.]+) m path; minimum ([\d.]+) m/);
  const text = walk ? `only ${walk[3]} m to walk from ${walk[1]} to ${walk[2]} (${walk[4]} m needed)` : line;
  const point = String.raw`\(-?[\d.]+, -?[\d.]+\)`;
  return text
    .replace(/^(walkway|lighting|bedroom|styling|paint|windows|living|relation): /, '')
    .replace(/[:;] \.\/varpet .*$/, '')
    .replace(/:? \{room_id.*$/, '')
    .replace(/\s*\((?:[^()]|\(\))*(?:\.\/varpet|onWall|--kind)(?:[^()]|\(\))*\)/g, '')
    .replace(/\s*\(on: [^)]*\)/g, '')
    .replace(/,? (?:centred )?with onWall\(.*$/, '')
    .replace(/: onWall\(.*$/, '')
    .replace(/[:,]? then wall_id .*$/, '')
    .replace(/,? pos (?:inside it|along its back|\([^)]*\))$/, '')
    .replace(new RegExp(String.raw`;? move \S+ to ${point}`), '')
    .replace(new RegExp(String.raw`,? (?:centred )?at ${point}(?: rot -?\d+)?`, 'g'), '')
    .replace(new RegExp(String.raw` toward ${point}`, 'g'), '')
    .replace(/ \([\d.]+\.\.[\d.]+ m along\)/g, '')
    .replace(/wall-[\w-]+(?:::[\w-]+)*/g, 'the wall')
    .replace(/door:door-([\w-]+)/g, (_, id: string) => `the ${id.replace(/-/g, ' ')} door`)
    .replace(/\bitem:/g, '')
    .replace(/ with on: <id>/g, '')
    .replace(/ on: "([^"]+)"/g, ' on $1')
    .replace(/^(\w+) \([\w+]+\) /, '$1 ')
    .replace(/height_m ~/g, 'about ')
    .replace(/[:;,]\s*$/, '')
    .replace(/\s+/g, ' ').trim();
}
