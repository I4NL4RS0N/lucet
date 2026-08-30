import { useEffect, useState } from 'react'

/**
 * The primitives page. Private, never deployed.
 *
 * Fourteen primitives on one page, with no prose between them. The point is to
 * settle look and feel where nothing else is competing for attention.
 *
 * TWO RULES FOR THIS PAGE.
 *
 * Every control shows EVERY state side by side -- default, hover, active,
 * focus, disabled -- because a control is only as good as its worst state, and
 * hover and focus are where most systems quietly give up. States that normally
 * need a pointer are forced with is-* classes that mirror the pseudo-classes
 * exactly, so nothing here is a drawing of a state; it is the state.
 *
 * Copy is deliberately INDUSTRY-NEUTRAL. Placeholder text is not decoration --
 * it teaches people what a library is for, and a library that ships one
 * industry's vocabulary reads as built for that industry.
 */

function Section({
  n,
  name,
  note,
  children,
  variant,
}: {
  n: string
  name: string
  note: string
  children: React.ReactNode
  variant?: 'cols' | 'tight'
}) {
  return (
    <section className="sec">
      <header className="sec__head">
        <span className="sec__n">{n}</span>
        <h2 className="sec__name">{name}</h2>
        <span className="sec__note">{note}</span>
      </header>
      <div className={`stage${variant ? ` stage--${variant}` : ''}`}>{children}</div>
    </section>
  )
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="spec">
      <span className="spec__label">{label}</span>
      {children}
    </div>
  )
}

/*
 * The accent axis. Monochrome is the default and hands primary to the neutral
 * solid, so the page is greyscale until an accent is deliberately chosen.
 */
const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'green', 'teal', 'cyan', 'amber',
] as const

/** The five states every interactive control has to answer for. */
const STATES = [
  { cls: '', label: 'Default' },
  { cls: 'is-hover', label: 'Hover' },
  { cls: 'is-active', label: 'Active' },
  { cls: 'is-focus', label: 'Focus' },
  { cls: 'is-disabled', label: 'Disabled' },
] as const

function StateRow({ render }: { render: (cls: string, label: string) => React.ReactNode }) {
  return (
    <div className="states">
      {STATES.map(({ cls, label }) => (
        <div className="states__cell" key={label || 'default'}>
          {render(cls, label)}
          <span className="states__label">{label}</span>
        </div>
      ))}
    </div>
  )
}

/*
 * Inline glyphs, so the page does not depend on an icon library before the icon
 * story is decided.
 *
 * Stroke 2, because the table is explicit: 1.5 beside regular (400), 2 beside
 * medium and semibold (500-600). These sit beside 500. An earlier pass used
 * 1.75 by splitting the difference between the two rows, which is not what the
 * table says.
 */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const Glyph = {
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  ),
}

/*
 * Status glyphs.
 *
 * These were four abstract dots -- a circle, a rotated square, a square and a
 * 3px bar -- differing only in silhouette so they would survive greyscale.
 * They satisfied 1.4.1 and communicated nothing: nobody reads "degraded" out of
 * a rotated square, and at 7px the bar just looked like a stray dash.
 *
 * Real glyphs carry the same greyscale distinction AND say what they mean, so
 * the shape stops being a code the reader has to learn.
 */
const badgeStroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.25, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const StatusGlyph = {
  ok: (
    <svg className="badge__icon" viewBox="0 0 24 24" {...badgeStroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  warn: (
    <svg className="badge__icon" viewBox="0 0 24 24" {...badgeStroke} aria-hidden>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </svg>
  ),
  bad: (
    <svg className="badge__icon" viewBox="0 0 24 24" {...badgeStroke} aria-hidden>
      <path d="M8.4 3.5h7.2l5.1 5.1v7.2l-5.1 5.1H8.4L3.3 15.8V8.6z" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  ),
  info: (
    <svg className="badge__icon" viewBox="0 0 24 24" {...badgeStroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
}


/*
 * The orb never ships without its label. Motion distinguishes the states for
 * people who can see the difference; the word does it for everyone else, and
 * under reduced motion the word is doing most of the work. Making the label a
 * required prop is the enforcement -- documenting it would not be.
 */
function Orb({
  state,
  label,
  time,
  size,
}: {
  state: 'thinking' | 'searching' | 'composing' | 'blocked' | 'queued' | 'degraded' | 'down'
  label: string
  time?: string
  size?: 'sm' | 'lg'
}) {
  return (
    <span className="orb-row">
      <span className={`orb${size ? ` orb--${size}` : ''}`} data-state={state} role="img" aria-label={label}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle className="orb__track" cx="12" cy="12" r="9" />
          <circle className="orb__arc" cx="12" cy="12" r="9" />
          {state === 'thinking' && <circle className="orb__arc orb__arc2" cx="12" cy="12" r="9" />}
          {(state === 'thinking' || state === 'blocked') && (
            <circle className="orb__core" cx="12" cy="12" r="2.5" />
          )}
        </svg>
      </span>
      <span className="orb-row__label">{label}</span>
      {time ? <span className="orb-row__time">{time}</span> : null}
    </span>
  )
}



/*
 * Placeholder artwork as inline SVG, so the media frame is exercised by real
 * <img> elements rather than by coloured divs pretending to be images. The
 * outline rule only means anything on a genuine replaced element.
 */
const swatch = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/></svg>`,
  )}`

const ART = {
  one: swatch('#6b7280', '#1f2937'),
  two: swatch('#9ca3af', '#4b5563'),
  three: swatch('#d1d5db', '#6b7280'),
}

const FileGlyph = {
  doc: (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  audio: (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M5 10v4M9 7v10M13 5v14M17 9v6M21 11v2" />
    </svg>
  ),
  close: (
    <svg width="12" height="12" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
}

export function Primitives() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [accent, setAccent] = useState('monochrome')

  /*
   * On the ROOT, not on this div. The library declares its tokens against
   * :root[data-theme], so setting the attribute on a wrapper matches nothing
   * and the page silently keeps whatever the OS preference was.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    return () => document.documentElement.removeAttribute('data-accent')
  }, [accent])
  const [checks, setChecks] = useState({ a: true, b: false })
  const [radio, setRadio] = useState('one')
  const [sw, setSw] = useState({ a: true, b: false })
  const [seg, setSeg] = useState('all')

  return (
    <div className="prim">
      <header className="prim__bar">
        <span className="prim__mark">
          Lucet <span>· primitives</span>
        </span>
        <div className="prim__bar-end">
          <label className="select" style={{ inlineSize: 128 }}>
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Accent"
            >
              {ACCENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <label key={t}>
                <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
      </header>

      <main className="prim__main">
        <h1 className="prim__title">Primitives</h1>
        <p className="prim__lede">
          Every control the components will be built from, in every state.
          Private page — this is where the look gets settled before anything is
          composed.
        </p>

        <Section n="01" name="Button" note="variants, sizes, and every state">
          <Spec label="Variants">
            <div className="row">
              <button className="btn btn--primary">Save</button>
              <button className="btn">Cancel</button>
              <button className="btn btn--ghost">Skip</button>
              <button className="btn btn--danger">Delete</button>
            </div>
          </Spec>

          <Spec label="Primary, all states">
            <StateRow
              render={(cls) => (
                <button className={`btn btn--primary ${cls}`} disabled={cls === 'is-disabled'}>
                  Save
                </button>
              )}
            />
          </Spec>

          <Spec label="Secondary, all states">
            <StateRow
              render={(cls) => (
                <button className={`btn ${cls}`} disabled={cls === 'is-disabled'}>
                  Cancel
                </button>
              )}
            />
          </Spec>

          <Spec label="Ghost, all states">
            <StateRow
              render={(cls) => (
                <button className={`btn btn--ghost ${cls}`} disabled={cls === 'is-disabled'}>
                  Skip
                </button>
              )}
            />
          </Spec>

          <Spec label="Danger, all states">
            <StateRow
              render={(cls) => (
                <button className={`btn btn--danger ${cls}`} disabled={cls === 'is-disabled'}>
                  Delete
                </button>
              )}
            />
          </Spec>

          <Spec label="Sizes">
            <div className="row">
              <button className="btn btn--sm">Small</button>
              <button className="btn">Medium</button>
              <button className="btn btn--lg">Large</button>
            </div>
          </Spec>

          <Spec label="With icon, and busy">
            <div className="row">
              <button className="btn btn--primary btn--lead">{Glyph.plus} New</button>
              <button className="btn btn--trail">Continue {Glyph.arrow}</button>
              <button className="btn btn--icon" aria-label="Delete">{Glyph.trash}</button>
              <button className="btn btn--primary">
                <span className="btn__spin" /> Working
              </button>
            </div>
          </Spec>
        </Section>

        <Section n="02" name="Input" note="a field is inset where a control is raised">
          <Spec label="All states">
            <StateRow
              render={(cls) => (
                <input
                  className={`field ${cls}`}
                  style={{ inlineSize: 150 }}
                  defaultValue="Weekly report"
                  disabled={cls === 'is-disabled'}
                  readOnly
                />
              )}
            />
          </Spec>
          <Spec label="Empty, with placeholder">
            <input className="field" style={{ inlineSize: 260 }} placeholder="Ask anything…" />
          </Spec>
        </Section>

        <Section n="03" name="Textarea" note="grows, never jumps">
          <Spec label="Default">
            <textarea
              className="field"
              style={{ inlineSize: 340 }}
              defaultValue="Summarise the attached documents and list anything still unresolved."
            />
          </Spec>
          <Spec label="Focus">
            <textarea className="field is-focus" style={{ inlineSize: 340 }} defaultValue="Focused." />
          </Spec>
          <Spec label="Disabled">
            <textarea className="field" style={{ inlineSize: 340 }} defaultValue="Unavailable." disabled />
          </Spec>
        </Section>

        <Section n="04" name="Select" note="intrinsic width, chevron on the wrapper">
          <Spec label="All states">
            <div className="states">
              {STATES.map(({ cls, label }) => (
                <div className="states__cell" key={label}>
                  <label className={`select ${cls}`} style={{ inlineSize: 132 }}>
                    <select defaultValue="a" disabled={cls === 'is-disabled'}>
                      <option value="a">Balanced</option>
                      <option value="b">Concise</option>
                    </select>
                  </label>
                  <span className="states__label">{label}</span>
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="In use">
            <div className="row">
              <label className="select" style={{ inlineSize: 190 }}>
                {/* Generic on purpose. A library that ships one vendor's model
                    names reads as built for that vendor. */}
                <select defaultValue="balanced">
                  <option value="balanced">Balanced model</option>
                  <option value="fast">Fast model</option>
                  <option value="deep">Deep reasoning</option>
                </select>
              </label>
              <label className="select" style={{ inlineSize: 150 }}>
                <select defaultValue="thread">
                  <option value="thread">This thread</option>
                  <option value="all">All threads</option>
                </select>
              </label>
            </div>
          </Spec>
        </Section>

        <Section n="05" name="Checkbox" note="the tick is drawn, not a glyph">
          <Spec label="All states, checked">
            <div className="states">
              {STATES.map(({ cls, label }) => (
                <div className="states__cell" key={label}>
                  <label className={`check ${cls}`}>
                    <input type="checkbox" defaultChecked disabled={cls === 'is-disabled'} readOnly />
                    <span className="check__box" />
                  </label>
                  <span className="states__label">{label}</span>
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="In use">
            <div className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={checks.a}
                  onChange={(e) => setChecks((c) => ({ ...c, a: e.target.checked }))}
                />
                <span className="check__box" />
                Cite sources
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={checks.b}
                  onChange={(e) => setChecks((c) => ({ ...c, b: e.target.checked }))}
                />
                <span className="check__box" />
                Show reasoning
              </label>
            </div>
          </Spec>
        </Section>

        <Section n="06" name="Radio" note="one of a set">
          <Spec label="All states, selected">
            <div className="states">
              {STATES.map(({ cls, label }) => (
                <div className="states__cell" key={label}>
                  <label className={`check ${cls}`}>
                    <input type="radio" defaultChecked disabled={cls === 'is-disabled'} readOnly />
                    <span className="check__box check__box--round" />
                  </label>
                  <span className="states__label">{label}</span>
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="In use">
            <div className="row">
              {[
                ['one', 'Concise'],
                ['two', 'Balanced'],
                ['three', 'Thorough'],
              ].map(([v, label]) => (
                <label className="check" key={v}>
                  <input type="radio" name="len" checked={radio === v} onChange={() => setRadio(v as string)} />
                  <span className="check__box check__box--round" />
                  {label}
                </label>
              ))}
            </div>
          </Spec>
        </Section>

        <Section n="07" name="Switch" note="the knob moves, so it reads without colour">
          <Spec label="All states, on">
            <div className="states">
              {STATES.map(({ cls, label }) => (
                <div className="states__cell" key={label}>
                  <label className={`switch ${cls}`}>
                    <input type="checkbox" defaultChecked disabled={cls === 'is-disabled'} readOnly />
                    <span className="switch__track"><span className="switch__knob" /></span>
                  </label>
                  <span className="states__label">{label}</span>
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="In use">
            <div className="row">
              <label className="switch">
                <input type="checkbox" checked={sw.a} onChange={(e) => setSw((s) => ({ ...s, a: e.target.checked }))} />
                <span className="switch__track"><span className="switch__knob" /></span>
                Stream responses
              </label>
              <label className="switch">
                <input type="checkbox" checked={sw.b} onChange={(e) => setSw((s) => ({ ...s, b: e.target.checked }))} />
                <span className="switch__track"><span className="switch__knob" /></span>
                Confirm before running
              </label>
            </div>
          </Spec>
        </Section>

        <Section n="08" name="Segmented control" note="a well, with one raised cell">
          <Spec label="Default, hover, focus">
            <div className="row">
              <div className="seg" role="group" aria-label="Filter">
                {['all', 'running', 'failed'].map((v) => (
                  <label key={v}>
                    <input type="radio" name="seg" checked={seg === v} onChange={() => setSeg(v)} />
                    <span>{v[0]!.toUpperCase() + v.slice(1)}</span>
                  </label>
                ))}
              </div>
              <div className="seg" aria-hidden>
                <label className="is-hover"><input type="radio" readOnly /><span>Hovered</span></label>
                <label><input type="radio" defaultChecked readOnly /><span>Selected</span></label>
              </div>
              <div className="seg" aria-hidden>
                <label className="is-focus"><input type="radio" defaultChecked readOnly /><span>Focused</span></label>
                <label><input type="radio" readOnly /><span>Other</span></label>
              </div>
            </div>
          </Spec>
        </Section>

        <Section n="09" name="Badge" note="the glyph carries the meaning, not the colour">
          <span className="badge badge--ok">{StatusGlyph.ok}Operational</span>
          <span className="badge badge--warn">{StatusGlyph.warn}Degraded</span>
          <span className="badge badge--bad">{StatusGlyph.bad}Down</span>
          <span className="badge badge--info">{StatusGlyph.info}Scheduled</span>
          <span className="badge">Draft</span>
        </Section>

        <Section n="10" name="Avatar" note="a mark by default, a control when it needs to be">
          <Spec label="Identity — inert on purpose">
            <div className="row">
              <span className="avatar avatar--solid">AI</span>
              <span className="avatar">AB</span>
              <span className="avatar avatar--lg">AB</span>
              <span className="avatar-stack">
                <span className="avatar">AB</span>
                <span className="avatar">CD</span>
                <span className="avatar">EF</span>
              </span>
            </div>
          </Spec>
          <Spec label="Interactive, all states">
            <StateRow
              render={(cls) => (
                <button className={`avatar ${cls}`} disabled={cls === 'is-disabled'}>
                  AB
                </button>
              )}
            />
          </Spec>
        </Section>

        <Section n="11" name="Tooltip" note="hover or focus the control — these are real">
          <Spec label="On hover, and on keyboard focus">
            <div className="row">
              <span className="tipwrap">
                <button className="btn btn--icon" aria-label="Copy">{Glyph.copy}</button>
                <span className="tip" role="tooltip">Copy to clipboard</span>
              </span>
              <span className="tipwrap">
                <button className="btn">Send</button>
                <span className="tip" role="tooltip">⌘ ⏎</span>
              </span>
            </div>
          </Spec>
          <Spec label="Shown">
            <span className="tipwrap is-hover" style={{ marginBlockStart: 26 }}>
              <button className="btn btn--icon" aria-label="Copy">{Glyph.copy}</button>
              <span className="tip" role="tooltip">Copy to clipboard</span>
            </span>
          </Spec>
        </Section>

        <Section n="12" name="Menu" note="overlay, at full elevation">
          <div className="menu">
            <div className="menu__item is-hover">Rename<kbd>⌘R</kbd></div>
            <div className="menu__item">Duplicate<kbd>⌘D</kbd></div>
            <div className="menu__item">Export</div>
            <div className="menu__sep" />
            <div className="menu__item menu__item--danger">Delete<kbd>⌫</kbd></div>
          </div>
        </Section>

        <Section n="13" name="Dialog" note="the top of the stack">
          <div className="dialog">
            <h3 className="dialog__title">Discard this draft?</h3>
            <p className="dialog__body">
              The response was interrupted before it finished. What arrived is
              still here, and discarding it cannot be undone.
            </p>
            <div className="dialog__foot">
              <button className="btn btn--ghost">Keep</button>
              <button className="btn btn--danger">Discard</button>
            </div>
          </div>
        </Section>

        <Section n="14" name="Progress" note="determinate, complete, and unknown" variant="cols">
          <Spec label="In progress">
            <div className="meter-row">
              <div className="meter"><div className="meter__fill" style={{ inlineSize: '68%' }} /></div>
              <span>68%</span>
            </div>
          </Spec>
          <Spec label="Complete">
            <div className="meter-row">
              <div className="meter meter--ok"><div className="meter__fill" style={{ inlineSize: '100%' }} /></div>
              <span>done</span>
            </div>
          </Spec>
          <Spec label="Unknown end">
            <div className="meter-row">
              <div className="meter meter--busy"><div className="meter__fill" /></div>
              <span>—</span>
            </div>
          </Spec>
        </Section>

        <Section n="15" name="Separator" note="a line is a line; it stays a border">
          <Spec label="Default">
            <div style={{ inlineSize: 260 }}><hr className="sep" /></div>
          </Spec>
          <Spec label="Strong">
            <div style={{ inlineSize: 260 }}><hr className="sep sep--strong" /></div>
          </Spec>
        </Section>

        <Section n="16" name="Link" note="underlined from the start, not on hover">
          <Spec label="In prose">
            <p style={{ maxInlineSize: 380, margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
              Answered from three sources, including{' '}
              <a className="link" href="#0">the revised specification</a> and{' '}
              <a className="link is-hover" href="#0">a summary from Tuesday</a>.
            </p>
          </Spec>
        </Section>

        <Section n="17" name="Keyboard" note="raised, because a key is a thing you press">
          <div className="row">
            <kbd>⌘</kbd><kbd>⇧</kbd><kbd>⏎</kbd><kbd>Esc</kbd><kbd>Tab</kbd>
          </div>
        </Section>

        <Section n="18" name="Spinner" note="unknown duration, no false progress">
          <div className="row">
            <span className="spinner" />
            <span className="spinner spinner--lg" />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Running…</span>
          </div>
        </Section>

        <Section n="19" name="Skeleton" note="the shape of what is coming, not a spinner">
          <div style={{ display: 'flex', gap: 12, inlineSize: 340 }}>
            <span className="skel skel--circle" style={{ inlineSize: 28, blockSize: 28, flex: 'none' }} />
            <div style={{ display: 'grid', gap: 8, flex: 1 }}>
              <span className="skel skel--title" />
              <span className="skel skel--text" />
              <span className="skel skel--text" style={{ inlineSize: '80%' }} />
            </div>
          </div>
        </Section>

        <Section n="20" name="Disclosure" note="what reasoning and tool calls are built on">
          <div style={{ display: 'grid', gap: 10, inlineSize: 420 }}>
            <div className="disc">
              <button className="disc__head" aria-expanded="false">
                <span className="caret" />
                Thought for 4 seconds
                <span className="disc__meta">collapsed</span>
              </button>
            </div>
            <div className="disc">
              <button className="disc__head is-hover" aria-expanded="true">
                <span className="caret" />
                Searched 3 documents
                <span className="disc__meta">2 of 3 returned</span>
              </button>
              <div className="disc__body">
                Two sources came back and the third timed out, so this is not the
                full picture.
              </div>
            </div>
          </div>
        </Section>

        <Section n="21" name="Code" note="quoted material, so the surface is sunken">
          <div style={{ display: 'grid', gap: 12, inlineSize: 460 }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
              Inline, as in <code>npm install</code>, sits in running text.
            </p>
            <div className="codeblock">
              <div className="codeblock__bar">
                bash
                <button className="btn btn--sm btn--lead">{Glyph.copy} Copy</button>
              </div>
              <pre><code>{`npm install lucet lucet-react`}</code></pre>
            </div>
          </div>
        </Section>

        <Section n="22" name="Prose" note="a streamed answer is this — the most important surface here">
          <div className="prose">
            <p>
              All three describe the same change, but only the last one gives a
              date for it. Where the earlier two disagree with it, they are{' '}
              <strong>older rather than wrong</strong>.
            </p>
            <h3>What changed</h3>
            <ul>
              <li>The review step now runs after approval, not before it.</li>
              <li>Two fields were merged into one.</li>
              <li>
                The old <code>archive</code> flag is gone.
              </li>
            </ul>
            <blockquote>
              Anything filed before Tuesday follows the previous order.
            </blockquote>
          </div>
        </Section>

        <Section n="23" name="Loaders" note="waiting is not one state, so it is not one loader">
          <Spec label="Long and unknown — calm, so it does not read as stuck">
            <div className="row">
              <span className="breathe" />
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Still working</span>
            </div>
          </Spec>

          <Spec label="Staggered — reads as progress, not a blinking blob">
            <span className="dots"><i /><i /><i /></span>
          </Spec>

          <Spec label="Named activity, with elapsed">
            <div style={{ display: 'grid', gap: 10 }}>
              <span className="working">
                <span className="breathe" />
                <span className="working__label">Searching documents</span>
                <span className="working__time">4.2s</span>
              </span>
              <span className="working">
                <span className="breathe" />
                <span className="working__label">Composing an answer</span>
                <span className="working__time">1m 12s</span>
              </span>
            </div>
          </Spec>

          <Spec label="Text still arriving">
            <p style={{ margin: 0, maxInlineSize: 330, fontSize: 15, color: 'var(--ink-2)' }}>
              The review step now runs after approval, which means anything filed
              before Tuesday follows the<span className="stream-cursor" />
            </p>
          </Spec>

          <Spec label="Staged work, known sequence">
            <div className="row">
              <span className="steps">
                <i data-state="done" /><i data-state="done" /><i data-state="now" /><i /><i />
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Step 3 of 5</span>
            </div>
          </Spec>
        </Section>

        <Section n="24" name="Activity orbs" note="the mark says what kind of wait it is">
          <Spec label="Working — every library ships these">
            <div style={{ display: 'grid', gap: 12 }}>
              <Orb state="thinking" label="Thinking" time="4.2s" />
              <Orb state="searching" label="Searching documents" time="1.1s" />
              <Orb state="composing" label="Composing an answer" time="8s" />
            </div>
          </Spec>

          <Spec label="Not working — the half nobody builds">
            <div style={{ display: 'grid', gap: 12 }}>
              <Orb state="blocked" label="Waiting for your answer" />
              <Orb state="queued" label="Queued behind 2 runs" time="~40s" />
              <Orb state="degraded" label="Running on the fallback model" />
              <Orb state="down" label="Service unreachable" />
            </div>
          </Spec>

          <Spec label="Sizes">
            <div className="row">
              <Orb state="thinking" label="Small" size="sm" />
              <Orb state="thinking" label="Default" />
              <Orb state="thinking" label="Large" size="lg" />
            </div>
          </Spec>
        </Section>


        <Section n="25" name="Media" note="the outline is pure black or white, never tinted">
          <Spec label="Square, wide, small">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="media media--square" style={{ inlineSize: 68 }}>
                <img src={ART.one} alt="" />
              </span>
              <span className="media media--wide" style={{ inlineSize: 132 }}>
                <img src={ART.two} alt="" />
              </span>
              <span className="media media--square media--sm">
                <img src={ART.three} alt="" />
              </span>
            </div>
          </Spec>
          <Spec label="Loading — the frame holds its shape">
            <span className="media media--square media--loading skel" style={{ inlineSize: 68 }} />
          </Spec>
        </Section>

        <Section n="26" name="Attachments" note="three variants, because a file means three things">
          <Spec label="Grid — in a message, the picture is the content">
            <div className="atts atts--grid">
              {[ART.one, ART.two, ART.three].map((src, i) => (
                <span className="att" key={i}>
                  <span className="media media--square">
                    <img src={src} alt="" />
                  </span>
                  <button className="att__remove" aria-label="Remove attachment">
                    {FileGlyph.close}
                  </button>
                  <span className="att__name">image-{i + 1}.png</span>
                </span>
              ))}
            </div>
          </Spec>

          <Spec label="Inline — in a composer, beside the caret">
            <div className="atts atts--inline">
              <span className="att">
                <span className="att__icon">{FileGlyph.doc}</span>
                <span className="att__name">quarterly-summary.pdf</span>
                <button className="att__remove" aria-label="Remove quarterly-summary.pdf">
                  {FileGlyph.close}
                </button>
              </span>
              <span className="att">
                <span className="att__icon">{FileGlyph.audio}</span>
                <span className="att__name">interview.mp3</span>
                <button className="att__remove" aria-label="Remove interview.mp3">
                  {FileGlyph.close}
                </button>
              </span>
            </div>
          </Spec>

          <Spec label="List — in sources, the metadata is the point">
            <div className="atts atts--list" style={{ maxInlineSize: 380 }}>
              <span className="att">
                <span className="media media--square media--sm" style={{ inlineSize: 28 }}>
                  <img src={ART.one} alt="" />
                </span>
                <span className="att__name">site-photograph.jpg</span>
                <span className="att__meta">1.4 MB</span>
                <button className="att__remove" aria-label="Remove site-photograph.jpg">
                  {FileGlyph.close}
                </button>
              </span>
              <span className="att is-hover">
                <span className="att__icon">{FileGlyph.doc}</span>
                <span className="att__name">a-file-with-a-very-long-name-that-truncates.pdf</span>
                <span className="att__meta">820 KB</span>
                <button className="att__remove" aria-label="Remove file">
                  {FileGlyph.close}
                </button>
              </span>
            </div>
          </Spec>
        </Section>

        <Section n="27" name="Scroll area" note="content should never just stop">
          <div className="scroller" style={{ maxBlockSize: 150, inlineSize: 320 }}>
            <div style={{ display: 'grid', gap: 8, padding: '4px 2px' }}>
              {[
                'Read the source documents',
                'Compare the two revisions',
                'Note where they disagree',
                'Check the dates on each',
                'Flag anything unresolved',
                'Draft the summary',
                'Cite every claim',
              ].map((t) => (
                <span key={t} style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section n="28" name="Table" note="numbers are tabular, so a column never shifts">
          <div style={{ inlineSize: '100%' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Status</th>
                  <th className="num">Sources</th>
                  <th className="num">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Read the source documents</td>
                  <td>
                    <span className="badge badge--ok">{StatusGlyph.ok}Done</span>
                  </td>
                  <td className="num">12</td>
                  <td className="num">4.2s</td>
                </tr>
                {/* No forced is-hover row: unlabeled, it read as a zebra
                    stripe rather than a state specimen. Row hover is real —
                    point at one. */}
                <tr>
                  <td>Compare the two revisions</td>
                  <td>
                    <Orb state="thinking" label="Running" />
                  </td>
                  <td className="num">8</td>
                  <td className="num">1.1s</td>
                </tr>
                <tr>
                  <td>Draft the summary</td>
                  <td>
                    <span className="badge badge--warn">{StatusGlyph.warn}Partial</span>
                  </td>
                  <td className="num">3</td>
                  <td className="num">9.7s</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  )
}
