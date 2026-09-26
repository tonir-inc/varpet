import { z } from 'zod';

const choice = z.string().trim().min(1).max(300);
export const askInputSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  options: z.array(choice).min(2).max(4).refine(
    options => new Set(options.map(option => option.toLocaleLowerCase())).size === options.length,
    'Options must be distinct',
  ).optional(),
}).strict();

/** The harness stops this turn and delivers the answer in the next user message. */
export function ask(input: unknown) {
  return { type: 'question' as const, ...askInputSchema.parse(input), awaiting_answer: true as const };
}
