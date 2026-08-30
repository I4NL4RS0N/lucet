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
 * The Configurator proves behaviour. This proves consistency.
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
  { state: 'operational', label: 'All services operational.', body: 'The only green in the system, and it never appears inside the thread.' },
  { state: 'refused', label: 'Declined.', body: 'I cannot delete anything. I can show you exactly what would go, grouped by why it looks old.' },
  { state: 'interrupted', label: 'Stopped.', body: 'You stopped this before it finished. What arrived is still here.' },
  { state: 'partial', label: 'Incomplete.', body: 'Two of three sources returned. This is not the full picture.' },
  { state: 'degraded', label: 'Running slow.', body: 'The usual model is unavailable. Running on the fallback, which is faster and less careful.' },
  { state: 'down', label: 'Service unavailable.', body: 'The model provider is having an outage. Nothing you have written is lost.' },
  { state: 'failed', label: 'Failed.', body: 'The request could not be completed.' },
  { state: 'rate-limited', label: 'Limit reached.', body: 'You have hit this hour’s limit. It resets in 14 minutes.' },
  { state: 'stale', label: 'From cache.', body: 'This answer is four hours old. Anything published this morning would not appear.' },
  { state: 'uncertain', label: 'Low confidence.', body: 'This is the summary’s claim rather than the original’s. Worth confirming.' },
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
  const [draft, setDraft] = useState('Compare the two plans on where they could slip')

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
        <Message message={msg('user', [text('Summarise the three documents I shared.')])} version="v_1" actions={<><Button variant="ghost">Restore</Button><Button variant="ghost">Copy</Button></>} />
        <Message message={msg('assistant', [text('All three describe the same change, but only the last one gives a date for it. Where the earlier two disagree with it, they are older rather than wrong.')])} />
        <Message message={msg('assistant', [text('The change affects how the second stage is applied. Previously that step ran before the review, not after it.')], 'streaming')} />
      </Spec>

      <Spec title="Reasoning" note="Collapsed by default and never in the response body. Reasoning is working, not answer.">
        <Reasoning text="Both plans end on the same date, so comparing end dates says nothing. The second front-loads its dependencies, which shortens the critical path but leaves no slack." />
        <Reasoning defaultOpen text="Both plans end on the same date, so comparing end dates says nothing. The second front-loads its dependencies, which shortens the critical path but leaves no slack." />
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
