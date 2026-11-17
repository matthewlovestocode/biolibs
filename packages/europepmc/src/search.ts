/**
 * Searching the literature, and what one result says about itself.
 *
 * Europe PMC indexes PubMed, PubMed Central, preprints, patents and theses together, which is why
 * it is worth asking rather than PubMed alone: a method is as likely to be in a preprint as in a
 * journal. What matters most for reading afterwards is not in the title at all — it is whether the
 * paper is open access and whether its full text is actually here, because that decides whether
 * anything beyond the abstract can be read. So {@link Found.fullText} says so plainly, instead of
 * leaving a caller to work it out from three separate flags.
 */
import { ask, EuropePmcError } from "./ask.js";

/** The most results one search gives back. */
export const MOST_FOUND = 100;

/** How many it gives back when nobody says. */
export const USUAL_FOUND = 10;

/** Which part of the literature to search. */
export const CORPORA = ["all", "open-access", "preprints", "reviews"] as const;

/** One of them. */
export type Corpus = (typeof CORPORA)[number];

/** What one result says about itself. */
export interface Found {
  /** Europe PMC's own ID for it, and which index it is in: `MED`, `PMC`, `PPR` for a preprint. */
  id: string;
  source: string;
  /** The PubMed ID, the PubMed Central ID and the DOI, where it has them. */
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  /** The title, with the full stop journals put on the end taken off. */
  title: string;
  /** The authors, as written. */
  authors: string[];
  /** Where and when it was published. */
  journal: string | null;
  year: number | null;
  /** The abstract, if the search was asked for one. */
  abstract: string | null;
  /** How many papers Europe PMC has that cite it. A rough measure of whether anybody built on it. */
  citedBy: number;
  /** Whether the paper is open access, and whether its full text can actually be read here. */
  openAccess: boolean;
  fullText: boolean;
  /** Whether it has data, supplementary files or a reference list worth following. */
  hasSupplement: boolean;
  hasReferences: boolean;
  /** Where a person would read it. */
  lookAt: string;
}

/** What a search found. */
export interface Search {
  /** What was asked. */
  query: string;
  /** How many matched in all, which is usually far more than are returned. */
  matched: number;
  /** The results. */
  results: Found[];
  /** A cursor for the next page, or `null` at the end. */
  next: string | null;
}

/** What the service sends back, in as much shape as is read. */
interface RawResult {
  [field: string]: unknown;
  journalInfo?: { journal?: { title?: string }; yearOfPublication?: number };
}

const words = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/**
 * A title with its markup gone.
 *
 * The service sends a title as it was typed, markup and all, so a paper about α<sub>S1</sub>-casein
 * arrives with the tags in it. Nothing downstream renders them, so they would be read aloud.
 */
const plain = (value: unknown): string | null => {
  const said = words(value);
  return said === null ? null : words(said.replace(/<[^>]{0,80}>/g, ""));
};
const yes = (value: unknown): boolean => value === "Y" || value === true;

/** The authors as a list, from the one string the service writes them in. */
const authorsOf = (value: unknown): string[] =>
  (words(value) ?? "").replace(/\.$/, "").split(/,\s*/).map((one) => one.trim()).filter((one) => one !== "");

/** What the query is narrowed with, for a corpus that is a filter rather than an index. */
const NARROWED: Readonly<Record<Corpus, string>> = {
  all: "",
  "open-access": "OPEN_ACCESS:Y",
  preprints: "SRC:PPR",
  reviews: "PUB_TYPE:\"review\"",
};

/**
 * One result, read into something steady.
 *
 * @param raw - What the service sent for it.
 * @returns What it says about itself.
 */
export function oneFound(raw: RawResult): Found {
  const id = words(raw["id"]) ?? "";
  const source = words(raw["source"]) ?? "MED";
  const pmcid = words(raw["pmcid"]);
  const doi = words(raw["doi"]);
  return {
    id, source,
    pmid: words(raw["pmid"]), pmcid, doi,
    // Journals put a full stop on the end of a title; it is not part of the title.
    title: (plain(raw["title"]) ?? "Untitled").replace(/\.$/, ""),
    authors: authorsOf(raw["authorString"]),
    journal: words(raw["journalTitle"]) ?? words(raw.journalInfo?.journal?.title) ?? null,
    year: typeof raw["pubYear"] === "string" && /^\d{4}$/.test(raw["pubYear"]) ? Number(raw["pubYear"])
        : typeof raw.journalInfo?.yearOfPublication === "number" ? raw.journalInfo.yearOfPublication : null,
    abstract: words(raw["abstractText"]),
    citedBy: typeof raw["citedByCount"] === "number" ? raw["citedByCount"] : 0,
    openAccess: yes(raw["isOpenAccess"]),
    // Open access is a licence; being in Europe PMC is whether the text is here to read. Both have
    // to hold, and a caller that is about to read a paper cares only about the second.
    fullText: yes(raw["inEPMC"]) && pmcid !== null,
    hasSupplement: yes(raw["hasSuppl"]) || yes(raw["hasData"]),
    hasReferences: yes(raw["hasReferences"]),
    lookAt: `https://europepmc.org/article/${source}/${id}`,
  };
}

/**
 * Search the literature.
 *
 * @param query - What to look for, in Europe PMC's own syntax: plain words, phrases in quotes, and
 *   fields such as `AUTH:`, `TITLE:`, `METHODS:`, `JOURNAL:`, `PUB_YEAR:`. `AND`, `OR` and `NOT`
 *   join them.
 * @param options - `limit` is how many to bring back; `corpus` narrows to open access, preprints or
 *   reviews; `abstracts` asks for abstracts too, which makes the reply much larger; `cursor` carries
 *   on from a previous search's `next`; `sort` is `cited`, `date` or relevance, which is the default.
 * @returns What matched.
 * @throws {@link EuropePmcError} if the service could not be reached or did not answer with results.
 *
 * @example
 * ```ts
 * import { searchArticles } from "@biolibs/europepmc";
 *
 * const found = await searchArticles('"kappa-casein" AND "Pichia pastoris"', { corpus: "open-access", abstracts: true });
 * found.results.filter((one) => one.fullText).map((one) => one.pmcid);
 * ```
 */
export async function searchArticles(query: string, options: {
  limit?: number; corpus?: Corpus; abstracts?: boolean; cursor?: string; sort?: "cited" | "date" | "relevance";
} = {}): Promise<Search> {
  const asked = query.trim();
  if (asked === "") throw new EuropePmcError("There is nothing to search for.", "", null);
  const narrowed = NARROWED[options.corpus ?? "all"];
  const whole = narrowed === "" ? asked : `(${asked}) AND ${narrowed}`;
  const limit = Math.max(1, Math.min(MOST_FOUND, options.limit ?? USUAL_FOUND));
  const body = await ask("search", {
    query: whole, format: "json", pageSize: limit,
    resultType: options.abstracts === true ? "core" : "lite",
    cursorMark: options.cursor ?? "*",
    ...(options.sort === "cited" ? { sort: "CITED desc" } : options.sort === "date" ? { sort: "P_PDATE_D desc" } : {}),
  });
  let answer: { hitCount?: number; nextCursorMark?: string; resultList?: { result?: RawResult[] } };
  try { answer = JSON.parse(body); } catch { throw new EuropePmcError("Europe PMC sent back something that is not the answer to a search.", "search"); }
  const results = (answer.resultList?.result ?? []).map(oneFound);
  const next = words(answer.nextCursorMark);
  return {
    query: whole,
    matched: typeof answer.hitCount === "number" ? answer.hitCount : results.length,
    results,
    // The service always sends a cursor, including one that would fetch the same page again.
    next: next === null || next === (options.cursor ?? "*") || results.length < limit ? null : next,
  };
}
