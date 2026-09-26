export type BlueprintJourneyPhase = 'build' | 'design' | 'customize';

const STEPS: [BlueprintJourneyPhase, string][] = [
  ['build', 'Build'], ['design', 'Design'], ['customize', 'Customize'],
];

/** The same journey follows the apartment from reconstruction into its editing workspace. */
export function blueprintJourneyMarkup(current: BlueprintJourneyPhase): string {
  const index = STEPS.findIndex(([phase]) => phase === current);
  return `<ol class="blueprint-journey" aria-label="Your apartment progress">${STEPS.map(([phase, label], i) =>
    `<li data-journey="${phase}" class="${i === index ? 'is-current' : i < index ? 'is-done' : ''}"${i === index ? ' aria-current="step"' : ''} aria-label="${label}${i < index ? ', complete' : ''}"><span class="journey-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span>${label}</span></li>`).join('')}</ol>`;
}

export function updateBlueprintJourney(root: HTMLElement, current: BlueprintJourneyPhase): void {
  const index = STEPS.findIndex(([phase]) => phase === current);
  root.querySelectorAll<HTMLElement>('[data-journey]').forEach(element => {
    const i = STEPS.findIndex(([phase]) => phase === element.dataset.journey);
    if (i < 0) return;
    element.classList.toggle('is-current', i === index);
    element.classList.toggle('is-done', i < index);
    element.setAttribute('aria-label', `${STEPS[i]![1]}${i < index ? ', complete' : ''}`);
    if (i === index) element.setAttribute('aria-current', 'step');
    else element.removeAttribute('aria-current');
  });
}
