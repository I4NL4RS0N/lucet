import { useState } from 'react'
import { Button, Composer, Message, Reasoning, StateNotice, ToolCall } from 'lucet-react'
import type { NoticeState } from 'lucet-react'
import type { Message as MessageType, MessagePart, ToolStatus } from 'lucet'

/**
 * The sheet.
 *
 * Every component, every state, one page, one theme. Not Storybook: nothing is
 * isolated, nothing is behind navigation, and there is no props panel. The
 * point is the opposite of isolation. You cannot see that the tool-call radius
 * disagrees with the composer radius when they live on different screens.
 *
 * The Konfabulator proves behaviour. This proves consistency.
 */

let seq = 0
function msg(
  role: MessageType['role'],
  parts: MessagePart[],
  status: MessageType['status'] = 'complete',
  reason: string | null = null,
): MessageType {
  seq += 1
  return { id: `sheet_${seq}`, role, authorId: role === 'user' ? 'you' : 'assistant', parts, status, reason, createdAt: 0 }
}

const text = (t: string): MessagePart => ({ kind: 'text', id: `t${seq++}`, text: t })

const NOTICES: readonly { state: NoticeState; label: string; body: string }[] = [
  { state: 'refused', label: 'Declined.', body: 'I cannot make a buy or sell recommendation. I can lay the three side by side on spread, duration, and rating history.' },
  { state: 'interrupted', label: 'Stopped.', body: 'You stopped this before it finished. What arrived is still here.' },
  { state: 'partial', label: 'Incomplete.', body: 'Two of three sources returned. This is not the full picture.' },
  { state: 'degraded', label: 'Running slow.', body: 'The usual model is unavailable. Running on the fallback, which is faster and less careful.' },
  { state: 'down', label: 'Service unavailable.', body: 'The model provider is having an outage. Nothing you have written is lost.' },
  { state: 'failed', label: 'Failed.', body: 'The request could not be completed.' },
  { state: 'rate-limited', label: 'Limit reached.', body: 'You have hit this hour’s limit. It resets in 14 minutes.' },
  { state: 'stale', label: 'From cache.', body: 'This answer is four hours old. A rating action this morning would not appear.' },
  { state: 'uncertain', label: 'Low confidence.', body: 'This is the sector default rather than this issuer’s figure. Worth confirming.' },
  { state: 'queued', label: 'Waiting.', body: 'Ada holds the turn. You can write your next prompt now.' },
]

const TOOLS: readonly { status: ToolStatus; detail: string | null }[] = [
  { status: 'running', detail: null },
  { status: 'succeeded', detail: '3 of 3 names returned' },
  { status: 'partial', detail: '2 of 3 names returned. Timed out on the third.' },
  { status: 'failed', detail: 'The data source rejected the query.' },
]

function Spec({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="sheet__spec">
      <h3>{title}</h3>
      <p className="sheet__note">{note}</p>
      <div className="sheet__stage">{children}</div>
    </section>
  )
}

export function Sheet() {
  const [draft, setDraft] = useState('Compare the two portfolios on duration risk')

  return (
    <section aria-label="Component sheet" className="sheet">
      <h2>Sheet</h2>
      <p className="sheet__note">
        Every component and every state on one page, sharing one theme. Change
        theme, accent, grey, or expression in the header and the whole sheet
        moves together. This is where look and feel gets settled.
      </p>

      <Spec
        title="Message"
        note="The assistant gets no bubble. Its output is the artefact, so it reads as a document at full measure. The prompt keeps a surface because it is an utterance, and because you need to find it again scrolling back."
      >
        <Message message={msg('user', [text('Summarise how issuance volume moved last quarter.')])} version="v_1" actions={<><Button variant="ghost">Restore</Button><Button variant="ghost">Copy</Button></>} />
        <Message message={msg('assistant', [text('Issuance volume rose 12% quarter over quarter, driven almost entirely by investment grade. High yield was flat. The move is concentrated in the last three weeks, so it reads more like pulled-forward supply than a change in trend.')])} />
        <Message message={msg('assistant', [text('The change affects how the sector adjustment is applied. Previously the adjustment was')], 'streaming')} />
      </Spec>

      <Spec title="Reasoning" note="Collapsed by default and never in the response body. Reasoning is working, not answer.">
        <Reasoning text="Both hold long-dated paper. Portfolio A is barbelled, so its weighted duration understates its convexity." />
        <Reasoning defaultOpen text="Both hold long-dated paper. Portfolio A is barbelled, so its weighted duration understates its convexity. Comparing weighted average duration alone would be misleading here." />
        <Reasoning streaming text="Checking the methodology note first" />
      </Spec>

      <Spec title="Tool call" note="Compact while it works. It earns weight only when it settles somewhere the reader has to act on. Partial is a first-class outcome, not a variant of failed.">
        {TOOLS.map((t) => (
          <ToolCall key={t.status} name="query_market_data" status={t.status} detail={t.detail} />
        ))}
      </Spec>

      <Spec title="State notice" note="One component, ten states. Not an alert. A refusal is a normal event, and a banner treatment teaches people something broke every time the assistant declines.">
        {NOTICES.map((n) => (
          <StateNotice key={n.state} state={n.state} label={n.label} action={n.state === 'rate-limited' ? <Button variant="ghost">Notify me</Button> : undefined}>
            {n.body}
          </StateNotice>
        ))}
      </Spec>

      <Spec title="Composer" note="The lock is designed in, not bolted on. When locked the field stays editable and only Send disables, so you can write your next prompt while someone else's runs.">
        <Composer value={draft} onChange={setDraft} onSubmit={() => setDraft('')} toolbar={<><Button variant="ghost">Attach</Button><Button variant="ghost">Sonnet 4.6</Button></>} />
        <Composer value="" onChange={() => {}} onSubmit={() => {}} streaming toolbar={<Button variant="ghost">Sonnet 4.6</Button>} />
        <Composer value="and check the third name again" onChange={() => {}} onSubmit={() => {}} lockedBy="Ada" toolbar={<Button variant="ghost">Sonnet 4.6</Button>} />
      </Spec>
    </section>
  )
}
