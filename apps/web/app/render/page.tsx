import { RenderStage } from '@/components/render/render-stage'

export const dynamic = 'force-static'

/** Render-only page driven by the warm headless browser in lib/render/browser.ts (window.__varpetRender). */
export default function RenderPage() {
  return <RenderStage />
}
