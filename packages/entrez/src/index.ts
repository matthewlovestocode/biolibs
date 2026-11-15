/**
 * @packageDocumentation
 * `@biolibs/entrez`: a client for NCBI's E-utilities, ported from Biopython's `Bio.Entrez`.
 *
 * It builds the same requests Biopython builds, spaces them out and retries them the same way, and
 * hands back the reply for `@biolibs/seqio` and the other parsers to read. It is the one package here
 * that touches the network, and it does so through a single replaceable function.
 *
 * `Entrez.read` and `Entrez.parse`, which turn NCBI's XML into objects, are not ported yet.
 *
 * - `eutils.ts`: `efetch`, `esearch`, `epost`, `elink`, `einfo`, `esummary`, `espell`, `ecitmatch` —
 *   the eight E-utilities — and `updateEcitmatchVariables`
 * - `request.ts`: `EntrezRequest`, `buildRequest`, `hasApiKey` — a request, and when it is a POST
 * - `params.ts`: `constructParams`, `formatIds`, `toMap`, `Params`, `EMAIL_WARNING` — what is added
 *   to the caller's parameters
 * - `urlencode.ts`: `urlencode`, `quotePlus` — Python's own URL encoding
 * - `pytext.ts`: `pyText`, `pyTypeOf` — Python's `str()` for parameter values
 * - `open.ts`: `open`, `EntrezHandle`, `throttle`, `contentSubtype` — sending, pacing, retrying, and the reply
 * - `transport.ts`: `Transport`, `Reply`, `fetchTransport` — the only code that touches the network
 * - `settings.ts`: `settings` — email, tool, API key, retry policy, transport and clock
 * - `errors.ts`: `HTTPError`, `URLError`, `UnicodeEncodeError`, `UnicodeDecodeError`
 *
 * @example
 * ```ts
 * import { efetch, settings } from "@biolibs/entrez";
 *
 * settings.email = "a.n.other@example.com";
 * const handle = await efetch("nucleotide", { id: "EU490707", rettype: "gb", retmode: "text" });
 * handle.readText();   // GenBank text, ready for the `read` function of the seqio package
 * ```
 */
export * from "./errors.js";
export * from "./pytext.js";
export * from "./urlencode.js";
export * from "./settings.js";
export * from "./params.js";
export * from "./request.js";
export * from "./transport.js";
export * from "./open.js";
export * from "./eutils.js";
