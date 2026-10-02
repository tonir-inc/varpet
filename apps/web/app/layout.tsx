import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'Varpet' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&family=Noto+Serif+Armenian:wght@400..700&family=Sofia+Sans:wght@300..700&family=Sofia+Sans+Condensed:wght@500..700&family=Noto+Sans+Armenian:wdth,wght@62.5..100,300..700&display=swap"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
