// Shared color palette + swatch builders, used by both the drawing options
// panel and the selection properties panel.

export interface Swatch {
  hex: string;
  name: string;
}

/** The main palette — strokes, text, fills. */
export const PALETTE: Swatch[] = [
  { hex: '#f0f0f0', name: 'paper' },
  { hex: '#ffffff', name: 'white' },
  { hex: '#8a8a90', name: 'graphite' },
  { hex: '#32243d', name: 'ink' },
  { hex: '#1a1a1a', name: 'black' },
  { hex: '#f95d50', name: 'coral' },
  { hex: '#ff5a3c', name: 'tangerine' },
  { hex: '#ffb02e', name: 'amber' },
  { hex: '#c8fa3a', name: 'lime' },
  { hex: '#6dbf8a', name: 'sage' },
  { hex: '#2bb3a3', name: 'teal' },
  { hex: '#3a8fff', name: 'cobalt' },
  { hex: '#d091ff', name: 'iris' },
  { hex: '#ff8fb3', name: 'pink' },
];

/** Sticky-note background colors. */
export const STICKY_PALETTE: string[] = [
  '#ffd84d', '#ff8fb3', '#6dbf8a', '#a4d4f5',
  '#ffb380', '#d4ff3a', '#f9a8d4', '#c4b5fd',
];

/**
 * Fill a `host` element with clickable color swatches. Returns a function that
 * highlights whichever swatch matches a given hex (call it when state changes).
 */
export function buildSwatches(
  host: HTMLElement,
  colors: string[],
  onPick: (hex: string) => void,
): (active: string) => void {
  const cells: Array<{ hex: string; el: HTMLElement }> = [];
  for (const hex of colors) {
    const sw = document.createElement('div');
    sw.className = 'color-swatch';
    sw.style.background = hex;
    sw.title = hex;
    sw.addEventListener('click', () => onPick(hex));
    host.appendChild(sw);
    cells.push({ hex, el: sw });
  }
  return (active: string) => {
    const a = (active || '').toLowerCase();
    for (const c of cells) c.el.classList.toggle('active', c.hex.toLowerCase() === a);
  };
}

/** A native color picker disguised as a rainbow swatch — the "custom" option. */
export function buildCustomSwatch(onPick: (hex: string) => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'color-swatch';
  wrap.title = 'custom color';
  wrap.style.cssText =
    'position:relative;overflow:hidden;cursor:pointer;' +
    'background:conic-gradient(from 0deg,#f95d50,#ffd84d,#c8fa3a,#2bb3a3,#3a8fff,#d091ff,#f95d50);';
  const input = document.createElement('input');
  input.type = 'color';
  input.style.cssText = 'position:absolute;inset:-4px;opacity:0;cursor:pointer;';
  input.addEventListener('input', () => onPick(input.value));
  wrap.appendChild(input);
  return wrap;
}
