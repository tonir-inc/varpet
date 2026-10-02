import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import { DevChat } from '../../../components/designer/dev-chat'

export const dynamic = 'force-dynamic'

const fixture = (path: string) => readFileSync(join(process.cwd(), 'components', path), 'utf8')

/** Dev only: the designer panel and the plan intake replaying recorded AgentEvent streams. ?speed=1..10 */
export default async function DevChatPage({ searchParams }: { searchParams: Promise<{ speed?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const speed = Math.min(10, Math.max(0.25, Number((await searchParams).speed) || 1))
  return (
    <>
      {/* Folio type; the app layout should load these for every page (reported as a shared change). */}
      <link rel="stylesheet" precedence="default"
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&family=Noto+Serif+Armenian:wght@400..700&family=Sofia+Sans:wght@300..700&family=Sofia+Sans+Condensed:wght@500..700&family=Noto+Sans+Armenian:wdth,wght@62.5..100,300..700&display=swap" />
      <DevChat designer={fixture('designer/__fixtures__/designer-turn.ndjson')} architect={fixture('intake/__fixtures__/architect-turn.ndjson')} speed={speed} />
    </>
  )
}
