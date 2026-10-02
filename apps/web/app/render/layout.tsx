import type { ReactNode } from 'react'
import { ClientBootstrap } from '../client-bootstrap'

export const metadata = { title: 'Varpet render' }

// The headless renderer's page (lib/render): Pascal's node registry, no editor chrome.
export default function RenderLayout({ children }: { children: ReactNode }) {
  return (
    <ClientBootstrap>
      {/* The dev server's corner badge would land in every capture. */}
      <style>{'nextjs-portal{display:none!important}'}</style>
      {children}
    </ClientBootstrap>
  )
}
