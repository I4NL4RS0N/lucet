import { useTriggerGroups, useLucet, useThread } from 'lucet-react'
import { writeStateParam, linkForState } from '../lib/deep-link'

/**
 * The trigger rail.
 *
 * Not a navigation. Clicking a trigger injects that state into the running
 * thread. Nothing resets and nothing navigates, which is the whole difference
 * between this and a component gallery.
 */
export function TriggerRail() {
  const lucet = useLucet()
  const groups = useTriggerGroups()
  const thread = useThread()
  const busy = thread.status !== 'idle'

  async function fire(id: string) {
    writeStateParam(id)
    await lucet.trigger(id)
  }

  return (
    <nav aria-label="State triggers">
      <h2>States</h2>
      <p>Injected into the running thread. Chain them.</p>

      {groups.map((group) => (
        <section key={group.group}>
          <h3>{group.group}</h3>
          <ul>
            {group.scenarios.map((scenario) => (
              <li key={scenario.id}>
                <button type="button" onClick={() => void fire(scenario.id)} disabled={busy}>
                  {scenario.label}
                </button>
                <button
                  type="button"
                  title="Copy a link straight to this state"
                  onClick={() => void navigator.clipboard.writeText(linkForState(scenario.id))}
                >
                  link
                </button>
                <p>{scenario.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <hr />
      <button type="button" onClick={() => lucet.reset()}>
        Reset thread
      </button>
    </nav>
  )
}
