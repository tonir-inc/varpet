import Link from 'next/link'

// Placeholder; lane B replaces this with the portal home.
export default function Home() {
  return (
    <main style={{ padding: 32 }}>
      <h1>Varpet v2</h1>
      <Link href="/editor">Open the editor</Link>
    </main>
  )
}
