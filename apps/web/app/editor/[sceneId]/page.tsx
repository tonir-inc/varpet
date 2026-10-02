import Link from 'next/link'
import { SceneEditor } from '@/components/editor'
import { getSceneStore } from '@/lib/scenes/store'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ sceneId: string }>
  searchParams: Promise<{ preview?: string | string[] }>
}

export default async function EditorScenePage({ params, searchParams }: PageProps) {
  const [{ sceneId }, { preview }] = await Promise.all([params, searchParams])
  const scene = await (await getSceneStore()).load(sceneId)

  if (!scene) {
    return (
      <main className="varpet-not-found">
        <h1>Scene not found</h1>
        <p>
          There is no scene <code>{sceneId}</code>.
        </p>
        <Link href="/editor">Start a new one</Link>
      </main>
    )
  }

  const { graph, ...meta } = scene
  return (
    <SceneEditor
      initialGraph={graph}
      initialPreviewSceneId={typeof preview === 'string' && preview ? preview : null}
      meta={meta}
    />
  )
}
