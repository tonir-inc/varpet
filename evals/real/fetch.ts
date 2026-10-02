// Downloads the real projects' plans and photos (manifest.json) into evals/real/cache/<project>/, for internal
// evaluation only (the cache is gitignored; the images stay their authors'). Photos are downscaled to 1280 px
// with macOS `sips` when it is there. Skips files already present.
//
//   node --experimental-strip-types --no-warnings evals/real/fetch.ts [project-id ...]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RealPhoto { file: string; room: string; url: string }
export interface RealProject {
  id: string
  title: string
  designer: string
  photographer?: string | null
  source: string
  city: string
  country: string
  areaM2: number
  bedrooms: number
  style: string
  rooms: string[]
  brief: string
  plan: { file: string; url: string; note: string }
  photos: RealPhoto[]
}

export const REAL_DIR = import.meta.dirname
export const CACHE_DIR = join(REAL_DIR, 'cache')

export function loadProjects(): RealProject[] {
  return (JSON.parse(readFileSync(join(REAL_DIR, 'manifest.json'), 'utf8')) as { projects: RealProject[] }).projects
}

/** Cached files of a project: the plan, then the photos (each with its room); missing files are left out. */
export function cachedImages(project: RealProject) {
  const dir = join(CACHE_DIR, project.id)
  const plan = existsSync(join(dir, project.plan.file)) ? join(dir, project.plan.file) : null
  const photos = project.photos.filter((p) => existsSync(join(dir, p.file))).map((p) => ({ room: p.room, path: join(dir, p.file) }))
  return { plan, photos }
}

async function download(url: string, file: string) {
  if (existsSync(file)) return false
  const response = await fetch(url, { headers: { 'user-agent': 'varpet-eval/0.1' } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  try {
    execFileSync('sips', ['-Z', '1280', file], { stdio: 'ignore' })
  } catch {} // no sips: keep the original size
  return true
}

if (import.meta.main) {
  const only = process.argv.slice(2)
  for (const project of loadProjects()) {
    if (only.length && !only.includes(project.id)) continue
    const dir = join(CACHE_DIR, project.id)
    mkdirSync(dir, { recursive: true })
    let got = 0
    for (const { url, file } of [project.plan, ...project.photos]) {
      try {
        if (await download(url, join(dir, file))) got++
      } catch (error) {
        console.error(`${project.id}/${file}: ${String(error)}`)
      }
    }
    console.log(`${project.id}: ${got} downloaded`)
  }
}
