import { describe, expect, it } from 'vitest'
import { parseMarkdown, plainTextOfInline, safeHref } from './markdown.js'
import type { MdBlock, MdInline } from './markdown.js'

/**
 * The streaming-safe markdown subset, pinned. The live-edge cases matter
 * most: they are the ones every off-the-shelf renderer gets wrong, and the
 * reason this parser exists.
 */

const settled = (text: string) => parseMarkdown(text)
const live = (text: string) => parseMarkdown(text, { streaming: true })

const para = (text: string): MdBlock => ({
  kind: 'paragraph',
  children: [{ kind: 'text', text }],
})

describe('blocks, settled', () => {
  it('splits paragraphs on blank lines and joins soft breaks', () => {
    expect(settled('one\ntwo\n\nthree')).toEqual([para('one\ntwo'), para('three')])
  })

  it('headings carry their level', () => {
    expect(settled('## Title')).toEqual([
      { kind: 'heading', level: 2, children: [{ kind: 'text', text: 'Title' }] },
    ])
  })

  it('a # without a space is text, not a heading', () => {
    expect(settled('#hashtag')).toEqual([para('#hashtag')])
  })

  it('fenced code keeps its language and body verbatim', () => {
    expect(settled('```ts\nconst a = 1\n\nconst b = 2\n```')).toEqual([
      { kind: 'code', language: 'ts', text: 'const a = 1\n\nconst b = 2', open: false },
    ])
  })

  it('markdown inside a fence stays characters', () => {
    const [block] = settled('```\n**not bold**\n# not a heading\n```')
    expect(block).toMatchObject({ kind: 'code', text: '**not bold**\n# not a heading' })
  })

  it('a fence never closed still renders as code at settle — an interrupted stream keeps what arrived', () => {
    expect(settled('```py\nprint(1)')).toEqual([
      { kind: 'code', language: 'py', text: 'print(1)', open: false },
    ])
  })

  it('quotes nest blocks', () => {
    expect(settled('> quoted\n> words')).toEqual([
      { kind: 'quote', blocks: [para('quoted\nwords')] },
    ])
  })

  it('unordered lists collect items', () => {
    const [list] = settled('- one\n- two')
    expect(list).toMatchObject({
      kind: 'list',
      ordered: false,
      items: [[para('one')], [para('two')]],
    })
  })

  it('ordered lists keep their start number', () => {
    expect(settled('3. three\n4. four')[0]).toMatchObject({ kind: 'list', ordered: true, start: 3 })
  })

  it('indented items nest as a sublist inside their parent item', () => {
    const [list] = settled('- outer\n  - inner\n- second') as [Extract<MdBlock, { kind: 'list' }>]
    expect(list.items).toHaveLength(2)
    expect(list.items[0]).toMatchObject([
      para('outer'),
      { kind: 'list', items: [[para('inner')]] },
    ])
  })

  it('a rule is a rule, not a list of dashes', () => {
    expect(settled('---')).toEqual([{ kind: 'rule' }])
    expect(settled('- - -')).toEqual([{ kind: 'rule' }])
  })

  it('tables need a delimiter row with matching cells', () => {
    const [table] = settled('| a | b |\n| --- | ---: |\n| 1 | 2 |') as [
      Extract<MdBlock, { kind: 'table' }>,
    ]
    expect(table.kind).toBe('table')
    expect(table.align).toEqual([null, 'right'])
    expect(table.head.map(plainTextOfInline)).toEqual(['a', 'b'])
    expect(table.rows.map((r) => r.map(plainTextOfInline))).toEqual([['1', '2']])
  })

  it('a pipe line with no delimiter row is just a paragraph', () => {
    expect(settled('| a | b |\nplain')).toEqual([para('| a | b |\nplain')])
  })

  it('escaped pipes stay inside their cell', () => {
    const [table] = settled('| a \\| b | c |\n| --- | --- |') as [
      Extract<MdBlock, { kind: 'table' }>,
    ]
    expect(table.head.map(plainTextOfInline)).toEqual(['a | b', 'c'])
  })
})

describe('inline, settled', () => {
  const inlineOf = (text: string): readonly MdInline[] => {
    const [block] = settled(text)
    if (block?.kind !== 'paragraph') throw new Error('expected paragraph')
    return block.children
  }

  it('strong, em, and code spans', () => {
    expect(inlineOf('a **b** *c* `d`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'd' },
    ])
  })

  it('emphasis nests inside strong', () => {
    expect(inlineOf('**b *i* b**')).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'b ' },
          { kind: 'em', children: [{ kind: 'text', text: 'i' }] },
          { kind: 'text', text: ' b' },
        ],
      },
    ])
  })

  it('triple markers mean strong + em', () => {
    expect(inlineOf('***both***')).toEqual([
      { kind: 'strong', children: [{ kind: 'em', children: [{ kind: 'text', text: 'both' }] }] },
    ])
  })

  it('arithmetic asterisks are not emphasis', () => {
    expect(inlineOf('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }])
  })

  it('snake_case underscores are words, not emphasis', () => {
    expect(inlineOf('the file_name_here stays')).toEqual([
      { kind: 'text', text: 'the file_name_here stays' },
    ])
  })

  it('markdown inside a code span stays characters', () => {
    expect(inlineOf('`**raw**`')).toEqual([{ kind: 'code', text: '**raw**' }])
  })

  it('links carry their destination; images become links', () => {
    expect(inlineOf('[docs](https://example.com)')).toEqual([
      { kind: 'link', href: 'https://example.com', children: [{ kind: 'text', text: 'docs' }] },
    ])
    expect(inlineOf('![alt words](https://example.com/a.png)')).toEqual([
      {
        kind: 'link',
        href: 'https://example.com/a.png',
        children: [{ kind: 'text', text: 'alt words' }],
      },
    ])
  })

  it('bare URLs autolink, without swallowing trailing punctuation', () => {
    expect(inlineOf('see https://example.com/x.')).toEqual([
      { kind: 'text', text: 'see ' },
      {
        kind: 'link',
        href: 'https://example.com/x',
        children: [{ kind: 'text', text: 'https://example.com/x' }],
      },
      { kind: 'text', text: '.' },
    ])
  })

  it('escapes render the character, not the construct', () => {
    expect(inlineOf('\\*not em\\*')).toEqual([{ kind: 'text', text: '*not em*' }])
  })

  it('a stray ** at settle is characters — the grace is withdrawn', () => {
    expect(inlineOf('a **b')).toEqual([{ kind: 'text', text: 'a **b' }])
  })
})

/**
 * THE LIVE EDGE. At the live edge, markers are promises: render the thing
 * they are about to be, hide the syntax.
 */
describe('the live edge', () => {
  it('an unclosed ** renders as strong-in-progress, no asterisks shown', () => {
    const [block] = live('a **bold arriv')
    expect(block).toMatchObject({
      kind: 'paragraph',
      children: [
        { kind: 'text', text: 'a ' },
        { kind: 'strong', children: [{ kind: 'text', text: 'bold arriv' }] },
      ],
    })
  })

  it('grace nests: an unclosed code span inside unclosed strong', () => {
    const [block] = live('**bold `code arriv')
    expect(block).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'strong',
          children: [{ kind: 'text', text: 'bold ' }, { kind: 'code', text: 'code arriv' }],
        },
      ],
    })
  })

  it('grace applies only at the very end — an earlier stray marker is characters', () => {
    const [block] = live('a **b\n\nlater words arriv')
    expect(block).toEqual(para('a **b'))
  })

  it('an unclosed fence is already a code block, open', () => {
    expect(live('```ts\nconst a =')).toEqual([
      { kind: 'code', language: 'ts', text: 'const a =', open: true },
    ])
  })

  it('a link whose destination is still arriving is styled but not clickable', () => {
    const [block] = live('see [the plan](https://exampl')
    expect(block).toMatchObject({
      kind: 'paragraph',
      children: [
        { kind: 'text', text: 'see ' },
        { kind: 'link', href: null, children: [{ kind: 'text', text: 'the plan' }] },
      ],
    })
  })

  it('a bare URL still arriving is not yet clickable — a truncated URL is a wrong destination', () => {
    const [block] = live('see https://example.com/pa')
    expect(block).toMatchObject({
      kind: 'paragraph',
      children: [{ kind: 'text', text: 'see ' }, { kind: 'link', href: null }],
    })
  })

  it('a bracketed aside stays literal until ]( proves a link', () => {
    const [block] = live('quoted [sic] arriv')
    expect(block).toEqual(para('quoted [sic] arriv'))
  })

  it('a bare marker at the live edge renders nothing — no syntax flash', () => {
    expect(live('done.\n\n##')).toEqual([para('done.')])
    expect(live('done.\n\n-')).toEqual([para('done.')])
    expect(live('word **')).toEqual([para('word ')])
  })

  it('a header line becomes a table the moment its delimiter row arrives — even mid-dash', () => {
    expect(live('| a | b |')).toEqual([para('| a | b |')])
    const [table] = live('| a | b |\n| --- | -')
    expect(table).toMatchObject({ kind: 'table', rows: [] })
    expect((table as Extract<MdBlock, { kind: 'table' }>).head.map(plainTextOfInline)).toEqual([
      'a',
      'b',
    ])
  })

  it('a table row still streaming shows its cells so far', () => {
    const [table] = live('| a | b |\n| --- | --- |\n| one | tw') as [
      Extract<MdBlock, { kind: 'table' }>,
    ]
    expect(table.rows.map((r) => r.map(plainTextOfInline))).toEqual([['one', 'tw']])
  })
})

describe('safeHref', () => {
  it('allows http, https, mailto, and relative destinations', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com')
    expect(safeHref('/docs/thesis')).toBe('/docs/thesis')
  })

  it('refuses executable and exotic schemes — streamed text is untrusted', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(safeHref('vbscript:x')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
    expect(safeHref('')).toBeNull()
  })
})

describe('plainTextOfInline', () => {
  it('gives the words alone', () => {
    const [block] = settled('**b** and [l](https://x.dev) and `c`')
    if (block?.kind !== 'paragraph') throw new Error('expected paragraph')
    expect(plainTextOfInline(block.children)).toBe('b and l and c')
  })
})
