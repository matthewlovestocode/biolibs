/**
 * A BLAST search at NCBI: submit, wait, fetch.
 *
 * NCBI's BLAST is not a request that answers. It is a request that answers with a ticket, and the
 * results are fetched by presenting the ticket until they are ready. Their developer notes ask that
 * nobody contact the server more often than once every ten seconds, nor poll any single ticket more
 * often than once a minute, and Biopython's loop is written to that: twenty seconds before the first
 * look, a minute between every look after it, and a count that starts from when the last search
 * spoke to NCBI rather than from now, so that two searches in a row still leave a gap.
 *
 * None of that is guesswork here — the delays, the order of the parameters and the pages that are
 * skipped rather than read are all Biopython's, and the recorded cases compare them.
 */
import { ValueError } from "@biolibs/core";
import { HTTPError, URLError } from "@biolibs/entrez";
import { NCBI_BLAST_URL, settings } from "./settings.js";
import { getOf, putOf, type FormatType, type Search } from "./request.js";
import { readRefPage, type Submitted } from "./refpage.js";

/** Twenty seconds before the first look, because almost nothing is ready sooner. */
export const FIRST_DELAY = 20;
/** A minute between every look after that, which is what NCBI asks for a single ticket. */
export const THEN_DELAY = 60;
/** After ten minutes, {@link Settings.waiting} is told the search is taking a long time. */
export const LONG_ENOUGH = 600;

/** A finished search. */
export interface Finished extends Submitted {
  /** The results, as the format asked for. */
  results: string;
  /** How many times NCBI was asked before they were ready. */
  polls: number;
}

/** How a format's results begin, which is how a finished answer is told from a waiting page. */
const BEGINS: Record<FormatType, string> = {
  XML: "<?xml ", HTML: "<!DOCTYPE html ", Text: "<p><!--\nQBlastInfoBegin",
  Tabular: "<p><!--\nQBlastInfoBegin", XML2: "PK\u0003\u0004", JSON2: "PK\u0003\u0004",
};

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Submit a search and return its ticket, without waiting for the results.
 *
 * @param search - What to search for, and how.
 * @returns The request identifier, NCBI's estimate in seconds, and any warning raised.
 * @throws {@link ValueError} for a program NCBI does not take, or an error page in place of a
 *   ticket; {@link HTTPError} and {@link URLError} from the network.
 */
export async function submit(search: Search): Promise<Submitted & { warnings: { message: string }[] }> {
  const put = putOf(search);
  const url = search.urlBase ?? NCBI_BLAST_URL;
  const reply = await settings.transport({ method: "POST", fullUrl: url, data: new TextEncoder().encode(put.body) } as never);
  return { ...readRefPage(text(reply.body)), warnings: put.warnings };
}

/**
 * Fetch a submitted search's results once, without waiting.
 *
 * @param search - The same search, for the formatting it asked for.
 * @param rid - The ticket.
 * @returns The body, and whether it is the results rather than another waiting page.
 */
export async function collect(search: Search, rid: string): Promise<{ ready: boolean; body: string }> {
  const url = search.urlBase ?? NCBI_BLAST_URL;
  const reply = await settings.transport({ method: "POST", fullUrl: url, data: new TextEncoder().encode(getOf(search, rid).body) } as never);
  const body = text(reply.body);
  const format = search.formatType ?? "XML";
  // Two pages mean "not yet": the HTML one BLAST shows a browser, and anything else that is a web
  // page rather than an answer. Everything else is taken as the results.
  const waiting = (format === "HTML" && body.includes("<title>NCBI Blast:</title>")) || body.startsWith("<!DOCTYPE html");
  return { ready: !waiting, body };
}

/**
 * Search NCBI's BLAST and wait for the results. `Bio.Blast.qblast`.
 *
 * @param search - What to search for, and how. `program`, `database` and `sequence` are required.
 * @returns The results, the ticket they came back under, and how many times NCBI was asked.
 * @throws {@link ValueError} for a program NCBI does not take, an error page in place of a ticket,
 *   or results that do not begin the way the format asked for should.
 *
 * @example
 * ```ts
 * import { qblast, settings } from "@biolibs/blast";
 *
 * settings.email = "a.n.other@example.com";
 * const found = await qblast({ program: "blastn", database: "nt", sequence: "ACGT..." });
 * found.results;   // the BLAST XML
 * ```
 */
export async function qblast(search: Search): Promise<Finished> {
  const { rid, rtoe } = await submit(search);
  const url = search.urlBase ?? NCBI_BLAST_URL;
  const started = settings.now();
  let delay = FIRST_DELAY;
  let polls = 0;
  for (;;) {
    // Counted from when NCBI was last spoken to, not from now, so that a second search started
    // straight after a first still leaves the gap NCBI asks for.
    const current = settings.now();
    const wait = settings.previous + delay - current;
    if (wait > 0) { await settings.sleep(wait); settings.previous = current + wait; }
    else settings.previous = current;
    if (delay < THEN_DELAY && url === NCBI_BLAST_URL) delay = THEN_DELAY;
    const elapsed = settings.now() - started;
    if (elapsed >= LONG_ENOUGH) settings.waiting(elapsed, rid);
    polls++;
    const { ready, body } = await collect(search, rid);
    if (!ready) continue;
    const format = search.formatType ?? "XML";
    if (!body.startsWith(BEGINS[format])) {
      throw new ValueError(`Results for ${rid} do not begin the way ${format} should: ${JSON.stringify(body.slice(0, 60))}`);
    }
    return { rid, rtoe, results: body, polls };
  }
}
