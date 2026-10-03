// The critic's rubric and its input: the brief, the agent's words and data, measured room facts, the renders of the
// agent's result, and real rooms to hold it against (the real project's own photos and plan for a real case, matched
// reference photos for a synthetic one). Pure apart from reading files, so the input is tested without a call.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalCase } from './cases.ts'
import { EVALS_DIR } from './cases.ts'
import { ROOM_VIEWS, wholeFlat } from './eye.ts'
import { cachedImages, loadProjects } from './real/fetch.ts'
import type { RoomFacts } from './room-facts.ts'
import type { CaseSummary } from './summary.ts'

export const CRITERIA = ['program', 'zones', 'scale', 'focal', 'layering', 'light', 'harmony', 'honest'] as const
export type Criterion = (typeof CRITERIA)[number]

export const CRITIC_PROMPT = `You review one job by varpet's AI interior designer (or its architect) in a flat. You get the brief, the agent's
final words, a data summary of what it changed (products with sizes, positions and prices; wall and floor finishes;
tool errors), measured facts per judged room, renders of the result (top and 3/4 views of the whole flat, then per
judged room an eye-level, a top and, for a room with anything in it, a 3/4 view), and real rooms to compare with: for
a real project, the plan and photos of how the real designer actually finished that same flat; otherwise photos of
real, lived-in rooms of the same type.

Which rooms are judged: for a whole-flat ask, every room of the flat, halls, corridors, entrances, kitchens and
bathrooms included, not only the main rooms; for a one-room ask, that room and every room the agent changed.

Judge from evidence: what the renders show, backed by the data and facts. Renders can be rough (simple lighting,
models still loading as grey boxes); trust the data for what is there and the renders for how it reads. The room
facts are context, not thresholds: decide what they mean by looking at the renders and the real rooms. They give per
room: how much floor the pieces take; bare wall (length and share of the wall with nothing against or on it);
pieces per m2; empty (nothing in it at all); openFloor (the largest stretch of floor 0.9 m clear of every piece, and
where: an empty corridor or a bare middle shows here); finishes (the floor's and the walls' finishes, and whether
each is still what the empty shell started with); kitchen (the built-in base run and how much of it has anything
above it on the wall); which seats have no surface or lamp near them.

Score each criterion 1-5 with a one-line reason that names the evidence, or null when it does not apply to the ask
(5 = a professional designer would present it; 3 = acceptable but visibly unfinished; 1 = missing or wrong):
- program: every activity the brief implies (sit and talk, eat, work, sleep, store, arrive and leave) has a complete
  station: a seat with a surface beside it, light, and storage where it is needed. In a whole-flat ask every room is
  part of the program: an entrance, hall or corridor left empty (nowhere to put keys, shoes and coats, no mirror, no
  light, nothing on its walls or floor) in an otherwise furnished flat is a missing station and a failure of program,
  however good the main rooms are. A bathroom or WC only needs its dressing (mirror, towels, a rug, a light).
- zones: clear zones, unblocked paths, doors swing free, windows unblocked; seating forms a conversation group whose
  members face each other (a sitting circle), not furniture lined up against the walls.
- scale: pieces sized to the room and the ceiling; the rug anchors the group; art and mirrors sized to their wall or
  to the furniture below them; a large room has enough mass to hold it.
- focal: one clear focal point per room; visual weight spread across the room, not piled on one wall around an
  empty middle.
- layering: the lived-in question, judged against the real rooms, across every judged room: textiles (rug, curtains,
  cushions, throws), dressed walls, books and objects, plants; neither showroom-bare nor cluttered. Bare walls and
  floors are failures of layering in an otherwise furnished flat: long runs of bare wall where the real rooms have
  shelves, art or units; a kitchen wall left bare above the counter (the base units are the shell's, the wall above
  them is the designer's to dress: wall units, shelves, a splashback, art); floors and walls left in the shell's
  default finish when the brief asked for finishes; an empty hall. A room that looks empty next to the real photos
  scores low here however correct its pieces are. Decoration standing in for furniture (a lone plant in an empty
  corner, a small frame on a bare wall, objects with nothing to sit on) is filler and scores low too.
- light: layered ambient, task and accent light; pools of light where people sit; seating turned to the daylight;
  no window blocked.
- harmony: a coherent palette and materials with deliberate contrast; the style matches the brief and stays
  consistent across rooms; one memorable move.
- honest: real products, accurate sizes, prices and clearances (no favourable rounding), within budget, trade-offs
  explained; what the agent says matches the data.
Then overall 1-5 with a one-line reason, answering: would a professional designer present this to a client, and does
it hold up next to the real rooms? Judge the whole of what was asked: a flat is presented whole, so an empty hall or
corridor, a bare kitchen wall or unfinished walls and floors weigh on overall as they would in front of a client, not
only the best room. Then up to five short, concrete issues, worst first. Be strict and specific.`

const scored = { type: 'object', additionalProperties: false, required: ['score', 'reason'], properties: { score: { type: ['integer', 'null'], minimum: 1, maximum: 5 }, reason: { type: 'string' } } }

export const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...CRITERIA, 'overall', 'issues'],
  properties: {
    ...Object.fromEntries(CRITERIA.map((k) => [k, scored])),
    overall: { ...scored, properties: { ...scored.properties, score: { type: 'integer', minimum: 1, maximum: 5 } } },
    issues: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
}

/** A criterion's score from a critic answer: the rubric's `{score}` or an older run's bare number. */
export function scoreOf(critic: Record<string, unknown>, key: string): number | null {
  const value = critic[key]
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { score?: unknown }).score === 'number') return (value as { score: number }).score
  return null
}

export interface CriticImage {
  label: string
  path: string
}

/**
 * The agent's renders in a case folder: the whole flat's top and 3/4 view, then per judged room its eye-level, top
 * and 3/4 view (shot-eye|top|3d-<room>.jpg|png), in rooms.json's order when there is one, else by file name.
 */
export function agentShots(dir: string): CriticImage[] {
  const files = existsSync(dir) ? readdirSync(dir) : []
  const shots: CriticImage[] = []
  if (files.includes('shot-top.png')) shots.push({ label: "agent's result, top view of the whole flat", path: join(dir, 'shot-top.png') })
  if (files.includes('shot-3d.png')) shots.push({ label: "agent's result, 3/4 view of the whole flat", path: join(dir, 'shot-3d.png') })
  // rooms.json (written with the renders) keeps the judged order and the room names; older runs have only the files.
  if (files.includes('rooms.json')) {
    const label = Object.fromEntries(ROOM_VIEWS.map((v) => [v.view, v.label]))
    const taken = JSON.parse(readFileSync(join(dir, 'rooms.json'), 'utf8')) as Array<{ room: string; view: string; file: string }>
    for (const shot of taken) if (files.includes(shot.file)) shots.push({ label: `agent's result, ${label[shot.view] ?? shot.view} of ${shot.room}`, path: join(dir, shot.file) })
    return shots
  }
  const roomFile = /^shot-(?:eye|top|3d)-(.+)\.(?:png|jpe?g)$/
  const rooms = [...new Set(files.flatMap((f) => roomFile.exec(f)?.[1] ?? []))].sort()
  for (const room of rooms) {
    for (const { prefix, label } of ROOM_VIEWS) {
      const file = files.find((f) => new RegExp(`^${prefix}-${room}\\.(png|jpe?g)$`).test(f))
      if (file) shots.push({ label: `agent's result, ${label} of ${room.replace(/-/g, ' ')}`, path: join(dir, file) })
    }
  }
  return shots
}

/** Real rooms to compare with: the project's plan and photos (real case) or the case's reference photos. */
export function realImages(c: EvalCase): { images: CriticImage[]; text: string } {
  if (c.project) {
    const project = loadProjects().find((p) => p.id === c.project)
    if (!project) throw new Error(`${c.id}: unknown project ${c.project}`)
    const { plan, photos } = cachedImages(project)
    if (!photos.length) throw new Error(`${c.id}: no cached photos for ${project.id}; run evals/real/fetch.ts`)
    return {
      images: [
        ...(plan ? [{ label: `real project plan (${project.designer})`, path: plan }] : []),
        ...photos.map((p) => ({ label: `real project photo: ${p.room}`, path: p.path })),
      ],
      text:
        `Real project: "${project.title}" by ${project.designer}, ${project.city}, ${project.areaM2} m2, ${project.style}. ` +
        `Brief from the project: ${project.brief} The agent got the same empty shell (traced from this plan) and the brief; ` +
        'compare its result room by room with how the real designer finished it: what each room contains, completeness and layering, layout logic, style, scale. ' +
        'Kitchen units drawn on the plan were built into the shell before the agent started; they are not its work.',
    }
  }
  return {
    images: (c.references ?? []).map((file) => ({ label: `real room for comparison (another flat): ${file.split('/').pop()}`, path: join(EVALS_DIR, file) })),
    text: c.references?.length
      ? 'Reference photos: real, lived-in rooms of this type and roughly this style in other flats, to calibrate what a finished room looks like.'
      : 'No reference photos for this case.',
  }
}

export function criticInput(c: EvalCase, summary: CaseSummary, facts: RoomFacts[], dir: string) {
  const real = realImages(c)
  const shots = agentShots(dir)
  const images = [...real.images, ...shots]
  const { trace: _trace, ...forCritic } = summary
  const empty = facts.filter((f) => f.empty).map((f) => f.room)
  const scope = wholeFlat(c) && c.role === 'designer'
    ? `Judged rooms (a whole-flat ask: every room of the flat): ${facts.map((f) => f.room).join(', ')}.`
    : `Judged rooms (the asked room and every room the agent changed): ${facts.map((f) => f.room).join(', ') || 'none'}.`
  const text = [
    `Room: ${c.room} (flat ${c.project ?? c.templateId ?? 'from the plan image'}). Role: ${c.role}.`,
    `${scope}${empty.length ? ` Judged rooms with nothing in them: ${empty.join(', ')}.` : ''}`,
    `Brief, in order: ${c.turns.map((t, i) => `(${i + 1}) ${t}`).join(' ')}`,
    `A good answer: ${c.expect}`,
    real.text,
    `Images, in order: ${images.map((im, i) => `${i + 1}. ${im.label}`).join('; ')}.` + (shots.length ? '' : " (The agent's renders failed.)"),
    `Room facts (measured on the result):\n${JSON.stringify(facts)}`,
    `Data summary:\n${JSON.stringify(forCritic)}`,
  ].join('\n\n')
  return { text, images }
}

export function imageDataUrl(path: string) {
  const type = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg'
  return `data:${type};base64,${readFileSync(path).toString('base64')}`
}
