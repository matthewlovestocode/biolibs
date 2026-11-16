# Bionet labs: a design

Status: **proposal, nothing here is built.** Written 2026-11-15 from a design conversation. It records
what was decided, what follows from each decision, and the questions that were open and how each
was settled.

## Where things stand

`@biolibs/bionet` 1.1.0 lets a lab publish a signed list of parts at `/.well-known/bionet.json`, lets a
reader fetch and check one, walk from lab to lab through `peers`, remember which key answered at an
address, and match a plan's starting parts to labs by checksum.

Two example labs run it, each its own Next application at its own address: `lab-wren` and
`lab-thistle`. Each publishes an inventory and fetches the other's when its page is rendered. The
biolibs site walks from Wren and reaches both.

What exists is a demonstration. Each lab's inventory is a committed file, its key is made and thrown
away on every publish, and the pages are plain. This document is about turning a lab into a tool
people run a freezer with, and about the libraries that would be shared along the way.

## Decisions

| Question | Decision |
|---|---|
| What is a lab app? | A real tool for managing a freezer, not a notice board |
| Who signs? | A person at the lab, with their own key |
| Where does a lab's work happen? | Desktop apps (Electron), one per member, each with its own SQLite file |
| How do members' apps stay in step? | Work offline, sync when online |
| What is the web for? | The glue between labs: each lab's public address, and the walk between them |
| Peer to peer? | Complements address-bound labs, does not replace them |
| What is tracked? | Physical items with quantities; locations later |
| UI library styling? | Headless first, then MUI and Tailwind variants |

## A lab is its people

### Person keys

Each member has an Ed25519 key per device, the same kind `@biolibs/opencloning` already signs plans
with. In the desktop app it lives in the operating system's keychain and never leaves it.

- No server ever holds a signing key. Someone who breaks into a lab's server can withhold the
  inventory or serve an old one, but cannot forge a new one.
- Signing in and signing are the same act: holding a key the lab recognises is what allows editing.
- A lost key needs another member to vouch for a new one. A one-person lab that loses its key is a
  stranger again, so backup belongs in the first-run flow.

### The roster

People join and leave, so the keys behind a lab change routinely. Today a reader remembers one set of
keys per address and is warned when it changes, with no way to tell a new member from a break-in.

The roster is the list of keys that may speak for a lab. It is a chain of signed changes starting
from a founding key, and every addition or removal is signed by a keeper already on it (see
"Settled questions" for members and keepers). A reader's rule becomes:

1. A key I remember: accepted.
2. A new key endorsed by one I remember: accepted, and remembered.
3. A new key nobody I remember vouched for: the warning, which now means something.

Properties:

- **Self-certifying.** Anyone can check the chain end to end, so where it is hosted does not matter
  for integrity. No server is an authority; a second server is a mirror or a voucher.
- **Its own document**, separate from the inventory, because it also covers plans a member signs.
- **The lab's identity.** A lab is identified by its roster's founding entry. Web addresses are claims
  the roster makes and the address confirms by serving it. That works on the web and off it.
- **Bound both ways.** The inventory names its roster and the roster names the addresses it speaks for.
- **Travels with the inventory.** A published inventory carries the recent roster entries, so reading
  a lab never depends on a second server being up.
- **Default location** is the lab's own address beside the inventory; extra locations are allowed. An
  institution may host rosters for its labs and add its own endorsement, which readers can weigh.

## Inside a lab

### Local-first

Every member's app is complete on its own: it can edit, sign and queue changes with no network. Sync
is opportunistic, by whatever path exists: another member on the same network, another member over
the internet, or the lab's web app.

### Signed logs

- Each device key has **one append-only log of signed changes** (a member may have several
  devices). Nobody writes to another key's log, so logs never conflict.
- The lab's state is the **merge of all the logs**. SQLite is a view of that merge and can be
  rebuilt from the logs at any time.
- **Order comes from what each change had seen**, not from clocks. Each change records the earlier
  changes it knew of, so every app merges to the same result. Wall time stays a claim.
- The roster and the inventory are the same kind of structure, which is also the shape peer-to-peer
  sync wants.

### Parts and items

- A **part** is a molecule, named by checksum. This is what bionet knows today.
- An **item** is one physical tube or prep of a part: its own ID, amount, concentration, who made it
  and when.

Item IDs are random, because items are created offline and sequential numbers would collide. Random
IDs also suit printed labels later.

### Operations

Changes are operations, not snapshots. A first set:

| Operation | Notes |
|---|---|
| Add a part | By sequence; the checksum is computed |
| Add an item | Of a part, with a starting amount |
| Adjust an amount | A signed difference ("received 10", "used 1"); concurrent adjustments all count |
| Recount | States what is physically there; supersedes the adjustments it had seen |
| Set a field | Name, note, concentration; needs a rule for concurrent edits |
| Set availability | Whether a part is on offer to other labs |
| Retire an item | Kept in history |

If merged adjustments take an item below zero, the app flags it for a recount. The freezer is the
truth, and the software should say when it has lost track of it.

Locations come later as a field changed by "move" operations, so freezers, boxes and positions need
new operations but no new model.

The logs double as a history: who added, used, moved or recounted each item, with their signature.

## Between labs

### The web peer

Each lab keeps a web application at its address. It becomes a **peer without a key**:

- It receives signed changes like any member's app, checks them against the roster, and stores them.
- It forwards changes between members who are never online at the same time.
- It serves the public inventory and the roster at the well-known paths.
- It gives outsiders a read-only view.

It cannot sign, so it cannot forge.

### Public and private

The logs inside a lab hold everything. The published inventory is a reduced view: which parts the
lab has and whether they are on offer. Tube counts and people's names stay inside unless the lab
chooses otherwise. The split is part of the protocol, not a display choice.

The public inventory needs a person's signature. A member's app signs a fresh one whenever it syncs
with the web peer, and readers judge staleness from `published_at`.

### Transport and provenance

Two additions to `@biolibs/bionet`, needed before peer-to-peer and worth making first:

- **A transport interface.** HTTPS today; direct connections between apps later. `fetchInventory`
  already accepts an injected `fetch`, so part of the seam exists.
- **Provenance on every result.** "Served from its own address" and "received from a peer holding
  this key" are different claims, and anything that shows a lab must show which one it has.

Peer-to-peer would then add live updates, presence, labs with no web server, and signed requests for
parts.

## Libraries

| Package | Holds |
|---|---|
| `@biolibs/bionet` | The protocol: inventory, roster, signed logs, merge rules, transport interface, provenance |
| `@biolibs/bionet-react` | A framework-free client (cache, sync state, subscriptions), hooks over it, headless primitives |
| `@biolibs/bionet-mui` | MUI components over the hooks |
| `@biolibs/bionet-tailwind` | Tailwind components, copied into the consuming app so it owns them |

The hooks work in plain React and in Next. Storage (native SQLite, or SQLite in the browser) and
transport are swappable, so the Electron window and a web app run the same hooks.

The headless layer carries everything that is not appearance:

- State and behaviour.
- **The wording.** One function turns a trust state into the sentences shown, so every variant says
  the same true things about a changed key or a lab that did not answer.
- Accessibility: roles, labels, keyboard handling.
- Trust states as a typed union (settled, unsigned, wrong address, key changed, unreachable), so a UI
  cannot forget one.

Two families of hooks and components:

- **Network**: walking, lab cards, sourcing, trust states, the walk drawn as a graph.
- **Lab**: items, adjust and recount, history, roster, sync and conflict prompts.

The example labs are the test beds: Wren on MUI, Thistle on Tailwind. Rich UI is built in a lab first
and promoted to a library when a second consumer needs it. One variant is finished before the next
is started.

## The log entry

Settled 2026-11-15. It is built on how bionet already signs: canonical JSON, a domain string in front
of the bytes, and the signature carried beside the document.

```json
{
  "entry": {
    "bionet_log_version": 1,
    "lab": "9f2c…",
    "author": "base64url public key",
    "seq": 42,
    "prev": "id of this author's entry 41",
    "seen": { "another author's key": "id of their latest entry I had" },
    "op": { "type": "item.adjust", "item": "k3v9…", "by": -1 }
  },
  "signature": { "algorithm": "Ed25519", "public_key": "…", "signature": "…",
                 "signer": "Ada", "signed_at": "2026-11-15T21:04:00Z" }
}
```

| Field | Purpose |
|---|---|
| `lab` | The lab's ID, so an entry cannot be replayed into another lab |
| `author`, `seq`, `prev` | Chain each author's log; a gap or a mismatch is detectable |
| `seen` | What the author knew of others' logs, which gives the merge order. Only heads that changed since the author's last entry are listed |
| `op` | One operation |
| `signature` | The existing `DocumentSignature`, made under a new domain, `biolibs/bionet log entry v1` |

- **An entry's ID** is the SHA-256 of its canonical JSON.
- **The lab's ID** is the ID of the founding entry (`roster.found`, `seq` 0), the only entry whose
  `lab` is empty.
- **Time** is `signed_at`, and stays a claim.

### One key per device

A log belongs to a key, and a key belongs to a device, not a person. A person with a lab desktop and
a laptop would otherwise write two entries with the same `seq`, which is indistinguishable from
forgery. The roster lists several keys under one person's name. This also suits keys that never leave
a keychain.

### One log for roster and inventory

Roster changes and inventory changes go in the same log. A removal cutoff is then a `seq`, and the
order between "was added to the roster" and "made a change" is never in doubt.

### Accepting an entry

1. The signature holds and the key matches `author`.
2. `lab` matches, `seq` follows `prev`, and `prev` is the entry already held.
3. The author's key was on the roster at the point the entry was written, and the entry is not past
   a removal cutoff.
4. An unknown `op.type` is kept and chained but not applied, so older apps survive newer ones.

### Operations

| Operation | Carries |
|---|---|
| `roster.found` | The founder's name; makes the founder a keeper |
| `roster.add` | Key, person's name, role (member or keeper) |
| `roster.remove` | Key, and the cutoff `seq` in that key's log |
| `roster.role` | Key, new role |
| `part.add` | The sequence, whether it is a circle, a name. The lab needs the sequence to check the checksum and to use the part; the public inventory still publishes only the checksum |
| `part.offer` | Checksum, whether it is on offer to other labs |
| `item.add` | Item ID, part checksum, starting amount |
| `item.adjust` | Item ID, a signed difference |
| `item.recount` | Item ID, the amount physically there |
| `item.retire` | Item ID |
| `field.set` | What is being changed, which field, the new value |

### What building it settled

Found while writing `log.ts` and `merge.ts` (2026-11-15):

- **Amounts are whole numbers of the item's unit.** bionet's canonical form signs only whole
  numbers, because only they have one agreed spelling. It also means amounts add up exactly. A lab
  that needs finer than its unit counts in a smaller one.
- **`roster.found` carries the lab's name as well as the founder's.**
- **A removed key stays removed.** It cannot be added again; the person gets a new device key.
- **A part is not on offer until a member says so**, and is listed publicly only while some item of
  it has anything left. The only note that leaves the lab is `public_note`.
- **A lab cannot be left without a keeper.** The change that would do it is refused.

### The tiebreak

When two edits truly overlap, the one with the lower entry ID wins. It is the same in every app and
nobody can choose it in advance. Between keepers, seniority decides first and entry ID second.

## Settled questions

These were open when this document was first written and were closed on 2026-11-15.

### Removal while offline: a removal names a cutoff

The roster entry that removes a member states the last entry of that member's log the lab accepts.
Every app rejects everything after it.

- A removed person cannot slip changes in later by claiming not to have seen the removal.
- Honest work done offline after the cutoff is shown to the remaining members as **set aside**. Any
  member can re-apply it under their own signature.
- If two keepers remove the same person with different cutoffs, the earlier cutoff wins.

### Who may change the roster: members and keepers

- A **member** may change the inventory.
- A **keeper** may also change the roster. The founder is the first keeper and can appoint others.
- If two keepers make conflicting roster changes while offline, the one who has been a keeper longer
  wins.
- The app encourages every lab to have a second keeper, as the cover for a lost key.

### Concurrent edits to a field: the later change wins, and nothing is hidden

When one edit had seen the other, the later one wins. When two edits truly overlap, a fixed tiebreak
picks one, and the history shows both with a note that they happened at the same time. There is no
blocking prompt.

### Sync: our own log format, an existing library only for connecting

- Logs are JSON entries signed the way bionet already signs, synced by "send me what I do not have".
- Hyperswarm can find and connect the desktop apps directly. It carries the logs and does not define
  them, and it is optional: see the trial below.
- The reason: the web peer and browsers must verify logs too, and adopting Hypercore's format would
  tie all of them to it.

### Log growth: deferred, with the operation reserved

A lab making 50 changes a day produces about 18,000 entries a year, a few megabytes. A keeper-signed
checkpoint can be added later without changing the model.

### Distribution: deferred until the first slice works

The app runs from source until then. macOS comes first when it is time, which needs an Apple
developer account for notarisation.

### Browser light client: deferred

The web peer's read-only view covers people without the app. SQLite in the browser works, but
browsers can delete site storage, so it could only ever be a working copy. Revisit once the desktop
app exists.

## Trial: Hyperswarm inside Electron

Run 2026-11-15 with Electron 45.3.2 and Hyperswarm 4.17.2 on macOS (arm64). The trial is in
`~/bio/bionet-electron-trial`, outside this repository, and is meant to be thrown away.

**What was shown**

- Hyperswarm and its native modules (`udx-native`, `sodium-native`) load in Electron's main process
  with no rebuild step.
- Two Electron instances joined a topic derived from a lab ID, found each other, opened an encrypted
  stream, and each received 200 entry-sized messages from the other, in order. Finding the peer took
  about ten seconds.

**What was not shown**

That result used a private DHT of three nodes started on the same machine. Over the public DHT the
trial failed: Hyperswarm's three default bootstrap servers did not answer from this network, while
ordinary UDP (STUN) and one unrelated public DHT did. Whether that was those servers or the route to
them could not be told from here. Connecting across the internet, through home routers, is therefore
still untested.

**What it changes**

1. **HTTPS to the lab's web peer is the baseline sync path.** It must be enough on its own. Many lab
   networks restrict UDP, and this trial failed on an ordinary home connection.
2. **Direct connections between apps are an optimisation**, used when they work and never required.
3. **A lab must not depend on somebody else's bootstrap servers.** If the DHT is used, bionet or the
   lab runs its own bootstrap node. Render's free web services do not accept inbound UDP, so that
   node needs a different host.
4. **Same-network discovery deserves its own look.** Members in one room should find each other
   without any server; local discovery (mDNS) is the candidate and was not tested.

## Transport for the first slice

Decided 2026-11-15: **the first slice syncs only through the lab's web peer, over WebSocket.** It
deploys on what the labs already run, works on networks that drop UDP, and is the path that has to
work anyway. Direct connections between apps come after.

For that later step, the candidates are:

| Option | Needs | Notes |
|---|---|---|
| libp2p | A WebSocket relay, which Render can host | Runs in Electron and browsers, finds same-network peers by mDNS, can upgrade a relayed connection to a direct one. Large and often-changing. The next thing to trial |
| Hyperswarm | Our own bootstrap node on a host that accepts UDP | Proven inside Electron over a private DHT. Never reaches a browser |
| Reticulum | A Python daemon beside each app | Built for radio and mesh links. A later transport for off-grid labs |

## Still to do before code

Nothing blocks the first slice. Two things remain for the step after it:

1. **Trial libp2p**: two Electron instances finding each other by mDNS on one network, and through a
   relay on Render across networks.
2. **Repeat the public-DHT Hyperswarm trial from another network**, to learn whether its failure was
   this network or the bootstrap servers.

## Progress

**Built, released and deployed (2026-11-15):**

- `@biolibs/bionet` 1.2.0, on npm: `log.ts`, `merge.ts`, `sync.ts`, with 51 new tests; the workspace
  passes (19,115).
- `lab-wren`: the web peer. `server.mjs` hosts Next and a `/sync` WebSocket; entries are kept in an
  append-only file; the inventory a member publishes is served at the well-known path in place of
  the committed example. `npm run try-peer` runs it end to end with two devices and a stranger.
  Deployed at `wss://lab-wren.onrender.com/sync`. No lab ID is set there yet, so it turns every
  connection away and the lab still serves its committed example.

**Settled while building the peer:**

- **Reading needs proof of membership; writing does not.** The peer challenges with a random number,
  the member signs it under `biolibs/bionet peer hello v1`, and entries are sent only to a key on the
  roster. Anybody may push, and nothing is kept from a key the roster has never heard of.
- **A peer that holds nothing knows no members**, so a first sync pushes before it says hello.
- **The peer serves one configured lab** and accepts nothing until its ID is set. Otherwise whoever
  connected first could found the lab.
- **The peer's storage is a cache.** Members hold the whole log and resend it.
- **The peer publishes an inventory only if** a key on the roster signed it, it names the peer's own
  address, and it is newer than the one it replaces.
- **Connected members are sent changes as the peer keeps them**, so two open apps stay in step.

- `bionet-desktop` (`~/bio/bionet-desktop`, not yet committed): the desktop app. Electron 45 with no
  native modules: SQLite and WebSocket are the ones built into its Node, and the device key is sealed
  by the operating system's keychain. The core is plain Node with no Electron in it, tested as two
  devices against the real web peer (`npm run try-core`, 22 checks). `npm run try-app` runs the real
  app as two devices and photographs each step.

**The first slice is complete, run locally:** two devices each with their own key; one founds the
roster and adds the other; both work offline; they converge through the web peer; one publishes, and
the peer serves the signed inventory.

**Settled while building the app:**

- **A change is tried before it is written.** A log is forever, so the app merges a change against
  the lab first and refuses it, with the reason, if the lab would.
- **Joining is two messages.** The new member sends their device's key; a keeper adds it and sends
  back an invitation, which is the peer's address and the lab's ID.
- **The app refuses a sequence in letters that are not bases.** The library underneath accepts any
  letters. This check is in the app, not in `mergeLog`; it should move there.
- **Publishing keeps the pointers already published.** There is no operation yet for a lab to choose
  which labs it points at.
- **The public address is derived from the peer's address**, and can be set separately.

**Found while building the app:**

- After going offline, the link went on writing new entries into the closed connection and counted
  them as delivered. It recovered on reconnecting, but the count of unsent changes was wrong. Fixed:
  an entry counts as sent only over an open connection.

**Not done:**

- Founding the real Wren Lab and setting its ID (`BIONET_LAB`) on the deployed peer.
- Removing a member from the app; editing fields; locations; choosing pointers.
- The UI libraries. The app's interface is its own for now, to be promoted once a second consumer
  needs it.
- The roster as a published document for outside readers. Readers still remember keys per address.
- `lab-thistle` has no peer yet.
- A removed member who is still connected keeps receiving entries until they reconnect.
- Installers, signing and updates.

## A first slice

Two instances of the desktop app for the Wren Lab:

1. Each has its own key; one founds the roster and adds the other.
2. Both go offline and edit: add an item, use some of it.
3. They come back online and converge on the same state.
4. They do so through `lab-wren` on the web, over WebSocket: each sends what the web peer lacks and
   receives what it lacks. The web peer publishes the signed inventory.
5. Thistle's page and the biolibs site see the change.

That exercises person keys, the roster, signed logs, merging, the keyless web peer and the public
view, with the smallest amount of UI. Removing a member with a cutoff is the natural second slice.
