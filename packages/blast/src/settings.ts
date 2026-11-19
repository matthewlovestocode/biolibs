/**
 * The settings every search shares, and the three things a search needs from the outside world:
 * something to send a request, a clock and a way to wait.
 *
 * Biopython keeps these as module variables — `Bio.Blast.email`, `Bio.Blast.tool`, and a `previous`
 * attribute hung on the `qblast` function itself to remember when it last spoke to NCBI. Here they
 * are fields of one object, so that they can be set from any module that imports it, and so that a
 * test can hand over a clock that does not really tick.
 */
import { fetchTransport, type Transport } from "@biolibs/entrez";

/** The fields of {@link settings}. */
export interface Settings {
  /** Your email address, sent with every search so NCBI can contact you before blocking heavy use. `Bio.Blast.email`. */
  email: string | null;
  /** The name of the software making the search. `Bio.Blast.tool`. */
  tool: string | null;
  /**
   * When NCBI was last spoken to, in seconds. Biopython keeps this on the function as
   * `qblast.previous`, and it is what keeps the polling from going faster than NCBI asks.
   */
  previous: number;
  /** Sends a request. The default uses `fetch`; replace it to use something else, or to test. */
  transport: Transport;
  /** The current time, in seconds. */
  now: () => number;
  /** Waits for a number of seconds. */
  sleep: (seconds: number) => Promise<void>;
  /** Told how long a search has been running, each time it is polled. Silent by default. */
  waiting: (seconds: number, rid: string) => void;
}

/** NCBI's BLAST endpoint. `Bio.Blast.NCBI_BLAST_URL`. */
export const NCBI_BLAST_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi";

/**
 * Shared settings, with Biopython's defaults.
 *
 * @example
 * ```ts
 * import { settings } from "@biolibs/blast";
 *
 * settings.email = "a.n.other@example.com";   // Python: Bio.Blast.email = "a.n.other@example.com"
 * settings.tool = "my-lab-notebook";
 * ```
 */
export const settings: Settings = {
  email: null,
  tool: "biopython",
  previous: 0,
  transport: fetchTransport,
  now: () => Date.now() / 1000,
  sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
  waiting: () => undefined,
};
