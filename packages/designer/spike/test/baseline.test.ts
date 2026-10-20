import { describe, expect, test } from 'vitest';
import { plainSuggestion, splitByBaseline, suggestionGroups } from '../lib/baseline.js';

// Lines as `check --final` writes them on the Komitas 2-5 plan-only design.
const walkway = 'walkway: door:door-balcony to item:dining-table: 0.05 m path; minimum 0.60 m (0.55 m)';
const lamp = 'lighting: desk desk has no task light; put a desk lamp on it (on: "desk") or a floor lamp beside it';
const rug = 'styling: living (living+dining) needs a rug under the seating group, about 2.82 x 2.06 m, centred at (4.50, -1.42) rot 0 so the front legs of sofa stand on it';
const art = 'styling: bedroom (bedroom) needs art above the headboard of bed: one piece or a pair (about 1.23 m wide) on wall-bedroom-hall::bedroom::1: onWall(scene, "bedroom", "wall-bedroom-hall::bedroom::1", size, 1.40)';

describe('a request is judged against where it started', () => {
  test('problems the flat already had do not block; new ones do', () => {
    const added = 'living: coffee table coffee-table is 0.26 m from sofa\'s front (keep 0.35-0.5 m, in reach from the seat); move it to (4.50, -1.68)';
    const moved = rug.replace('(4.50, -1.42)', '(4.50, -1.52)');
    expect(splitByBaseline([walkway, moved, added], { problems: [walkway, rug, lamp] })).toEqual({ added: [added], existing: [walkway, moved] });
  });
  test('a walkway the request narrows is new, one it leaves or widens is not', () => {
    const narrower = walkway.replace('0.05 m path', '0.02 m path'), wider = walkway.replace('0.05 m path', '0.30 m path');
    expect(splitByBaseline([narrower], { problems: [walkway] }).added).toEqual([narrower]);
    expect(splitByBaseline([wider], { problems: [walkway] }).existing).toEqual([wider]);
  });
  test('the same problem twice counts twice', () => {
    expect(splitByBaseline([lamp, lamp], { problems: [lamp] }).added).toEqual([lamp]);
  });
});

describe('existing problems as optional suggestions', () => {
  test('at most four groups, each with the customer words that apply it', () => {
    const groups = suggestionGroups([walkway, lamp, rug, art]);
    expect(groups.map(g => g.id)).toEqual(['space', 'lighting', 'textiles', 'walls']);
    expect(groups.every(g => g.chip.startsWith('Suggestion: '))).toBe(true);
  });
  test('plain lines carry no commands, helper calls, wall ids or coordinates', () => {
    expect(plainSuggestion(walkway)).toBe('only 0.05 m to walk from the balcony door to dining-table (0.60 m needed)');
    for (const line of [lamp, rug, art].map(plainSuggestion)) expect(line).not.toMatch(/varpet|onWall|wall-|\(-?\d+\.\d+, -?\d+\.\d+\)|on: /);
  });
});
