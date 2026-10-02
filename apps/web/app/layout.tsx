import type { ReactNode } from 'react'
import { ClientBootstrap } from './client-bootstrap'
import './globals.css'

export const metadata = { title: 'Varpet' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientBootstrap>{children}</ClientBootstrap>
      </body>
    </html>
  )
}
