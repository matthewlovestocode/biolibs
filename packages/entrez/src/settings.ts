/**
 * The settings every request shares, and the three things a request needs from the outside world:
 * something to send it, a clock and a way to wait.
 *
 * Biopython keeps these as module variables (`Entrez.email`, `Entrez.max_tries`, ...). Here they are
 * fields of one object, so that they can be set from any module that imports it.
 */
import { fetchTransport, type Transport } from "./transport.js";

/** The fields of {@link settings}. */
export interface Settings {
  /** Your email address, sent with every request so NCBI can contact you before blocking heavy use. `Entrez.email`. */
  email: string | null;
  /** The name of the software making the request. `Entrez.tool`. */
  tool: string | null;
  /** An NCBI API key, which raises the limit from 3 requests a second to 10. `Entrez.api_key`. */
  apiKey: string | null;
  /** How many times to try a request before giving up. `Entrez.max_tries`. */
  maxTries: number;
  /** Seconds to wait before trying again after a request got no answer. `Entrez.sleep_between_tries`. */
  sleepBetweenTries: number;
  /** Sends a request. The default uses `fetch`; replace it to use something else, or to test. */
  transport: Transport;
  /** The current time, in seconds. */
  now: () => number;
  /** Waits for a number of seconds. */
  sleep: (seconds: number) => Promise<void>;
}

/**
 * Shared settings, with Biopython's defaults.
 *
 * @example
 * ```ts
 * import { settings } from "@biolibs/entrez";
 *
 * settings.email = "a.n.other@example.com";   // Python: Entrez.email = "a.n.other@example.com"
 * settings.apiKey = "0123456789abcdef";       // optional
 * ```
 */
export const settings: Settings = {
  email: null,
  tool: "biopython",
  apiKey: null,
  maxTries: 3,
  sleepBetweenTries: 15,
  transport: fetchTransport,
  now: () => Date.now() / 1000,
  sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
};
