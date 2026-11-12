# @biolibs/seq

A TypeScript port of Biopython's `Bio.Seq`, `Bio.Data.CodonTable` and `Bio.Data.IUPACData`. Behaviour is verified against Biopython 1.88 with about 22,700 recorded calls (results, exceptions and their messages, warnings, and state after mutation) plus complete dumps of every genetic code table. See [PARITY.md](../PARITY.md) for the item-by-item checklist.

```ts
import { Seq, MutableSeq, translate, reverseComplement, CodonTable } from "@biolibs/seq";

const s = new Seq("ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG");
s.translate().toString();                 // "MAIVMGR*KGAR*"
s.translate({ toStop: true }).toString(); // "MAIVMGR"
s.reverseComplement().toString();

const m = new MutableSeq("ACGT");
m.set(0, "T");
m.append("A");
m.toString();                             // "TCGTA"
```

## Naming: Python to TypeScript

Method names are the camelCase of Biopython's. Python operators and dunder methods become named methods; arguments keep Python's positional order.

| Python | TypeScript |
|---|---|
| `len(s)` | `s.length` |
| `s[i]` | `s.at(i)` (negative indices work) |
| `s[a:b:c]` | `s.slice(a, b, c)`, or `s.get({ start, stop, step })` |
| `s[i] = "T"`, `s[a:b] = "TT"` | `s.set(i, "T")`, `s.set({ start: a, stop: b }, "TT")` |
| `del s[i]` | `s.delete(i)` |
| `a + b`, `"x" + a` | `a.add(b)`, `a.radd("x")` |
| `a * n`, `n * a`, `a *= n` | `a.mul(n)`, `a.rmul(n)`, `a.imul(n)` (returns a new object, as Biopython does) |
| `a == b`, `<`, `<=`, `>`, `>=` | `a.equals(b)`, `a.lt(b)`, `le`, `gt`, `ge` |
| `x in s` | `s.contains(x)` |
| `str(s)`, `bytes(s)`, `repr(s)` | `s.toString()`, `s.toBytes()`, `s.repr()` |
| `hash(s)` | `s.hashCode()` (not the same number as CPython) |
| `for c in s` | `for (const c of s)` |
| `None` | `null` / `undefined` |
| `bytes`, `bytearray` | `Uint8Array` |
| `s.reverse_complement(inplace=True)` | `s.reverseComplement(true)` |

## Seq and MutableSeq

`Seq` is immutable and hashable; `MutableSeq` supports in-place edits. They share almost all methods.

**Searching:** `count`, `countOverlap`, `find`, `rfind`, `index`, `rindex`, `contains`, `startswith`, `endswith` (a string, a sequence, or an array of alternatives), `search` (several subsequences at once, a generator of `[position, text]`).

**Editing (return a new sequence):** `strip`, `lstrip`, `rstrip`, `removeprefix`, `removesuffix`, `upper`, `lower`, `replace`, `join`, `split`, `rsplit` (parts are always `Seq`, as in Biopython). `isupper` and `islower` test case.

**Biology:** `complement`, `complementRna`, `reverseComplement`, `reverseComplementRna`, `transcribe`, `backTranscribe`, `translate`.

**Copy or modify in place:** methods taking `inplace` (all the editing and biology methods above except `split`/`join`) return a new sequence by default. Pass `true` to modify a `MutableSeq` and get it back; on a `Seq` this throws `TypeError("Sequence is immutable")`.

**MutableSeq only:** `set`, `delete`, `append`, `insert`, `pop`, `remove`, `reverse`, `extend`.

### Translation

```ts
seq.translate();                                  // standard code
seq.translate(2);                                 // by NCBI id
seq.translate("Vertebrate Mitochondrial");        // by name
seq.translate({ table: 11, cds: true });          // must be start...stop in frame
seq.translate("Standard", "*", true);             // positional, as in Python: table, stopSymbol, toStop, cds, gap
```

- Ambiguous codons resolve like Biopython: `TTN` is `X`, `CTN` is `L`, `GAR` is `E`, and `RAY` is `B`.
- A trailing partial codon emits a `BiopythonWarning`; see *Warnings* below.
- A gap codon (`---`) translates to `-` for sequences. The module-level `translate(string)` has no gap handling unless you pass one.
- Invalid codons or CDS violations throw `CodonTable.TranslationError`.

### Undefined and partially defined sequences

Sequences of known length but unknown content, as in GenBank `CONTIG` records:

```ts
const u = new Seq(null, 100);          // fully undefined
u.length;                              // 100
u.defined;                             // false
u.toString();                          // throws UndefinedSequenceError

const p = new Seq(new Map([[0, "ACGT"], [10, "TT"]]), 12);   // partly defined
p.definedRanges;                       // [[0, 4], [10, 12]]
p.slice(2, 12).repr();                 // Seq({0: 'GT', 8: 'TT'}, length=10)
```

Slicing, concatenation, `upper`/`lower`, complementing, `mul` and `replace` (same-length) all keep the defined/undefined structure, exactly as Biopython does.

## Module functions

`translate`, `transcribe`, `backTranscribe`, `complement`, `complementRna`, `reverseComplement`, `reverseComplementRna`. Each accepts a string (returns a string), a `Seq`, or a `MutableSeq`. Passing `inplace = true` to a string throws `TypeError("strings are immutable")`.

```ts
reverseComplement("ATGC");            // "GCAT"  (string in, string out)
reverseComplement(new Seq("ATGC"));   // Seq("GCAT")
```

## CodonTable

A namespace holding all 27 NCBI genetic codes, each in six flavours keyed by NCBI id and by name:

| Registry | Meaning |
|---|---|
| `unambiguousDnaById/ByName` | DNA codons (`NCBICodonTableDNA`) |
| `unambiguousRnaById/ByName` | RNA codons (`NCBICodonTableRNA`) |
| `genericById/ByName` | both T and U codons |
| `ambiguousDnaById/ByName` | DNA with IUPAC ambiguity resolution |
| `ambiguousRnaById/ByName` | RNA with IUPAC ambiguity resolution |
| `ambiguousGenericById/ByName` | used by `translate` |

Registries are `Map`s. Each table has `id`, `names`, `forwardTable`, `backTable` (a `Map` with a `null` key for the default stop codon), `startCodons`, `stopCodons`, `nucleotideAlphabet`, `proteinAlphabet`, and `toString()` (the familiar 4x4x4 grid). `forwardTable` supports `has(codon)`, `get(codon, failobj)` and `getItem(codon)`, which throws `KeyError` or `TranslationError` like Python's `table[codon]`.

Also: `standardDnaTable`, `standardRnaTable`, `registerNcbiTable`, `makeBackTable`, `listAmbiguousCodons`, `listPossibleProteins`, `AmbiguousForwardTable`, `AmbiguousCodonTable`.

```ts
CodonTable.unambiguousDnaById.get(1)!.toString();
CodonTable.ambiguousGenericByName.get("Vertebrate Mitochondrial")!.stopCodons; // ["TAA","TAG","AGA","AGG", ...]
```

## IUPACData

A namespace of all 32 constants from `Bio.Data.IUPACData`, camelCased: `ambiguousDnaLetters`, `ambiguousDnaValues`, `ambiguousDnaComplement`, `proteinLetters`, `proteinLetters1to3`, `proteinLetters3to1`, `extendedProteinValues`, `monoisotopicProteinWeights`, `atomWeights`, the `*WeightRanges`, and so on. Generated from Biopython, never typed by hand.

```ts
IUPACData.proteinLetters1to3["A"];    // "Ala"
IUPACData.ambiguousDnaValues["R"];    // "GA"
```

## SequenceDataAbstractBaseClass

The content provider behind every sequence. Subclass it to supply lazily loaded content: implement `length`, `getItem(i)` and `getSlice(slice)`; all other methods derive from them. Exported providers: `BytesData`, `UndefinedSequenceData`, `PartiallyDefinedSequenceData`.

## Errors and warnings

Exceptions mirror Python's by name: `ValueError`, `IndexError`, `KeyError` (from `@biolibs/core`), `UndefinedSequenceError`, and `CodonTable.TranslationError`. Their messages are the same as Biopython's.

Warnings go through `@biolibs/core`:

```ts
import { captureWarnings, setWarningHandler } from "@biolibs/core";
const { result, warnings } = captureWarnings(() => new Seq("ATGA").translate());
warnings[0].message; // "Partial codon, len(sequence) not a multiple of three. ..."
```

## Intentional differences from Python

- Wrong argument *types* throw `TypeError` (Python raises `AttributeError` for some of them).
- `hashCode()` is a stable hash with different numeric values than CPython's.
- `Seq({0: 5}, n)`, where Python's `bytes(5)` silently makes five NUL bytes, throws `ValueError`.
- Python `list` and `tuple` arguments to `startswith`/`endswith` are both just arrays.

Everything else is intended to be identical, and a difference is a bug. Please report it with the failing call.

## Source layout

The package is split into small, single-purpose modules (no file is much over 200 lines). Each directory has an `index.ts` whose header describes its files.

```
packages/seq/src/
  index.ts              public entry point
  seq/                  Seq, MutableSeq and Bio.Seq module functions
    seq.ts  mutable-seq.ts  functions.ts  translate.ts
    base/               shared base class, built as layers so no file holds every method:
      core.ts           storage, indexing, comparison, arithmetic, inplace mechanism
      search.ts         count/find/index/search, startswith/endswith, split
      edit.ts           strip family, upper/lower, replace, join
      biology.ts        translate, complement, transcribe  (exports SeqAbstractBaseClass)
    args.ts  pytypes.ts  complement-tables.ts  seq-record-brand.ts   support modules
  seqdata/              content providers: abstract base, BytesData, Undefined/Partially defined
  codon-table/          CodonTable classes, ambiguity resolution, registries
  pybytes/              Python bytes/slice semantics on Uint8Array (search, split/strip, transform, ...)
  data/                 GENERATED from Biopython (IUPAC constants, NCBI tables); never edit by hand
```

Two rules keep the layering clean: the base class never imports `Seq` or `MutableSeq` (it uses an abstract `makeSeq` hook and structural checks), so there are no circular imports at load time; and `SeqRecord` is recognised through a brand symbol instead of an import.
