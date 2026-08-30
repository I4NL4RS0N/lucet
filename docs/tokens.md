# Token API

Lucet declares 243 custom properties. Most of them are machinery.

This file says which ones you may rely on. It is not documentation written
after the fact: `scripts/token-api.test.mjs` parses this file and fails if a
token is listed here but absent from the CSS, or present in the CSS but listed
in neither section below. A new token cannot join the API by accident, and it
cannot stay unclassified.

**Public** tokens are a contract. They keep their names and their meanings, and
they follow semver.

**Internal** tokens are implementation. They can be renamed, retuned, or
deleted in a patch release. Read them if you are curious; do not build on them.

Two shorthands. A `*` is a family by prefix: `--lucet-text-*` covers
`--lucet-text-xs` through `--lucet-text-2xl`. A `#` is a family whose members
end in digits: `--lucet-space-#` covers `--lucet-space-0` through
`--lucet-space-16`, and deliberately does NOT cover `--lucet-space-base`.

In each entry, only the names BEFORE the em dash are claims. Names after it are
cross-references.

---

## Public

### Axis inputs — the knobs you set

- `--lucet-scale` — global size multiplier. Everything geometric derives from it.
- `--lucet-accent-h`, `--lucet-accent-c` — accent hue angle and peak chroma.
- `--lucet-accent-on-solid` — what goes on top of the accent solid.
- `--lucet-neutral-h`, `--lucet-neutral-c` — grey hue and chroma. Chroma 0 is the default, and is genuinely zero.
- `--lucet-radius-base` — the one number the radius roles derive from.
- `--lucet-radius-override` — set to force a radius independent of expression.
- `--lucet-font-sans`, `--lucet-font-mono`, `--lucet-font-prose` — the typeface slots.

### Semantic surface

These are the shadcn interop layer. Each reads `var(--x, our-default)`, so
setting the bare shadcn name works without knowing Lucet exists.

- `--lucet-background`, `--lucet-foreground`
- `--lucet-card`, `--lucet-card-foreground`
- `--lucet-popover`, `--lucet-popover-foreground`
- `--lucet-solid`, `--lucet-solid-hover`, `--lucet-solid-foreground` — NEUTRAL emphasis, and the default for anything that must be the strongest thing on screen. Near-black on light, near-white on dark.
- `--lucet-primary`, `--lucet-primary-foreground`, `--lucet-primary-hover` — the ACCENT role. Equal to the neutral solid until a consumer sets an accent, at which point primary carries the colour and solid does not.
- `--lucet-secondary`, `--lucet-secondary-foreground`
- `--lucet-muted`, `--lucet-muted-foreground`
- `--lucet-subtle`, `--lucet-subtle-foreground`
- `--lucet-border`, `--lucet-input`, `--lucet-ring`
- `--lucet-hover`, `--lucet-hover-strong`
- `--lucet-accent-ink` — accent as TEXT. Step 12, because that is the step that clears 4.5:1 for every accent in both themes.

### Geometry

- `--lucet-space-#` — the spacing scale.
- `--lucet-text-*` — the type scale: 11 / 14 / 16 / 18 / 22 / 28.
- `--lucet-radius-control`, `--lucet-radius-surface`, `--lucet-radius-panel` — the radius ROLES. Prefer these to the raw sizes.
- `--lucet-radius-sm`, `--lucet-radius-md`, `--lucet-radius-lg`, `--lucet-radius-xl`, `--lucet-radius-full` — raw sizes.
- `--lucet-control-height`, `--lucet-control-height-sm`, `--lucet-control-height-md`, `--lucet-control-height-lg`
- `--lucet-control-pad-x`, `--lucet-control-inset`
- `--lucet-border-width`, `--lucet-focus-width`, `--lucet-focus-offset`

Anything sitting in a row with a button — a select, a segment, an input — takes
`--lucet-control-height` and `--lucet-radius-control`. That is what keeps a row
reading as one row.

### Type

- `--lucet-leading-tight`, `--lucet-leading-normal`, `--lucet-leading-prose`
- `--lucet-tracking-tight`, `--lucet-tracking-normal`, `--lucet-tracking-wide`

### Motion

- `--lucet-duration-instant`, `--lucet-duration-fast`, `--lucet-duration-normal`, `--lucet-duration-slow`
- `--lucet-ease-out`, `--lucet-ease-in-out`

These collapse to zero under `prefers-reduced-motion`. They are declared in
`motion.css`, which is imported last, because an earlier file re-declaring a
duration silently defeated that.

### Materials

Pick one. Do not assemble your own shadow stack — that is how the components
drifted apart in the first place.

- `--lucet-material-flat` — content sitting ON a surface. A line only.
- `--lucet-material-control` — anything you press.
- `--lucet-material-raised` — surfaces floating above the ground.
- `--lucet-material-overlay` — surfaces above those.
- `--lucet-material-pressed` — the pressed state of a control.
- `--lucet-material-inset` — a field. Inset where a control is raised.

### Tones and states

- `--lucet-tone-*` — a `surface`, `foreground` and `border` triple plus an `h` and `c` for each of `neutral`, `info`, `caution`, `danger`, `unknown`, `success`.
- `--lucet-state-*` — the same triple, one per named state.

Severity maps to loudness. `info` is the quietest tone, because it is the one
that means no action is needed.

---

## Internal

Do not build on these.

- `--lucet-al-#`, `--lucet-ac-#` — the lightness and chroma curves the accent scale is generated from.
- `--lucet-accent-#` (steps 1–12) — generated from those curves. Use the named roles instead: `--lucet-primary` to fill, `--lucet-ring` to ring, `--lucet-accent-ink` to write with. If you need a step for a job with no name, that is a missing role — ask for it rather than reaching past the API.
- `--lucet-neutral-#` — the raw grey ramp.
- `--lucet-default-*` — the pre-interop fallbacks. Every one is already reachable through its public alias.
- `--lucet-surface-ground`, `--lucet-surface-raised`, `--lucet-surface-overlay`, `--lucet-surface-sunken` — feed the semantic layer.
- `--lucet-edge-top`, `--lucet-edge-bottom`, `--lucet-hairline`, `--lucet-hairline-raised`, `--lucet-hairline-overlay`, `--lucet-shade-#`, `--lucet-inset-hair`, `--lucet-inset-shallow`, `--lucet-inset-deep`, `--lucet-gloss` — the primitives the materials are built from. The ring family ramps with elevation and the inset family is chosen by the size of the recess; both are assembled for you by the four materials.
- `--lucet-shadow-color`, `--lucet-shadow-alpha`, `--lucet-primary-glow`
- `--lucet-space-base`, `--lucet-space-unit` — the spacing scale's own arithmetic.
- `--lucet-radius-root`, `--lucet-radius-control-inner` — derived; the nested-radius rule computes them.
- `--lucet-font-system`, `--lucet-font-mono-system` — the fallback stacks behind the typeface slots.
- `--lucet-line` — the raw line colour behind `--lucet-border`.
