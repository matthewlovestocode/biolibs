/**
 * Asking UniProt something: the one part of this package that touches the network.
 *
 * Everything else is given a {@link Transport}, so the rest can be run, and tested, without one.
 *
 * UniProt's REST service needs no key and no account. It asks of a client only that it name itself,
 * so that heavy use can be traced to a piece of software rather than to nobody. It is told the
 * software's name and nothing else: never a person, never an address, unless somebody sets one on
 * purpose.
 */
import { BioError } from "@biolibs/core";

/** Where the service lives. */
export const SERVICE = "https://rest.uniprot.org";

/** Something went wrong asking UniProt. */
export class UniProtError extends BioError {
  /** The HTTP status, or `null` if there was no answer at all. */
  readonly status: number | null;
  /** The address that was asked for. */
  readonly url: string;
  /**
   * Whether the service could not be reached at all.
   *
   * It is a field of its own because a missing status does not mean what it looks like it means:
   * an accession of the wrong shape is refused before anything is sent, and so has no status
   * either. Telling somebody their device is offline when what is wrong is their typing sends them
   * to check the wrong thing.
   */
  readonly offline: boolean;

  /**
   * @param message - What went wrong, in words.
   * @param url - What was asked for.
   * @param status - The HTTP status, if there was one.
   * @param offline - Whether the service could not be reached at all.
   */
  constructor(message: string, url: string, status: number | null = null, offline = false) {
    super(message);
    this.name = "UniProtError";
    this.url = url;
    this.status = status;
    this.offline = offline;
  }
}

/** A successful reply, before anything is done with it. */
export interface Reply {
  /** The `Content-Type` header, or `null` if there was none. */
  contentType: string | null;
  /** The body. */
  body: Uint8Array;
}

/**
 * Sends a request.
 *
 * @param url - The whole address, query string and all.
 * @param headers - What to send with it.
 * @returns The reply, if the service answered with success.
 * @throws {@link UniProtError} otherwise.
 */
export type Transport = (url: string, headers: Readonly<Record<string, string>>) => Promise<Reply>;

/** The default {@link Transport}: the platform's `fetch`. */
export const fetchTransport: Transport = async (url, headers) => {
  let response: Response;
  try {
    response = await fetch(url, { headers: { ...headers } });
  } catch (cause) {
    throw new UniProtError(`UniProt could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, url, null, true);
  }
  if (!response.ok) throw new UniProtError(`UniProt answered ${response.status} ${response.statusText}.`, url, response.status);
  return { contentType: response.headers.get("content-type"), body: new Uint8Array(await response.arrayBuffer()) };
};

/** The settings every request shares. */
export interface Settings {
  /** What to call this software when asking. Never a person's name. */
  tool: string;
  /** An address UniProt could use to get in touch about heavy use, if somebody has set one on purpose. */
  email: string | null;
  /** The most bytes of any reply that will be read. A UniProt entry is large; a proteome is larger. */
  mostBytes: number;
  /** Sends a request. Replace it to use something else, or to test without a network. */
  transport: Transport;
}

/** Shared settings. */
export const settings: Settings = {
  tool: "biolibs-uniprot",
  email: null,
  mostBytes: 8_000_000,
  transport: fetchTransport,
};

/**
 * Ask the service for something.
 *
 * @param path - The path under the service, such as `uniprotkb/P02666.xml`.
 * @param query - The query string, as pairs. Anything `undefined` is left out.
 * @returns The body, as bytes, since what comes back is XML to be parsed.
 * @throws {@link UniProtError} if it could not be reached, answered with a failure, or sent back
 *   more than {@link Settings.mostBytes}.
 *
 * @example
 * ```ts
 * import { ask } from "@biolibs/uniprot";
 *
 * const xml = await ask("uniprotkb/P02666.xml");
 * ```
 */
export async function ask(path: string, query: Readonly<Record<string, string | number | undefined>> = {}): Promise<Uint8Array> {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value !== undefined) search.set(name, String(value));
  const url = `${SERVICE}/${path}${search.size === 0 ? "" : `?${search.toString()}`}`;
  const agent = settings.email !== null && settings.email.trim() !== "" ? `${settings.tool} (${settings.email.trim()})` : settings.tool;
  let reply: Reply;
  try {
    reply = await settings.transport(url, { "User-Agent": agent, Accept: "application/xml, application/json;q=0.9, */*;q=0.8" });
  } catch (cause) {
    // The transport is replaceable, and this says it throws one kind of error. One that threw
    // something else still failed to deliver a request, which is what being offline is.
    if (cause instanceof UniProtError) throw cause;
    throw new UniProtError(`UniProt could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, url, null, true);
  }
  if (reply.body.length > settings.mostBytes) {
    throw new UniProtError(`That reply is ${reply.body.length.toLocaleString("en-US")} bytes, which is more than one ask reads.`, url);
  }
  return reply.body;
}

/** Whether something is shaped like a UniProt accession, such as `P02666` or `A0A0B4J2F0`. */
export const looksLikeAccession = (value: string): boolean =>
  /^[OPQ][0-9][A-Z0-9]{3}[0-9]$/i.test(value.trim()) || /^[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}$/i.test(value.trim());
