/** Blueprint paper: the landing sheet, the construction ground and the editor's ground for a built plan. */
export const BLUEPRINT_PAPER = '#155f6d';

/** How the editor first appears: on blueprint paper, from the construction view's camera, tools arriving. */
export interface EditorPresentation {
  paper: string;
  camera?: { position: [number, number, number]; target: [number, number, number]; fov: number };
  /** Start with the tools away and the canvas look-only; `editorView.arrive()` brings them in. */
  arriving?: boolean;
}
