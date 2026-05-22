// Shared, mutable client state — the current tool and brush settings.
// The toolbar UI (index.ts) writes these; the drawing and object modules
// read them. A tiny module like this keeps those modules from importing
// each other in a cycle.

export type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'text'
  | 'sticky'
  | 'flowcard'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow';

export const state = {
  tool: 'select' as Tool,
  color: '#f0f0f0',
  size: 3,
  /** Fill for newly-drawn shapes; null = unfilled. */
  fill: null as string | null,
  spaceDown: false,
};

/** The CSS cursor that matches the active tool. */
export function toolCursor(): string {
  switch (state.tool) {
    case 'hand':
      return 'grab';
    case 'select':
      return 'default';
    case 'text':
    case 'sticky':
    case 'flowcard':
      return 'copy';
    default:
      return 'crosshair';
  }
}
