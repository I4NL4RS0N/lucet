import type { ReactNode } from 'react'

/**
 * The host application behind drawer mode.
 *
 * It exists because a drawer over nothing proves nothing. Scope Control will
 * read this breadcrumb directly: the navigation is already a scope ladder, and
 * this is the ladder it will climb.
 */
export function MockPage({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav aria-label="Breadcrumb">
        <ol>
          <li>Coverage</li>
          <li>Utilities</li>
          <li>Pacific Grid Holdings</li>
          <li aria-current="page">Q3 review</li>
        </ol>
      </nav>

      <h1>Pacific Grid Holdings</h1>
      <p>Quarterly review. 14 documents, 3 revisions, 1 process change.</p>

      <h2>Recent actions</h2>
      <ul>
        <li>Revision 7 replaces revision 6, superseded</li>
        <li>Review step moved after approval</li>
        <li>Third-quarter records archived</li>
      </ul>

      {children}
    </div>
  )
}
