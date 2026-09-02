# lucet-react

## 0.1.2

### Patch Changes

- Raise the attachment chip's Retry and Remove hit regions to 28×28 with the two regions 4px apart, widen their focus ring offset to 2px, and dim the set-aside turn to 0.48 opacity — the smallest value at which its body text keeps 4.5:1 against the dark planes.
  - lucet-core@0.1.2
- Remove two orphaned lines left behind when the orb's breathe animation was taken out — the tail of a deleted `@keyframes` block that the CSS minifier warned about.
- Let narrow columns win over fixed minimums: the sources block caps its grid tracks at the column and lets the freshness note wrap once it has its own line, the code block's 16rem floor yields to a narrower column, attachment chips cap at their row, and the scope panel yields to the viewport. A phone-width thread no longer scrolls sideways.

## 0.1.1

### Patch Changes

- Five fixes from the first component audit. In a shared thread your own turns stay on the right with no avatar; only other people gain a face and a name, as the thread's own caption says. A code-only answer gets a width floor of 16rem, so a block measures the same while it streams and after it settles. The failed-attachment chip keeps Retry and Remove a spacing token apart with independent hit targets, draws the two glyphs to one optical size, and sets the reason as quiet metadata. Every dynamic figure — projected prices, token counts, elapsed time, source locations and freshness, scope counts — sets in tabular numerals through the one shared rule. The restore banner's commit action no longer asks for a 550 weight no loaded face ships.
  - lucet-core@0.1.1

## 0.1.0

### Minor Changes

- First real release. The core: an event-sourced store with a pure
  reducer, the scripted mock runtime, streaming, aborts, the tool
  lifecycle, versioning and restore-as-copy, scope, usage and budget
  projection, and the announcement plan for screen readers. The React
  package: the twelve baseline components with every state reachable,
  the token set with light/dark themes and the Paper/Glass material
  axis at identical geometry.

### Patch Changes

- Updated dependencies
  - lucet-core@0.1.0
