# Navigation in the Konfabulator

The sidebar, the collapsed rail, the chat-history panes and New thread,
audited as one system in component audit 08. None of it is a library
component: it is the host chrome of the demonstration app, and it is held
to the same bar as the components it frames.

## The contract

**Exactly one active thread, the live one.** The sidebar and both
Chat history panes (the drawer's and the phone's) carry one real row for
the current conversation, marked `aria-current="page"`, current by a
leading marker and its ink rather than colour alone, and titled from the
thread's first prompt on a whole word — the same words the phone bar
shows. An empty thread is called *New thread*. Choosing the row goes to
the conversation: the composer takes focus. Every other row is set
dressing by a standing decision (the conversations do not exist): hidden
from assistive technology, and honest to a pointer too — the hover veil
and the cursor make the shelf feel real, and *Not in this demo* on hover
tells the truth to anyone who lingers. Nothing switches threads, because
there is one.

**New thread is immediate when nothing is at stake.** The thread empties,
the act is spoken once (*New thread.*), and focus lands in the new
composer. Pressing it twice makes one thread and one announcement.

**New thread is blocked with an exit when it would discard something.**
Draft text, staged files or a queued message are unsent work; a response
still arriving — yours or another person's — is someone's answer. In
either case New thread does nothing destructive. A compact notice appears
by the composer, takes focus so its sentence is read, and offers two
ways out:

- *You have unsent work in this thread.* — **Keep writing** (the safe
  default; Escape chooses it and returns focus to the draft, selection
  intact) or **Discard and start new** (the destructive one, in danger
  ink, the quieter button).
- *Jennifer’s response is still arriving in this thread.* or *Your
  response is still arriving in this thread.* — **Stay here** (Escape;
  focus returns to the New thread control) or **Discard and start new**.

At a phone width the two actions wrap beneath the sentence, each whole,
and the notice never widens its column: the floor's column is the
floor's width and not a child's minimum content, so nothing in it can
push the composer past the frame.

It is a group, not a dialog: the composer stays usable behind it, and
the notice does not outlive its reason. Send the draft, cancel the
queue, let the response settle, and it leaves on its own; if it held
focus, focus returns to the control that raised it. From a Chat history
pane, New thread lands on the thread first so the notice is where the
composer is. If the control that raised the notice is hidden by the time
it closes (the sidebar folded meanwhile), focus goes to the composer
rather than to the page.

**A recorded limitation.** The runtime holds one thread and no
background thread state, so a response running in the previous thread
cannot be preserved across a new one here. The intended contract for a
host with real threads is to navigate and let the old thread finish
where it is; the notice is how this demo never erases a response in
silence. Silent abortion is not the contract.

## Menus

The drawer's and the phone's menus use the library's disclosure-menu
grammar, the one the budget meter and scope control already use: opening
lands focus on the current pane's row, ArrowDown and ArrowUp rove with
wrap, Home and End jump, Escape closes and returns focus to the trigger,
choosing a row closes and returns focus to the trigger, and a press
outside closes. Rows carry `aria-pressed` for the pane and presentation
they select.

## Collapse and expand

Hide moves focus to the floating toggle that takes its place; Show moves
it back to the sidebar's own toggle. Collapsed, the sidebar's controls are
untabbable; a 14px edge strip peeks it for a hovering pointer, and its own
control pins it. The active thread does not change. Under reduced motion
the slide is instant.

## Targets

| Control | Fine pointer | Coarse pointer |
|---|---|---|
| New thread (30px box) | 40px zone | 44px zone |
| Live thread row (32px) | 40px zone | 44px zone |
| Sidebar toggles (28px box) | 40px zone | 44px zone |
| Menu trigger (28px box) | 40px zone | 44px zone |
| Menu rows | 40px | 44px |
| Notice buttons (32px box) | 40px zone | 44px zone |

The phone's bar stands at 44px, the genre's own height, so its zones fit;
New thread's zone leans 4px inward from the bar's edge.

## Filed, not fixed

- Empty and long histories are not states this demo has: the dressing
  list is fixed.
- The Mobile container is a fixed 390px phone mock, accepted as is; at a
  narrower viewport the page scrolls sideways.
