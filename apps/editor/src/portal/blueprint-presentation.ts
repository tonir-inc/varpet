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
  /** Opened from the plan catalog: Design shows the developer's furnished design as the person's to change. */
  bundle?: BundlePresentation;
  /** Single-use transfer of the construction world. Session-only; never serialized into the project. */
  takeViewport?: () => FinishViewport | null;
}

export interface BundlePresentation {
  id: string;
  name: string;
  developerName: string;
  developerHref: string;
  /** Same-origin plan image, shown beside the brief so Design reads as the catalog card, opened. */
  blueprintUrl: string;
  furnishedPieces: number;
  /** Who furnished it when not the developer (Experimental flats: varpet, from the developer's own plan). */
  furnishedBy?: string;
}
