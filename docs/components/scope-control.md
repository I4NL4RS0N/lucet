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
  moving underneath the conversation. With nothing typed, `scope/moved`
  reconfigures the ladder, the selection follows (keeping the person's
  chosen rung when it still exists), and a note in the info ink renders
  on its own line under the composer bar until the person acts on scope
  — because a scope that silently tracks a moving page is a guess again.
  The note is `role="status"`: the reader hears the ground shift too.
  With a draft in the field the move is held and the control asks
  instead (the scope-freeze rule, below). In the Konfabulator the host's
  page tabs are real navigation, so the whole loop is live: click Page 2,
  watch the breadcrumb, the ladder, and the note all move together.
- **The toggle is the config.** No levels, no control. The full page
  and the phone are hosts without a scope feature today, and they
  render nothing — the same law as suggestions.
- **Host configuration survives a new thread.** Reset keeps the ladder
  (the page is still under you) and clears the moved note (a new
  thread is an act on scope).

## Two freezes (2026-09-02)

The control is frozen in two situations, for two different reasons.

- **While a turn is in flight** the control is disabled with the rest of
  the composer's bar: the answer being written was asked against a scope,
  and changing it mid-turn would misdescribe what is arriving.
- **While a draft is in the field, when the page changes underneath.**
  With nothing typed, navigation may update "This page" and the note
  says so. With words already written, the page they were written
  against may not be swapped under them — that is a silent change of
  meaning — so `scope/moved` is held in the reducer (`scope.pending`)
  and the control asks, in place of the note: *Page changed — update
  scope?* with **Use new page** (`scope/updateAccepted`: the ladder and
  the note update) and **Keep previous page** (`scope/updateDeclined`:
  the ladder stays, the draft untouched). Picking a rung settles a held
  move the same way acting on scope settles the note; a new thread
  applies it, because the draft is gone with the thread. The rule lives
  in the reducer, so a host's own navigation gets it for free — the
  Konfabulator's drawer page tabs included. Both paths are tested in the
  runtime and walked by the states audit in the drawer.

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

`scope-ladder`, "Use the current page as context" (install, read the
scope, answer within it — the tool receipt shows `"scope": "page"`),
and `scope-moved`, "Scope updates after navigation" (the page changes
after settle; the ladder follows and the note says so; then, with a
draft in the field, a second change is held and the control asks) — the
SCOPE group on the Features tab, and the drawer's page tabs demo the
loop by hand.

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

## Component audit 04 (2026-09-03)

Scope and navigation as one family — the trigger, the ladder, the follow
and the hold — measured in four cells at 1440 and 320, through the
drawer's own page tabs. The brief's three findings and five of the
audit's own, plus two rulings on copy.

- **The decision names both pages.** "Use new page / Keep previous page"
  asked the person to remember which two pages those were, and on a
  phone the app does not show both. Rungs may now carry a `name` — the
  referent behind a deictic label, "Reports review" behind "This page" —
  and the move carries the destination's `pageName`. The control asks
  *Page changed to Vendor call. Update scope?* and offers **Keep Reports
  review** and **Use Vendor call**. Keeping is primary: a draft in the
  field is evidence the previous context was meant, so preserving it is
  the safe way, and the riskier way is secondary. Message on its own
  row, the two ways together below it, equal widths while both names fit;
  a long name wraps them into two full-width rows rather than shrinking
  the type or orphaning the second.
- **"This page" only while it is the page on screen.** With the page
  beneath already changed, "This page" pointed at the wrong one while Send
  stayed live — while a move was held, and again after the previous page
  was kept. The state now carries the host's current `pageName` from the
  last move, and the chip names the scope's own page — *Quarterly
  planning* — whenever that page is not the one on screen, until the two
  agree again. Send stays available: the draft is bound to the scope it
  was written for, and the chip says which. (Found on the deployed round,
  not in the capture: the capture read the chip while held, not after
  Keep.)
- **Only a changed boundary is news.** Navigating with *All of Aquilo*
  selected changed nothing the AI may read, yet a draft in the field
  raised the decision anyway. The reducer now compares the selected rung
  across the two ladders — name, summary, count — and when it reads the
  same, the ladder updates quietly: no note, no decision. The page rung
  and a section that changes still follow or hold as before.
- **Focus and caret come home.** After either choice the controls
  unmounted and focus fell to body. The composer now returns focus to the
  field with the selection it had, because the draft is what the
  decision was about.
- **Both outcomes are said.** Automatic follow: *Scope updated to Reports
  review.* Explicit switch: *Scope updated to Vendor call.* Explicit keep:
  *Scope remains on Reports review.* — the last composed by the reducer,
  where the kept rung is known. The note stays until the person acts on
  scope again: it is the provenance of the current scope, not a toast.
- **A fresh send lets a held move apply.** The words went against the
  scope they were written for; with the field empty the ground may
  follow, and the note says so. A retry sends older words, leaves the
  draft, and leaves the hold.
- **The disabled trigger is inert** for the keyboard too, and says so —
  the budget trigger's repair, applied here.
- **The counts form a column.** The pill sat beside its label, 142px
  ragged across one to four digits. It trails now, right-aligned and
  tabular, with the check in a slot reserved on every row.
- **The host names its boundary.** *Everything* is gone from the ladder:
  the widest rung is *All of Aquilo — every plan, report and directory in
  Aquilo*, because the boundary is the host, not the internet. The
  drawer's frame title follows the page, and the entry point is *Ask AI
  about Reports review* to assistive technology.

Escape while a decision is open does nothing to it: the decision is not
a modal, and dismissing it would pick one answer silently. Considered and
kept: the compact label *This page* in the drawer, where the page it
names is visible beside it (the floating drawer keeps the page in view
too); automatic follow with an empty field, because a confirmation on
every navigation turns browsing into paperwork; the note that persists
until the next act on scope. Not built, filed as product decisions for
Ian: scope-keyed Ask and Do suggestions (the chip contract is static per
thread), per-turn scope provenance (turns record no scope today), a
full-page context bar and a mobile bottom sheet (the full page and the
phone are hosts without a scope feature), and section-level rungs (the
ladder is the host's; it may publish any rungs it has).
