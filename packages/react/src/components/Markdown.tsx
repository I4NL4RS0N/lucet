import { useMemo } from 'react'
import { parseMarkdown, safeHref } from '@lucet/core'
import type { MdBlock, MdInline } from '@lucet/core'
import { CodeBlock } from './CodeBlock.js'

/**
 * The streaming response's document body: markdown, rendered from the
 * core's streaming-safe block model. The judgment calls live in the parser
 * (packages/core/src/markdown.ts) and the rationale doc; what this file owns
 * is the rendering policy:
 *
 * - EVERYTHING IS ELEMENTS. No innerHTML anywhere, ever: streamed text is
 *   untrusted, and the block model is rendered node by node so there is no
 *   string of HTML to get wrong.
 * - HEADINGS DEMOTE. A response lives inside a page that already has an
 *   outline, so the response's `#` must not outrank the page's own h1.
 *   `headingBase` (default 3) is where a response-level-1 heading lands;
 *   deeper levels step down from it. The VISUAL scale follows the markdown
 *   level, not the rendered tag.
 * - LINKS EARN THE CLICK. Destinations pass the core's allowlist or render
 *   as plain words; absolute links open in a new tab (leaving a running
 *   thread to follow a reference is rarely what anyone meant) and carry a
 *   leaving-glyph; a link whose destination is still streaming is styled
 *   but inert until the URL is whole.
 * - THE CARET RIDES THE DEEPEST LIVE EDGE — inside the last list item,
 *   inside the open code fence — so the eye keeps tracking one thing.
 */

export interface MarkdownProps {
  text: string
  /** True while the text is still arriving: grants the live edge its grace. */
  streaming?: boolean | undefined
  /** Shown at the live edge while streaming. */
  caret?: boolean | undefined
  /** The rendered heading level for a markdown level-1 heading. */
  headingBase?: 2 | 3 | 4 | undefined
}

const CARET = <span className="lucet-thread__caret" aria-hidden />

function Leaving() {
  return (
    <svg className="lucet-md__leaving" viewBox="0 0 24 24" aria-hidden>
      <path d="M8 16L16 8M9.5 8H16v6.5" />
    </svg>
  )
}

function inlineNodes(nodes: readonly MdInline[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return node.text
      case 'strong':
        return <strong key={i}>{inlineNodes(node.children)}</strong>
      case 'em':
        return <em key={i}>{inlineNodes(node.children)}</em>
      case 'code':
        return (
          <code className="lucet-md__code" key={i}>
            {node.text}
          </code>
        )
      case 'link': {
        if (node.href === null) {
          // Still arriving: styled, not clickable.
          return (
            <span className="lucet-md__link" data-arriving key={i}>
              {inlineNodes(node.children)}
            </span>
          )
        }
        const href = safeHref(node.href)
        if (href === null) {
          // A destination the allowlist refused renders as words, not as a
          // dead control pretending to be one.
          return <span key={i}>{inlineNodes(node.children)}</span>
        }
        const external = /^https?:/i.test(href)
        return (
          <a
            className="lucet-md__link"
            key={i}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {inlineNodes(node.children)}
            {external ? <Leaving /> : null}
          </a>
        )
      }
    }
  })
}

function Block({
  block,
  caret,
  headingBase,
}: {
  block: MdBlock
  caret: boolean
  headingBase: 2 | 3 | 4
}) {
  const tail = caret ? CARET : null
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="lucet-md__p">
          {inlineNodes(block.children)}
          {tail}
        </p>
      )
    case 'heading': {
      const Tag = `h${Math.min(6, headingBase + block.level - 1)}` as 'h2'
      return (
        <Tag className="lucet-md__h" data-mdlevel={Math.min(block.level, 3)}>
          {inlineNodes(block.children)}
          {tail}
        </Tag>
      )
    }
    case 'code':
      return (
        <CodeBlock
          code={block.text}
          language={block.language}
          open={block.open}
          caret={tail}
        />
      )
    case 'quote':
      return (
        <blockquote className="lucet-md__quote">
          <Blocks blocks={block.blocks} caret={caret} headingBase={headingBase} />
        </blockquote>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          className="lucet-md__list"
          {...(block.ordered && block.start !== 1 ? { start: block.start } : {})}
        >
          {block.items.map((item, i) => {
            const last = i === block.items.length - 1
            return (
              <li key={i}>
                {item.length === 0 && caret && last ? (
                  tail
                ) : (
                  <Blocks blocks={item} caret={caret && last} headingBase={headingBase} />
                )}
              </li>
            )
          })}
        </Tag>
      )
    }
    case 'table': {
      const lastRow = block.rows[block.rows.length - 1]
      return (
        <div className="lucet-md__tablewrap" tabIndex={0} role="region" aria-label="Table">
          <table className="lucet-md__table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} {...(block.align[i] ? { 'data-align': block.align[i] } : {})}>
                    {inlineNodes(cell)}
                    {caret && block.rows.length === 0 && i === block.head.length - 1 ? tail : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} {...(block.align[c] ? { 'data-align': block.align[c] } : {})}>
                      {inlineNodes(cell)}
                      {caret && row === lastRow && c === row.length - 1 ? tail : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'rule':
      return <hr className="lucet-md__rule" />
  }
}

function Blocks({
  blocks,
  caret,
  headingBase,
}: {
  blocks: readonly MdBlock[]
  caret: boolean
  headingBase: 2 | 3 | 4
}) {
  if (blocks.length === 0 && caret) return CARET
  return (
    <>
      {blocks.map((block, i) => (
        <Block
          key={i}
          block={block}
          caret={caret && i === blocks.length - 1}
          headingBase={headingBase}
        />
      ))}
    </>
  )
}

export function Markdown({ text, streaming, caret, headingBase = 3 }: MarkdownProps) {
  const blocks = useMemo(
    () => parseMarkdown(text, { streaming: streaming === true }),
    [text, streaming],
  )
  return (
    <div className="lucet-md">
      <Blocks blocks={blocks} caret={caret === true} headingBase={headingBase} />
    </div>
  )
}
