# @biolibs/seqedit

Editing a `SeqRecord` while keeping its features true. Biopython can slice a record and add records together, but both are lossy for an editor: `record[a:b]` keeps only the features wholly inside the slice and drops the rest, and there is no operation for "replace these bases and move the annotations". This package supplies that.

**Verified against Biopython 1.88 on 62 cases** (`packages/seqedit/test/golden/seqedit.json`, built by `reference/golden/gen_seqedit_cases.py`) at the three places the two overlap:

| Biopython | biolibs |
|---|---|
| `record[a:b]` | `extractRegion(record, a, b, { edgeFeatures: "drop" })` |
| `record.reverse_complement(...)` | `reverseComplementRecord(record)` |
| `location + offset` | `shiftLocation(location, offset)` |

```ts
import { applyEdit, applyEdits, extractRegion, insertBases, rotateCircular } from "@biolibs/seqedit";

// Delete ten bases; a gene spanning them survives as the part that remains.
const shorter = applyEdit(record, { start: 100, end: 110, insert: "" });

// Put a restriction site in without stretching the feature beside it.
const tagged = insertBases(record, 500, "GAATTC");

// Several changes at once, given in the original coordinates.
const patched = applyEdits(record, [
  { start: 10, end: 20, insert: "" },
  { start: 100, end: 100, insert: "GAATTC" },
]);

// Cut an insert out, keeping edge-crossing features as their surviving parts.
const insert = extractRegion(plasmid, 100, 600);
const rotated = rotateCircular(plasmid, 1000);   // base 1000 becomes base 0
```

Records are never changed in place, and positions are 0-based half-open spans, as in Biopython's `SimpleLocation`.

## How a location moves

An edit replaces `[start, end)` with new text, so every base boundary maps to a new boundary. `mapPosition` is that mapping:

- A boundary **before** the edit does not move; one **after** it moves by the change in length.
- A boundary **inside** the removed stretch has no exact answer, so it collapses to one end of the replacement. A feature's own start collapses to the start and its end to the end, so a feature the edit cuts through survives as the part of it that remains.
- A **pure insertion** at a feature's boundary leaves the feature alone — a left edge moves past the new bases, a right edge stays before them — so the inserted bases fall outside a feature they merely abut. `touches` agrees with this.

A boundary the edit only *shifted* keeps its position class and fuzziness: a `BeforePosition` stays a `BeforePosition` and a `WithinPosition` keeps its range, which is what Biopython's `location + offset` does and what the golden cases check. A boundary the edit **cut through** becomes an `ExactPosition`, because the edit created it and it is known exactly — there is nothing in Biopython to compare that with, since it drops the feature instead.

A `CompoundLocation` carries each part through and keeps its operator; one left with a single part collapses to a `SimpleLocation`, as Biopython's own location arithmetic does.

## Clipping or dropping

`cutFeatures` (on `applyEdit`) and `edgeFeatures` (on `extractRegion`) choose between `"clip"`, the default, which keeps a feature the edit cuts through as its surviving part, and `"drop"`, which reproduces Biopython's slicing. The drop test compares the bases a location **actually covers**, not its outermost extent, so a join losing part of one exon is dropped too.

## One measured divergence from Biopython

Biopython reads `feature.location.ref` while slicing and `location.flip` while reverse-complementing, so a feature with **no location** makes it raise `AttributeError`. Here such a feature survives untouched, there being nothing in it to move — crashing on one would make the record uneditable. The golden file records Biopython's failure and the test asserts that this port succeeds where Biopython raises, so the divergence is measured rather than merely claimed, and cannot quietly spread to a case it was not claimed for.

## Metadata

The id, name, description, dbxrefs and annotations are carried over as they are: the caller knows whether an edit invalidates them, and silently dropping an accession would lose more than it saved. Per-letter annotations are edited in step with the sequence — the stretch covering the removed bases is dropped and the inserted bases get `fill` (a space for a string, `null` for a list), since nothing is known about them.

`extractRegion` is the exception: a piece cut out of a circle is a line, so it sets `topology` to `"linear"` and names the new record after the region (`"pUC19:100-600"`) unless given an `id`.

## Circular records

A record counts as circular when its `topology` annotation is `"circular"`, which is where GenBank and EMBL put it. `extractRegion` can then take a region **across the origin** (pass an `end` past the length), which Biopython's slicing cannot express at all; a feature spanning the origin is joined into one stretch after the cut, or split into a two-part join where that is what it becomes. `rotateCircular` moves a chosen base to the start, leaving the molecule unchanged as a circle.
