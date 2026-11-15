/**
 * Sending a request and receiving the reply: the one part of this package that touches the network.
 *
 * Everything else is given a {@link Fetcher}, so it can be run, and tested, without one.
 */
import { HTTPError, URLError } from "@biolibs/entrez";

/** One request, as Biopython hands it to `urllib`. */
export interface PdbRequest {
  /** The full address. */
  url: string;
  /** `"POST"` when there is a body, as `urllib` decides it, and `"GET"` otherwise. */
  method: "GET" | "POST";
  /** The body of a POST, or `null`. */
  data: Uint8Array | null;
  /** The headers Biopython sets, which is none for a download. */
  headers: Record<string, string>;
}

/**
 * Sends a request.
 *
 * @param request - What to send.
 * @returns The body of the reply, if the server answered with success.
 * @throws `HTTPError` if it answered with anything else, and `URLError` if it did not answer; both are
 * the entrez package's, re-exported here.
 */
export type Fetcher = (request: PdbRequest) => Promise<Uint8Array>;

/**
 * The default {@link Fetcher}: the platform's `fetch`, in a browser or in Node 20 and later.
 *
 * `Content-Length` is left for `fetch` to work out, since a page is not allowed to set it. This function
 * is not measured against Biopython, because what it does is talk to the network; its own tests run it
 * against a stand-in for `fetch`.
 *
 * @param request - What to send.
 * @returns The body of the reply.
 * @throws `HTTPError` for a status outside 200 to 299, and `URLError` if `fetch` itself fails.
 */
export const fetchBytes: Fetcher = async (request) => {
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.toLowerCase() !== "content-length"));
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      ...(request.data ? { body: request.data as BodyInit } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
  } catch (error) {
    throw new URLError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new HTTPError(request.url, response.status, response.statusText);
  return new Uint8Array(await response.arrayBuffer());
};

/** The root of the archive on the server Biopython uses: every archive address a `PDBList` builds starts with it. */
export const WWPDB_ARCHIVE = "https://files.wwpdb.org/pub/pdb";

/**
 * The same archive at PDBe, the European partner of the wwPDB. Unlike `files.wwpdb.org` it answers with
 * `Access-Control-Allow-Origin: *`, so a web page can read from it.
 */
export const PDBE_ARCHIVE = "https://ftp.ebi.ac.uk/pub/databases/pdb";

/**
 * A {@link Fetcher} that asks a mirror for what would have been asked of the archive.
 *
 * This is not Biopython's: its `server` argument can only name a mirror whose files sit under
 * `/pub/pdb`, and it has no need of one that a browser may read. Requests for anything outside the
 * archive, such as the search for assemblies, are passed on untouched.
 *
 * @param mirror - The root of the mirror. Default {@link PDBE_ARCHIVE}.
 * @param fetcher - What sends the rewritten request. Default {@link fetchBytes}.
 * @param archive - The root being replaced. Default {@link WWPDB_ARCHIVE}; pass your own if you set `server`.
 * @returns The fetcher.
 * @example
 * ```ts
 * const pdbl = new PDBList({ fetcher: viaMirror(), verbose: false });
 * await pdbl.retrievePdbFile("4HHB", { fileFormat: "pdb" });
 * // asks https://ftp.ebi.ac.uk/pub/databases/pdb/data/structures/divided/pdb/hh/pdb4hhb.ent.gz
 * ```
 */
export function viaMirror(mirror: string = PDBE_ARCHIVE, fetcher: Fetcher = fetchBytes, archive: string = WWPDB_ARCHIVE): Fetcher {
  return (request) => fetcher(request.url.startsWith(`${archive}/`) ? { ...request, url: mirror + request.url.slice(archive.length) } : request);
}
