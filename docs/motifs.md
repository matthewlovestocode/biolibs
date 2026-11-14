# @biolibs/motifs

A TypeScript port of `Bio.motifs`: motifs made from aligned instances or counts, position matrices (counts, weights, log-odds scores), scanning sequences, score distributions and thresholds, and the formats JASPAR (`pfm`, `sites`, `jaspar`), TRANSFAC, Cluster-Buster, AlignACE, MEME (XML and minimal text), MAST, XMS and `pfm-four-columns`/`pfm-four-rows`. All **173 items** are at parity, verified against Biopython 1.88 on **3,154 cases**
(`packages/motifs/test/golden/motifs.json`, built by `reference/golden/gen_motif_cases.py`): 2,099 on the
readers and writers, 503 on the matrices, 452 on `Motif` itself, 93 on matrix comparison and 7 on JASPAR
id splitting. See [the package README](../packages/motifs/README.md) for the API with worked examples.

```ts
import { Seq } from "@biolibs/seq";
import * as motifs from "@biolibs/motifs";

const m = motifs.create(["TACAA", "TACGC", "TACAC", "TACCC", "AACCC", "AATGC", "AATGC"].map((s) => new Seq(s)));
m.counts.consensus;                  // Seq("TACGC")
m.pseudocounts = 0.5;                // Biopython's m.pseudocounts = 0.5
m.background = 0.4;                  // GC content
const pssm = m.pssm;                 // log-odds scoring matrix
pssm.calculate(new Seq("ACGTTACAAGG"));         // Float32Array of window scores
pssm.search(new Seq("ACGTTACAAGG"), 3.0);       // [[position, score], ...]; negative positions are the reverse strand
const dist = new motifs.ScoreDistribution(1000, pssm, m.background);   // pssm.distribution(background, precision) in Python
dist.thresholdFpr(0.001);  dist.thresholdPatser();
console.log(motifs.write([m], "jaspar"));
```

## From Python

| Python | TypeScript |
|---|---|
| `motif.counts["A"]`, `matrix[a, b]`, slices | `matrix.row("A")`, `matrix.get(a, b)`, `{start, stop, step}` slices; tuples through `getTuple` |
| `motif[1:4]` | `motif.slice({ start: 1, stop: 4 })` (anything but a slice raises `TypeError`) |
| `motifs.parse(handle, fmt)` | `motifs.parse(text, fmt)`; sources are the file's text, as in `@biolibs/seqio` |
| `format(motif, "jaspar")`, `motif.format(...)` | `motif.format("jaspar")` |
| counts as `dict` of lists | rows in a `Map` (`matrix.values`), read with `matrix.row(letter)` |

Details kept as in Biopython, including the unexpected ones:

- A weight matrix stores its rows as Python tuples, which shows in index error messages (`tuple index out of range`). `sum()` of floats uses compensated summation in Python 3.12+, so totals are computed with `pySum`.
- `calculate` returns a single number (not an array) when there is exactly one window, so `search` over a sequence exactly as long as the motif raises NumPy's `nonzero` error, as Biopython does. Scores are single precision. `search` orders hits with NumPy's `argsort`, which is not stable; `argsortQuick` reproduces its quicksort so equal positions on the two strands come out in the same order.
- Assignments that fail leave their partial effect: a bad `pseudocounts` dictionary leaves the pseudocounts *empty*, and a bad `mask` string keeps the characters before the bad one. The mask is then shorter than the motif, so `toString(true)` throws `IndexError("list index out of range")` rather than padding — Biopython indexes the mask position by position. Assigning a valid mask recovers.
- The matrices are `dict` subclasses in Biopython, so `equals` compares the stored rows and nothing else: the alphabet plays no part, and a plain `Map` of the same rows is equal. The row container counts, because `[1.0] == (1.0,)` is false in Python — a weight matrix stores tuples where every other matrix stores lists, so `pwm.equals(counts)` is false however close the numbers, and so is comparing a weight matrix with a `Map`. `lt`, `le`, `gt` and `ge` always throw `TypeError`, naming both operands as Python does, since `dict` has no ordering.
- `calculateConsensus` keeps the previous position's letter when a position has no counts (Python's variable survives the loop).
- `ScoreDistribution` fails with `ValueError` for matrices that contain `-Infinity` scores (zero probabilities), because Python converts `nan` to `int`.
- A TRANSFAC `VV` line is stored as the record's version *and* as an annotation; a line with only a key reuses the previous value; reading stops matrices at the first non-numeric line and processes that line as an ordinary field.

## The other readers

`motifs.parse(text, fmt)` also reads `alignace`, `meme` (XML), `minimal` (MEME's text output), `mast` (XML), `xms` and `pfm-four-columns`/`pfm-four-rows`; each module (`motifs.meme`, ...) has its own `read` and record class with the extra attributes (`evalue`, `numOccurrences`, `score`, hit `diagrams`, ...). The XML formats use the small ElementTree in `@biolibs/seqio`. Biopython's `Seq` attribute `length` on a MEME site is `lengthAttr` here (a `Seq`'s own `length` is its size). Malformed XML in an XMS file raises an error named `ExpatError` (Python's minidom); the exact expat wording is not reproduced.

## Not ported

`motifs.jaspar.db` (a MySQL client), `Motif.weblogo` (posts to a web service), and the `Bio.motifs.matlab`/`universal` helpers. The motif-based `ScoreDistribution` path in Biopython needs methods `Motif` no longer has, and is not ported.
