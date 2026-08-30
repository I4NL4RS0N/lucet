import { useState } from 'react'

/**
 * The playground. Private, never deployed.
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

export function Playground() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [checks, setChecks] = useState({ a: true, b: false })
  const [radio, setRadio] = useState('one')
  const [sw, setSw] = useState({ a: true, b: false })
  const [seg, setSeg] = useState('all')

  return (
    <div className="pg" data-theme={theme}>
      <header className="pg__bar">
        <span className="pg__mark">
          Lucet <span>· playground</span>
        </span>
        <div className="pg__bar-end">
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

      <main className="pg__main">
        <h1 className="pg__title">Primitives</h1>
        <p className="pg__lede">
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
                <select defaultValue="opus">
                  <option value="opus">Claude Opus 4.6</option>
                  <option value="sonnet">Claude Sonnet 4.5</option>
                  <option value="haiku">Claude Haiku 4.5</option>
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

        <Section n="09" name="Badge" note="four silhouettes, so they read in greyscale">
          <span className="badge badge--ok"><span className="badge__dot" />Operational</span>
          <span className="badge badge--warn"><span className="badge__dot" />Degraded</span>
          <span className="badge badge--bad"><span className="badge__dot" />Down</span>
          <span className="badge badge--info"><span className="badge__dot" />Scheduled</span>
          <span className="badge">Draft</span>
        </Section>

        <Section n="10" name="Avatar" note="initials, and a stack">
          <span className="avatar avatar--accent">AI</span>
          <span className="avatar">AB</span>
          <span className="avatar avatar--lg">AB</span>
          <span className="avatar-stack">
            <span className="avatar">AB</span>
            <span className="avatar">CD</span>
            <span className="avatar">EF</span>
          </span>
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
            <div className="menu__item">Delete<kbd>⌫</kbd></div>
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
      </main>
    </div>
  )
}
