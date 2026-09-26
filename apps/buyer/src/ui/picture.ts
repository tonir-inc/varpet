import type { Piece } from '../contracts';

/**
 * Stand-in for the buyer's uploaded picture in the recorded example. It is a drawing, not a photo:
 * no generated or unlicensed image. Replace it with a licensed photo whose piece boxes match the recording.
 */
export const EXAMPLE_PICTURE = `<svg viewBox="0 0 400 300" role="img" aria-label="Example picture: a living room with a fluted oak sideboard, a cream sofa, a round table and a tall bookshelf">
  <defs><linearGradient id="pw" x1="0" x2="1"><stop offset="0" stop-color="#d9d1c7"/><stop offset="1" stop-color="#c8bdb1"/></linearGradient>
  <linearGradient id="pf" y1="0" y2="1"><stop offset="0" stop-color="#b79a7c"/><stop offset="1" stop-color="#9c7f63"/></linearGradient></defs>
  <rect width="400" height="210" fill="url(#pw)"/><rect y="210" width="400" height="90" fill="url(#pf)"/>
  <rect x="40" y="36" width="92" height="120" fill="#f3efe7"/><line x1="86" y1="36" x2="86" y2="156" stroke="#cfc6ba" stroke-width="3"/>
  <rect x="318" y="58" width="58" height="162" fill="#8a6a4e"/>
  <g stroke="#6f533c" stroke-width="3"><line x1="318" y1="96" x2="376" y2="96"/><line x1="318" y1="136" x2="376" y2="136"/><line x1="318" y1="176" x2="376" y2="176"/></g>
  <rect x="150" y="150" width="148" height="62" fill="#b58a5f"/>
  <path stroke="#9c754f" stroke-width="2" d="M158 154v54M166 154v54M174 154v54M182 154v54M190 154v54M198 154v54M206 154v54M214 154v54M222 154v54M230 154v54M238 154v54M246 154v54M254 154v54M262 154v54M270 154v54M278 154v54M286 154v54"/>
  <rect x="194" y="120" width="12" height="26" rx="5" fill="#ece6dc"/>
  <rect x="24" y="214" width="170" height="52" rx="16" fill="#ece5d9"/><rect x="24" y="196" width="170" height="34" rx="14" fill="#e2dacd"/>
  <ellipse cx="258" cy="252" rx="44" ry="12" fill="#caa47c"/><rect x="254" y="252" width="8" height="30" fill="#a9845f"/>
</svg>`;

const DONE = new Set(['found', 'done']);

/** The designer's reading of the picture: a box and a number on each piece it saw. New boxes draw themselves in. */
export function pictureBoxes(pieces: Piece[], boxes: Map<number, [number, number, number, number]>, drawn: Set<number>): string {
  let fresh = 0;
  return pieces.flatMap(piece => {
    const box = boxes.get(piece.key);
    if (!box) return [];
    const [x, y, w, h] = box.map(v => v * 100) as [number, number, number, number];
    const pending = !DONE.has(piece.status);
    const enter = drawn.has(piece.key) ? '' : ` class="enter" style="animation-delay:${(fresh++ * 0.38).toFixed(2)}s"`;
    return [`<rect x="${x}%" y="${y}%" width="${w}%" height="${h}%" rx="3" fill="none" stroke="#0C6A55" stroke-width="2.5"${pending ? ' stroke-dasharray="4 4"' : ''}${enter}/>`,
      `<g${enter}><circle cx="${x + w}%" cy="${y}%" r="10" fill="${pending ? '#FBF7F5' : '#0C6A55'}" stroke="#0C6A55" stroke-width="1.5"/>`,
      `<text x="${x + w}%" y="${y}%" dy="4.5" text-anchor="middle" font-size="13" font-weight="700" font-family="Noto Sans, sans-serif" fill="${pending ? '#0C6A55' : '#fff'}">${piece.key}</text></g>`];
  }).join('');
}
