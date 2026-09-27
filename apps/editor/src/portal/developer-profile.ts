/** Developer profiles (lane portal-profile). Stub so `app.ts` can route here before the page lands. */
export type DeveloperProfileTarget = { slug: string } | { studio: true };

export async function mountDeveloperProfile(host: HTMLElement, target: DeveloperProfileTarget): Promise<void> {
  host.textContent = 'slug' in target ? `Developer profile ${target.slug} is coming soon.` : 'Your developer studio is coming soon.';
}
