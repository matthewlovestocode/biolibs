# @biolibs/align

Pairwise sequence alignment, in the spirit of Biopython's `pairwise2` / `PairwiseAligner`. Works on any strings (DNA, RNA, protein, or arbitrary text).

## Alignment

### `globalAlign(a, b, options?): Alignment`
Needleman–Wunsch end-to-end alignment with a linear gap penalty.

### `localAlign(a, b, options?): Alignment`
Smith–Waterman best local alignment. Returns the highest-scoring local segment (one optimal alignment if several tie).

### `AlignOptions`

| Option | Default | Meaning |
|---|---|---|
| `match` | `1` | Score for identical characters |
| `mismatch` | `-1` | Score for different characters |
| `gap` | `-2` | Linear penalty per gap position (use a negative number) |
| `score` | – | `(a, b) => number` custom substitution scorer; overrides `match`/`mismatch` (e.g. a BLOSUM lookup) |

### `Alignment`

| Field | Meaning |
|---|---|
| `score` | Optimal alignment score |
| `a`, `b` | Aligned strings of equal length, `-` for gaps |
| `aRange`, `bRange` | `[start, end)` positions in the original sequences covered by the alignment (whole sequence for global) |

```ts
const r = globalAlign("ACGT", "AGT", { gap: -1 });
// r.a === "ACGT", r.b === "A-GT", r.score === 2

const l = localAlign("TTTACGTAAA", "GGGACGTCCC");
// l.a === "ACGT", l.score === 4, l.aRange === [3, 7]
```

## Metrics

### `identity(alignment): number`
Fraction of alignment columns where both characters are identical and not gaps.

### `editDistance(a, b): number`
Levenshtein distance (unit-cost insert, delete, substitute).

## Complexity

Both alignment functions use O(n·m) time and memory (a score matrix plus a traceback matrix). That's fine for sequences up to a few thousand characters; for genome-scale inputs use a seed-and-extend approach.

## Not yet supported

Affine gap penalties, built-in substitution matrices (BLOSUM/PAM), semi-global alignment, enumerating all optimal alignments, banded alignment.
