import type { CatalogAsset } from '../../../editor/src/contracts';
import type { DesignerState, Piece, StreamLine } from '../contracts';

/** `streaming` is internal: true while message_delta text is arriving, so progress lines do not overwrite it. */
type State = DesignerState & { streaming?: boolean };

export function initialDesigner(): DesignerState {
  return { phase: 'idle', says: '', pieces: [], palette: [], assets: [], scripted: false };
}

const mergeAssets = (assets: CatalogAsset[], incoming: CatalogAsset[] = []) => {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  for (const asset of incoming) byId.set(asset.id, asset);
  return [...byId.values()];
};
const updatePiece = (pieces: Piece[], match: (piece: Piece) => boolean, patch: (piece: Piece) => Partial<Piece>) =>
  pieces.map(piece => match(piece) ? { ...piece, ...patch(piece) } : piece);

/** Pure: the buyer window's designer state after one stream line received `at` seconds after the request. */
export function reduce(state: DesignerState, line: StreamLine, at: number): DesignerState {
  return step(state as State, line, at);
}

function step(prev: State, line: StreamLine, at: number): State {
  let next: State = { ...prev, startedAt: prev.startedAt ?? at, lastAt: at, streaming: false };
  if ('scripted' in line && line.scripted) next.scripted = true;
  const working = prev.phase === 'proposed' ? 'proposed' : 'working';
  switch (line.type) {
    case 'progress':
      return { ...next, phase: working, streaming: prev.streaming, says: prev.streaming ? prev.says : line.message };
    case 'message_delta':
      return { ...next, phase: working, streaming: true, says: prev.streaming ? prev.says + line.delta : line.delta };
    case 'tool': {
      next.phase = working;
      const refs = line.refs ?? {};
      const key = (piece: Piece) => piece.key === refs.key;
      if (line.name === 'set_intent' && line.phase === 'end' && refs.pieces) {
        next.pieces = refs.pieces.map(({ key, name, kind, soft }) => ({ key, name, kind, soft, status: 'seen', source: 'none' }));
        next.palette = refs.palette ?? prev.palette;
      } else if (line.name === 'search_catalog' && line.phase === 'start') {
        next.pieces = updatePiece(prev.pieces, key, () => ({ status: 'searching' }));
      } else if (line.name === 'search_catalog' && line.phase === 'end') {
        const chosen = refs.chosen;
        next.pieces = updatePiece(prev.pieces, key, () => chosen ? { status: 'found', source: 'shop', asset: chosen } : { status: 'seen' });
      } else if (line.name === 'reserve_slot' && line.phase === 'end' && refs.slot) {
        const slot = refs.slot;
        next.pieces = updatePiece(prev.pieces, key, () => ({ slotId: slot.slotId, size: slot.size_wdh_m, asset: slot, status: 'reserved', source: 'custom' }));
      } else if (line.name === 'propose' && line.phase === 'end' && refs.proposal) {
        next = { ...next, phase: 'proposed', proposal: refs.proposal, assets: mergeAssets(prev.assets, refs.assets) };
      }
      return next;
    }
    case 'build': {
      const url = line.state === 'done' ? line.glb : undefined;
      const built = (asset: CatalogAsset): CatalogAsset => ({ ...asset, source: { type: 'gltf', url: url! } });
      next.pieces = updatePiece(prev.pieces, piece => piece.slotId === line.slotId, piece => ({
        status: line.state,
        ...(line.state === 'failed' ? { reason: line.reason } : {}),
        ...(url && piece.asset ? { asset: built(piece.asset) } : {}),
      }));
      if (url) next.assets = prev.assets.map(asset => asset.id === line.slotId ? built(asset) : asset);
      return next;
    }
    case 'proposal': {
      const incoming = new Map((line.assets ?? []).map(asset => [asset.id, asset]));
      return {
        ...next, phase: 'proposed', proposal: line.proposal, conversationId: line.conversationId,
        assets: mergeAssets(prev.assets, line.assets),
        pieces: updatePiece(prev.pieces, piece => !!piece.asset && incoming.has(piece.asset.id), piece => ({ asset: { ...piece.asset, ...incoming.get(piece.asset!.id)! } })),
      };
    }
    case 'question':
      return { ...next, phase: 'question', conversationId: line.conversationId, says: line.question, question: { text: line.question, options: line.options } };
    case 'message':
      return { ...next, phase: 'message', conversationId: line.conversationId, says: line.message };
    case 'decline':
      return { ...next, phase: 'declined', conversationId: line.conversationId, says: line.message };
    case 'error':
      return { ...next, phase: 'error', says: line.message };
    default:
      return prev; // a line type this build does not know: ignore it
  }
}
