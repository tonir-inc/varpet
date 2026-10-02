import type { ReactNode } from 'react'
import { ClientBootstrap } from '../client-bootstrap'
import '../pascal-theme.css'

export const metadata = { title: 'Varpet editor' }

// Pascal's node registry is filled here, not in the root layout, so portal pages don't load Pascal.
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <ClientBootstrap>
      <div className="varpet-editor">{children}</div>
    </ClientBootstrap>
  )
}
