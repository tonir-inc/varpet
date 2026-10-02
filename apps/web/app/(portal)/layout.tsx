import { Noto_Sans_Armenian, Noto_Serif_Armenian, Sofia_Sans, Sofia_Sans_Condensed, Source_Serif_4 } from 'next/font/google'
import type { ReactNode } from 'react'
import { PortalFrame, THEME_SCRIPT } from '@/components/portal/frame'
import '@/styles/portal/base.css'
import '@/styles/portal/theme.css'
import '@/styles/portal/portal.css'
import '@/styles/portal/blueprint.css'
import '@/styles/portal/catalog.css'
import '@/styles/portal/developer-profile.css'

// v1's type: Sofia Sans for the interface, Source Serif 4 for headings, Noto for Armenian.
const sofia = Sofia_Sans({ subsets: ['latin', 'cyrillic'], variable: '--font-sofia-sans', display: 'swap' })
const condensed = Sofia_Sans_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-sofia-sans-condensed', display: 'swap' })
const serif = Source_Serif_4({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-source-serif', display: 'swap' })
const armenian = Noto_Sans_Armenian({ subsets: ['armenian'], variable: '--font-noto-sans-armenian', display: 'swap' })
const armenianSerif = Noto_Serif_Armenian({ subsets: ['armenian'], variable: '--font-noto-serif-armenian', display: 'swap' })

export const metadata = {
  title: 'Varpet · Your apartment studio',
  description: 'Varpet — a shared space for shaping your apartment in 3D.',
}

/** Every portal page: v1's tokens and CSS scoped to this wrapper, so none of it reaches the Pascal editor. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`portal-root portal-host ${sofia.variable} ${condensed.variable} ${serif.variable} ${armenian.variable} ${armenianSerif.variable}`}
      data-theme="light" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <PortalFrame>{children}</PortalFrame>
    </div>
  )
}
