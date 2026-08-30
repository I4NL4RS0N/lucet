/**
 * State icons.
 *
 * NOT decoration. Colour alone to convey status is a WCAG 1.4.1 failure, and
 * our caution amber and danger red are close to indistinguishable to a
 * deuteranope. So the silhouettes are deliberately different from each other:
 * an octagon, a triangle, a square, a half-filled disc. Squint until the colour
 * is gone and the states should still be tellable apart.
 *
 * Inline SVG rather than an icon dependency. A component library that drags in
 * an icon set makes the adoption decision for its host, and the set is small
 * enough that the tradeoff is not close.
 *
 * These are the FALLBACK. A host can replace any subset through Icons.Provider,
 * so a product already running Lucide or Phosphor can make our states match the
 * rest of its interface. See icon-context.tsx.
 */

import type { ReactElement } from 'react'
import { useIconOverride } from './icon-context'

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
  // Circle + check. The only state that gets a tick.
  operational: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.2 8.2 7.1 10.1 10.9 6.1" />
    </>
  ),
  // Triangle. Reads as caution at any size, in any colour, in no colour.
  degraded: (
    <>
      <path d="M8 2 14.5 13.6H1.5Z" />
      <path d="M8 6.4v3.1" />
      <circle cx="8" cy="11.6" r=".65" fill="currentColor" stroke="none" />
    </>
  ),
  /*
   * Solid octagon. An outlined octagon and an outlined circle are the same
   * glyph at 16px, which defeats the point of having shapes at all, so the
   * distinction is fill rather than silhouette. Filled versus outlined is the
   * most legible severity step available at this size, and a solid stop sign
   * needs no inner mark to be read.
   */
  down: (
    <path
      d="M5.4 1.6h5.2l3.8 3.8v5.2l-3.8 3.8H5.4l-3.8-3.8V5.4Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  // Circle + cross. Turn-scoped failure, deliberately NOT the octagon.
  failed: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.9 5.9 10.1 10.1M10.1 5.9 5.9 10.1" />
    </>
  ),
  // Clock. Known cause, known end, nobody's fault.
  scheduled: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8.3l2.4 1.4" />
    </>
  ),
  // Stacked discs: served from a store, not fetched fresh.
  stale: (
    <>
      <ellipse cx="8" cy="4.2" rx="5.4" ry="2.2" />
      <path d="M2.6 4.2v3.6c0 1.2 2.4 2.2 5.4 2.2s5.4-1 5.4-2.2V4.2" />
      <path d="M2.6 7.8v3.6c0 1.2 2.4 2.2 5.4 2.2s5.4-1 5.4-2.2V7.8" />
    </>
  ),
  uncertain: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.3 6.2a1.75 1.75 0 1 1 2.4 2.2c-.5.3-.7.7-.7 1.2" />
      <circle cx="8" cy="11.5" r=".65" fill="currentColor" stroke="none" />
    </>
  ),
  // A bar, not a cross. A boundary held on purpose is not an error.
  refused: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.2 8h5.6" />
    </>
  ),
  // Square. The stop glyph. Reads as deliberate, which it usually was.
  interrupted: <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2" />,
  // Half filled. Some of it came back, and you can see how much.
  partial: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  // Hourglass. Temporary by definition.
  'rate-limited': (
    <>
      <path d="M4.4 2h7.2M4.4 14h7.2" />
      <path d="M5.5 2v2.4L8 7l2.5-2.6V2M5.5 14v-2.4L8 9l2.5 2.6V14" />
    </>
  ),
  running: (
    <>
      <circle cx="8" cy="8" r="6.25" opacity=".35" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" />
    </>
  ),
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
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      /* Decorative here: every icon sits beside a text label that already says
         the same thing. Announcing it twice is worse than not announcing it. */
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
