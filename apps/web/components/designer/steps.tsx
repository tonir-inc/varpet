'use client'

import { clock, stepsSummary, type LiveTurn as LiveTurnState, type Step, type TurnSteps } from '../../lib/agent-stream'
import { Icon } from './icons'

const marks = { done: ['check', 'Done'], failed: ['cross', 'Failed'], unfinished: ['wait', 'Not finished when the turn ended'] } as const

/** One step row. The ring's phase follows the clock so a re-rendered row does not visibly restart. */
function StepRow({ step, current, elapsed }: { step: Step; current: boolean; elapsed?: number }) {
  const title = step.status === 'running' ? 'Working' : marks[step.status][1]
  const time = step.end !== undefined ? clock(step.end - step.at) : step.status === 'running' && elapsed !== undefined ? clock(elapsed - step.at) : null
  return (
    <li className={`designer-step designer-step-${step.status}`}>
      <span className="designer-step-mark" title={title}>
        {step.status === 'running'
          ? <span className="designer-ring" style={{ animationDelay: `-${Math.round((typeof performance !== 'undefined' ? performance.now() : 0) % 900)}ms` }} />
          : <Icon name={marks[step.status][0]} size={14} />}
      </span>
      <span className="designer-step-label">
        <span className="designer-visually-hidden">{title}: </span>
        {step.label}
        {step.detail ? <span className="designer-step-detail"> · {step.detail}</span> : null}
        {step.timed && time ? <> · <span className="designer-step-time">{time}</span></> : null}
      </span>
      {current && elapsed !== undefined ? <span className="designer-elapsed" aria-hidden="true">{clock(elapsed)}</span> : null}
    </li>
  )
}

export function StepList({ steps, current = -1, elapsed }: { steps: Step[]; current?: number; elapsed?: number }) {
  return (
    <ol className="designer-step-list">
      {steps.map((step, index) => <StepRow key={step.key} step={step} current={index === current} elapsed={elapsed} />)}
    </ol>
  )
}

/** A finished turn reads as one line ("6 steps · 0:48") that opens to its steps. */
export function CollapsedSteps({ turn }: { turn: TurnSteps }) {
  return (
    <details className="designer-steps">
      <summary>{stepsSummary(turn)}</summary>
      <StepList steps={turn.steps} />
    </details>
  )
}

/** The turn in flight: the last few steps, the current one with a running clock. */
export function LiveTurn({ turn, elapsed, noun = 'designer' }: { turn: LiveTurnState; elapsed: number; noun?: string }) {
  const steps = [...turn.steps]
  if (!steps.some((step) => step.status === 'running')) {
    steps.push({ key: 'now', status: 'running', at: 0,
      label: !steps.length ? turn.progress || `Sending your request to the ${noun}` : turn.draft ? 'Writing the reply' : 'Thinking it through' })
  }
  const current = steps.map((step) => step.status).lastIndexOf('running')
  const shown = 7, hidden = Math.max(0, steps.length - shown)
  return (
    <div className="designer-progress designer-turn" aria-live="off">
      {hidden ? <small className="designer-steps-earlier">{hidden} earlier step{hidden === 1 ? '' : 's'} done</small> : null}
      <StepList steps={steps.slice(hidden)} current={current - hidden} elapsed={elapsed} />
      <span className="designer-visually-hidden" role="status">{steps[current]?.label ?? turn.progress}</span>
    </div>
  )
}
