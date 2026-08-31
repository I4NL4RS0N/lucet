import type { Source } from 'lucet'

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
 * 3. TRIPLE-CODED CONDITION. Word, silhouette, and tone together: stale
 *    wears the caution ink and a turned-clock glyph; gone strikes the
 *    title through and wears danger. Never colour alone (1.4.1).
 * 4. WORDS, NOT URLS. The demo cites documents in collections, so no row
 *    pretends to be a link. Click-through, hover previews, and inline
 *    marker interaction are deferred to the host's document model — the
 *    marker text is plain text on purpose until then.
 */

export interface SourcesProps {
  sources: readonly Source[]
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

export function Sources({ sources }: SourcesProps) {
  if (sources.length === 0) return null
  return (
    <div className="lucet-sources">
      <span className="lucet-sources__label">Sources</span>
      <ol className="lucet-sources__list">
        {sources.map((source) => (
          <li key={source.id} className="lucet-sources__row" data-status={source.status}>
            <KindGlyph kind={source.sourceKind} />
            <span className="lucet-sources__body">
              <span className="lucet-sources__title">{source.title}</span>
              <span className="lucet-sources__loc">{source.location}</span>
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
          </li>
        ))}
      </ol>
    </div>
  )
}
