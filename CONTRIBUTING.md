# Contributing

Lucet is one library, two packages, one docs site, and a lot of written
reasons. This page is the working agreement.

## Working here

- `npm ci`, then `npm run dev` for the docs site on port 4340. `?instant=1`
  skips the opening playback; the browser is never sniffed for it.
- `npm run verify` is the gate: build, typecheck, tests, and four audits in
  a real browser (WCAG 2.2 AA, theme parity, states, expression geometry).
  Nothing merges red.
- Every component change comes with its rationale in `docs/components/`.
  CLAUDE.md carries the standing constraints; read it first.
- Commit subjects are plain and imperative, under 72 characters, naming
  what changed. Reasoning goes in the body.

## Changesets

Any change under `packages/` ships with a changeset in `.changeset/`:

```md
---
"lucet-core": minor
"lucet-react": minor
---

One paragraph of changelog text: what changed and why it matters.
```

`lucet-core` and `lucet-react` are a fixed group and always move together,
so name both. Use `minor` for anything visible or new in the API and
`patch` for a fix that changes no contract. `npx changeset` writes the file
interactively if you prefer.

## Releases

Releases happen in GitHub Actions (`.github/workflows/release.yml`), never
from a laptop.

1. Push to `main` with changesets pending. The workflow opens or updates
   the **Version Packages** pull request: versions bumped, changelogs
   written. That PR is the release candidate; it keeps updating until it
   is merged.
2. Merge it. The same workflow checks the registry, runs `verify` in full,
   publishes `lucet-core` and then `lucet-react` with npm trusted publishing
   (OIDC and `--provenance`, no token anywhere), pushes the tags, and
   creates one GitHub Release for the pair, marked Latest.

Guards: a version the registry already has is never published; one of two
packages already published stops the job for a person to look; one release
runs at a time; `verify` must be green first.

When the Version Packages PR bumps a minor, review the README's Shipped
contents in that same PR. The number is never what needs updating — the
badges carry it live from the registry — the contents are.

Nobody runs `npm publish`, `changeset version` or `changeset publish`
locally.

### One-time setup on npmjs.com, once per package

npm has to be told to trust this workflow. Signed in as the package owner,
for **lucet-core** and then again for **lucet-react**:

1. Open the package's page on npmjs.com and choose **Settings**.
2. Under **Publishing access**, choose **Add a trusted publisher** and pick
   **GitHub Actions**.
3. Fill in the organization or user `I4NL4RS0N`, the repository `lucet`,
   and the workflow filename `release.yml`. Leave the environment blank.
4. Save.

There is no token to create or paste. Until this is done, the workflow's
publish step fails with these same instructions.

### Rehearsing the workflow

Copy `release.yml` to a throwaway branch, add that branch to its `on.push`
list, set `DRY_RUN: 'true'`, and add a throwaway changeset. The Version
Packages PR opens against the branch; merging it runs `verify`, stubs the
publish, and creates and then removes the tags and the Release. Delete the
branch afterwards.

## The README recording

The recording at the top of the README changes only when the flow it shows
becomes untrue; polish, timing and colour never trigger a re-cut or a
re-upload. Everything else in the README is committed like any other file.
