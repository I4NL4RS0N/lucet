#!/usr/bin/env node
/**
 * Release guards, run by .github/workflows/release.yml.
 *
 * Default: the registry check. Both packages already on npm at their
 * package.json version means nothing is due (publish=false, the job ends
 * green). Neither on npm means a release is due (publish=true). One of two
 * means half a release happened; nothing publishes until a person looks.
 *
 * --npm: the trusted-publishing preconditions, checked before the first
 * publish so a missing permission fails here with words, not inside npm.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

const packages = ['packages/core', 'packages/react'].map((dir) => {
  const json = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
  return { dir, name: json.name, version: json.version }
})

const output = (key, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  console.log(`${key}=${value}`)
}
const fail = (title, message) => {
  console.error(`::error title=${title}::${message}`)
  process.exit(1)
}

if (process.argv.includes('--npm')) {
  const npmVersion = execFileSync('npm', ['--version']).toString().trim()
  const [major, minor, patch] = npmVersion.split('.').map(Number)
  const ok = major > 11 || (major === 11 && (minor > 5 || (minor === 5 && patch >= 1)))
  if (!ok)
    fail('npm too old for trusted publishing', `npm ${npmVersion} cannot publish with an OIDC token; 11.5.1 or newer is needed. Pin a newer Node in .nvmrc or install npm@latest in the workflow.`)
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
    fail('no OIDC token available', 'The job has no id-token: write permission, so npm cannot mint a publish credential. Add id-token: write to the workflow permissions.')
  console.log(`npm ${npmVersion}; OIDC token available. Trusted publishing can proceed.`)
  process.exit(0)
}

const onRegistry = (name, version) => {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== ''
  } catch {
    return false
  }
}

const versions = new Set(packages.map((p) => p.version))
if (versions.size !== 1)
  fail('versions disagree', `lucet-core and lucet-react are a fixed group and must share a version; found ${packages.map((p) => `${p.name} ${p.version}`).join(' and ')}.`)

const published = packages.map((p) => ({ ...p, published: onRegistry(p.name, p.version) }))
const label = published.map((p) => `${p.name} ${p.version}`).join(' and ')
if (published.every((p) => p.published)) {
  console.log(`${label} are already on npm. Nothing to publish.`)
  output('publish', 'false')
} else if (published.some((p) => p.published)) {
  const which = published.filter((p) => p.published).map((p) => p.name).join(', ')
  fail('half a release on the registry', `${which} is on npm at this version and the other package is not. Nothing publishes until a person looks at the registry and the last run.`)
} else {
  console.log(`${label} are not on npm yet. A release is due.`)
  output('publish', 'true')
}
