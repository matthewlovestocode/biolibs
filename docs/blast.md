# `@biolibs/blast`

`Bio.Blast`'s `qblast`: NCBI's remote BLAST, over HTTP.

BLAST answers a question no aligner answers. An aligner is given two sequences and lines them up end
to end. BLAST is given one sequence and a database of millions, and finds the *patches* that resemble
it — a conserved domain buried in two otherwise unrelated genes is a strong BLAST hit and a terrible
global alignment. It is a heuristic: short exact words are looked up, then grown into alignments,
which is what makes searching GenBank take seconds and what means a real similarity sharing no word
can be missed. Every hit carries an **E-value**: how many hits this good you would expect by chance in
a database this size.

## It is a search, not a request that answers

A search is submitted; NCBI replies with a ticket; the results are fetched by presenting that ticket
until they are ready. NCBI's developer notes ask that nobody contact the server more often than once
every ten seconds, nor poll a single ticket more often than once a minute, and that a contact address
is sent so they can write to you before blocking you. All three are honoured, with Biopython's own
timings: twenty seconds before the first look, a minute between every look after it, counted from
when NCBI was last spoken to rather than from now.

```ts
import { qblast, settings } from "@biolibs/blast";

settings.email = "a.n.other@example.com";
const found = await qblast({ program: "blastn", database: "nt", sequence: "ACGTACGT…" });
found.rid;        // the ticket
found.rtoe;       // NCBI's estimate in seconds
found.results;    // the BLAST XML
```

`submit` and `collect` are the two halves on their own, for anyone who would rather hold the ticket
and come back later than keep a process waiting.

## Parity

Measured, not claimed. `reference/golden/gen_blast_cases.py` runs the real `qblast` from Biopython
1.88 with `urlopen`, the clock and `sleep` replaced, and records what it would have sent. The
TypeScript tests replay the same calls: twelve searches, eight wait pages and six program names, and
they compare the Put body, the Get body, the gaps between polls, the ticket read out of the page and
the words of every error and warning.

Two things that comparison settled, which reading the source had not:

- Python writes `EXPECT=10.0` and JavaScript would write `EXPECT=10`. The default and anything a
  caller gives are floats; the short-query workaround assigns an **int**, and Biopython sends `1000`.
  Both are reproduced through `@biolibs/core`'s `PyFloat`.
- `RTOE` comes back as a **whole number**, not text, and a page carrying anything else raises
  `A non-integer RTOE found in the 'please wait' page`. The first draft here returned text, and the
  recorded cases caught it.

## What is not here

Reading the results. BLAST XML comes back as text; `Bio.Blast.parse`, `Bio.Blast.Record` and the rest
of the result model have no counterpart yet. A search asking for `Tabular` can be read today by
`@biolibs/align`'s tabular reader, which is a port of `Bio.Align.tabular` and takes BLAST's
`-outfmt 7`.
