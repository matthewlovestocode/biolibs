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
