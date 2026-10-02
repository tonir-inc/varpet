import { DeveloperProfilePage } from '@/components/portal/developers'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <DeveloperProfilePage slug={decodeURIComponent(slug)} />
}
