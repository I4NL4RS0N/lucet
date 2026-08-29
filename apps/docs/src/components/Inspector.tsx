import { useEventLog, useThread } from 'lucet-react'
import { describeEvent } from 'lucet'

/**
 * The state inspector.
 *
 * Current state, plus every transition as it happens. Doubles as the API
 * documentation, which is why the plain-language description sits above the raw
 * payload rather than instead of it.
 */
export function Inspector() {
  const thread = useThread()
  const log = useEventLog()
  const recent = log.slice(-40).reverse()

  return (
    <aside aria-label="State inspector">
      <h2>Inspector</h2>

      <h3>Current</h3>
      <dl>
        <dt>runtime</dt>
        <dd>{thread.status}</dd>
        <dt>turns</dt>
        <dd>{thread.turns.length}</dd>
        <dt>composer</dt>
        <dd>{thread.composer.locked ? `locked by ${thread.composer.lockedBy}` : 'open'}</dd>
        <dt>service</dt>
        <dd>{thread.service.status}</dd>
        <dt>context</dt>
        <dd>
          {thread.usage.contextTokens.toLocaleString()} /{' '}
          {thread.usage.contextLimit.toLocaleString()} tokens
        </dd>
        <dt>thread cost</dt>
        <dd>${thread.usage.threadCostUsd.toFixed(4)}</dd>
      </dl>

      <h3>Transitions ({log.length})</h3>
      <ol reversed>
        {recent.map((entry) => (
          <li key={entry.seq}>
            <details>
              <summary>
                <code>{entry.seq}</code> {describeEvent(entry.event)}
              </summary>
              <pre>{JSON.stringify(entry.event, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </aside>
  )
}
