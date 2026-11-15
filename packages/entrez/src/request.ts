/**
 * A request for an E-utility, built the way Biopython's `_build_request` builds one.
 */
import { AttributeError } from "@biolibs/core";
import { constructParams, type Params } from "./params.js";
import { pyTypeOf } from "./pytext.js";
import { urlencode } from "./urlencode.js";

/** What will be sent: the counterpart of Python's `urllib.request.Request`. */
export class EntrezRequest {
  /** The address, including the query string for a GET. `Request.full_url`. */
  readonly fullUrl: string;
  /** `"GET"` or `"POST"`. */
  readonly method: "GET" | "POST";
  /** The body of a POST, already URL-encoded; `null` for a GET. */
  readonly data: Uint8Array | null;

  /**
   * @param fullUrl - The address, including any query string.
   * @param method - `"GET"` or `"POST"`.
   * @param data - The body of a POST.
   */
  constructor(fullUrl: string, method: "GET" | "POST" = "GET", data: Uint8Array | null = null) {
    this.fullUrl = fullUrl;
    this.method = method;
    this.data = data;
  }
}

/**
 * How many identifiers a request's `id` holds, as Biopython counts them: commas plus one.
 *
 * It asks the value itself for its `count` method, so text is counted by its commas, a list by how
 * many of its elements are exactly `","`, and a number, which has no such method, is an error. That
 * last case is reached by `elink`, which does not join its identifiers first.
 *
 * @param id - The `id` parameter as it will be sent. @returns The count.
 * @throws AttributeError for a number or boolean, and TypeError for bytes, as Python raises.
 */
function idCount(id: unknown): number {
  if (typeof id === "string") return id.split(",").length;
  if (Array.isArray(id)) return id.filter((element) => element === ",").length + 1;
  if (id instanceof Uint8Array) throw new TypeError("argument should be integer or bytes-like object, not 'str'");
  throw new AttributeError(`'${pyTypeOf(id)}' object has no attribute 'count'`);
}

/**
 * Biopython's `_build_request`: turn an E-utility's address and parameters into a request.
 *
 * A GET carries the parameters in the address; a POST carries them in the body. Unless told which to
 * use, it posts when the encoded parameters come to more than 1,000 characters or there are 200 or
 * more identifiers, as the E-utilities documentation asks.
 *
 * @param cgi - The address of the E-utility.
 * @param params - Its parameters; see {@link constructParams} for what is added to them.
 * @param post - `true` to POST, `false` to GET, `null` (the default) to decide by size.
 * @param ecitmatch - Leave `|` unescaped, which only `ecitmatch` wants.
 * @param joinIds - Passed to {@link constructParams}.
 * @returns The request, ready for {@link open}.
 * @throws AttributeError when the size has to be decided and `id` is an unjoined number.
 * @example
 * ```ts
 * settings.email = "a.n.other@example.com";
 * buildRequest("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", { db: "pubmed", term: "biopython" }).fullUrl;
 * // "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=biopython&tool=biopython&email=a.n.other%40example.com"
 * ```
 */
export function buildRequest(cgi: string, params?: Params | null, post: boolean | null = null, ecitmatch = false, joinIds = true): EntrezRequest {
  const sent = constructParams(params, joinIds);
  let text = urlencode(sent);
  if (ecitmatch) text = text.replaceAll("%7C", "|");

  let usePost = post;
  // The parameters are ASCII by now, so their length is the same counted in characters or in bytes.
  if (usePost === null && text.length > 1000) usePost = true;
  // NCBI prefers a POST once there are about 200 identifiers.
  if (usePost === null && sent.has("id") && idCount(sent.get("id")) >= 200) usePost = true;

  return usePost ? new EntrezRequest(cgi, "POST", new TextEncoder().encode(text)) : new EntrezRequest(`${cgi}?${text}`, "GET");
}

/**
 * Biopython's `_has_api_key`: whether a request carries an API key, which decides how long to wait
 * before sending it.
 *
 * @param request - A request. @returns True if `api_key=` appears in the body of a POST or the address of a GET.
 */
export function hasApiKey(request: EntrezRequest): boolean {
  if (request.method === "POST") return new TextDecoder("latin1").decode(request.data ?? new Uint8Array()).includes("api_key=");
  return request.fullUrl.includes("api_key=");
}
