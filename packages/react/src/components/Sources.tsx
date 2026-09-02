import type { Source } from 'lucet-core'

/**
 * Citations & sources: the response's bibliography. The positions:
 *
 * 1. SOURCES ARE PART OF THE MESSAGE. They arrive as a part, live in the
 *    event log, and survive in history — not a tooltip's worth of
 *    decoration. Inline [n] markers in the text refer to this list's
 *    order.
 * 2. A CITATION IS A CLAIM WITH A TIMESTAMP. Sources age after the
 *    response settles: `stale` means updated behind the citation, `gone`
 *    means removed outright. A bibliography that can only say "fine" is
 *    not reporting, and the aging states are the half nobody designs.
 * 3. THE ROW IS THE WORDS, THE TRACE IS THE RECEIPT. Which pages of the
 *    document, the query as it ran — full traceability, behind the same
 *    disclosure grammar as the tool call, under the same law: no trace,
 *    no chevron, nothing dead to expand.
 * 4. TRIPLE-CODED CONDITION. Word, silhouette, and tone together: stale
 *    wears the caution ink and a turned-clock glyph; gone strikes the
 *    title through and wears danger. Never colour alone (1.4.1).
 * 5. WORDS, NOT URLS. The demo cites documents in collections, so no row
 *    pretends to be a link; click-through belongs to the host's document
 *    model and attaches at `location`.
 */

export interface SourcesProps {
  /** What the rows are — "Sources" by default; a Do path lists what it created. */
  label?: string | undefined
  sources: readonly Source[]
}

/** What the receipt is called, per kind of source. */
const TRACE_LABEL: Record<Source['sourceKind'], string> = {
  document: 'Where in the document',
  data: 'The query it ran',
  web: 'What was retrieved',
}

function KindGlyph({ kind }: { kind: Source['sourceKind'] }) {
  if (kind === 'web') {
    return (
      <svg className="lucet-sources__glyph" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5z" />
      </svg>
    )
  }
  if (kind === 'data') {
    return (
      <svg className="lucet-sources__glyph" viewBox="0 0 24 24" aria-hidden>
        <ellipse cx="12" cy="6" rx="7.5" ry="3" />
        <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
      </svg>
    )
  }
  return (
    <svg className="lucet-sources__glyph" viewBox="0 0 24 24" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

function Row({ source }: { source: Source }) {
  return (
    <>
      <KindGlyph kind={source.sourceKind} />
      <span className="lucet-sources__body">
        <span className="lucet-sources__title">{source.title}</span>
        <span className="lucet-sources__loc">{source.location}</span>
        {source.detail ? <span className="lucet-sources__where">{source.detail}</span> : null}
      </span>
      {source.status !== 'ok' ? (
        <span className="lucet-sources__flag">
          {source.status === 'stale' ? (
            <svg className="lucet-sources__flag-glyph" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 8v4l2.6 1.6M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V6H18" />
            </svg>
          ) : (
            <svg className="lucet-sources__flag-glyph" viewBox="0 0 24 24" aria-hidden>
              <path d="M9 6l-3.2 3.2a4.5 4.5 0 0 0 0 6.4l2.6 2.6a4.5 4.5 0 0 0 6.4 0L18 15M7 3l14 18" />
            </svg>
          )}
          {source.note ??
            (source.status === 'stale' ? 'Updated since cited' : 'No longer available')}
        </span>
      ) : null}
    </>
  )
}

export function Sources({ sources, label = 'Sources' }: SourcesProps) {
  if (sources.length === 0) return null
  return (
    <div className="lucet-sources">
      <span className="lucet-sources__label">{label}</span>
      <ol className="lucet-sources__list">
        {sources.map((source) => (
          <li key={source.id}>
            {source.trace && source.status !== 'gone' ? (
              <details className="lucet-source" data-status={source.status}>
                <summary className="lucet-sources__row lucet-sources__row--summary">
                  <Row source={source} />
                </summary>
                <div className="lucet-sources__io">
                  <span className="lucet-sources__io-label">
                    {TRACE_LABEL[source.sourceKind]}
                  </span>
                  <pre
                    className="lucet-sources__io-pre"
                    tabIndex={0}
                    role="region"
                    aria-label={TRACE_LABEL[source.sourceKind]}
                  >
                    <code>{source.trace}</code>
                  </pre>
                </div>
              </details>
            ) : (
              /* No trace, no disclosure: a plain row that promises nothing.
                 A GONE source is a plain row too (round 05, P1): a removed
                 reference must never read as openable. */
              <span className="lucet-sources__row" data-status={source.status}>
                <Row source={source} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
