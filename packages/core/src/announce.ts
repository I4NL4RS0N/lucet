/**
 * What a screen reader hears while the answer streams.
 *
 * A live region that mirrors raw chunks announces word fragments; one that
 * mirrors raw markdown announces punctuation soup ("asterisk asterisk").
 * So the announcer never mirrors — it speaks UNITS: completed sentences of
 * prose, and completed structure DESCRIBED rather than spelled. A closed
 * code block is "Code, javascript, 8 lines", because hearing code
 * character-by-character helps no one; the visible block is there to read
 * at leisure.
 *
 * The one invariant, and the reason this is a pure function in core rather
 * than timing logic in a component:
 *
 *   THE PLAN FOR A PREFIX IS A PREFIX OF THE PLAN.
 *
 * As text grows, previously returned units never change and never reorder —
 * new units only append. That property is what lets a renderer announce
 * `plan[n..]` on every state change and be correct, with no timers and no
 * diffing. It is enforced by test, by replaying documents chunk by chunk.
 *
 * Units are emitted from:
 *  - every block except the last (their content is fixed);
 *  - the last block's COMPLETED parts: finished sentences of a paragraph,
 *    finished items of a list, finished rows of a table;
 *  - everything remaining, once `settled` is true.
 *
 * Held back on purpose:
 *  - a heading still on the live line (it announces whole, once its line
 *    ends);
 *  - an open code fence (it announces as one unit when it closes);
 *  - a live paragraph's text from its first pipe onward — the one stretch
 *    that can be re-read as a table when a delimiter row arrives, so those
 *    words wait until the reading is settled.
 */

import { parseMarkdown, plainTextOfInline } from './markdown.js'
import type { MdBlock } from './markdown.js'

/** Sentence enders, with closing quotes/brackets allowed to trail. */
const SENTENCE_END = /([.!?…]+['"’”)\]]*)(\s+)/g

function sentencesOf(text: string): { done: string[]; rest: string } {
  const done: string[] = []
  let cursor = 0
  SENTENCE_END.lastIndex = 0
  for (let m = SENTENCE_END.exec(text); m !== null; m = SENTENCE_END.exec(text)) {
    const end = m.index + m[1]!.length
    const sentence = text.slice(cursor, end).trim()
    if (sentence !== '') done.push(sentence)
    cursor = end
  }
  return { done, rest: text.slice(cursor).trim() }
}

function codeUnit(block: Extract<MdBlock, { kind: 'code' }>): string {
  const lines = block.text === '' ? 0 : block.text.split('\n').length
  const lang = block.language ? `, ${block.language}` : ''
  return `Code${lang}, ${lines} ${lines === 1 ? 'line' : 'lines'}.`
}

/**
 * `complete` means this block can no longer grow. The last block of a
 * streaming document is the only incomplete one, and completeness recurses:
 * inside an incomplete list, only the last item is incomplete.
 */
function emitBlock(block: MdBlock, complete: boolean, units: string[]): void {
  switch (block.kind) {
    case 'paragraph': {
      const text = plainTextOfInline(block.children)
      if (!complete) {
        // Everything from the first pipe on is held: those characters may
        // yet be re-read as a table, and a unit once spoken cannot be
        // unspoken. Text before the pipe is safe — a table starts at a line
        // start, so words already sentenced ahead of it never move.
        const pipe = text.indexOf('|')
        units.push(...sentencesOf(pipe === -1 ? text : text.slice(0, pipe)).done)
        return
      }
      const { done, rest } = sentencesOf(text)
      units.push(...done)
      if (rest !== '') units.push(rest)
      return
    }
    case 'heading': {
      if (!complete) return
      const text = plainTextOfInline(block.children)
      if (text !== '') units.push(`Heading: ${text}`)
      return
    }
    case 'code': {
      if (!complete || block.open) return
      units.push(codeUnit(block))
      return
    }
    case 'quote': {
      block.blocks.forEach((inner, idx) =>
        emitBlock(inner, complete || idx < block.blocks.length - 1, units),
      )
      return
    }
    case 'list': {
      block.items.forEach((item, idx) => {
        const itemComplete = complete || idx < block.items.length - 1
        item.forEach((inner, j) => emitBlock(inner, itemComplete || j < item.length - 1, units))
      })
      return
    }
    case 'table': {
      const head = block.head.map(plainTextOfInline).filter((c) => c !== '')
      if (head.length > 0) units.push(`Table: ${head.join(', ')}.`)
      // The final row may still be mid-line; it announces once the next row
      // starts, or at settle.
      const safeRows = complete ? block.rows.length : Math.max(0, block.rows.length - 1)
      for (let r = 0; r < safeRows; r++) {
        const cells = block.rows[r]!.map(plainTextOfInline).filter((c) => c !== '')
        if (cells.length > 0) units.push(`${cells.join(', ')}.`)
      }
      return
    }
    case 'rule':
      return
  }
}

/**
 * The full list of announcement units for this text. Stable under growth:
 * call it again with more text and the previous result is a prefix of the
 * new one. `settled: true` withdraws the holds and flushes everything.
 */
export function announcementPlan(text: string, settled: boolean): readonly string[] {
  const blocks = parseMarkdown(text, { streaming: !settled })
  const units: string[] = []
  blocks.forEach((block, idx) => {
    emitBlock(block, settled || idx < blocks.length - 1, units)
  })
  return units
}
