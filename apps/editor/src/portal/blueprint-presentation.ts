import type { FinishViewport } from '../render/viewport';
export { BLUEPRINT_PAPER } from '../render/blueprint-theme';

/** How the editor first appears: on blueprint paper, from the construction view's camera, tools arriving. */
export interface EditorPresentation {
  paper: string;
  camera?: { position: [number, number, number]; target: [number, number, number]; fov: number };
  /** Start with the tools away and the canvas look-only; `editorView.arrive()` brings them in. */
  arriving?: boolean;
  /** Offer the first furnishing design before revealing the full editing tools. */
  workflow?: 'design';
  /** Single-use transfer of the construction world. Session-only; never serialized into the project. */
  takeViewport?: () => FinishViewport | null;
}
