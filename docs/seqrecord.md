# @biolibs/seqrecord

A TypeScript port of Biopython's `Bio.SeqRecord`: a sequence together with its identifiers, annotations and features. Verified against Biopython 1.88 with about 6,100 recorded calls (results, exception types and messages, warnings, and the full state of the record after every call, including hidden side effects such as the lazy creation of `letterAnnotations`). See [PARITY.md](../PARITY.md).

```ts
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";

const rec = new SeqRecord(
  new Seq("ATGAAATAGCCC"), "id1", "name1", "desc1", null,
  [new SeqFeature(new SimpleLocation(0, 9, 1), "CDS")],
  { molecule_type: "DNA" },
  { q: "abcdefghijkl" },
);

rec.slice(2, 6).seq!.toString();          // "GAAA"
rec.slice(3).letterAnnotations.get("q");  // "defghijkl"   (sliced alongside the sequence)
rec.reverseComplement().seq!.toString();  // "GGGCTATTTCAT"
rec.reverseComplement().features[0]!.location!.toString(); // "[3:12](-)"  (flipped)
rec.translate().seq!.toString();          // "MK*P"
rec.add(rec).seq!.toString();             // "ATGAAATAGCCCATGAAATAGCCC"  (features concatenated too)
```

## Constructor

`new SeqRecord(seq, id?, name?, description?, dbxrefs?, features?, annotations?, letterAnnotations?)`

| Argument | Type | Default |
|---|---|---|
| `seq` | `Seq`, `MutableSeq` or `null` | required |
| `id` | `string` or `null` | `"<unknown id>"` |
| `name`, `description` | `string` | `"<unknown name>"`, `"<unknown description>"` |
| `dbxrefs` | `string[]` | `[]` |
| `features` | `SeqFeature[]` | `[]` |
| `annotations` | `Map` or plain object | empty `Map` (a `Map` you pass in is shared, not copied, like a Python dict) |
| `letterAnnotations` | `Map` or plain object whose values are strings or arrays as long as `seq` | none |

Wrong types throw `TypeError` with Biopython's messages; a per-letter annotation of the wrong length throws `ValueError`.

## Attributes

- `seq` (get/set), `id`, `name`, `description`, `dbxrefs`, `features`, `annotations` (a `Map`).
- `letterAnnotations`: a `RestrictedDict` (a `Map` that only accepts strings/arrays of exactly the sequence's length). Reading it creates it on first use; assigning replaces its contents.
- Assigning `seq` while per-letter annotations exist requires the new sequence to have the same length (`ValueError` otherwise).
- `length`.

## Slicing and indexing

| Python | TypeScript |
|---|---|
| `rec[i]` | `rec.at(i)` |
| `rec[a:b:c]` | `rec.slice(a, b, c)` |
| `len(rec)` | `rec.length` |
| `for c in rec` | `for (const c of rec)` |
| `x in rec` | `rec.contains(x)` |
| `bytes(rec)`, `str(rec)`, `repr(rec)` | `rec.toBytes()`, `rec.toString()`, `rec.repr()` |
| `rec + other`, `other + rec` | `rec.add(other)`, `rec.radd(other)` |

A slice keeps `id`, `name`, `description` and `molecule_type`, slices every per-letter annotation, and, for plain forward slices (step 1), keeps the features lying entirely inside the slice, shifted to the new coordinates. Features that refer to other sequences are dropped with a warning.

## Arithmetic

- `rec + seq` (a `Seq`, `MutableSeq` or string) appends it and keeps the left record's metadata.
- `seq + rec` prepends, shifting features right.
- `rec + rec` concatenates: the right record's features are shifted; `id`, `name`, `description` and each annotation survive only if both records agree; cross-references are merged; per-letter annotations present in both are concatenated.

## Other methods

`count(sub, start?, end?)`, `upper()`, `lower()`, `isupper()`, `islower()`.

### `reverseComplement(...)` and `translate(...)`

Both return a new record. Each metadata option (`id`, `name`, `description`, `dbxrefs`, `features`, `annotations`, `letterAnnotations`) is polymorphic, as in Biopython: **`true` copies the field, `false` drops it, and an explicit value is used as is**.

```ts
rec.reverseComplement({ id: true, description: "reverse strand" });
rec.reverseComplement("new-id");               // positional, Python order: id, name, description, features, annotations, letterAnnotations, dbxrefs
rec.translate({ table: 11, cds: true, id: true });
```

- `reverseComplement` defaults: `features: true` (flipped and sorted by start), `letterAnnotations: true` (reversed), everything else dropped. It uses the RNA complement when `molecule_type` contains `"RNA"`, and refuses proteins.
- `translate` drops all metadata by default, sets `molecule_type` to `"protein"`, and cannot carry features or per-letter annotations across (`true` for either throws `TypeError`).

## Comparison is deliberately unsupported

`equals`, `ne`, `lt`, `le`, `gt` and `ge` all throw `NotImplementedError`, exactly like Biopython; compare the attributes you care about.

## `format(fileFormat)`

`rec.format("")` returns the same text as `toString()`. Other formats are produced by writers registered in `SeqRecord.writers` (a `Map<string, (record) => string>`); `@biolibs/seqio` will register `fasta`, `genbank`, and so on when it is ported. Until then an unknown format throws `KeyError`, as in Biopython.

## Intentional differences from Python

- Records have no truthiness (`bool(rec)` is always true in Biopython).
- When joining records, Biopython prints "Failed while try to concatenate letter annotations" before re-raising the `TypeError`; we just re-raise.
- Tuples and lists are both arrays, so per-letter annotations and annotation values do not distinguish them.
- Where Python raises `AttributeError` for a wrong argument type, TypeScript throws `TypeError`.
- `Bio.SeqIO` is not ported yet, so `format()` supports only the empty format.

## Source layout

```
packages/seqrecord/src/
  seq-record.ts      the SeqRecord class
  restricted-dict.ts   RestrictedDict (length-checked per-letter map)
  letter-values.ts     slice / concatenate / length of per-letter values
  slicing.ts  concatenate.ts  transform.ts   slicing, +, reverseComplement, translate
  types.ts  index.ts
```
