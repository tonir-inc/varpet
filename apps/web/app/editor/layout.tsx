import type { ReactNode } from 'react'
import '../pascal-theme.css'

export const metadata = { title: 'Varpet editor' }

// Folio fonts load with display=swap; if Google Fonts is blocked the system fallbacks in pascal-theme.css apply.
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Armenian:wght@400;500;600;700&family=Noto+Serif+Armenian:wght@400;600&family=Sofia+Sans+Condensed:wght@400;500;600&family=Sofia+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap'

export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
      <link href={FONTS_URL} precedence="default" rel="stylesheet" />
      <div className="varpet-editor">{children}</div>
    </>
  )
}
