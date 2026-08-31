/**
 * The activity orb: a named wait, with a mark that differs by WHAT KIND of
 * wait it is. Promoted from the primitives lab the moment a component needed
 * it — the prompt input's status strip is its first real job.
 *
 * Seven states, deliberately split. Three are the agent working (thinking,
 * searching, composing) — every library ships those, and they take the
 * accent, because the agent working on your request is the most brand-forward
 * moment the interface has. Four are the agent NOT working: blocked on you,
 * queued for capacity, degraded to a fallback, down entirely. Nobody ships
 * those, and they are the ones a person most needs distinguished.
 *
 * The label is a REQUIRED prop, not a convention: motion distinguishes the
 * states for people who can see the difference, and the word does it for
 * everyone else. Under reduced motion each state keeps a distinct static
 * form.
 */

export type ActivityOrbState =
  | 'thinking'
  | 'searching'
  | 'composing'
  | 'blocked'
  | 'queued'
  | 'degraded'
  | 'down'
  /** At rest and present: the cold start's face. A slow breath, no urgency. */
  | 'ready'

export interface ActivityOrbProps {
  state: ActivityOrbState
  /** Always visible. An orb without its word is a mystery lamp. */
  label: string
  /** Elapsed or estimated time, rendered tabular. */
  time?: string
  size?: 'sm' | 'lg'
}

export function ActivityOrb({ state, label, time, size }: ActivityOrbProps) {
  return (
    <span className="lucet-orb-row">
      <span
        className={`lucet-orb${size ? ` lucet-orb--${size}` : ''}`}
        data-state={state}
        role="img"
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle className="lucet-orb__track" cx="12" cy="12" r="9" />
          <circle className="lucet-orb__arc" cx="12" cy="12" r="9" />
          {state === 'thinking' && <circle className="lucet-orb__arc lucet-orb__arc2" cx="12" cy="12" r="9" />}
          {(state === 'thinking' || state === 'blocked' || state === 'ready') && (
            <circle className="lucet-orb__core" cx="12" cy="12" r="2.5" />
          )}
        </svg>
      </span>
      <span className="lucet-orb-row__label">{label}</span>
      {time ? <span className="lucet-orb-row__time">{time}</span> : null}
    </span>
  )
}
