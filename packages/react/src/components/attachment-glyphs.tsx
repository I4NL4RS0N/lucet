import type { AttachmentKind } from 'lucet-core'

/**
 * What a file LOOKS like, by kind (component audit 07): one glyph family for
 * the composer's staged chips, the queued item's chips, and the thread's
 * read-only provenance chips — the same file wears the same face everywhere.
 * Categories come from the extension first, the host's kind second.
 */

export type FileCategory = 'doc' | 'table' | 'image' | 'video' | 'audio' | 'archive' | 'code'

const EXT_CATEGORY: Record<string, FileCategory> = {
  pdf: 'doc', doc: 'doc', docx: 'doc', txt: 'doc', rtf: 'doc', md: 'doc', pages: 'doc',
  xls: 'table', xlsx: 'table', csv: 'table', tsv: 'table', numbers: 'table',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', heic: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', json: 'code',
  html: 'code', css: 'code', sh: 'code', yaml: 'code', yml: 'code',
}

/** base + extension, split so the extension can survive truncation. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

export function categoryOf(name: string, fileKind: AttachmentKind): FileCategory {
  const { ext } = splitName(name)
  const byExt = EXT_CATEGORY[ext.slice(1).toLowerCase()]
  if (byExt) return byExt
  if (fileKind === 'image') return 'image'
  if (fileKind === 'audio') return 'audio'
  return 'doc'
}

/** A size a person can read: whole kilobytes below a megabyte, one decimal
    above it. Tabular numerals are the caller's job. */
export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(n / 1000))} KB`
}

export const FILE_GLYPHS: Record<FileCategory, React.ReactNode> = {
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 11h16M10 5v14" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 16l5-4 4 3 3-2 4 3" />
    </>
  ),
  video: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  audio: <path d="M5 10v4M9 7v10M13 5v14M17 9v6M21 11v2" />,
  archive: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M12 5v3m0 2v1m0 2v1" />
    </>
  ),
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
}
