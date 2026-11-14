# @biolibs/dseqrecord

pydna's record layer: a sequence with a name, features and annotations. A port of `pydna.seqrecord`,
measured against pydna in [docs/parity-pydna/](parity-pydna/README.md).

Biopython's `SeqRecord` already holds a sequence together with its identifiers, features and annotations.
What pydna adds is the working vocabulary of someone with a construct in front of them: GenBank's three
fields under the names a GenBank file uses, a way to mark a region as a feature by position *or* by the
sequence it contains, a table of what is annotated, mapping a sequencing read onto the record, and a
checksum stamped into the comment so two files can be told apart.

| Python | biolibs | What it does |
|---|---|---|
| `SeqRecord(seq, id, name, ...)` | `new PydnaSeqRecord(...)` | a record whose defaults are `"id"`, `"name"`, `"description"` |
| `locus`, `accession`, `definition` | same | GenBank's names for `name`, `id`, `description` |
| `isorf(table)` | `isorf(table)` | whether the sequence is a complete reading frame |
| `add_feature(x, y, seq, ...)` | `addFeature(x, y, seq, ...)` | mark a region, by position or by its sequence |
| `list_features()` | `listFeatures()` | a row per feature: label, strand, span, type, orf? |
| `extract_feature(n)`, `sorted_features()` | `extractFeature(n)`, `sortedFeatures()` | one feature's stretch; the features in sequence order |
| `lcs(other, limit=25)` | `lcs(other, limit)` | the longest shared stretch, as a feature to draw |
| `stamp(now, tool, ...)`, `comment(text)` | same | the checksum in the comment, and the comment itself |
| `seguid()`, `gc()`, `cai()`, `express()` | same | passed through to the sequence |
| `rarecodons(organism)` | `rarecodons(organism)` | the rare codons, as features |
| `add_colors_to_features_for_ape()` | `addColorsToFeaturesForApe()` | paint features for the ApE editor |
| `from_Bio_SeqRecord(sr)` | `PydnaSeqRecord.fromBioSeqRecord(sr)` | adopt a Biopython record |
| `ProteinSeqRecord` | `ProteinSeqRecord` | a record that refuses the DNA-only questions |

```ts
import { PydnaSeqRecord } from "@biolibs/dseqrecord";

const a = new PydnaSeqRecord("atgtaa");
a.id;                       // "id" — not Biopython's "<unknown id>"
a.isorf();                  // true
a.addFeature(2, 4);
a.features[0].qualifiers.get("label");    // ["ft2"] — or ["orfN"] if the region reads as a frame
a.stamp(() => "2026-01-01T00:00:00");
a.comment();                // "pydna lsseguid=4c-FaL3dvt8QXjvUyYHrJdVFNcY 2026-01-01T00:00:00"
```

## Things that are reproduced rather than tidied up

- **`addFeature` with a backwards span, and `format("pydnafasta")`, both fail with an `AttributeError`.**
  Each asks whether something is circular — the record in one case, the sequence in the other — and
  neither a plain record nor a plain sequence has any such property. Only `Dseqrecord` and `Dseq` know,
  so on this layer the question itself is the error: `'SeqRecord' object has no attribute 'circular'`.
  That is where those two features actually live.
- **`startcodon`, `stopcodon` and `express` take an organism and then drop it.** Each calls the sequence
  without passing it on, so the answer is always the default organism's. The parity cases record both
  organisms to pin that down.
- **A slice is named after what is annotated in it.** A piece of two bases or more is named after its
  longest feature's label, or failing that its note, or failing both `part_<id>`; both the id and the name
  are then reduced to something that could be a Python name and cut to sixteen characters. A piece shorter
  than two bases is handed back untouched.
- **`identifierFromString` drops hyphens instead of converting them.** Upstream intends otherwise — it
  calls `s.replace("-", "_")` and throws the result away, since Python strings are immutable and the line
  is missing its assignment. The hyphen then falls to the next step, which strips it, so `"ab-cd"` comes
  back as `"abcd"`.
- **Setting a locus longer than sixteen characters truncates it and warns**, with pydna's own missing
  space: `locus property ... truncatedto 16 chars ...`.
- **`stamp` warns when it overwrites a different checksum**, because that means the sequence has been
  edited since it was stamped and the file no longer says what it holds. Stamping the same checksum twice
  changes nothing.
- **Equality compares everything.** Biopython refuses to compare records at all, on the grounds that it is
  never clear which fields were meant; pydna decides it means all of them. Upstream the test is
  `str(self.__dict__) == str(other.__dict__)` — the *printed* dictionary — and since both records come from
  the same constructor and so hold the same fields in the same order, this compares the fields themselves
  instead of reproducing a printed form of them.
- **`listFeatures` and `express` give cells, not a table.** Upstream both return a `prettytable`, whose
  layout belongs to that library rather than to pydna, so the rendering is not ported and the parity cases
  compare the cells.

## What is not ported

- **`__hash__`** hashes a string built from the instance dictionary, and Python's string hashing moves with
  the interpreter's hash seed, so the number differs from run to run. There is nothing reproducible to
  agree with, and it is marked not applicable.
- **`dump`** writes a Python pickle — a format that exists to be read back by Python. Also not applicable.
- **`datefunction`** is here, because `stamp` reads it by default, but its answer is whenever it was
  called, so there is nothing for a case to compare.

## Formatting

`format("fasta")` and the other file formats come from `@biolibs/seqio`, which registers the writers when
it is imported. This package does not depend on the IO layer, so a program that wants those formats imports
`@biolibs/seqio` itself; `"primer"` and `"pydnafasta"` are pydna's own and need nothing.

## Moving features around a circle

`locations.ts` ports the four helpers from `pydna.utils` that the record layer rests on. One of them earns
its own section.

```ts
import { locationBoundaries, shiftFeature, shiftLocation } from "@biolibs/dseqrecord";

// A feature on a 10-base circle, written as two parts because it spans the origin.
const spanning = new CompoundLocation([new SimpleLocation(8, 10, 1), new SimpleLocation(0, 2, 1)]);
shiftLocation(spanning, 2, 10).toString();      // "[0:4](+)" — one stretch again under the new origin
locationBoundaries(spanning);                   // [8, 2] — begin after end, which is how a wrap is spotted
```

`shiftLocation` is what rewrites every feature whenever a circular molecule's origin moves — and it moves
whenever one is cut open, rotated or re-closed. A part that runs off the end is split in two; two parts that
end up adjacent are joined back into one, which is how an origin-spanning feature becomes a single stretch
and the other way round. A mistake here does not raise. It moves annotations onto the wrong bases, which is
why it is measured on its own over 1,140 shift-and-limit combinations rather than only through the methods
that call it.

Three things it does that are worth knowing:

- **`locationBoundaries` is not the lowest and highest base.** It is the first part's start and the last
  part's end, reversed for the minus strand — so for a feature that spans the origin the pair comes back
  the "wrong" way round, with the beginning numerically *after* the end. Callers rely on that: testing
  `boundaries[0] < boundaries[1]` is how pydna finds the features that wrap.
- **pydna's own assertion gives way more often than one might expect.** Any limit shorter than the location
  wraps it onto itself and changes how many bases it covers, and `assert len(newloc) == len(original)` then
  fails — a bare `assert`, so it carries no message, and neither does this. 283 of the recorded cases end
  that way; they are recorded rather than avoided, because that is what the function does.
- **A zero-length location with no limit raises `ValueError: min() iterable argument is empty`**, from
  Python's `min` being handed a location covering no bases at all.

One bug of my own, which only the `lim = null` cases caught. With no limit pydna wraps around `sys.maxsize`,
and my Python-style modulo computed `((a % b) + b) % b` — but at that magnitude a double's neighbours are
two thousand apart, so `(5 % maxsize) + maxsize` is just `maxsize` again and the 5 was lost. Every location
on a linear sequence came out as the whole of it. The non-negative case now returns `a % b` directly, which
is exact, and is the only path a linear sequence ever takes since the negative ones are refused earlier.

## `Dseqrecord`: the molecule with its features

`Dseqrecord` is where pydna's two halves meet. `Dseq` knows what is opposite every base — the sticky ends,
the nicks, whether the molecule is closed — and the record knows what it is called and what is annotated on
it. Together they are a plasmid or a fragment as somebody actually works with one.

```ts
import { Dseqrecord } from "@biolibs/dseqrecord";

const p = new Dseqrecord("atgtaa", true);     // a tiny circular plasmid
p.repr();                                      // "Dseqrecord(o6)"
p.addFeature(5, 1);                            // a feature that runs through the origin
p.shifted(2).features[0]!.location!.toString();  // the same feature, renumbered
p.slice(4, 2).repr();                          // "Dseqrecord(-4)" — a piece through the origin
```

What makes this more than the sum of the two halves is that **every operation has to carry the features
with it**, and nothing complains when that goes wrong — the annotations simply end up on the wrong bases.
So:

- **`looped` drops a feature that no longer fits.** Closing a molecule shortens it by its overhangs, and a
  feature spanning both of them has nowhere to go.
- **`shifted` renumbers every feature and re-sorts them** by where they now start.
- **`slice` on a circle, where the end is before the start, rotates first** and then keeps only the
  features that fit inside the piece and do not themselves wrap. A circular slice whose start equals its
  stop asks for the whole circle opened at that point, which is a cut, so it goes through `applyCut`.
- **`applyCut` carries a feature lying inside the overhang across to the far end** of the opened molecule,
  because that is where those bases now are, and drops one that straddles the cut.
- **`add` shifts the right-hand features twice**: Biopython moves them by the left molecule's length, and
  pydna then applies a further, *negative* offset when the two ends overlap, because the joined molecule is
  shorter than the sum of its parts.
- **`reverseComplement` flips each part of a location where it stands** and sorts the features by their new
  start. Flipping only the outer start and end would turn an origin-spanning feature into one covering the
  whole molecule.

Six behaviours are reproduced rather than tidied up:

- **`upper` and `lower` lose circularity.** `Dseq.upper` builds a fresh sequence that knows nothing of
  pydna's `circular` flag, and pydna does not put it back, so upper-casing a plasmid hands back a linear
  molecule.
- **`tolinear` does not linearise anything.** It warns that it is obsolete, then returns a copy: the line
  that would open the molecule is commented out upstream.
- **`addFeature`'s wrapping branch needs both positions to be *truthy*,** so a feature starting at base
  zero never wraps however circular the molecule is. It also fills the label in *after* building the
  feature, on the dictionary the feature already holds, and asks `isorf` before the label is there.
- **`findAa` reads the overhang before checking whether it found anything**, so on a molecule whose `ovhg`
  is None — one with single-stranded stretches at both ends — it raises `TypeError: '>' not supported
  between instances of 'NoneType' and 'int'` even when the amino acids are simply absent.
- **`contains` and `findAa` pad differently.** `contains` puts the padding `n`s at the front and `findAa`
  at the back, so the two read different frames. They are not two spellings of one search.
- **`shifted` on a circle of no length raises `ZeroDivisionError: division by zero`**, from `shift % 0`.

## Cutting

Cutting a record is cutting a molecule and then deciding, for every feature, which fragment it belongs to.
`Dseq` already knows where the enzymes break the strands; the second half of the job is the bookkeeping,
so the parity cases put features deliberately across the cut sites — inside a fragment, over a cut, and
through the origin of a circle.

```ts
import { Dseqrecord } from "@biolibs/dseqrecord";
import { enzymes } from "@biolibs/restriction";

const EcoRI = enzymes.EcoRI;               // enzymes are looked up, not named exports
new Dseqrecord("aaaGAATTCttt").cut(EcoRI).map((f) => f.repr());  // ["Dseqrecord(-7)", "Dseqrecord(-9)"]
new Dseqrecord("aaaGAATTCttt", true).linearize(EcoRI).name;      // "name_lin"
[...new Dseqrecord("aaaGAATTCttt").cutters()].length;            // enzymes that cut it, from CommOnly
```

| Python | biolibs | What it does |
|---|---|---|
| `cut(*enzymes)` | `cut(...enzymes)` | the fragments, each with its own features |
| `linearize(*enzymes)` | `linearize(...enzymes)` | open a circle at the one place an enzyme cuts |
| `number_of_cuts(*enzymes)` | `numberOfCuts(...enzymes)` | how many sites, counting repeats |
| `cutters`, `no_cutters`, `unique_cutters`, `once_cutters`, `twice_cutters`, `n_cutters(n)` | same, camelCased | which enzymes cut, and how often |
| `synced(ref, limit=25)` | `synced(ref, limit)` | rotate a circle to line up with another sequence |

Three things worth knowing:

- **`numberOfCuts` does not de-duplicate its arguments, where `cut` does.** pydna flattens the enzymes with
  `flatten` for counting and through `dict.fromkeys` for finding the sites, so `numberOfCuts(EcoRI, EcoRI)`
  is twice `numberOfCuts(EcoRI)` while `cut(EcoRI, EcoRI)` is the same as `cut(EcoRI)`. It counts *sites*
  rather than fragments, too, so it does not care whether the molecule can actually be broken there.
- **The cutter queries search the molecule as linear even when it is a circle**, because pydna hands the
  sequence to `RestrictionBatch.search` without saying otherwise. A site spanning the origin is therefore
  not counted. Their default batch is `CommOnly`, the commercially available enzymes.
- **`synced` looks for stretches that begin at the *reference's* own start**, not just any overlap: it
  doubles the molecule, finds the longest such stretch, and moves the origin there. It searches the reverse
  complement too and complements the answer if that matches better. A reference with nothing in common
  raises `TypeError: There is no overlap between sequences!`, and `linearize` refuses three ways — a linear
  molecule, enzymes that do not cut, and enzymes that cut more than once.

Not in this slice, and unchecked in [docs/parity-pydna/](parity-pydna/README.md) — 222 of 225: the output
formats, `format`, `write` and `figure`.

**Not portable, and marked as such:** `history`, `source`, `validate_history`, `normalize_history` and
`is_amplicon` need `pydna.opencloning_models` — 1,421 lines of pydantic describing a provenance interchange
format, which is a port of its own rather than part of the molecule. Usefully, `__eq__` deletes `source`
from both sides before comparing, so carrying it unset changes nothing a caller can observe.
`copy_gb_to_clipboard` and `copy_fasta_to_clipboard` need a clipboard, `map_trace_files` reads ABI files off
disk, `display_html` is for Jupyter, and `__hash__` hashes the instance dictionary and so moves with the
interpreter's hash seed.
