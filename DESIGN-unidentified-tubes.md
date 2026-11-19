# A tube you have not sequenced

A design note, written 18 November 2026 out of the vegan cheese work.

**Built on 18 November.** The design below is as written; two things it did not anticipate came
out of building it, both now fixed:

- The client snapshot copied `parts`, `strains`, `items`, `places`, `runs` and `plans` across to a
  window, but not `specimens` — so the protocol modelled them, the client could write them, and no
  part of the app could ever see one. Added, with the type.
- A published method carried the specimen's own name into the document, which is a private note on
  a tube ("pET from the back of the -80") going out to strangers, and tells another lab nothing. A
  method now says only "something the publishing lab had not identified".

Committed and pushed as `6be3e2f`, and **published** later the same day in `@biolibs/bionet` 1.8.4,
`@biolibs/bionet-client` 0.2.10 and `@biolibs/bionet-panels` 0.3.11. The open question of whether two
new op types deserve a minor rather than a patch was settled as a patch: nothing existing changes
meaning, and an older reader refuses the new entries cleanly, which is what the version number is
there to promise.

**Documented 19 November** in the `@biolibs/bionet` readme, which had never mentioned specimens at
all — see "A tube nobody has sequenced" there, with an example that runs as a test.

Compatibility was checked against the published 1.8.3 rather than assumed: given a log that uses
specimens, it marks the two new op types "this version does not know that kind of change", marks
the item carrying `specimen` as carrying an unknown field, and applies everything else — 4 applied,
3 not understood, nothing invented.

## The problem, concretely

A lab takes the casein method. It reports fourteen molecules missing, including pJTFlag and
pPIC9K. But that lab almost certainly has pET vectors and Pichia strains in a −80 already. It
cannot say so, because of two rules that meet badly:

- a part is identified **by the checksum of its sequence**, so a part without a sequence cannot exist;
- an item is **of a part or a culture of a strain**, and nothing else.

So the model can only describe a lab that already knows everything it holds. No real freezer is
like that, and the gap is worst at exactly the moment a lab first tries to use any of this.

The second half is just as bad: `sequencing` here means *compare a read against a design*. There
is no way to express "find out what this is", which is the run that would resolve it.

## The shape of the answer

A culture is already a thing that is physically real, lab-local, and has no checksum — and the
model handles it. `item.add` takes `part` **or** `strain`; `whatIsIn` returns `{ part: null, …,
alive }` for a culture; a method describes such an input and says it cannot travel.

An unsequenced tube is the same shape of problem. So it should get the same shape of answer rather
than a new mechanism: a third thing an item can be of.

Call it a **specimen**: something the lab physically has and cannot yet name.

## The changes

Four, all new op types or new values, so an older reader refuses cleanly and keeps reading.

**`specimen.add`** — `{ specimen, name, note? }`. A thing in the freezer. `name` is what the lab
would write on the tube ("pET from the back of the −80"), not a claim about identity.

**`item.add`** gains `specimen` as a third alternative to `part` and `strain`. This is a new field
on an existing op, so an older reader marks that entry *not understood* and skips it. That is the
correct outcome: a version that cannot represent an unidentified tube should not pretend to.

**`specimen.identify`** — `{ specimen, part }`. Says what it turned out to be. The part must already
exist, like a plan's inputs. After this, items of the specimen read as items of that part, and the
tube keeps its place, its amount and its history. The physical tube never changed; what changed is
what is known about it, and the log should say exactly that.

**A run kind, `identification`.** Run kinds are free text (`text(op["kind"], 40)`), so this costs
nothing in compatibility. Unlike `sequencing` it compares against nothing: it consumes some of the
tube and produces a sequence that the lab then adds as a part.

## The lifecycle

```
specimen.add        "pET from the back of the −80"
item.add            a tube of it, 30 µL, in box 3
run.record          an identification, using 5 µL of that tube
part.add            the sequence that came back
specimen.identify   the specimen was that part
```

Five ops, each meaning one thing, each independently refusable.

## What it does to the rest

**Plans.** A specimen cannot satisfy a plan input, which wants a checksum. Correct, and useful:
the work panel can then say *you have six unidentified tubes and are missing fourteen molecules* —
which is the prompt a real lab actually needs. It must not guess which is which.

**Methods.** A specimen never travels, for the same reason a strain never does: it is this lab's
own tube. The existing `alive` path is the precedent, and the wording already exists for it.

**`takeMethod`.** Unchanged in behaviour, better in usefulness: still reports what is missing, and
the lab can now answer *perhaps I have that, let me look*.

## What this deliberately does not do

- **No guessing.** A specimen is never matched to a part by name, size or belief. Only an
  identification run resolves it.
- **No partial identity.** A read that resolves nothing leaves the specimen unidentified. Notes can
  record what was learned; the identity stays absent.
- **No sequence-free parts.** The checksum stays the identity of a part. This change exists
  precisely so that rule does not have to bend.

## Open questions

1. Should `specimen.identify` be reversible — a later read showing the first was wrong? Append-only
   suggests a second identify wins, as fields do. Worth deciding rather than discovering.
2. Should a specimen carry what the lab *believes* it is? Useful for "probably pET-21a", dangerous
   if anything downstream reads it as fact. Leaning towards a note, with nothing machine-readable.
3. A tube split before identification — two items, one specimen — probably already works, but
   should be tested rather than assumed.
