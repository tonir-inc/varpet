import manifest from '../../../../catalog/openings/manifest.json';
import type { EntityMetadata, Opening } from '../contracts';

/** One door or window model from catalog/openings (see its README for the frame and the moving parts). */
export interface OpeningModelEntry {
  file: string; kind: string; mechanism: NonNullable<EntityMetadata['mechanism']>;
  opening_m: { width: number; height: number };
  moving: Record<string, { point_m: number[]; motion: string }>;
}

const PREFIX = 'extra:openings:';
const entries = manifest as unknown as OpeningModelEntry[];

/** The manifest entry an opening's assetId names, or undefined when it names none. */
export function openingModelEntry(assetId: string | undefined): OpeningModelEntry | undefined {
  if (!assetId?.startsWith(PREFIX)) return undefined;
  const file = `${assetId.slice(PREFIX.length)}.glb`;
  return entries.find(entry => entry.file === file);
}

/** How an opening opens: its confirmed metadata, else its catalog model's mechanism, else the kind's default. */
export function openingMechanism(opening: Opening, metadata: EntityMetadata): NonNullable<EntityMetadata['mechanism']> {
  return metadata.mechanism ?? openingModelEntry(opening.assetId)?.mechanism ?? (opening.kind === 'door' ? 'hinged' : 'fixed');
}
