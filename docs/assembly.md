# @biolibs/assembly

Joining DNA fragments by the sequence they share. A port of the layer `pydna`'s assembly rests on, measured
against pydna in [docs/parity-pydna/](parity-pydna/README.md).

Gibson assembly, fusion PCR and homologous recombination all work the same way: fragments whose ends agree are
joined at that agreement. So before anything can be assembled, one question has to be answered — given two
sequences, where and how far do they agree? That is this package.

| Python | biolibs | What it finds |
|---|---|---|
| `common_sub_strings(x, y, limit=25)` | `commonSubStrings(x, y, limit)` | every shared stretch, longest first |
| `terminal_overlap(x, y, limit=15)` | `terminalOverlap(x, y, limit)` | only the shared stretches at an end |
| `Match` | `Match` | one stretch, as `[startx, starty, length]` |

```ts
import { commonSubStrings, terminalOverlap } from "@biolibs/assembly";

commonSubStrings("gatgatttcggtagtta", "gtcagtatgtctatctatcgcg", 3);
// [[1, 6, 3], [7, 17, 3], [10, 4, 3], [12, 3, 3]]

terminalOverlap("agctatgtatcttgcatcgta", "gcatcgtagtctatttgcttac", 8);
// [[13, 0, 8]] — x ends with what y begins with, so the two can be fused there
```

A stretch is reported when it is **maximal**: it cannot be extended by one character in either direction. Two
stretches may overlap, and the same part of either sequence may appear in several of them — `"AAAA"` against
itself at a limit of 1 gives seven, because every offset agrees with every other. The order is pydna's: longest
first, then by position in `x`, then by position in `y`. `terminalOverlap` keeps only those that lie at a seam,
which means one of the two reaches the end of its sequence while the other starts at the beginning of its own;
note that its default limit is 15, not 25.

Both functions are case sensitive, and both refuse what the library underneath them refuses: an empty sequence
raises `ValueError: zero-size array to reduction operation maximum which has no identity`, a negative limit
`OverflowError: can't convert negative value to npy_uint64`, and a character above code point 127 `TypeError:
str must only contain ascii chars`. Those messages are NumPy's and not pydna's, which is worth knowing when
one appears: a limit of 0 is not refused, and asks the same question as a limit of 1, since a run of nothing is
not a match.

## How this port finds them, and why that is a port at all

Upstream, `common_sub_strings` is a call into [pydivsufsort](https://github.com/louisabraham/pydivsufsort), a
compiled suffix-array library, so there is no Python to read: what pydna promises is whatever that library
returns. The first job was therefore to establish the promise rather than the method. Four thousand random
pairs against a brute-force definition settled it exactly — every maximal common stretch of at least `limit`
characters, and nothing else — and that definition is what the golden cases pin, over one- and two-letter
alphabets where the number of stretches is quadratic in the length and the order tells one reading of
"maximal" from another.

This port then computes it by a different route. Every position of `x` is filed under the `limit` characters
that start there, and each position of `y` looks its own run of `limit` up. A pair cannot agree over `limit`
characters without agreeing over the first `limit` of them, so nothing can hide from the index; and for real
DNA at the usual limit of 25, only a handful of pairs ever come back to be checked, where a suffix array would
have to be built over both sequences first. The cost is in the output rather than the search, which is the
right place for it — except where the sequences are nearly uniform, as `"A"` repeated is, and then the number
of maximal stretches is itself quadratic and no algorithm escapes it.

## What is not here yet

`Assembly` itself. It needs pydna's record layer (`Dseqrecord`, which wraps Biopython's `SeqRecord`, and
`Contig`) before the graph of fragments and overlaps can be built, and pydna now has two of them —
`pydna.assembly`, which warns that it is deprecated, and `pydna.assembly2`, which replaces it. Neither is
ported. See `docs/dseq.md` for the double-stranded sequence this will be built on.
