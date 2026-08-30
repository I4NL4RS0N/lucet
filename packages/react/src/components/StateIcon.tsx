import type { ReactElement } from 'react'
import { useIconOverride } from './icon-context'

/**
 * State icons.
 *
 * NOT decoration. Colour alone to convey status is a WCAG 1.4.1 failure, and
 * our caution amber and danger red are close to indistinguishable to a
 * deuteranope. Squint until the colour is gone and the states must still be
 * tellable apart, which is why the silhouettes are deliberately unalike: an
 * octagon, a triangle, a square, a half-filled disc, an hourglass.
 *
 * DRAWN FROM LUCIDE, NOT DEPENDED ON IT.
 *
 * The glyphs below are Lucide's, vendored rather than imported. A component
 * library that pulls in an icon package makes an adoption decision on its
 * host's behalf, and it is a common reason to reject one outright. Vendoring
 * twelve paths costs nothing and drags in no dependency.
 *
 * Lucide specifically, for a practical reason rather than a stylistic one:
 * shadcn projects already run it, so these read as native in the most likely
 * host and most consumers never need to override anything at all.
 *
 * TWO DELIBERATE DEVIATIONS, both because these render at 16px and Lucide is
 * drawn for 24.
 *
 * `down` uses Lucide's octagon FILLED with the inner cross removed. An outlined
 * octagon and an outlined circle are the same glyph at 16px, which would
 * collapse the distinction between a system outage and a single failed turn.
 * Fill versus outline is the most legible severity step available at that size.
 *
 * `partial` fills its inner half. Lucide draws `contrast` stroke-only, which at
 * 16px reads as an exclamation mark rather than as "some of it came back".
 *
 * Any of these can be replaced by the host through Icons.Provider. Ours is the
 * fallback, exactly as our palette is the fallback for a shadcn host.
 *
 * ---------------------------------------------------------------------------
 * Icon paths adapted from Lucide (https://lucide.dev), ISC License.
 * Copyright (c) Lucide Icons and Contributors. See NOTICE.
 * ---------------------------------------------------------------------------
 */

export type IconName =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'failed'
  | 'scheduled'
  | 'stale'
  | 'uncertain'
  | 'refused'
  | 'interrupted'
  | 'partial'
  | 'rate-limited'
  | 'running'

const PATHS: Record<IconName, ReactElement> = {
  // circle-check. The only state that gets a tick.
  operational: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </>
  ),
  // triangle-alert. Caution reads as a triangle at any size, in any colour, in none.
  degraded: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  // octagon-x. System-level outage. Filled, see the note above.
  down: <path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z" fill="currentColor" stroke="none" />,
  // circle-x. Turn-scoped failure, deliberately NOT the octagon.
  failed: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  // clock. Known cause, known end, nobody at fault.
  scheduled: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  // database. Served from a store, not fetched fresh.
  stale: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </>
  ),
  // circle-help. A question, never a warning.
  uncertain: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  // circle-minus. A bar, not a cross. A boundary held on purpose is not an error.
  refused: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </>
  ),
  // square. The stop glyph. Reads as deliberate, which it usually was.
  interrupted: <rect width="18" height="18" x="3" y="3" rx="2" />,
  // contrast, with the inner half FILLED. Lucide draws it stroke-only, which at
  // 16px reads as an exclamation mark rather than as "some of it came back".
  partial: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 22a10 10 0 0 0 0-20z" fill="currentColor" stroke="none" />
    </>
  ),
  // hourglass. Temporary by definition.
  'rate-limited': (
    <>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </>
  ),
  // loader-circle. Spun by CSS, stopped under reduced motion.
  running: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
}

export interface StateIconProps {
  name: IconName
  size?: number
}

export function StateIcon({ name, size = 16 }: StateIconProps) {
  const Override = useIconOverride(name)
  if (Override) return <Override size={size} className="lucet-icon" />

  return (
    <svg
      className="lucet-icon"
      width={size}
      height={size}
      /* Lucide's native 24px grid. Rendering it at 16 rather than redrawing at
         16 keeps the geometry exactly as drawn. */
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      /* Decorative: every icon sits beside a text label that already says the
         same thing, and announcing it twice is worse than not announcing it. */
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
