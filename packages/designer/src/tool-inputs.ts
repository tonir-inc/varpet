import {z} from 'zod';
import {opsSchema} from './adapter.js';
import {placeInputSchema} from './place.js';

// Codex's MCP schema converter needs homogeneous items, not draft-7 tuple items.
// Fixed lengths remain enforced here; the typed domain parsers run in each handler.
const number=z.number().finite(),point=z.array(number).length(2),size=z.array(number.positive()).length(3);
const operations=opsSchema.element.options;
export const opsToolSchema=z.array(z.discriminatedUnion('type',[
  operations[0].extend({pos:point}),
  operations[1].extend({item:operations[1].shape.item.extend({pos:point,size})}),
  operations[2],
])).max(200);

const relations=placeInputSchema.shape.relations.element.options;
const relationsToolSchema=z.array(z.discriminatedUnion('type',[
  relations[0],relations[1],relations[2],
  relations[3].extend({wall_ids:z.array(z.string().min(1)).length(2).optional()}),
  relations[4],relations[5],relations[6],
])).min(1);
const singlePlaceToolSchema=placeInputSchema.extend({
  item:placeInputSchema.shape.item.unwrap().extend({size}).optional(),
  relations:relationsToolSchema,
});
export const placeToolSchema=singlePlaceToolSchema.partial().extend({placements:z.array(singlePlaceToolSchema).min(1).max(6).optional()});
