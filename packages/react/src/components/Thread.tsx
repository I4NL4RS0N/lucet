import { useEffect, useRef, useState, createContext, useContext } from 'react'
import { announcementPlan } from 'lucet-core'
import type { Message, MessagePart, ThreadState, NoticeAction, NoticePart } from 'lucet-core'
import { ActivityOrb } from './ActivityOrb.js'
import { Avatar } from './Avatar.js'
import { Markdown } from './Markdown.js'
import { MessageActions } from './MessageActions.js'
import { Reasoning } from './Reasoning.js'
import { Sources } from './Sources.js'
import { StateNotice } from './StateNotice.js'
import { StateIcon } from './StateIcon.js'
import { ToolCall } from './ToolCall.js'

/**
 * The thread: turns, rendered from the contract.
 *
 * The positions this encodes:
 *
 * 1. THE RESPONSE IS A DOCUMENT, NOT A BUBBLE. The assistant's output is the
 *    artefact the whole interface exists to produce, so it reads at full
 *    measure with no container. The PROMPT keeps a surface: it is an
 *    utterance, something you said, and you need to find it again while
 *    scrolling.
 * 2. PEOPLE HAVE FACES; THE MACHINE HAS OUTPUT. The group-chat grammar:
 *    your own turns sit right with no avatar (you know who you are), other
 *    people's turns sit left with a PROMINENT avatar -- multiplayer is the
 *    differentiator, so the humans get the faces. The assistant gets no
 *    avatar and no header at all: the document is its presence, which is the
 *    no-bubble position taken to its conclusion.
 * 3. A RESPONSE IS NEVER SIMPLY "LOADING" OR "DONE". Streaming shows the
 *    caret on the live edge; interrupted, failed, and refused each end the
 *    message with words that say what happened and what survives.
 * 4. WHAT YOU SENT STAYS VISIBLE. Attachment parts render as read-only chips
 *    on the prompt -- the composer's chips, minus the verbs.
 *
 * Reasoning and tool parts render through their own components (Reasoning,
 * ToolCall); the thread only decides where they sit and when they are live.
 */

export interface ThreadProps {
  /** Preview the thread as of this version (restore/entered). Offered on
      settled, non-latest turns while not already viewing the past. */
  onRestore?: ((turnId: string) => void) | undefined
  /** Commit the previewed restore: a NEW version of that turn lands at
      the end of the thread. Restore is a copy — nothing is deleted. */
  onRestoreCommit?: ((turnId: string) => void) | undefined
  /** Return to latest (restore/exited); the banner's escape hatch. */
  onExitRestore?: (() => void) | undefined
  /** A notice's named exit (Retry on Auto): the host performs it. */
  onNoticeAction?: ((action: NoticeAction) => void) | undefined
  /** The ending's own exit (round 05, P1): perform the response's recovery verb. */
  onRecover?: ((turnId: string) => void) | undefined
  /** 'history' holds the announcer's live role while a HOST-SCRIPTED
      stream plays (narration follows initiation — see
      ResponseAnnouncer); default 'live'. */
  narration?: 'live' | 'history' | undefined
  state: ThreadState
  /** Matched against message authorIds; your own turns are labelled You. */
  selfId?: string | undefined
  /** Ask again with the same words: a new turn that knows its ancestor. */
  onRetry?: ((turnId: string) => void) | undefined
  /** Record or retract a verdict on a response. */
  onFeedback?: ((messageId: string, verdict: 'up' | 'down' | null) => void) | undefined
}

const TERMINAL: Record<string, { icon: 'interrupted' | 'failed' | 'refused'; word: string }> = {
  interrupted: { icon: 'interrupted', word: 'Stopped early' },
  failed: { icon: 'failed', word: 'Failed' },
  refused: { icon: 'refused', word: 'Declined' },
}

const NoticeActionContext = createContext<((action: NoticeAction) => void) | undefined>(undefined)

function NoticeInline({ part }: { part: NoticePart }) {
  const onAction = useContext(NoticeActionContext)
  const action = part.action
  return (
    <StateNotice
      state={part.state}
      tone={part.tone}
      label={part.label}
      action={
        action && onAction ? (
          <button type="button" className="lucet-button" data-variant="ghost" onClick={() => onAction(action)}>
            {action.label}
          </button>
        ) : undefined
      }
    >
      {part.text}
    </StateNotice>
  )
}

function Part({
  part,
  streaming,
  last,
  doc,
}: {
  part: MessagePart
  streaming: boolean
  last: boolean
  doc: boolean
}) {
  switch (part.kind) {
    case 'text':
      /*
       * The assistant's text is a DOCUMENT and renders as one: markdown,
       * through the core's streaming-safe parser. The prompt stays verbatim
       * plain text on purpose — it is a quotation of what you typed, and
       * dressing it up would misquote you.
       */
      return doc ? (
        <Markdown text={part.text} streaming={streaming} caret={streaming && last} />
      ) : (
        <p className="lucet-thread__text">
          {part.text}
          {streaming && last ? <span className="lucet-thread__caret" aria-hidden /> : null}
        </p>
      )
    case 'reasoning':
      /* Live only while it is the newest thing in the message: the moment
         the answer starts, the thinking row settles into a plain fact. */
      return <Reasoning text={part.text} streaming={streaming && last} />
    case 'tool':
      return (
        <ToolCall
          name={part.name}
          status={part.status}
          detail={part.detail}
          args={part.args}
          result={part.result}
        />
      )
    case 'sources':
      return <Sources sources={part.sources} label={part.label} />
    case 'notice':
      /* THE RUNTIME TELLS, INLINE (audit round 05): how this answer is
         being made — a fallback model, a limit — before the answer, in the
         notice grammar that already exists. The action is a named exit the
         host performs (Retry on Auto), delivered through context so the
         part needs no plumbing. */
      return <NoticeInline part={part} />
    case 'attachment':
      return (
        <span className="lucet-att lucet-att--readonly">
          <svg className="lucet-att__icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
          <span className="lucet-att__name">{part.name}</span>
        </span>
      )
  }
}

function MessageView({
  message,
  self,
  actions,
}: {
  message: Message
  self: boolean
  actions?: React.ReactNode
}) {
  const isUser = message.role === 'user'
  const terminal = TERMINAL[message.status]
  const attachments = message.parts.filter((p) => p.kind === 'attachment')
  const rest = message.parts.filter((p) => p.kind !== 'attachment')
  /* The LAST part is where content is arriving, so it is where liveness
     lives: the caret if it is text, the thinking orb if it is reasoning.
     Everything before it has already settled into history. */
  const lastPartId = rest[rest.length - 1]?.id

  /* A VALUE, not a nested component. Rendered as <PromptBody /> this was
     a fresh component type every render, so React remounted the whole
     prompt/doc subtree on every streamed chunk — replaying the arrival
     animation on turns that had long since arrived, and rebuilding their
     DOM for nothing. */
  const promptBody = (
    <div className={isUser ? 'lucet-thread__prompt' : 'lucet-thread__doc'}>
      {rest.map((part) => (
        <Part
          key={part.id}
          part={part}
          streaming={message.status === 'streaming'}
          last={part.id === lastPartId}
          doc={!isUser}
        />
      ))}
      {attachments.length > 0 ? (
        <div className="lucet-thread__atts">
          {attachments.map((part) => (
            <Part key={part.id} part={part} streaming={false} last={false} doc={false} />
          ))}
        </div>
      ) : null}
      {message.status === 'streaming' && rest.length === 0 ? (
        <ActivityOrb state="composing" label="Writing…" size="sm" />
      ) : null}
    </div>
  )

  return (
    <div className="lucet-thread__turn" data-role={message.role} data-self={self || undefined}>
      {/*
       * Heads only where they inform. Your own turns carry no head at all --
       * position says it. Other PEOPLE get the prominent avatar and their
       * name: the faces belong to the humans. The assistant gets a
       * visually-hidden label for screen readers and nothing else; its
       * document is its presence. (The version marker left with the heads;
       * it returns with the Version Marker + Restore pattern, where a
       * restore affordance gives it meaning beyond jargon.)
       */}
      {!isUser ? <span className="lucet-visually-hidden">Assistant</span> : null}

      {isUser && !self ? (
        /* Another person's turn: the face sits OUTSIDE the bubble,
           bottom-aligned to it — meeting the bubble's anchored tail
           corner, so the corner and the face point at each other. The
           name rides above the bubble in the same column. In a SHARED
           thread this is still only other people: your own turns keep
           the messaging grammar — right, no head, no "you" — position
           says yours whoever else is speaking (Option A, 2026-09-02;
           the previous rule gave you a face and pulled you left, which
           contradicted the specimen's own caption). */
        <div className="lucet-thread__withface">
          <Avatar name={message.authorId} />
          <div className="lucet-thread__spoke">
            <span className="lucet-thread__author">{message.authorId}</span>
            {promptBody}
          </div>
        </div>
      ) : (
        promptBody
      )}
      {terminal ? (
        <p className="lucet-thread__ended" data-status={message.status} role="status">
          <StateIcon name={terminal.icon} />
          <span>
            <strong>{terminal.word}.</strong> {message.reason ?? ''}
            {message.recovery?.mode === 'retry-at' && message.recovery.at !== null ? (
              /* The one thing the person needs from a limit: exactly when it
                 lifts (round 05, P1). Tabular, so the seconds hold still. */
              <>
                {' '}
                Resets at{' '}
                <time className="lucet-thread__at" dateTime={new Date(message.recovery.at).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(message.recovery.at))}
                </time>
                .
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {actions}
    </div>
  )
}

/**
 * What a screen reader hears while the answer streams. The visible document
 * is NOT a live region — mirroring raw chunks announces word fragments, and
 * mirroring markdown announces its syntax. Instead this hidden log receives
 * the core's announcement UNITS: finished sentences, structure described
 * rather than spelled ("Code, ts, 8 lines"). The plan's prefix invariant
 * (see packages/core/src/announce.ts) is what lets this be a counter and a
 * slice, with no timers: units only ever append.
 *
 * NARRATION FOLLOWS INITIATION. The log narrates answers the person is
 * waiting on; a stream the host scripted on its own (a demo playback,
 * an onboarding replay) is content arriving, not an answer arriving —
 * and the interrupt-any-key escape cannot be counted on in
 * screen-reader browse mode, where virtual-cursor keys never reach the
 * page. So the host may set narration="history": the log still fills,
 * readable at leisure, but carries no live role until the host flips
 * it back — at which point only NEW units announce, because a live
 * region speaks mutations, never its backlog.
 */
function ResponseAnnouncer({
  state,
  narration = 'live',
}: {
  state: ThreadState
  narration?: 'live' | 'history'
}) {
  const [units, setUnits] = useState<readonly string[]>([])
  const seen = useRef({ messageId: '', count: 0 })

  useEffect(() => {
    const response = state.turns[state.turns.length - 1]?.response
    if (!response) {
      if (state.turns.length === 0 && seen.current.messageId !== '') {
        seen.current = { messageId: '', count: 0 }
        setUnits([])
      }
      return
    }
    const settled = response.status !== 'streaming' && response.status !== 'pending'
    const textParts = response.parts.filter((p) => p.kind === 'text')
    const plan = textParts.flatMap((part, i) =>
      announcementPlan(part.text, settled || i < textParts.length - 1),
    )
    if (response.id !== seen.current.messageId) {
      /*
       * A response that was ALREADY settled when we first saw it is history,
       * not news: announcing its whole backlog on mount would read a page of
       * old answers at whoever loads the thread. Start the counter at the
       * end and say nothing. (Joining mid-stream announces from the top --
       * you just arrived; the recent context is the point.)
       */
      seen.current = { messageId: response.id, count: settled ? plan.length : 0 }
      setUnits([])
    }
    if (plan.length > seen.current.count) {
      const fresh = plan.slice(seen.current.count)
      seen.current.count = plan.length
      setUnits((prev) => [...prev, ...fresh])
    }
  }, [state])

  return (
    <div
      className="lucet-visually-hidden"
      role={narration === 'live' ? 'log' : undefined}
      aria-label={narration === 'live' ? 'The response, as it arrives' : undefined}
    >
      {units.map((unit, i) => (
        <p key={i}>{unit}</p>
      ))}
    </div>
  )
}

export function Thread({
  state,
  selfId,
  onRetry,
  onFeedback,
  onRestore,
  onRestoreCommit,
  onExitRestore,
  onNoticeAction,
  onRecover,
  narration,
}: ThreadProps) {
  const last = state.turns[state.turns.length - 1]
  const sectionRef = useRef<HTMLElement | null>(null)
  /* THE SEPARATOR RULE (review): no container ever renders a separator
     whose preceding message is entirely out of view — either the tail
     is visible above the line, or the line is not drawn. Enforced HERE,
     in the component, because the separator is drawn here: each pair
     watches its own visibility inside the host's scroll container, and
     when a pair has less than a legible sliver showing, the divider on
     the pair below it goes transparent (never zero-width). The host
     declares a top inset for its own scroll fade via
     --lucet-thread-top-inset, so a line of text dimmed to nothing by a
     mask does not count as "visible". Falls back to always-drawn where
     IntersectionObserver does not exist. */
  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof IntersectionObserver === 'undefined') return
    let root: HTMLElement | null = section.parentElement
    while (root && root !== document.body) {
      const overflow = getComputedStyle(root).overflowY
      if (overflow === 'auto' || overflow === 'scroll') break
      root = root.parentElement
    }
    if (!root || root === document.body) return
    const inset = parseFloat(getComputedStyle(section).getPropertyValue('--lucet-thread-top-inset')) || 0
    /* 18px past the fade: a two-pixel sliver of faded text is not
       "visible text above the line". */
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const next = entry.target.nextElementSibling
          if (!next || !next.classList.contains('lucet-thread__pair')) continue
          if (entry.isIntersecting) next.removeAttribute('data-prev-out')
          else next.setAttribute('data-prev-out', '')
        }
      },
      { root, rootMargin: `${-(inset + 18)}px 0px 0px 0px` },
    )
    for (const pair of section.querySelectorAll('.lucet-thread__pair')) io.observe(pair)
    return () => io.disconnect()
  }, [state.turns.length])
  /* THE BADGE SPEAKS WORDS; NUMBERS DEMOTE TO METADATA. A version's
     badge says what happened, in the reader's language: Retried and
     Restored name how a version came to be; Current marks a badged
     newest version with no creation word. Ordinals ("2nd version of
     this prompt") survive only as per-lineage metadata, revealed on
     hover/focus — the store's global ids stay internal. Markers appear
     only where history is non-linear; a plain thread stays plain. */
  const lineageRoot = (t: (typeof state.turns)[number]): string => {
    let cur = t
    for (;;) {
      const parentId = cur.retryOf ?? cur.restoreOf
      if (!parentId) return cur.id
      const parent = state.turns.find((x) => x.id === parentId)
      if (!parent) return parentId
      cur = parent
    }
  }
  const lineages = new Map<string, string[]>()
  for (const t of state.turns) {
    const root = lineageRoot(t)
    const list = lineages.get(root) ?? []
    list.push(t.id)
    lineages.set(root, list)
  }
  const versionFacts = (t: (typeof state.turns)[number]) => {
    const family = lineages.get(lineageRoot(t)) ?? [t.id]
    if (family.length < 2) return null
    const ordinal = family.indexOf(t.id) + 1
    const newest = family[family.length - 1] === t.id
    const born = t.restoreOf ? 'restored' : t.retryOf ? 'retried' : 'asked'
    const word = t.restoreOf ? 'Restored' : t.retryOf ? 'Retried' : newest ? 'Current' : null
    const ord = ordinal === 1 ? '1st' : ordinal === 2 ? '2nd' : ordinal === 3 ? '3rd' : `${ordinal}th`
    const meta = `${newest ? 'current · ' : ''}${ord} version of this prompt · ${born}`
    return { word, meta, newest }
  }
  const restoredIndex = state.restoredFrom
    ? state.turns.findIndex((t) => t.id === state.restoredFrom)
    : -1
  /* Shared the moment a second human speaks — derived from the turns,
     never a flag a host could forget to set. */
  const shared = new Set(state.turns.map((t) => t.prompt.authorId)).size > 1
  const setAside = state.turns.length - 1 - restoredIndex
  return (
    /*
     * The visible thread is a named region for FINDING; the hidden announcer
     * below is the live log for HEARING. They are deliberately not the same
     * element: a live region over the visible document would announce every
     * raw chunk and every piece of markdown syntax, which is the streaming
     * mess this component exists to clean up.
     */
    <NoticeActionContext.Provider value={onNoticeAction}>
    <section
      ref={sectionRef}
      className="lucet-thread"
      aria-label="Conversation"
      data-shared={shared || undefined}
    >
      {state.turns.map((turn) => {
        const response = turn.response
        /* Actions appear once a response has SETTLED — there is nothing to
           copy, judge, or retry about a stream still arriving. The
           latest/older visibility law is CSS on the pair. */
        const settled =
          response !== null && response.status !== 'streaming' && response.status !== 'pending'
        const index = state.turns.indexOf(turn)
        const facts = versionFacts(turn)
        const aside = restoredIndex >= 0 && index > restoredIndex
        return (
          <article
            className="lucet-thread__pair"
            key={turn.id}
            data-latest={turn.id === last?.id || undefined}
            data-version-old={(facts && !facts.newest) || undefined}
            data-aside={aside || undefined}
            /* Set-aside turns leave the page for EVERYONE while the view
               is restored: inert removes them from pointer and tab order,
               aria-hidden from the accessibility tree — the eyes and the
               reader agree about what "as of v1" means. */
            ref={(el) => {
              if (el) el.inert = aside
            }}
            aria-hidden={aside || undefined}
          >
            {facts ? (
              /* The word badge, then the ordinal as hover/focus metadata.
                 The metadata span keeps its layout space at rest
                 (opacity, not display), so revealing it moves nothing. */
              <div className="lucet-thread__vrow">
                {facts.word ? (
                  <span className="lucet-thread__vbadge">{facts.word}</span>
                ) : null}
                <span className="lucet-thread__vmeta">{facts.meta}</span>
              </div>
            ) : null}
            <MessageView
              message={turn.prompt}
              self={turn.prompt.authorId === (selfId ?? null)}
            />
            {response ? (
              <MessageView
                message={response}
                self={false}
                actions={
                  settled ? (
                    <MessageActions
                      message={response}
                      onRetry={onRetry ? () => onRetry(turn.id) : undefined}
                      onRecover={onRecover ? () => onRecover(turn.id) : undefined}
                      onFeedback={
                        onFeedback ? (verdict) => onFeedback(response.id, verdict) : undefined
                      }
                      onRestore={
                        onRestore && !(facts?.newest ?? turn.id === last?.id) && restoredIndex < 0
                          ? () => onRestore(turn.id)
                          : undefined
                      }
                    />
                  ) : null
                }
              />
            ) : null}
            {restoredIndex === index ? (
              /* PREVIEW, THEN COMMIT — the banner is the introduction:
                 it states where you are and what both options do, in the
                 words the announce layer uses. role=status announces the
                 mode change without stealing focus. Restore only ever
                 adds, and the banner's commit says so by its phrasing. */
              <div className="lucet-thread__restored" role="status">
                <svg className="lucet-thread__restored-glyph" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 8v4l2.6 1.6M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V6H18" />
                </svg>
                <span className="lucet-thread__restored-text">
                  Previewing an earlier version — {setAside} later{' '}
                  {setAside === 1 ? 'turn is' : 'turns are'} set aside, not deleted.
                </span>
                {/* THE PAIR (audit round 04): the way back is a ghost, the
                    commit is the primary — the library's own button grammar,
                    so the hierarchy is silhouette (a fill against none), not
                    hue. Labels never wrap; below the width where both fit
                    beside the sentence the pair takes a row of its own. */}
                {onExitRestore || onRestoreCommit ? (
                  <span className="lucet-thread__restored-actions">
                    {onExitRestore ? (
                      <button
                        type="button"
                        className="lucet-button lucet-thread__return"
                        data-variant="ghost"
                        onClick={onExitRestore}
                      >
                        Return to latest
                      </button>
                    ) : null}
                    {onRestoreCommit ? (
                      <button
                        type="button"
                        className="lucet-button lucet-thread__return"
                        data-variant="primary"
                        data-commit
                        onClick={() => onRestoreCommit(turn.id)}
                      >
                        Restore version
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
      <ResponseAnnouncer state={state} narration={narration ?? 'live'} />
    </section>
    </NoticeActionContext.Provider>
  )
}
