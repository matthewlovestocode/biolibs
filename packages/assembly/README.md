# @biolibs/assembly

Where do two sequences agree, and for how long? A port of the layer
[pydna](https://github.com/BjornFJohansson/pydna)'s assembly rests on.

Gibson assembly, fusion PCR and homologous recombination all work the same way: fragments whose ends
agree are joined at that agreement. So before anything can be assembled, that one question has to be
answered — and this package is the answer.

- **`commonSubStrings(x, y, limit)`** — every shared stretch, longest first
- **`terminalOverlap(x, y, limit)`** — only the stretches at a seam, where one sequence's end is the
  other's beginning
- **`Match`** — one stretch, as `[startx, starty, length]`
- No dependencies

## What is verified

| Upstream module | Items at parity | Checklist |
|---|---|---|
| `pydna.common_sub_strings` | **2 / 2** | [pydna.common_sub_strings.md](../../docs/parity-pydna/pydna.common_sub_strings.md) |

**1,155 recorded cases** against pydna 5.5.16, over one- and two-letter alphabets as well as DNA —
because that is where the number of stretches goes quadratic and the *order* tells one reading of
"maximal" from another.

Establishing what to verify against was most of the work, and it is worth knowing why:

- **There is no Python to read.** Upstream, `common_sub_strings` is a call into
  [pydivsufsort](https://github.com/louisabraham/pydivsufsort), a compiled suffix-array library, so what
  pydna promises is whatever that library returns.
- **So the promise was established first, not the method.** Four thousand random pairs against a
  brute-force definition settled it exactly — every maximal common stretch of at least `limit`
  characters, and nothing else — and that definition is what the cases pin.

## Install

```bash
npm install @biolibs/assembly
```

- ESM only, Node 20 or later, TypeScript declarations included
- No dependencies

## API

### `commonSubStrings`

```ts
import { commonSubStrings } from "@biolibs/assembly";

console.log(commonSubStrings("gatgatttcggtagtta", "gtcagtatgtctatctatcgcg", 3));
// [[1, 6, 3], [7, 17, 3], [10, 4, 3], [12, 3, 3]]
```

Each `[startx, starty, length]` is a stretch that is **maximal**: it cannot be extended by one character
in either direction. Stretches may overlap, and the same part of either sequence may appear in several of
them:

```ts
console.log(commonSubStrings("AAAA", "AAAA", 1));
// [[0, 0, 4], [0, 1, 3], [1, 0, 3], [0, 2, 2], [2, 0, 2], [0, 3, 1], [3, 0, 1]]
```

Seven, for four characters against themselves — because every offset agrees with every other. The order
is pydna's: longest first, then by position in `x`, then by position in `y`. The default `limit` is 25.

Matching is **case sensitive**:

```ts
console.log(commonSubStrings("ACGT", "acgt", 2));   // []
```

### `terminalOverlap`

The stretches that lie at a seam — one sequence reaching its end while the other is at its beginning.
These are the joins an assembly can actually make.

```ts
import { terminalOverlap } from "@biolibs/assembly";

console.log(terminalOverlap("agctatgtatcttgcatcgta", "gcatcgtagtctatttgcttac", 8));
// [[13, 0, 8]]   — x ends with what y begins with, so the two can be fused there
```

Its default `limit` is **15**, not 25.

### What they refuse

Both functions refuse what the library underneath them refuses, with NumPy's messages rather than
pydna's — worth knowing when one appears:

```ts
commonSubStrings("", "ACGT", 2);
// ValueError: zero-size array to reduction operation maximum which has no identity

commonSubStrings("AC", "AC", -1);
// OverflowError: can't convert negative value to npy_uint64

commonSubStrings("ACGé", "ACG", 2);
// TypeError: str must only contain ascii chars
```

A limit of **0 is not refused**, and asks the same question as a limit of 1, since a run of nothing is
not a match.

## How this port finds them

By a different route from upstream, and deliberately. Every position of `x` is filed under the `limit`
characters that start there, and each position of `y` looks its own run of `limit` up.

A pair cannot agree over `limit` characters without agreeing over the *first* `limit` of them, so nothing
can hide from the index; and for real DNA at the usual limit of 25, only a handful of pairs ever come back
to be checked — where a suffix array would have to be built over both sequences first. The cost lands in
the output rather than the search, which is the right place for it.

Except where the sequences are nearly uniform, as `"A"` repeated is: there the number of maximal stretches
is itself quadratic, and no algorithm escapes that.

## Testing

```bash
npm test                 # the whole workspace
npx vitest run packages/assembly/test
```

| File | What it checks |
|---|---|
| `test/substrings.test.ts` | the 1,155 recorded cases, one `it` each |
| `test/readme.test.ts` | every code block in this file |

Coverage from this package's own tests — `npx vitest run --coverage packages/assembly/test`:

| | |
|---|---|
| Statements | **100.00%** (50 / 50) |
| Functions | **100.00%** (4 / 4) |
| Branches | **97.56%** (40 / 41) |

## What is not here

**`Assembly` itself.** It needs pydna's `Contig` and — in the current `pydna.assembly2` — a provenance
model built on 1,421 lines of pydantic, before the graph of fragments and overlaps can be built. pydna
has two versions of it, `pydna.assembly` (which warns that it is deprecated) and `pydna.assembly2` (which
replaces it), and neither is ported.

The record layer it would be built on *is* here: [`@biolibs/dseq`](../dseq) and
[`@biolibs/dseqrecord`](../dseqrecord). [`@biolibs/cloning`](../cloning) does Gibson assembly and overlap
primer design on top of this matcher, without pydna's graph.

## License

MIT — see [LICENSE](LICENSE).
