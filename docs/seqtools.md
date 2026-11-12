# @biolibs/seqtools

A TypeScript port of Biopython's `Bio.SeqUtils` and its submodules: GC content, molecular weight, amino acid code conversion, six-frame translation display, the codon adaptation index, checksums, sequence complexity, protein analysis, isoelectric point and melting temperature. Verified against Biopython 1.88 with about 5,000 recorded calls. See [PARITY.md](../PARITY.md).

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

### Submodules

| Python | TypeScript | Notes |
|---|---|---|
| `CheckSum.crc32`, `crc64`, `gcg`, `seguid` | `crc32`, `crc64`, `gcg`, `seguid` | `seguid` and `crc32` take text (UTF-8), `Seq`, bytes, or a count (`bytes(5)` is five zero bytes); SHA-1 and base64 are written out, no `crypto` needed |
| `lcc.lcc_simp`, `lcc_mult` | `lccSimp`, `lccMult` | local composition complexity |
| `ProtParam.ProteinAnalysis` | `ProteinAnalysis` | `countAminoAcids`, `aminoAcidsPercent`, `molecularWeight`, `aromaticity`, `instabilityIndex`, `flexibility`, `gravy`, `proteinScale`, `isoelectricPoint`, `chargeAtPH`, `secondaryStructureFraction`, `molarExtinctionCoefficient` |
| `ProtParamData` | `ProtParamData` | the 28 hydropathy scales, `flex`, `diwv` (generated) |
| `IsoelectricPoint.IsoelectricPoint` | `IsoelectricPoint` | `chargeAtPH`, `pi` |
| `MeltingTemp.Tm_Wallace`, `Tm_GC`, `Tm_NN` | `tmWallace`, `tmGC`, `tmNN` | positional options in Python's keyword order |
| `MeltingTemp.salt_correction`, `chem_correction`, `make_table` | `saltCorrection`, `chemCorrection`, `makeTable` | tables are `Map`s or plain objects of `[dH, dS]` |
| `MeltingTemp.DNA_NN1`... | `MeltingTempData.dnaNn1`... | `dnaNn1`-`4`, `rnaNn1`-`3`, `rDnaNn1`, `dnaImm1`, `dnaTmm1`, `dnaDe1`, `rnaDe1` (generated) |

```ts
import { tmNN, tmWallace, ProteinAnalysis, crc32, seguid } from "@biolibs/seqtools";

tmNN("CGTTCCAAAGATGTGGGCATGAGCTTAC");   // 60.32...
tmWallace("ACGTTGCAATGCCGTA");          // 48
new ProteinAnalysis("MKVLAAGIVG").gravy();
```

`ProteinAnalysis.proteinScale` writes "warning: X is not a standard amino acid." lines to standard error like Biopython; `setStderrWriter(fn)` redirects them.

## Differences from Python

- **Sums.** Python 3.12+ adds floats with compensated summation; `@biolibs/core`'s `pySum` does the same, so `molecularWeight` and weighted `gcFraction` agree to the last digit.
- **`ntSearch` with an empty pattern** loops forever in Python; here it throws `RuntimeError`.
- **`CodonAdaptationIndex.calculate`** uses `Math.log` and `Math.exp`, which can differ from Python's C library in the last bit (tests allow 1e-14 relative difference).
- **Tolerance.** Functions built on `log`, `exp` or `pow` (`lccSimp`, `lccMult`, `CodonAdaptationIndex.calculate`, `tmGC`, `tmNN`, `saltCorrection`, `IsoelectricPoint.chargeAtPH`) can differ from Python in the last bit because the C library and V8 round them differently; the tests allow a relative 1e-12.
- **Error text.** `chargeAtPH` overflow reports `(34, 'Result too large')`, the wording of the macOS C library that produced the recorded cases (Linux says `Numerical result out of range`).
- `Seq`-typed arguments are converted to text first, so the results match Python for ordinary input; exotic input types (lists of letters, bytes) are not supported.

## Source layout

```
packages/seqtools/src/
  args.ts  gc.ts  search.ts  names.ts  weight.ts  six-frame.ts  cai.ts
  checksum.ts  sha1.ts  lcc.ts  amino-counts.ts  isoelectric.ts  protparam.ts  stderr.ts
  melting-salt.ts  melting-simple.ts  melting-nn.ts  melting.ts  index.ts
  data/  prot-param-data.ts  melting-temp-data.ts      (generated by reference/gen_data.py)
```

The earlier string-only scaffold (restriction digests, Wallace Tm) was removed; restriction enzymes will return as a port of `Bio.Restriction`.
