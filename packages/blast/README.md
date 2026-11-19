# @biolibs/blast

NCBI's remote BLAST, over HTTP, sending the requests Biopython's `Bio.Blast` sends.

BLAST answers a question no aligner answers. An aligner is given two sequences and lines them up end
to end; BLAST is given one sequence and a database of millions, and finds the *patches* that resemble
it. A conserved domain buried in two otherwise unrelated genes is a strong BLAST hit and a terrible
global alignment. It is a heuristic — short exact words are looked up and then grown — which is what
makes searching GenBank take seconds, and what means a real similarity that shares no word can be
missed. Every hit carries an **E-value**: how many hits this good you would expect by chance in a
database this size.

- **`qblast`**, with Biopython's parameters and defaults
- **The same two requests, byte for byte** — the same parameter order, the same URL encoding, and
  Python's own way of writing a number, so `EXPECT=10.0` rather than `EXPECT=10`
- **The same manners** — twenty seconds before the first look and a minute between the looks after
  it, counted from when NCBI was last spoken to, and a contact address sent with every search
- **Both halves on their own** — `submit` hands back the ticket, `collect` fetches once; hold the
  ticket and come back later rather than keeping a process waiting
- **One replaceable function touches the network** — swap `settings.transport` to route through a
  proxy, add caching, or test without a connection
- **Two dependencies**, `@biolibs/core` and `@biolibs/entrez`, the second for its URL encoding, which
  is already measured against Python's

`Bio.Blast.parse`, `Record` and the rest of the result model are **not ported yet**: the results come
back as text. A search asking for `Tabular` can be read today by [`@biolibs/align`](../align), whose
tabular reader is a port of `Bio.Align.tabular` and takes BLAST's `-outfmt 7`.

## Install

```bash
npm install @biolibs/blast
```

## A search

```ts
import { qblast, settings } from "@biolibs/blast";

settings.email = "a.n.other@example.com";   // NCBI ask for this, and so does courtesy
settings.tool = "my-lab-notebook";

const found = await qblast({ program: "blastn", database: "nt", sequence: "ACGTACGT…" });
found.rid;        // "FYJTMJBY016" — the ticket NCBI gave it
found.rtoe;       // 30 — its estimate in seconds
found.polls;      // how many times it was asked before the answer was ready
found.results;    // the BLAST XML
```

## Holding the ticket

A search can take minutes. `submit` and `collect` let something else wait:

```ts
import { collect, submit } from "@biolibs/blast";

const search = { program: "blastp", database: "nr", sequence: "MKVLILACLVALALAR" };
const { rid, rtoe } = await submit(search);     // write these down somewhere
// … later, in another process …
const { ready, body } = await collect(search, rid);
```

`collect` says whether what came back is the results or another "please wait" page. Honour NCBI's
rule either way: no more than one look a minute at a single ticket.

## Building a request without sending it

```ts
import { getOf, putOf } from "@biolibs/blast";

putOf({ program: "blastn", database: "nt", sequence: "ACGT" }).body;
// "DATABASE=nt&ENTREZ_QUERY=%28none%29&EXPECT=10.0&HITLIST_SIZE=50&PROGRAM=blastn&QUERY=ACGT&CMD=Put&tool=biopython"
getOf({ program: "blastn", database: "nt", sequence: "ACGT" }, "ABC123").body;
// "ALIGNMENTS=500&DESCRIPTIONS=500&FORMAT_TYPE=XML&RID=ABC123&CMD=Get"
```

## Things to know

- **A program NCBI does not take is refused here**, before anything is sent, with Biopython's own
  wording: `Program specified is BLASTN. Expected one of blastn, blastp, blastx, tblastn, tblastx`.
  The five are lower case.
- **`shortQuery` is dropped for `blastn`**, whatever the sequence length, because NCBI's own handling
  of `SHORT_QUERY_ADJUST` is wired up wrongly for it. For a sequence under 31 bases the parameters it
  stood for are set by hand instead — `EXPECT=1000`, `WORD_SIZE=7`, `NUCL_REWARD=1` — and a warning
  says so, as Biopython's does.
- **Who is asking is sent only to NCBI.** Point `urlBase` at a BLAST of your own and the address and
  tool name are left out, since they are NCBI's courtesy rule and nobody else's.
- **`RTOE` is a whole number of seconds**, and a page carrying anything else is refused.
- **Nothing is cached.** The same search twice is two searches, and NCBI will notice.
- **`rtoe` is NCBI's guess, and it is sometimes wildly out.** A search held in their queue waits
  there however long the queue is: estimates of 30 and 62 seconds have both gone past forty minutes
  on a bad afternoon, and making the query smaller does not help, because what is waited on is being
  let in rather than the search itself. When one is slow, ask NCBI rather than suspecting this code —
  `curl "https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=<rid>"` says
  `Status=WAITING` while it is queued, which is an answer from them and not from here. This is the
  reason `submit` and `collect` are separate: hold the ticket, and let something else do the waiting.

## Parity

Measured, not claimed. `reference/golden/gen_blast_cases.py` runs the real `qblast` from Biopython
1.88 with `urlopen`, the clock and `sleep` replaced, and records what it would have sent. The tests
here replay the same calls — twelve searches, eight wait pages, six program names — and compare the
Put body, the Get body, the gaps between polls, the ticket read out of the page, and the words of
every error and warning.

Two things that comparison settled which reading the source had not: Python writes `EXPECT=10.0` where
JavaScript would write `10`, and the short-query workaround sends `1000` as an **int**; and `RTOE`
comes back as a number rather than text, with its own error for a page that carries something else.
The first draft here got the second one wrong, and the recorded cases caught it.

## License

MIT — see [LICENSE](LICENSE).
