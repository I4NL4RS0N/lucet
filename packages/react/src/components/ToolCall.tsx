import type { ToolStatus } from 'lucet'

/**
 * Tool call display.
 *
 * Compact by default: a running tool is a progress report, not the subject.
 * It only earns visual weight when it settles somewhere other than success,
 * because that is the only outcome the reader has to do something about.
 *
 * `partial` exists here and nowhere else in this category. Succeeded-or-failed
 * is the lie that lets a product answer confidently from two thirds of the data.
 */

export interface ToolCallProps {
  name: string
  status: ToolStatus
  detail?: string | null
}

const VERB: Record<ToolStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  succeeded: 'Ran',
  failed: 'Failed',
  partial: 'Partly returned',
}

export function ToolCall({ name, status, detail }: ToolCallProps) {
  return (
    <div className="lucet-tool" data-status={status}>
      <div className="lucet-tool__head">
        <span className="lucet-tool__status">{VERB[status]}</span>
        <code className="lucet-tool__name">{name}</code>
      </div>
      {detail ? <p className="lucet-tool__detail">{detail}</p> : null}
    </div>
  )
}
