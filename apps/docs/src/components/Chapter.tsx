/**
 * A chapter on one of the long lab pages: a quiet label and one plain
 * proposition, visually below the section headings it groups, with the
 * break carried by spacing alone (no divider). Named, never numbered —
 * the chapters are the page's own vocabulary, not an index. Sections
 * beneath a chapter are h3, so the outline reads page → chapter →
 * section. (Macro pass, 2026-09-02.)
 */
export function Chapter({ name, note }: { name: string; note: string }) {
  return (
    <header className="chapter">
      <h2 className="chapter__name">{name}</h2>
      <p className="chapter__note">{note}</p>
    </header>
  )
}
