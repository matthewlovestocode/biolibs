# @biolibs/seqtools

A TypeScript port of Biopython's `Bio.SeqUtils`: GC content, molecular weight, amino acid code conversion, six-frame translation display, and the codon adaptation index. Verified against Biopython 1.88 with about 2,800 recorded calls. See [PARITY.md](../PARITY.md).

```ts
import { gcFraction, molecularWeight, seq3, ntSearch } from "@biolibs/seqtools";

gcFraction("ACTGN");                 // 0.5   (N is left out of the denominator)
gcFraction("ACTGN", "weighted");     // 0.5
molecularWeight("ACGT", "DNA");      // 1253.8027
seq3("MAIV*");                       // "MetAlaIleValTer"
ntSearch("ACGTGGAGAGATGAT", "GRG");  // ["G[AG]G", 5, 7]
```

Every function takes plain text, a `Seq` or a `MutableSeq`.

## Functions

| Python | TypeScript | Notes |
|---|---|---|
| `gc_fraction(seq, ambiguous="remove")` | `gcFraction(seq, ambiguous?)` | `"remove"`, `"ignore"` or `"weighted"`; other values throw `ValueError` |
| `GC123(seq)` | `gc123(seq)` | `[overall, pos1, pos2, pos3]` percentages; `ZeroDivisionError` with no A/C/G/T |
| `GC_skew(seq, window=100)` | `gcSkew(seq, window?)` | one value per window; `window` 0 is a `ValueError`, a non-integer a `TypeError` |
| `nt_search(seq, subseq)` | `ntSearch(seq, subseq)` | IUPAC-aware, overlapping matches; `seq` must be text (Python rejects `Seq` too) |
| `seq1(seq, custom_map, undef_code)` | `seq1(seq, customMap?, undefCode?)` | `customMap` is a `Map` or plain object |
| `seq3(seq, custom_map, undef_code)` | `seq3(seq, customMap?, undefCode?)` | |
| `molecular_weight(seq, seq_type, double_stranded, circular, monoisotopic)` | `molecularWeight(seq, seqType?, doubleStranded?, circular?, monoisotopic?)` | positional flags; also accepts a `SeqRecord` |
| `six_frame_translations(seq, genetic_code)` | `sixFrameTranslations(seq, geneticCode?)` | returns text, or a `Seq`/`MutableSeq` holding it when given one (Biopython does the same) |
| `CodonAdaptationIndex` | `CodonAdaptationIndex` | extends `Map`; `calculate`, `optimize`, `toString` |
| `xGC_skew` | not ported | it opens a Tkinter window; `gcSkew` gives the data it plots |

## Differences from Python

- **Sums.** Python 3.12+ adds floats with compensated summation; `@biolibs/core`'s `pySum` does the same, so `molecularWeight` and weighted `gcFraction` agree to the last digit.
- **`ntSearch` with an empty pattern** loops forever in Python; here it throws `RuntimeError`.
- **`CodonAdaptationIndex.calculate`** uses `Math.log` and `Math.exp`, which can differ from Python's C library in the last bit (tests allow 1e-14 relative difference).
- `Seq`-typed arguments are converted to text first, so the results match Python for ordinary input; exotic input types (lists of letters, bytes) are not supported.

## Source layout

```
packages/seqtools/src/
  args.ts  gc.ts  search.ts  names.ts  weight.ts  six-frame.ts  cai.ts  index.ts
```

The earlier string-only scaffold (restriction digests, Wallace Tm) was removed; melting temperature returns as a port of `Bio.SeqUtils.MeltingTemp` and restriction enzymes as `Bio.Restriction`.
