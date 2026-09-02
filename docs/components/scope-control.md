# Scope Control

User-controlled context: the breadcrumb is the ladder.

## The positions

- **The breadcrumb is the ladder.** Every product in this category
  guesses what "this" means, builds retrieval invisibly, and hopes. But
  the host already published its context hierarchy — home, section,
  page, record. The control renders the host's own rungs
  (`ScopeLevel { id, label, summary, itemCount }`), defaulting to the
  page, widened deliberately. Wrong answers are usually wrong context,
  not a wrong model — this is a trust feature wearing a picker.
- **Show what is in scope.** Every rung carries its contents in words
  and a count. A picker without contents is a guess wearing a control;
  the summary line is the trust half, not decoration.
- **The page moves, and the scope says so.** In a drawer the page keeps
  moving underneath the conversation. `scope/moved` reconfigures the
  ladder, the selection follows (keeping the person's chosen rung when
  it still exists), and a note in the info ink renders on its own line
  under the composer bar until the person acts on scope — because a
  scope that silently tracks a moving page is a guess again. The note
  is `role="status"`: the reader hears the ground shift too. In the
  Konfabulator the host's page tabs are real navigation, so the whole
  loop is live: click Page 2, watch the breadcrumb, the ladder, and the
  note all move together.
- **The toggle is the config.** No levels, no control. The full page
  and the phone are hosts without a scope feature today, and they
  render nothing — the same law as suggestions.
- **Host configuration survives a new thread.** Reset keeps the ladder
  (the page is still under you) and clears the moved note (a new
  thread is an act on scope).

## What is deliberately not here yet

- **English copy is hardcoded** — the aria-label prefix and the moved-note framing. A labels escape hatch is
  deferred until a real host shows which strings it must own;
  freezing a copy API speculatively would freeze the wrong one.
- ~~Full menu keyboard grammar~~ — delivered via the shared
  disclosure-menu hook (`useMenuGrammar`, shared with the Budget
  Meter): open focuses the pressed row, arrows rove with wrap,
  Home/End jump, Escape returns focus to the trigger, an outside
  click closes. Asserted with real key events in the state audit.
  Typeahead stays deferred.
- **Multi-select scopes** ("this page and the appendix") — the contract
  is single-rung until a real host proves the need.
- **Live re-counting while open** — counts arrive with the ladder; a
  host streaming count updates would use `scope/configured`.

## The scenarios

`scope-ladder` (install, read the scope, answer within it — the tool
receipt shows `"scope": "page"`) and `scope-moved` (the page changes
after settle; the ladder follows and the note says so) — the SCOPE
group on the Features tab, and the drawer's page tabs demo the loop by
hand.

## Floating surface — stacking decision (2026-09-01)

In-tree by design. The panel anchors inside the composer's own
stacking context and always wins within the component; nothing the
library renders can occlude it. What CAN occlude it is a host whose
own chrome floats above the composer at a higher layer — that is the
host's z-ladder to manage, and the honest fix on the host side is
the top layer, not a bigger number. The docs site's chrome popovers
use the native Popover API for exactly this reason. An opt-in
top-layer mode for this surface (Popover API, keeping the current
anchoring as fallback) is filed for 0.2. The states audit probes
this surface open, in all four theme-and-expression cells, and fails
on any occlusion.
