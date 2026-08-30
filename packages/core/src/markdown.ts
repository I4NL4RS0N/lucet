/**
 * Streaming-safe markdown.
 *
 * The response is a document, and markdown is the dress documents arrive in.
 * But markdown was specified for FINISHED text, and a streaming interface
 * renders every prefix of the document on its way to being finished. Render
 * those prefixes naively and the seams show: bold flashes as asterisks until
 * its closer arrives, a half-open code fence dumps raw backticks, a link
 * leaks its URL character by character.
 *
 * This parser makes prefixes first-class. One law covers every construct:
 *
 *   AT THE LIVE EDGE, MARKERS ARE PROMISES. AT SETTLE, THEY ARE CHARACTERS.
 *
 * While text is still arriving (`streaming: true`), an unclosed `**`,
 * backtick, fence, or link at the very end of the text renders as the thing
 * it is about to be, syntax hidden. Once the message settles the grace is
 * withdrawn: a document that truly ends with a stray `**` contains a stray
 * `**`, and pretending otherwise would misquote it. (One deliberate
 * exception: a fence that never closed still renders as code at settle —
 * an interrupted stream keeps what arrived, and what arrived was code.)
 *
 * Zero dependencies, by the core's standing rule, which also means this is a
 * deliberate SUBSET: the markdown assistants actually emit. Headings,
 * paragraphs, lists, fenced code, quotes, tables, rules; strong, emphasis,
 * inline code, links, autolinks. No setext headings, no footnotes, no raw
 * HTML (never rendered — parts are text, and stay text). The subset is
 * documented in docs/components/streaming-response.md.
 */

export type MdAlign = 'left' | 'center' | 'right' | null

export type MdInline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: readonly MdInline[] }
  | { readonly kind: 'em'; readonly children: readonly MdInline[] }
  | { readonly kind: 'code'; readonly text: string }
  /**
   * href is null while the destination is still arriving: the label renders
   * styled but NOT clickable, because you cannot click a destination that
   * has not finished existing.
   */
  | { readonly kind: 'link'; readonly children: readonly MdInline[]; readonly href: string | null }

export type MdRow = readonly (readonly MdInline[])[]

export type MdBlock =
  | { readonly kind: 'paragraph'; readonly children: readonly MdInline[] }
  | {
      readonly kind: 'heading'
      readonly level: 1 | 2 | 3 | 4 | 5 | 6
      readonly children: readonly MdInline[]
    }
  /** `open` is true only while streaming with the fence not yet closed. */
  | {
      readonly kind: 'code'
      readonly language: string | null
      readonly text: string
      readonly open: boolean
    }
  | { readonly kind: 'quote'; readonly blocks: readonly MdBlock[] }
  | {
      readonly kind: 'list'
      readonly ordered: boolean
      readonly start: number
      readonly items: readonly (readonly MdBlock[])[]
    }
  | {
      readonly kind: 'table'
      readonly align: readonly MdAlign[]
      readonly head: MdRow
      readonly rows: readonly MdRow[]
    }
  | { readonly kind: 'rule' }

export interface ParseMarkdownOptions {
  /** True while the text is still arriving. Grants the live edge its grace. */
  readonly streaming?: boolean
}

export function parseMarkdown(
  text: string,
  options: ParseMarkdownOptions = {},
): readonly MdBlock[] {
  return parseBlocks(text.split('\n'), options.streaming === true)
}

/* ------------------------------------------------------------------ blocks */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*).*$/
const CLOSE_BACKTICK = /^ {0,3}`{3,}\s*$/
const CLOSE_TILDE = /^ {0,3}~{3,}\s*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/
const RULE = /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
/** A GFM delimiter row: cells of dashes, optional alignment colons. */
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
/** A delimiter row still arriving — only dashes, colons, pipes so far. */
const PARTIAL_SEPARATOR = /^\s*\|[\s:|-]*$/
/**
 * A block marker with no content yet ("##", "-", ">", "1.", "**"). At the
 * live edge this is a promise with nothing to show, so it renders as
 * nothing rather than flashing raw syntax for one chunk. Bare digits count
 * too — "1" is most likely "1." mid-arrival, and treating it as text for
 * one tick would flicker the block after it in and out of existence.
 */
const BARE_MARKER = /^ {0,3}(?:#{1,6}|[-*+]|\d{1,9}[.)]?|>|\*{1,3}|_{1,3}|`{1,2})\s*$/

function leadingSpaces(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/** Split a table row into trimmed cell strings, honouring escaped pipes. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (ch === '\\' && s[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

function alignOf(cell: string): MdAlign {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

/**
 * `live` means: the end of THESE lines is the live edge of the document.
 * Only the construct that consumes the final line inherits the grace.
 */
function parseBlocks(lines: readonly string[], live: boolean): MdBlock[] {
  const blocks: MdBlock[] = []
  let i = 0
  /** True when parsing has consumed through the final line. */
  const atEnd = (nextIndex: number) => live && nextIndex >= lines.length

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }

    // A marker alone at the live edge: a promise with no content yet.
    if (live && i === lines.length - 1 && BARE_MARKER.test(line) && !RULE.test(line)) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const closer = fence[1]![0] === '`' ? CLOSE_BACKTICK : CLOSE_TILDE
      const language = fence[2] ? fence[2] : null
      const body: string[] = []
      let closed = false
      i++
      while (i < lines.length) {
        if (closer.test(lines[i]!)) {
          closed = true
          i++
          break
        }
        body.push(lines[i]!)
        i++
      }
      blocks.push({
        kind: 'code',
        language,
        text: body.join('\n'),
        open: !closed && atEnd(i),
      })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2]!.trim(), atEnd(i + 1)),
      })
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length) {
        const m = QUOTE.exec(lines[i]!)
        if (!m) break
        inner.push(m[1]!)
        i++
      }
      blocks.push({ kind: 'quote', blocks: parseBlocks(inner, atEnd(i)) })
      continue
    }

    const listStart = LIST_ITEM.exec(line)
    if (listStart) {
      const baseIndent = listStart[1]!.length
      const ordered = /\d/.test(listStart[2]![0]!)
      const start = ordered ? parseInt(listStart[2]!, 10) : 1
      const items: (readonly MdBlock[])[] = []

      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]!)
        if (!m || m[1]!.length > baseIndent) break
        if (/\d/.test(m[2]![0]!) !== ordered) break
        // Content column: marker plus the single space after it. Nested
        // material is dedented to this column so recursion sees it at the
        // margin.
        const contentCol = m[1]!.length + m[2]!.length + 1
        const itemLines: string[] = [m[3]!]
        i++
        while (i < lines.length) {
          const l = lines[i]!
          if (l.trim() === '') {
            // A blank inside an item survives only if indented content
            // follows; otherwise the list is over.
            const next = lines[i + 1]
            if (next !== undefined && next.trim() !== '' && leadingSpaces(next) > baseIndent) {
              itemLines.push('')
              i++
              continue
            }
            break
          }
          const sub = LIST_ITEM.exec(l)
          if (sub && sub[1]!.length <= baseIndent) break
          if (leadingSpaces(l) > baseIndent) {
            itemLines.push(l.slice(Math.min(leadingSpaces(l), contentCol)))
            i++
            continue
          }
          break
        }
        items.push(parseBlocks(itemLines, atEnd(i)))
      }
      blocks.push({ kind: 'list', ordered, start, items })
      continue
    }

    // Tables: a header line becomes a table the moment its delimiter row
    // arrives. Until then it is a paragraph — text you can see beats text
    // held back — and the promotion is the one re-interpretation the live
    // edge allows.
    if (line.includes('|')) {
      const next = lines[i + 1]
      const headCells = splitRow(line)
      const fullSeparator =
        next !== undefined &&
        SEPARATOR.test(next) &&
        next.includes('|') &&
        splitRow(next).length === headCells.length
      if (fullSeparator) {
        const align = splitRow(next).map(alignOf)
        const head = headCells.map((c) => parseInline(c, false))
        i += 2
        const rows: MdRow[] = []
        while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
          const cells = splitRow(lines[i]!)
          const rowLive = atEnd(i + 1)
          rows.push(cells.map((c, idx) => parseInline(c, rowLive && idx === cells.length - 1)))
          i++
        }
        blocks.push({ kind: 'table', align, head, rows })
        continue
      }
      if (
        live &&
        next !== undefined &&
        i + 1 === lines.length - 1 &&
        PARTIAL_SEPARATOR.test(next)
      ) {
        // The delimiter row is mid-arrival (anything from "|" to all but its
        // last cell): promote early, head only, so the header does not sit
        // as pipe soup while the dashes stream in.
        blocks.push({
          kind: 'table',
          align: headCells.map(() => null),
          head: headCells.map((c) => parseInline(c, false)),
          rows: [],
        })
        i += 2
        continue
      }
    }

    // Paragraph: collect until a blank line or a line that opens a block.
    const para: string[] = [line]
    i++
    while (i < lines.length) {
      const l = lines[i]!
      if (
        l.trim() === '' ||
        FENCE.test(l) ||
        HEADING.test(l) ||
        RULE.test(l) ||
        QUOTE.test(l) ||
        LIST_ITEM.test(l)
      )
        break
      const following = lines[i + 1]
      if (
        l.includes('|') &&
        following !== undefined &&
        SEPARATOR.test(following) &&
        following.includes('|') &&
        splitRow(following).length === splitRow(l).length
      )
        break
      para.push(l)
      i++
    }
    blocks.push({ kind: 'paragraph', children: parseInline(para.join('\n'), atEnd(i)) })
  }

  return blocks
}

/* ------------------------------------------------------------------ inline */

const ESCAPABLE = '\\`*_{}[]()#+-.!|>'

function isWordy(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch)
}

function countRun(src: string, from: number, ch: string): number {
  let n = 0
  while (src[from + n] === ch) n++
  return n
}

/** Index of the next run of EXACTLY `len` × `ch`, or -1. */
function findExactRun(src: string, from: number, ch: string, len: number): number {
  let i = from
  while (i < src.length) {
    if (src[i] === '\\' && src[i + 1] !== undefined) {
      i += 2
      continue
    }
    if (src[i] === ch) {
      const run = countRun(src, i, ch)
      if (run === len) return i
      i += run
      continue
    }
    i++
  }
  return -1
}

/**
 * Index of the next emphasis closer `delim` × `len` whose preceding character
 * is not a space (a `*` after a space is arithmetic, not emphasis), or -1.
 */
function findCloser(src: string, from: number, delim: string, len: number): number {
  let i = from
  while (i < src.length) {
    if (src[i] === '\\' && src[i + 1] !== undefined) {
      i += 2
      continue
    }
    if (src[i] === delim) {
      const run = countRun(src, i, delim)
      if (run >= len && i > from && src[i - 1] !== ' ') {
        // Prefer the tail of a longer run so `**bold*` inner `*` stays put.
        return i + run - len
      }
      i += run
      continue
    }
    i++
  }
  return -1
}

function findChar(src: string, from: number, ch: string): number {
  let i = from
  while (i < src.length) {
    if (src[i] === '\\' && src[i + 1] !== undefined) {
      i += 2
      continue
    }
    if (src[i] === ch) return i
    i++
  }
  return -1
}

const AUTOLINK = /^https?:\/\/[^\s<>]+/

/** Trailing punctuation an autolink should not swallow. */
function trimAutolink(url: string): string {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]!
    if ('.,;:!?\'"'.includes(ch)) {
      end--
      continue
    }
    if (ch === ')') {
      // Keep balanced parens: en.wikipedia.org/wiki/Lucet_(tool)
      const opens = (url.slice(0, end).match(/\(/g) ?? []).length
      const closes = (url.slice(0, end).match(/\)/g) ?? []).length
      if (closes > opens) {
        end--
        continue
      }
    }
    break
  }
  return url.slice(0, end)
}

/**
 * `live` is true only when this text runs to the live edge of the document.
 * Inside any CLOSED construct the flag drops to false: bounded content gets
 * no grace, because nothing in it is still arriving.
 */
function parseInline(src: string, live: boolean): MdInline[] {
  const out: MdInline[] = []
  let buf = ''
  const flush = () => {
    if (buf !== '') {
      out.push({ kind: 'text', text: buf })
      buf = ''
    }
  }

  let i = 0
  while (i < src.length) {
    const ch = src[i]!

    if (ch === '\\' && src[i + 1] !== undefined && ESCAPABLE.includes(src[i + 1]!)) {
      buf += src[i + 1]
      i += 2
      continue
    }

    if (ch === '`') {
      const run = Math.min(countRun(src, i, '`'), 2)
      const close = findExactRun(src, i + run, '`', run)
      if (close !== -1) {
        flush()
        let inner = src.slice(i + run, close)
        if (inner.length > 1 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== '')
          inner = inner.slice(1, -1)
        out.push({ kind: 'code', text: inner })
        i = close + run
      } else if (live) {
        flush()
        out.push({ kind: 'code', text: src.slice(i + run) })
        i = src.length
      } else {
        buf += src.slice(i, i + run)
        i += run
      }
      continue
    }

    if (ch === '*' || ch === '_') {
      // Underscores inside a word are words (snake_case), not emphasis.
      if (ch === '_' && i > 0 && isWordy(src[i - 1]!)) {
        buf += ch
        i++
        continue
      }
      const run = Math.min(countRun(src, i, ch), 3)
      const after = src[i + run]
      // An opener must touch its content.
      if (after === undefined || after === ' ') {
        if (live && after === undefined) {
          // Trailing markers at the live edge: a promise with no content yet.
          i += run
          continue
        }
        buf += src.slice(i, i + run)
        i += run
        continue
      }
      const wrap = (len: number, children: MdInline[]): MdInline =>
        len >= 2 ? { kind: 'strong', children } : { kind: 'em', children }
      const close = findCloser(src, i + run, ch, run)
      if (close !== -1) {
        flush()
        const inner = src.slice(i + run, close)
        if (run === 3) {
          out.push({ kind: 'strong', children: [{ kind: 'em', children: parseInline(inner, false) }] })
        } else {
          out.push(wrap(run, parseInline(inner, false)))
        }
        i = close + run
      } else if (live) {
        flush()
        const children = parseInline(src.slice(i + run), true)
        out.push(run === 3 ? { kind: 'strong', children: [{ kind: 'em', children }] } : wrap(run, children))
        i = src.length
      } else {
        buf += src.slice(i, i + run)
        i += run
      }
      continue
    }

    // Links — and images, which render as links to the image (a chat thread
    // is not the place to hot-load remote resources; the reader chooses).
    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const bracket = ch === '!' ? i + 1 : i
      const closeBracket = findChar(src, bracket + 1, ']')
      if (closeBracket !== -1 && src[closeBracket + 1] === '(') {
        const closeParen = findChar(src, closeBracket + 2, ')')
        const label = src.slice(bracket + 1, closeBracket)
        if (closeParen !== -1) {
          flush()
          const href = src.slice(closeBracket + 2, closeParen).trim().split(/\s+/)[0] ?? ''
          out.push({ kind: 'link', href, children: parseInline(label, false) })
          i = closeParen + 1
          continue
        }
        if (live) {
          flush()
          out.push({ kind: 'link', href: null, children: parseInline(label, false) })
          i = src.length
          continue
        }
      }
      buf += ch
      i++
      continue
    }

    if (ch === 'h' && (src.startsWith('http://', i) || src.startsWith('https://', i))) {
      const m = AUTOLINK.exec(src.slice(i))
      if (m) {
        const url = trimAutolink(m[0])
        const toEnd = i + url.length >= src.length && url === m[0]
        flush()
        out.push({
          kind: 'link',
          // Still arriving: styled, not clickable — a truncated URL is a
          // wrong destination, which is worse than a short wait.
          href: live && toEnd ? null : url,
          children: [{ kind: 'text', text: url }],
        })
        i += url.length
        continue
      }
    }

    buf += ch
    i++
  }

  flush()
  return out
}

/* -------------------------------------------------------------- plain text */

/** The words alone — what a screen reader should say, what search should see. */
export function plainTextOfInline(inline: readonly MdInline[]): string {
  return inline
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text
        case 'strong':
        case 'em':
        case 'link':
          return plainTextOfInline(node.children)
      }
    })
    .join('')
}

/* ------------------------------------------------------------------- hrefs */

/**
 * The destinations a rendered link may point at. Streamed text is untrusted
 * by definition — a model can be induced to emit `javascript:` the same way
 * any input can — so the allowlist is part of the contract, not a renderer
 * nicety. A refused href renders as words, not as a dead control.
 */
export function safeHref(href: string): string | null {
  const trimmed = href.trim()
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed)
  if (!scheme) return trimmed === '' ? null : trimmed
  const name = scheme[0].slice(0, -1).toLowerCase()
  return name === 'http' || name === 'https' || name === 'mailto' ? trimmed : null
}
