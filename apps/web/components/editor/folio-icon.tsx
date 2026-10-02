// v1 Folio's 24-unit stroke icons (apps/editor/src/ui/icons.ts), ink by currentColor, 1.6 stroke.
const paths = {
  select: '<path d="m5 3 15 10-7 1-3 7Z"/>',
  marquee: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M10 4h4M10 20h4M4 10v4M20 10v4"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  rotate: '<path d="M20 10a8 8 0 1 0-1 7M20 3v7h-7"/>',
  trash: '<path d="M3 6h18M6 6l1 15h10l1-15M9 6V3h6v3M10 10v7M14 10v7"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  sliders: '<path d="M4 7h6M16 7h4M4 17h10M20 17h-1"/><circle cx="13" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  properties: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5"/>',
  top: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h18M13 3v9M8 12v9"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 13h7v7M14 4v6h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  undo: '<path d="M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10"/>',
  redo: '<path d="m15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  ruler: '<path d="m3 17 14-14 4 4L7 21Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  walls: '<path d="M3 20V5h18v15M3 13h8v7M15 5v8h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 17h.01"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  sofa: '<path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 18v3M19 18v3M5 12H3v6h18v-6h-2v3H5Z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
} as const

export type FolioIconName = keyof typeof paths

export function FolioIcon({ name, size = 18 }: { name: FolioIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] }}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      width={size}
    />
  )
}
