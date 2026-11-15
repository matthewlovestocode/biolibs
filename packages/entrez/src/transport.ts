/**
 * Sending a request and receiving the reply: the one part of this package that touches the network.
 *
 * Everything else is given a {@link Transport}, so it can be run, and tested, without one.
 */
import { HTTPError, URLError } from "./errors.js";
import type { EntrezRequest } from "./request.js";

/** A successful reply, before anything is done with it. */
export interface Reply {
  /** Where the reply finally came from, after any redirects. */
  url: string;
  /** The `Content-Type` header, or `null` if there was none. */
  contentType: string | null;
  /** The body. */
  body: Uint8Array;
}

/**
 * Sends a request.
 *
 * @param request - What to send.
 * @returns The reply, if the server answered with success.
 * @throws {@link HTTPError} if it answered with anything else, and {@link URLError} if it did not answer.
 */
export type Transport = (request: EntrezRequest) => Promise<Reply>;

/**
 * The default {@link Transport}: the platform's `fetch`, in a browser or in Node 20 and later.
 *
 * A POST is sent as `application/x-www-form-urlencoded`, as Python's `urllib` sends one. This function
 * is not measured against Biopython, because what it does is talk to the network; its own tests run it
 * against a stand-in for `fetch`.
 *
 * @param request - What to send.
 * @returns The reply.
 * @throws {@link HTTPError} for a status outside 200 to 299, and {@link URLError} if `fetch` itself fails.
 */
export const fetchTransport: Transport = async (request) => {
  let response: Response;
  try {
    response = await fetch(request.fullUrl, {
      method: request.method,
      ...(request.data ? { body: request.data as BodyInit, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
    });
  } catch (error) {
    throw new URLError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new HTTPError(request.fullUrl, response.status, response.statusText);
  return { url: response.url || request.fullUrl, contentType: response.headers.get("content-type"), body: new Uint8Array(await response.arrayBuffer()) };
};
