#!/usr/bin/env node
/**
 * The GitHub Release body for one version: the matching section from each
 * package's changelog, in order, under the package's name. Written to
 * stdout; the workflow redirects it to a file for gh.
 */
import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>')
  process.exit(2)
}

const section = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${version}`)
  if (start === -1) return null
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end === -1) end = lines.length
  return lines.slice(start + 1, end).join('\n').trim()
}

const parts = []
for (const [name, file] of [['lucet-core', 'packages/core/CHANGELOG.md'], ['lucet-react', 'packages/react/CHANGELOG.md']]) {
  const body = section(file)
  if (body === null) {
    console.error(`${file} has no "## ${version}" section`)
    process.exit(1)
  }
  parts.push(`## ${name} ${version}\n\n${body}`)
}
parts.push(`Published from GitHub Actions with npm provenance. Install with \`npm install lucet-react@${version}\`.`)
process.stdout.write(parts.join('\n\n') + '\n')
