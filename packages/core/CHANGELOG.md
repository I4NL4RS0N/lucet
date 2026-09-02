# lucet-core

## 0.1.3

### Patch Changes

- A control labelled Restore must restore. The older version's action is now **Preview version**, with a tip that says nothing changes until you restore; the preview banner pairs a ghost **Return to latest** with a primary **Restore version** that commits in one click. The pair wears the library's own button grammar, so the hierarchy is a fill against none rather than hue; labels never wrap, and at drawer width the pair takes its own row. The announce layer says "Previewing an earlier version" for the first stage. The attachment chip's 28×28 hit regions are settled by hit test in the states audit.

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- First real release. The core: an event-sourced store with a pure
  reducer, the scripted mock runtime, streaming, aborts, the tool
  lifecycle, versioning and restore-as-copy, scope, usage and budget
  projection, and the announcement plan for screen readers. The React
  package: the twelve baseline components with every state reachable,
  the token set with light/dark themes and the Paper/Glass material
  axis at identical geometry.
