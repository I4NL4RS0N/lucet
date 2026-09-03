---
'lucet-core': patch
'lucet-react': patch
---

Fix the React package's smallest example so it compiles

The published example passed `value` to `LucetProvider`, whose prop is
`lucet`, and left out `onModelChange` and `onRemoveAttachment`, which
`PromptInput` requires. Copied verbatim into a fresh project it did not
typecheck. Found by installing the published packages into a disposable
project and following the README exactly.
