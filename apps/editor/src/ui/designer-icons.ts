import { icon } from './icons';

/** Designer-only glyphs on the shared 24px, 1.65 stroke grid. Shared shapes come from icons.ts. */
const paths: Record<string, string> = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cross: '<path d="m7 7 10 10M17 7 7 17"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
  down: '<path d="M12 4v15m-6-6 6 6 6-6"/>',
  send: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  wait: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
};

export function designerIcon(name: string, size = 18): string {
  const path = paths[name];
  if (!path) return icon(name);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Icon-only control: every one names its action for screen readers and on hover. */
export function designerIconButton(name: string, label: string, action: () => void, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `designer-icon-button ${className}`.trim();
  button.innerHTML = designerIcon(name); button.setAttribute('aria-label', label); button.title = label;
  button.onclick = action; return button;
}
