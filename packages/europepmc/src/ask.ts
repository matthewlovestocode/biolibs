/**
 * Asking Europe PMC something: the one part of this package that touches the network.
 *
 * Everything else is given a {@link Transport}, so the rest can be run, and tested, without one.
 *
 * Europe PMC's REST service needs no key and no account. What it asks of a client is that it names
 * itself, so that heavy use can be traced to a piece of software rather than to nobody. It is told
 * the software's name and nothing else: never a person, never an address, unless somebody sets one
 * on purpose.
 */
import { BioError } from "@biolibs/core";

/** Where the service lives. */
export const SERVICE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

/** Something went wrong asking Europe PMC. */
export class EuropePmcError extends BioError {
  /** The HTTP status, or `null` if there was no answer at all. */
  readonly status: number | null;
  /** The address that was asked for. */
  readonly url: string;
  /**
   * Whether the service could not be reached at all.
   *
   * It is a field of its own because a missing status does not mean what it looks like it means.
   * An ID that is the wrong shape is refused before anything is sent, and so has no status either,
   * and telling somebody their device is offline when what is wrong is their typing sends them to
   * check the wrong thing.
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
    this.name = "EuropePmcError";
    this.url = url;
    this.status = status;
    this.offline = offline;
  }
}

/** A successful reply, before anything is done with it. */
export interface Reply {
  /** The `Content-Type` header, or `null` if there was none. */
  contentType: string | null;
  /** The body, as text. */
  body: string;
}

/**
 * Sends a request.
 *
 * @param url - The whole address, query string and all.
 * @param headers - What to send with it.
 * @returns The reply, if the service answered with success.
 * @throws {@link EuropePmcError} otherwise.
 */
export type Transport = (url: string, headers: Readonly<Record<string, string>>) => Promise<Reply>;

/** The default {@link Transport}: the platform's `fetch`. */
export const fetchTransport: Transport = async (url, headers) => {
  let response: Response;
  try {
    response = await fetch(url, { headers: { ...headers } });
  } catch (cause) {
    throw new EuropePmcError(`Europe PMC could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, url, null, true);
  }
  if (!response.ok) throw new EuropePmcError(`Europe PMC answered ${response.status} ${response.statusText}.`, url, response.status);
  return { contentType: response.headers.get("content-type"), body: await response.text() };
};

/** The settings every request shares. */
export interface Settings {
  /**
   * What to call this software when asking. Europe PMC asks a client to name itself so that heavy
   * use can be traced to a program; it is never a person's name.
   */
  tool: string;
  /**
   * An address Europe PMC could use to get in touch about heavy use, if somebody has given one for
   * that on purpose. It is never taken from a lab, a document or a device.
   */
  email: string | null;
  /** The most characters of any reply that will be read. A paper is not a genome, but some are long. */
  mostCharacters: number;
  /** Sends a request. Replace it to use something else, or to test without a network. */
  transport: Transport;
}

/** Shared settings. */
export const settings: Settings = {
  tool: "biolibs-europepmc",
  email: null,
  mostCharacters: 4_000_000,
  transport: fetchTransport,
};

/**
 * Ask the service for something.
 *
 * @param path - The path under the service, such as `search` or `PMC123/fullTextXML`.
 * @param query - The query string, as pairs. Anything `undefined` is left out.
 * @returns The body, as text.
 * @throws {@link EuropePmcError} if it could not be reached, answered with a failure, or sent back
 *   more than {@link Settings.mostCharacters}.
 *
 * @example
 * ```ts
 * import { ask } from "@biolibs/europepmc";
 *
 * const body = await ask("search", { query: "casein AND yeast", format: "json", pageSize: 5 });
 * ```
 */
export async function ask(path: string, query: Readonly<Record<string, string | number | undefined>> = {}): Promise<string> {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value !== undefined) search.set(name, String(value));
  // The service names it `email`, and sends nothing back that depends on it: it is a way to be told
  // off before being blocked, and it only goes if somebody put one in the settings.
  if (settings.email !== null && settings.email.trim() !== "") search.set("email", settings.email.trim());
  const url = `${SERVICE}/${path}${search.size === 0 ? "" : `?${search.toString()}`}`;
  let reply: Reply;
  try {
    reply = await settings.transport(url, { "User-Agent": settings.tool, Accept: "application/json, application/xml;q=0.9, */*;q=0.8" });
  } catch (cause) {
    // The transport is replaceable, and this says it throws one kind of error. One that threw
    // something else still failed to deliver a request, which is what being offline is.
    if (cause instanceof EuropePmcError) throw cause;
    throw new EuropePmcError(`Europe PMC could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, url, null, true);
  }
  if (reply.body.length > settings.mostCharacters) {
    throw new EuropePmcError(`That reply is ${reply.body.length.toLocaleString("en-US")} characters, which is more than one ask reads.`, url);
  }
  return reply.body;
}
