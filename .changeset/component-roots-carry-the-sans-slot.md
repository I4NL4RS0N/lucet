---
'lucet-core': minor
'lucet-react': minor
---

Component roots carry the sans typeface slot

Nothing in the shipped CSS ever read `--lucet-font-sans`. The tokens
existed and `data-typeface` switched them, the mono and prose rules
read theirs, but the sans slot was inert outside the docs site, which
sets the face on an ancestor the components inherited. A project that
installed the packages and followed the README exactly rendered every
component in the browser's default serif.

Every component root now names the slot. A host that wants its own face
sets the token — `--lucet-font-sans: "Söhne", sans-serif`, or
`--lucet-font-sans: inherit` to keep borrowing the host's — which is a
change for anyone who was relying on that inheritance, hence a minor.
