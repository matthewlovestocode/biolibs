/**
 * The eight E-utilities: Biopython's `efetch`, `esearch`, `epost`, `elink`, `einfo`, `esummary`,
 * `espell` and `ecitmatch`.
 *
 * Each builds its request as soon as it is called, so a bad argument throws, and the missing-email
 * warning is given, before anything is sent. What comes back is a promise of the reply.
 */
import { KeyError } from "@biolibs/core";
import { type EntrezHandle, open } from "./open.js";
import { type Params, toMap } from "./params.js";
import { pyTypeOf } from "./pytext.js";
import { buildRequest } from "./request.js";

/** The address every E-utility lives under. */
export const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";

/** The fields of a citation, in the order `ecitmatch` wants them. */
const CITATION_KEYS = ["journal_title", "year", "volume", "first_page", "author_name", "key"] as const;

/**
 * A positional argument followed by the caller's keywords, as one ordered set of parameters.
 *
 * @param first - The parameters the function takes by position.
 * @param keywords - The rest. @returns Both, the positional ones first.
 */
function withKeywords(first: [string, unknown][], keywords: Params | null | undefined): Map<string, unknown> {
  const variables = new Map<string, unknown>(first);
  for (const [key, value] of toMap(keywords)) variables.set(key, value);
  return variables;
}

/**
 * `Entrez.efetch`: retrieve records in the requested format from a list of identifiers or from the
 * history server.
 *
 * @param db - The database, such as `"nucleotide"`, `"protein"` or `"pubmed"`.
 * @param keywords - The rest of the parameters: `id`, `rettype`, `retmode`, `retstart`, `retmax`,
 *   `WebEnv`, `query_key` and so on. An `id` list is joined with commas.
 * @returns The reply. Use `readText()` to get text for `@biolibs/seqio`.
 * @example
 * ```ts
 * const handle = await efetch("nucleotide", { id: "EU490707", rettype: "gb", retmode: "text" });
 * const record = read(handle.readText(), "genbank");   // read from @biolibs/seqio
 * ```
 */
export function efetch(db: string, keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}efetch.fcgi`, withKeywords([["db", db]], keywords)));
}

/**
 * `Entrez.esearch`: search a database and get back the identifiers of what matched.
 *
 * @param db - The database to search.
 * @param term - The query, in Entrez's own syntax, such as `"Opuntia[orgn] AND rpl16"`.
 * @param keywords - The rest of the parameters: `retmax`, `retstart`, `usehistory`, `sort`, `idtype` and so on.
 * @returns The reply, which is XML unless `retmode` asks otherwise.
 * @example
 * ```ts
 * const handle = await esearch("pubmed", "biopython[title]", { retmax: 20 });
 * ```
 */
export function esearch(db: string, term: string, keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}esearch.fcgi`, withKeywords([["db", db], ["term", term]], keywords)));
}

/**
 * `Entrez.epost`: upload a list of identifiers to the history server, for later requests to refer to.
 * Always sent as a POST.
 *
 * @param db - The database the identifiers belong to.
 * @param keywords - `id`, and optionally `WebEnv` and `query_key` to add to an existing set.
 * @returns The reply, XML naming the `WebEnv` and `query_key` to use next.
 */
export function epost(db: string, keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}epost.fcgi`, withKeywords([["db", db]], keywords), true));
}

/**
 * `Entrez.elink`: find records related to a set of identifiers, in the same database or another.
 *
 * Unlike the other functions it does **not** join an `id` list with commas: it repeats the parameter,
 * which asks NCBI for the links of each identifier separately. Join them yourself to get one combined
 * answer. A single `id` must be text; Biopython fails on a number here, and so does this.
 *
 * @param keywords - `dbfrom`, `db`, `id`, `cmd`, `linkname` and so on.
 * @returns The reply, as XML.
 * @throws AttributeError if `id` is a number.
 */
export function elink(keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}elink.fcgi`, toMap(keywords), null, false, false));
}

/**
 * `Entrez.einfo`: list the Entrez databases, or describe one.
 *
 * @param keywords - Nothing, for the list; or `db`, for that database's fields and links.
 * @returns The reply, as XML.
 */
export function einfo(keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}einfo.fcgi`, toMap(keywords)));
}

/**
 * `Entrez.esummary`: get document summaries for a list of identifiers.
 *
 * @param keywords - `db`, `id`, and optionally `retmode`, `WebEnv`, `query_key` and so on.
 * @returns The reply, as XML unless `retmode` asks otherwise.
 */
export function esummary(keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}esummary.fcgi`, toMap(keywords)));
}

/**
 * `Entrez.espell`: get spelling suggestions for a query.
 *
 * @param keywords - `term`, and optionally `db`.
 * @returns The reply, as XML.
 */
export function espell(keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}espell.fcgi`, toMap(keywords)));
}

/**
 * Biopython's `_update_ecitmatch_variables`: the parameters `ecitmatch` sends.
 *
 * @param keywords - As given to {@link ecitmatch}.
 * @returns `retmode`, then either everything in `keywords`, when `bdata` is already text, or just `db`
 *   and the citations written out as `bdata`, when it is a list.
 * @throws KeyError if `bdata` is missing, or `db` is missing and `bdata` is a list.
 * @throws TypeError if `bdata` is neither text nor a list, or a citation field is not text.
 */
export function updateEcitmatchVariables(keywords?: Params | null): Map<string, unknown> {
  const given = toMap(keywords);
  const variables = new Map<string, unknown>([["retmode", "xml"]]);
  if (!given.has("bdata")) throw new KeyError("bdata");
  const bdata = given.get("bdata");
  if (typeof bdata === "string") {
    for (const [key, value] of given) variables.set(key, value);
    return variables;
  }
  if (!given.has("db")) throw new KeyError("db");
  variables.set("db", given.get("db"));
  if (!Array.isArray(bdata)) throw new TypeError(`'${pyTypeOf(bdata)}' object is not iterable`);
  const lines = bdata.map((citation) => {
    const fields = toMap(citation as Params);
    return CITATION_KEYS.map((key, i) => {
      const field = fields.has(key) ? fields.get(key) : "";
      if (typeof field !== "string") throw new TypeError(`sequence item ${i}: expected str instance, ${pyTypeOf(field)} found`);
      return field;
    }).join("|");
  });
  variables.set("bdata", lines.join("\r"));
  return variables;
}

/**
 * `Entrez.ecitmatch`: find the PubMed identifiers of citations.
 *
 * @param keywords - `db` and `bdata`. `bdata` is either the citation text NCBI specifies, or a list of
 *   citations, each an object with any of `journal_title`, `year`, `volume`, `first_page`,
 *   `author_name` and `key`.
 * @returns The reply, as text: each citation followed by the identifier found for it.
 * @throws KeyError if `bdata` is missing, or `db` is missing and `bdata` is a list.
 * @example
 * ```ts
 * const handle = await ecitmatch({
 *   db: "pubmed",
 *   bdata: [{ journal_title: "proc natl acad sci u s a", year: "1991", volume: "88", first_page: "3248",
 *             author_name: "mann bj", key: "citation_1" }],
 * });
 * ```
 */
export function ecitmatch(keywords?: Params | null): Promise<EntrezHandle> {
  return open(buildRequest(`${EUTILS}ecitmatch.cgi`, updateEcitmatchVariables(keywords), null, true));
}
