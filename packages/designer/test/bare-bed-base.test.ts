import { expect, test } from 'vitest';
import { createHttpCatalogQuery, isBareBedBase, searchCatalog, type CatalogQuery } from '../src/catalog.js';

// Real `bed` rows from the live catalog (Balcony Bedroom 1 bug, 26 Sept 2026).
const bare = [
  'Amazon Basics 9-Leg Support Metal Bed Frame - Strong Support for Box Spring and Mattress Set - Queen',
  'Amazon Basics 6-Leg Support Metal Bed Frame - Strong Support for Box Spring and Mattress Set - Twin',
  'AmazonBasics Foldable, 14" Metal Platform Bed Frame with Tool-Free Assembly, No Box Spring Needed - Twin',
  'Amazon Basics Rollaway Folding Guest Bed with 4-inch Memory Foam Mattress - Cot size',
  'AmazonBasics Heavy Duty Non-Slip Bed Frame with Steel Slats, Easy Assembly - 18" H, (King)',
  'Box Spring 8" Queen', 'Memory Foam Mattress, 25 cm, Double', 'Wooden Bed Slats Only, 140 cm',
];
const beds = [
  'Amazon Brand - Alkove Hayes Solid Wood Double Bed Frame, 4 Mattress Levels, 140 x 190cm, White',
  'AmazonBasics Solid Platform Bed - Rustic Finish - No Box Spring Needed - Strong Wood Slat Support - Queen',
  'Rivet Jonathan Mid-Century Modern Wood Full Bed, 59.5"W, Walnut',
  'AmazonBasics Faux Leather Upholstered Platform Bed Frame with Wooden Slats, Queen',
  'Metal Bed Frame with Headboard and Footboard, Queen',
  'Movian Havel',
];

test('bare frames, bases, box springs, slats, rollaways and loose mattresses are not beds', () => {
  for (const name of bare) expect(isBareBedBase(name), name).toBe(true);
  for (const name of beds) expect(isBareBedBase(name), name).toBe(false);
});

const row = (id: string, name: string, kind = 'bed') => ({ id, kind, name, size_m: [1.4, 2, .9], price: 100000, currency: 'AMD' });

test('catalog search never returns a bare bed base as a bed', async () => {
  const query: CatalogQuery = async () => ({ results: [row('frame', bare[0]!), row('bed', beds[0]!), row('stand', 'Bed Base Nightstand', 'nightstand')] });
  const result = await searchCatalog({ kind: 'bed', limit: 10 }, query);
  expect(result.results.map(p => p.sku)).toEqual(['bed']);
  // Only the `bed` kind is filtered; other kinds keep their names untouched.
  expect((await searchCatalog({ kind: 'nightstand', limit: 10 }, query)).results.map(p => p.sku)).toEqual(['stand']);
});

test('the shared HTTP catalog query drops bare bed bases for every caller, before enrichment', async () => {
  const details: string[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    if (init?.method === 'GET') return new Response(null, { status: 405 });
    if (init?.method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(String(init?.body));
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'stub', version: '1' } };
    else if (message.params?.name === 'search_furniture') result = { content: [{ type: 'text', text: JSON.stringify({ results: [row('frame', bare[0]!), row('bed', beds[2]!)] }) }] };
    else { details.push(message.params.arguments.item_id); result = { content: [], structuredContent: row(message.params.arguments.item_id, beds[2]!) }; }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const response = await createHttpCatalogQuery({ url: 'http://catalog.test/mcp', fetch })({ kind: 'bed', limit: 1 }) as { results: { id: string }[] };
  expect(response.results.map(r => r.id)).toEqual(['bed']);
  expect(details).toEqual(['bed']);
});
