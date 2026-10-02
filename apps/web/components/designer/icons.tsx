import type { ReactNode } from 'react'

// v1's designer glyphs (icons.ts + designer-icons.ts): a 24 px grid with a 1.65 stroke.
const paths: Record<string, ReactNode> = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cross: <path d="m7 7 10 10M17 7 7 17" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></>,
  down: <path d="M12 4v15m-6-6 6 6 6-6" />,
  send: <path d="M4 12h15m-6-6 6 6-6 6" />,
  wait: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  sparkles: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4" />,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  plan: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 12h7v9M14 3v6h7" /></>,
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.sparkles}
    </svg>
  )
}

/** Icon-only control: every one names its action for screen readers and on hover. */
export function IconButton({ name, label, onClick, className = '', disabled, type = 'button', size }: {
  name: string; label: string; onClick?: () => void; className?: string; disabled?: boolean; type?: 'button' | 'submit'; size?: number
}) {
  return (
    <button type={type} className={`designer-icon-button ${className}`.trim()} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon name={name} size={size} />
    </button>
  )
}
