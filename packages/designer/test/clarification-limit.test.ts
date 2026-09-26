import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function connectTurn() {
  const server = createServer({ rooms: [], walls: [], openings: [], items: [], fixed: [] });
  const client = new Client({ name: 'clarification-limit', version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    ask: (args: Record<string, unknown>) => client.callTool({ name: 'ask', arguments: args }),
    close: async () => { await client.close(); await server.close(); },
  };
}

function payload(response: Awaited<ReturnType<Client['callTool']>>) {
  return JSON.parse((response.content as { text: string }[])[0]!.text);
}

test('one customer turn can emit one question; a second ask is an actionable error without a question envelope', async () => {
  const turn = await connectTurn();
  try {
    const first = await turn.ask({ question: ' Which room should I arrange? ', options: ['Living room', 'Bedroom'] });
    expect(first.isError).not.toBe(true);
    expect(payload(first)).toEqual({ type: 'question', question: 'Which room should I arrange?',
      options: ['Living room', 'Bedroom'], awaiting_answer: true });
    const second = await turn.ask({ question: 'Which style should I use?' });
    expect(second.isError).toBe(true);
    expect(payload(second)).not.toHaveProperty('question');
    expect(payload(second)).not.toHaveProperty('awaiting_answer');
    expect(payload(second).type).not.toBe('question');
    expect(JSON.stringify(second.content)).toMatch(/already|one clarification/i);
    expect(JSON.stringify(second.content)).toMatch(/wait|next (?:customer|message)/i);
  } finally { await turn.close(); }
});

test('MCP input validation rejects an invalid first ask without consuming the turn allowance', async () => {
  const turn = await connectTurn();
  try {
    for (const input of [{ question: '   ' }, { question: 'Which room?', options: ['Only one'] }]) {
      const invalid = await turn.ask(input);
      expect(invalid.isError).toBe(true);
    }
    const valid = await turn.ask({ question: 'Which room should I arrange?' });
    expect(valid.isError).not.toBe(true);
    expect(payload(valid)).toMatchObject({ type: 'question', awaiting_answer: true });
    expect((await turn.ask({ question: 'Another question?' })).isError).toBe(true);
  } finally { await turn.close(); }
});

test('a fresh server for the next customer turn has its own one-question allowance', async () => {
  const previous = await connectTurn();
  try {
    expect((await previous.ask({ question: 'Which room?' })).isError).not.toBe(true);
    expect((await previous.ask({ question: 'Which style?' })).isError).toBe(true);
  } finally { await previous.close(); }
  const next = await connectTurn();
  try {
    const reply = await next.ask({ question: 'Which activity matters most?' });
    expect(reply.isError).not.toBe(true);
    expect(payload(reply)).toMatchObject({ type: 'question', question: 'Which activity matters most?' });
    expect((await next.ask({ question: 'Which colour?' })).isError).toBe(true);
  } finally { await next.close(); }
});

test('simultaneous asks cannot both emit customer questions', async () => {
  const turn = await connectTurn();
  try {
    const replies = await Promise.all([
      turn.ask({ question: 'Which room?' }),
      turn.ask({ question: 'Which style?' }),
    ]);
    expect(replies.filter(reply => reply.isError === true)).toHaveLength(1);
    expect(replies.filter(reply => payload(reply).type === 'question')).toHaveLength(1);
  } finally { await turn.close(); }
});
