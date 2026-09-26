import { expect, test } from 'vitest';
import { ask, askInputSchema } from '../src/ask.js';

test('ask returns one structured question and marks the turn as waiting for the customer', () => {
  expect(ask({ question: ' What would make it cozier? ', options: ['A reading corner', 'Closer seating'] })).toEqual({
    type: 'question', question: 'What would make it cozier?', options: ['A reading corner', 'Closer seating'], awaiting_answer: true,
  });
});

test('ask allows a single free-text question without options', () => {
  expect(ask({ question: 'What activity should this room support?' })).toEqual({ type: 'question', question: 'What activity should this room support?', awaiting_answer: true });
});

test('ask accepts two through four distinct options and rejects empty questions or unusable choices', () => {
  expect(askInputSchema.safeParse({ question: 'Choose a layout?', options: ['One', 'Two', 'Three', 'Four'] }).success).toBe(true);
  for (const input of [
    { question: '' }, { question: '   ' }, { question: 'Choose?', options: [] },
    { question: 'Choose?', options: ['Only one'] }, { question: 'Choose?', options: ['A', 'B', 'C', 'D', 'E'] },
    { question: 'Choose?', options: ['A', ' '] }, { question: 'Choose?', options: ['Same', 'same'] },
    { question: 'Choose?', questions: ['A second question?'] },
  ]) expect(askInputSchema.safeParse(input).success).toBe(false);
});
