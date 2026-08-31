import type { ReactNode } from 'react'

/**
 * One header, three pages. The Konfabulator, the components stage, and the
 * primitives lab all wear the same identity and the same navigation
 * grammar, so moving between them feels like one site rather than three
 * rooms decorated by different people. Identity left (the tile links
 * home), navigation right — internal pages first, the outbound repo link
 * last wearing its flag — and each page may slot its own quiet controls
 * before the nav through `children`.
 */

const PAGES = [
  { id: 'konfabulator', label: 'Konfabulator', href: '/', dev: false },
  { id: 'components', label: 'Components', href: '/components.html', dev: true },
  { id: 'primitives', label: 'Primitives', href: '/primitives.html', dev: true },
] as const

export type SitePage = (typeof PAGES)[number]['id']

export function SiteHeader({ page, children }: { page: SitePage; children?: ReactNode }) {
  return (
    <header className="cfg__bar">
      <div className="cfg__bar-in">
        <a className="cfg__mark" href="/" aria-label="Lucet home">
          {/* The tile: settled material (graphite plate, sheen, edge-light),
              carrying Ian's personal mark as a stand-in while the Lucet
              glyph is still being explored. Full rationale in
              public/favicon.svg. */}
          <svg className="cfg__logo" viewBox="0 0 96 96" aria-hidden>
            <defs>
              <linearGradient id="lgo-p" x1="0" y1="0" x2="0.45" y2="1">
                <stop offset="0" stopColor="#34343f" />
                <stop offset="0.52" stopColor="#191920" />
                <stop offset="1" stopColor="#0a0a0f" />
              </linearGradient>
              <linearGradient id="lgo-s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
                <stop offset="0.38" stopColor="#fff" stopOpacity="0.02" />
                <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="lgo-h">
                <stop offset="0" stopColor="#fff" stopOpacity="0.26" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <clipPath id="lgo-c">
                <rect width="96" height="96" rx="27" />
              </clipPath>
            </defs>
            <rect width="96" height="96" rx="27" fill="url(#lgo-p)" />
            <g clipPath="url(#lgo-c)">
              <circle cx="48" cy="48" r="30" fill="url(#lgo-h)" />
              <path
                transform="translate(-2.58 1.11) scale(0.14427)"
                fill="#F4F5FB"
                d="M425.57,429.21c-3.97,0-6.35-4.42-4.16-7.73l127.91-193.94c2.18-3.31-.19-7.73-4.16-7.73h-81.27c-3.35,0-6.48,1.69-8.32,4.48l-132.19,200.44c-1.84,2.79-4.97,4.48-8.32,4.48h-68.91c-3.97,0-6.35-4.42-4.16-7.73l173.94-263.75c2.18-3.31-.19-7.73-4.16-7.73h-76.28c-3.35,0-6.48,1.69-8.32,4.48l-176.75,268c-2.18,3.31.19,7.73,4.16,7.73h71.19c3.97,0,6.35,4.42,4.16,7.73l-35.83,54.34c-2.18,3.31.19,7.73,4.16,7.73h81.27c3.35,0,6.48-1.68,8.32-4.48l40.13-60.84c1.84-2.8,4.97-4.48,8.32-4.48h68.91c3.97,0,6.35,4.42,4.16,7.73l-35.83,54.34c-2.18,3.31.19,7.73,4.16,7.73h126.12c3.35,0,6.48-1.68,8.32-4.48l38.64-58.59c2.18-3.31-.19-7.73-4.16-7.73h-121.03Z"
              />
              <rect width="96" height="96" rx="27" fill="url(#lgo-s)" />
            </g>
          </svg>
          <span className="cfg__name">Lucet</span>
        </a>

        {children}

        {/* The nav is a CONSTANT: the same three places on every page, and
            the one you are on wears the active ink. A nav that reshuffles
            itself per page makes the reader re-find everything. */}
        <nav className="cfg__nav" aria-label="Site">
          {PAGES.filter((p) => !p.dev || import.meta.env.DEV).map((p) => (
            <a
              className="cfg__navlink"
              key={p.id}
              href={p.href}
              aria-current={p.id === page ? 'page' : undefined}
            >
              {p.label}
            </a>
          ))}
          <a
            className="cfg__navlink"
            href="https://github.com/I4NL4RS0N/lucet"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="cfg__navlink-gh" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            GitHub
            {/* Outbound: the north-east arrow says "this one leaves". */}
            <svg className="cfg__navlink-out" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 16L16 8M9.5 8H16v6.5" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  )
}
