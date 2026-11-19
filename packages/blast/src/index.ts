/**
 * @packageDocumentation
 * `@biolibs/blast`: NCBI's remote BLAST over HTTP — a port of `Bio.Blast`'s `qblast`.
 *
 * BLAST answers a question no aligner answers. An aligner is given two sequences and lines them up;
 * BLAST is given one and a database of millions, and finds the patches that resemble it. It is a
 * heuristic: it looks up short exact words, then tries to grow those seeds, which is what makes
 * searching GenBank take seconds rather than days, and what means it can miss a real similarity that
 * shares no word.
 *
 * **It is a search, not a request that answers.** A search is submitted, NCBI replies with a ticket,
 * and the results are fetched by presenting that ticket until they are ready. NCBI's developer notes
 * ask that nobody speak to the server more often than once every ten seconds, nor poll a single
 * ticket more often than once a minute, and that a contact address is sent so they can write to you
 * before blocking you. All three are honoured here, with Biopython's own timings.
 *
 * - `settings.ts`: `settings`, `NCBI_BLAST_URL` — who is asking, and the clock the waiting uses
 * - `request.ts`: `putOf`, `getOf`, `PROGRAMS` — the two requests, built without sending anything
 * - `refpage.ts`: `readRefPage` — the ticket, out of the "please wait" page
 * - `qblast.ts`: `qblast`, `submit`, `collect` — the whole search, and its two halves on their own
 *
 * What it does **not** do: parse the results. BLAST XML comes back as text; `Bio.Blast.parse` has no
 * counterpart here yet. `@biolibs/align`'s tabular reader already reads BLAST's `-outfmt 7`, so a
 * search asking for `Tabular` can be read today.
 *
 * @example
 * ```ts
 * import { qblast, settings } from "@biolibs/blast";
 *
 * settings.email = "a.n.other@example.com";    // NCBI ask for this, and so does courtesy
 * const found = await qblast({ program: "blastn", database: "nt", sequence: "ACGTACGT..." });
 * found.rid;        // the ticket NCBI gave it
 * found.results;    // the BLAST XML
 * ```
 */
export * from "./settings.js";
export * from "./request.js";
export * from "./refpage.js";
export * from "./qblast.js";
