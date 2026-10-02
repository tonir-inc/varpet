// Flat templates a new apartment starts from (client-safe: the manifest only, no graphs).
// Built by lib/flats/build-templates.ts from the reconstructed v1 flats.
import manifest from './templates/manifest.json'

export interface FlatTemplate {
  id: string
  name: string
  note: string
  /** Floor area of all rooms, m². */
  area: number
  rooms: number
  bedrooms: number
  /** Public path of the developer's plan image. */
  thumbnail: string
}

export const FLAT_TEMPLATES: readonly FlatTemplate[] = manifest
export const DEFAULT_FLAT_TEMPLATE_ID = 'sunday-b12121'

export const flatTemplate = (id: string) => FLAT_TEMPLATES.find((t) => t.id === id)
