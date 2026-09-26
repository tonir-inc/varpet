import type { AgentProposal, AssetKind, CatalogAsset } from '../../editor/src/contracts';

/**
 * The designer stream as the buyer app reads it: the service's NDJSON lines plus the opt-in
 * `tool` and `build` lines from Notion "Designer: from an inspiration photo to a quote".
 * Unknown line types are ignored, never fatal, so the app keeps working while the service grows.
 */
export type BuildState = 'queued' | 'writing' | 'checking' | 'fixing' | 'done' | 'failed';
export type StreamLine =
  | { type: 'progress'; message: string }
  | { type: 'message_delta'; delta: string }
  | { type: 'tool'; name: string; phase: 'start' | 'end'; summary?: string; refs?: ToolRefs; scripted?: boolean }
  | { type: 'build'; slotId: string; state: BuildState; glb?: string; reason?: string; scripted?: boolean }
  | { type: 'proposal'; conversationId: string; proposal: AgentProposal; assets?: CatalogAsset[]; metrics?: unknown; notes?: string }
  | { type: 'question'; conversationId: string; question: string; options: string[] }
  | { type: 'message'; conversationId: string; message: string }
  | { type: 'decline'; conversationId: string; message: string }
  | { type: 'error'; message: string };

/** What tool lines carry (on `end`, except `key`, which a search_catalog `start` also sends). `key` is the piece's number in the picture, legend and room. */
export interface SeenPiece { key: number; name: string; kind: AssetKind; soft: boolean; box?: [number, number, number, number] }
export interface ToolRefs {
  /** set_intent: what the designer saw in the picture (box is x, y, w, h in 0..1 of the picture). */
  pieces?: SeenPiece[];
  palette?: string[];
  /** search_catalog: the piece searched for and the product chosen, if any. */
  key?: number;
  chosen?: CatalogAsset;
  /** reserve_slot: the custom slot, a provisional asset with the stored size and an estimate. */
  slot?: CatalogAsset & { slotId: string; size_wdh_m: [number, number, number] };
  /** propose: the checked proposal, sent at once so the window can show the layout with grey slots
   * before any build finishes. `assets` are the slot and shop assets its command needs. */
  proposal?: AgentProposal;
  assets?: CatalogAsset[];
}

/** A recorded stream: each line with the seconds since the request started. */
export interface TimedLine { at: number; line: StreamLine }
export interface Recording { id: string; title: string; flatId: string; request: string; picture?: string; currency?: 'AMD' | null; lines: TimedLine[] }

/** One piece from the picture, as the legend, the room and the quote show it. */
export type PieceStatus = 'seen' | 'searching' | 'found' | 'reserved' | BuildState;
export interface Piece {
  key: number;
  name: string;
  kind: AssetKind;
  soft: boolean;
  status: PieceStatus;
  source: 'shop' | 'custom' | 'none';
  asset?: CatalogAsset;
  slotId?: string;
  /** Custom slot size, [w, d, h] in metres. */
  size?: [number, number, number];
  reason?: string;
}

export type DesignerPhase = 'idle' | 'working' | 'proposed' | 'question' | 'message' | 'declined' | 'error';
export interface DesignerState {
  phase: DesignerPhase;
  /** The designer's latest words for the buyer: streamed text, else the latest progress line. */
  says: string;
  pieces: Piece[];
  palette: string[];
  proposal?: AgentProposal;
  /** Built or reserved assets the proposal's command needs registered before it is checked. */
  assets: CatalogAsset[];
  question?: { text: string; options: string[] };
  conversationId?: string;
  /** True when any line was scripted (a replay or a stand-in for a service feature not built yet). */
  scripted: boolean;
  startedAt?: number;
  lastAt?: number;
}

/** How the quote treats each piece in the flat. */
export type Ownership = 'owned' | 'placeholder';
