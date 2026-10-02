// A floor plan chosen on the portal, handed to the editor's plan intake for one scene (sessionStorage, this tab).

export interface PlanHandoff { name: string; url: string }

const key = (sceneId: string) => `varpet.intake.plan:${sceneId}`
const storage = () => { try { return window.sessionStorage } catch { return undefined } }

export function savePlanHandoff(sceneId: string, plan: PlanHandoff): boolean {
  try { storage()?.setItem(key(sceneId), JSON.stringify(plan)); return true } catch { return false }
}

export function readPlanHandoff(sceneId: string): PlanHandoff | null {
  try {
    const raw = storage()?.getItem(key(sceneId))
    const plan = raw ? (JSON.parse(raw) as Partial<PlanHandoff>) : null
    return plan && typeof plan.name === 'string' && typeof plan.url === 'string' && plan.url.startsWith('data:image/') ? { name: plan.name, url: plan.url } : null
  } catch { return null }
}

export function clearPlanHandoff(sceneId: string) {
  try { storage()?.removeItem(key(sceneId)) } catch { /* storage unavailable */ }
}

export function hasPlanHandoff(sceneId: string): boolean {
  return readPlanHandoff(sceneId) !== null
}
