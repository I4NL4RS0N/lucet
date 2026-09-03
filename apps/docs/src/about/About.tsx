import { useRef } from 'react'
import { AppearancePrefs, useAppearance, useCanvasGround } from '../components/ThemeControls'
import { SiteHeader } from '../components/SiteHeader'

/**
 * About: the one page that explains the site, so the demo never has to.
 *
 * Prose only, on the lab pages' shell — the shell's measure and its 32px
 * inline padding, the site heading pattern, the header pinned to Paper the
 * way chrome is everywhere. No hero, no cards, no feature grid, no footer.
 * A stranger arriving here wants the argument and the install line; the
 * rest of the site is the evidence and does not need summarising twice.
 *
 * IT CARRIES THE APPEARANCE ROW, and that is a decision about this page
 * rather than a shell inherited. It was left off at first, on the rule
 * that the row belongs beside the stage it changes and there is no stage
 * here. The reason it belongs anyway is two lines below it: this page is
 * where "the look is the host's" is stated in words, and the row is that
 * claim made operable in the same viewport — ground, ink, the command's
 * surface and the typeface all move under it. A page that argues the
 * axes exist and then withholds them is the weaker page.
 *
 * Its second effect is that all three pages on this shell start their
 * heading on one line, which reserving 30px of nothing would have faked.
 *
 * EVERY CLAIM BELOW IS CHECKED against the repository and the published
 * packages (2026-09-03, both at the version the badges carry): lucet-core
 * declares no dependencies at all, lucet-react depends on it and takes
 * React as a peer, both are MIT, and neither makes a network call of any
 * kind — which is what "the host supplies the AI service" means literally.
 */
export function About() {
  const [appearance, setAppearance] = useAppearance({ theme: 'dark', accent: 'violet' })
  const groundRef = useRef<HTMLDivElement>(null)
  useCanvasGround(groundRef, appearance)

  return (
    <div ref={groundRef} className="prim" data-expression={appearance.expression}>
      <SiteHeader page="about" />

      <main className="prim__main about">
        <div className="prim__controls">
          <AppearancePrefs state={appearance} onChange={setAppearance} />
        </div>
        <h1 className="prim__title">About Lucet</h1>

        <p className="prim__lede">
          Lucet is an open-source library of AI interface components, built
          around the states real AI features actually hit — refusals,
          interruptions, rate limits, stale answers, a silent downgrade to a
          cheaper model — with a written rationale for every one.
        </p>

        <p className="about__p">
          A conversation holds more than messages. It holds the sources an
          answer stood on, the scope it was asked in, the versions it passed
          through, the other people taking turns in it, and what it costs.
          Most libraries treat all of that as living outside the
          conversation. It doesn’t, and scope, versioning, multiplayer and
          budget all fall out of saying so.
        </p>

        <p className="about__p">
          The behaviour is one contract and the look is the host’s: theme,
          accent, material and typeface change nothing about how a refusal
          or a restore behaves. React bindings sit over a framework-free
          core that declares no dependencies of its own, the styling is
          plain CSS custom properties — no Tailwind, no build step — and
          both packages are MIT. Lucet draws the interface and holds the
          state; the host supplies the AI service.
        </p>

        <p className="about__p">
          The Konfabulator on this site is a scripted, interactive demo, not
          a live AI backend.
        </p>

        <p className="about__cmd">
          <code>npm install lucet-core lucet-react</code>
        </p>

        <p className="about__p">
          That is the install line, exactly as the README gives it. Its{' '}
          <a
            href="https://github.com/I4NL4RS0N/lucet#packages"
            target="_blank"
            rel="noopener noreferrer"
          >
            Packages section
          </a>{' '}
          carries the getting-started path from there.
        </p>
      </main>
    </div>
  )
}
