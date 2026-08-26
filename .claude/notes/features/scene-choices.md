# Scene choices - slots, candidates, and who decided

_Written 2026-08-18, against `version/0.6`._

An agent that silently picks assets produces a scene whose choices cannot be argued with.
So a meaningful decision in a scene is not a value - it is a **slot** with **candidates**,
and the user resolves it. `SceneDocument.Slots`, four MCP tools, four REST endpoints, and
the editor's Choices panel.

## The model, and the three things it is easy to get wrong

- **A slot is one node.** At most one node carries any given `slotId`
  (`DuplicateSlotNode`); the alternatives live in the slot's `Candidates`, not as extra
  nodes. `SceneNode.SlotId` was originally written expecting the opposite - one node per
  alternative, grouped by a shared id - and several nodes per slot would stand every
  rejected option in the scene at once.
- **Candidate ids are allocated by the server and never reused.** `A`..`Z`, `AA`, `AB`.
  The next id is the first the slot has _never_ held, rejected ones included. Numbering
  from the candidate count would hand a new proposal the id of one the user just turned
  down, and "I don't like B" would mean two different assets in two turns of one
  conversation. Ids exist to be spoken; that is the whole requirement.
- **Slot status is derived, not stored.** `proposed` / `chosen` / `rejected` is read off
  the candidates and `ChosenCandidateId`. A stored status is a second statement about the
  same facts, and the two drift into a document that says `chosen` with nothing chosen.

## Removing a node removes its slot - and that is not the anchor rule

An orphaned slot fails document validation (`SlotNodeMissing`), and a document is
validated **in full on every write** - so a slot left behind after its node was deleted
would refuse _every later write to that scene_, citing a node the user had already
deleted. Shipped as a defect in the first cut; caught before merge.

`RemoveSceneNodeCommand` therefore cascades the slot, and returns it
(`RemovedSlot`) so `RestoreSceneNodeCommand` puts both back. This is deliberately the
**opposite** call to the one four lines above it, which _refuses_ to remove a node other
nodes rest on: an anchor cascade would delete other nodes nobody named, while a slot is
not a node at all - it is the open question about the one being deleted. The editor's
local `removeNode` does the same to the draft, or the next save is rejected.

## Contradictions the validator refuses to resolve

Each is a document stating two incompatible things about one decision. None is repaired,
because repairing one decides something only the user can:

`ChosenCandidateRejected` (picked and ruled out), `ChoiceWithoutResolver` (a decision with
no record of who made it), `ResolverWithoutChoice` (attribution with no decision behind
it - a scene claiming a human approved something no human saw).

## Attribution is a property of the endpoint, not the request

`resolve_slot` over MCP **always** writes `resolvedBy: "agent"`, whatever the agent was
told to do. `PUT /scenes/{id}/slots/{slotId}/choice` **always** writes `"user"` and does
not read it from the body - that endpoint is only reached by a person clicking. Taking it
from the request would make the one attribution the model exists to keep a caller-supplied
string.

## Two performance/correctness boundaries worth not re-deriving

- **Candidate assets are deliberately absent from `SceneViewBuilder.ReferencedAssets`.**
  That set is what `SceneWriter` verifies and resolves facts for on _every_ edit. Putting
  proposals in it would mean an asset recycled after being proposed blocks every later
  edit to the scene - including the one that rejects it. Proposals are verified in the
  propose handler instead, where the mistake is actually being made.
- **`get_slots` is a separate read from `get_scene`.** Resolving what the library knows
  about each candidate walks the part list of assets that are not in the scene; that is
  worth paying when someone opens the panel, not on every scene read.

## Rejections are feedback, not deletions

A rejected candidate keeps its id, its card and its reason. That is what the next round
reads back through `get_slots` before proposing again, and it is why a rejected candidate
**cannot be chosen** - accepting it would silently discard the feedback. The route back is
a fresh proposal, which correctly gets a new id.

An already-rejected candidate keeps its _original_ reason when a later blanket "none of
these" sweeps the slot: the first "no" is the one that says something specific.

## The panel must never be served from cache

`getSceneSlotsQueryOptions` and `getSceneByIdQueryOptions` set `staleTime: 0`, against the
app-wide five-minute default in `lib/react-query.ts`. That default assumes the user is the
only author, which is the one thing a scene is not: the agent writes over MCP, and the
whole review loop is the user looking at what it just wrote. No invalidation can cover it -
the write never passed through this client - and `refetchOnMount` does nothing while the
entry is still fresh.

For slots the default was worse than stale data. The panel renders `null` for a scene with
no slots (most scenes have none), so a cache entry captured when the scene was first opened
did not show old candidates - it showed **no choices panel at all**, and the decisions the
agent had just offered stayed invisible until the entry aged out.

Found by the three `06-scene-choices.feature` scenarios, which failed on
`[data-testid="scene-choices"]` never existing. They seed slots over the API and then
reopen the scene by clicking, so nothing invalidates anything - the scenarios in
`02-scene-authoring.feature` only pass because they save through the UI first, and that
mutation invalidates the whole `['scenes']` key. Worth remembering when writing any e2e
that seeds through `page.request`: an in-app "reopen" is not a reload, and the cache
outlives it.

See also [[shared-render-lib.md]] for what the Choices panel's preview shares with the
viewer - the preview is a client-side document swap, never a write, so looking at four
options does not move the scene's revision four times.

## Direct scene writes exclude each other - and the hold is the SCENE's

Slot writes (choose / reject / reopen / accept-all) and the project link all go straight
to the server carrying `baseRevision`, and each of them moves the revision when it lands.
Two in flight at once means whichever loses comes back as a conflict the user could not
have caused, so they are mutually exclusive in **both** directions - a link waits for a
pending slot write, and a slot write waits for a pending link.

Three things that were learned the hard way here:

- **Guard inside the handler, not only on the control.** The rejection form also submits
  on Enter, and that path never consulted `busy`. A disabled button is styling; the rule
  belongs to the write, so `submitRejection`, `onChoose`, `onReopen`, the accept-all
  confirm and `runSlotWrite` each check it themselves.
- **The hold is per-scene state, not component state.** The dock renders only the
  active tab, so glancing at another tab unmounts the editor - which used to throw the
  hold away. The remount believed nothing was in flight, over a draft seeded on a revision
  the server had already replaced. It lives in `sceneLinkHoldStore`, keyed by scene id,
  claimed in front of the request and settled by its own outcome.
- **`isPending` is a narrower window than the problem.** The slot writes were held only by
  it, and it goes false when the RESPONSE arrives - a detail refetch and a draft reseed
  before the draft is on the new revision. An edit in that gap dirtied the draft at N while
  the server was at N+1; the reseed was then skipped BECAUSE it was dirty, so no revision
  was left the draft could be saved against, and refusing the save afterwards is the
  symptom, permanently. Every direct write takes the same hold now.
- **An unresolved hold refuses the next claim rather than being overwritten.** `tryBegin`
  returns false when one is already open. Overwriting it replaced the record of an unknown
  outcome with a record of the new write, which is how "Retry link" after an ambiguous
  failure lost the fact that anybody was waiting to find out - while also resending a write
  that may have committed, carrying the project chosen before it.
- **A transport failure is not a refusal.** Releasing the hold on any rejected promise
  hands the editor back over a scene that may have moved: the server may have committed
  and the answer never arrived. Only a request the server *answered* and declined (4xx,
  excluding 408) releases; everything else - network error, timeout, 5xx, an unrecognised
  error - keeps the hold and turns it into a reconciliation. The same test decides what a
  UI may OFFER: scene creation's "Retry link" appears for a refusal and never for an
  unknown outcome, where the only move is to open the scene and reconcile it.

The release condition is deliberately made of comparisons against authoritative data and
nothing else: not fetching, not in error, the draft seeded on the loaded revision, the
loaded revision at or past the one the server reported, and the data fetched **after** the
write settled. The last clause is what a "did a refetch happen" flag could not express -
it has to be observed by a mounted component, and a link that does not move the revision
(re-picking the project a scene already has) is otherwise indistinguishable from a stale
cache entry. Nothing releases on a timer or on a lifecycle event, which is also why a
persistent hold cannot strand anybody: reopening the scene re-evaluates it against fresh
data and it ends the moment that data agrees.
