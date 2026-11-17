/**
 * Following a paper backwards and forwards: what it cited, and who has cited it since.
 *
 * A method is almost never described where you first meet it. A paper says it expressed the gene
 * "as described previously" and gives a number, and the number is the paper that actually has the
 * recipe. So being able to walk the reference list is not a nicety: it is often the only way to the
 * thing somebody is looking for. Going the other way says whether anybody managed to repeat it.
 */
import { ask, EuropePmcError } from "./ask.js";

/** The most on one page of either list. */
export const MOST_ON_A_PAGE = 100;

/** One paper in a trail, said the same way whichever direction it was found in. */
export interface Linked {
  /** Europe PMC's ID for it, and which index it is in. */
  id: string | null;
  source: string | null;
  /** Its title. */
  title: string;
  /** The authors, as written. */
  authors: string;
  /** Where and when. */
  journal: string | null;
  year: number | null;
  /** Where to read it, if it has an ID to be read by. */
  lookAt: string | null;
}

/** One page of a trail. */
export interface Trail {
  /** How many there are in all. */
  count: number;
  /** The ones on this page. */
  papers: Linked[];
  /** Which page this was, counting from 1, and whether there are more. */
  page: number;
  more: boolean;
}

const words = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** One entry, read into something steady. */
function oneLinked(raw: Record<string, unknown>): Linked {
  const id = words(raw["id"]);
  const source = words(raw["source"]);
  return {
    id, source,
    title: (words(typeof raw["title"] === "string" ? raw["title"].replace(/<[^>]{0,80}>/g, "") : raw["title"]) ?? "Untitled").replace(/\.$/, ""),
    authors: words(raw["authorString"]) ?? "",
    journal: words(raw["journalAbbreviation"]) ?? words(raw["journalTitle"]) ?? null,
    year: typeof raw["pubYear"] === "number" ? raw["pubYear"]
        : typeof raw["pubYear"] === "string" && /^\d{4}$/.test(raw["pubYear"]) ? Number(raw["pubYear"]) : null,
    lookAt: id === null || source === null ? null : `https://europepmc.org/article/${source}/${id}`,
  };
}

/** Ask for one page of a list hanging off an article. */
async function page(which: "references" | "citations", source: string, id: string, options: { page?: number; limit?: number }): Promise<Trail> {
  const index = source.trim().toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(index)) throw new EuropePmcError(`${JSON.stringify(source)} is not an index. It is MED for PubMed, PMC, or PPR for a preprint.`, which);
  if (!/^[A-Za-z0-9.]{1,20}$/.test(id.trim())) throw new EuropePmcError(`${JSON.stringify(id)} is not an article ID.`, which);
  const size = Math.max(1, Math.min(MOST_ON_A_PAGE, options.limit ?? 25));
  const wanted = Math.max(1, options.page ?? 1);
  const body = await ask(`${index}/${id.trim()}/${which}`, { format: "json", pageSize: size, page: wanted });
  let answer: { hitCount?: number; referenceList?: { reference?: Record<string, unknown>[] }; citationList?: { citation?: Record<string, unknown>[] } };
  try { answer = JSON.parse(body); } catch { throw new EuropePmcError(`Europe PMC sent back something that is not a list of ${which}.`, which); }
  const papers = (answer.referenceList?.reference ?? answer.citationList?.citation ?? []).map(oneLinked);
  const count = typeof answer.hitCount === "number" ? answer.hitCount : papers.length;
  return { count, papers, page: wanted, more: wanted * size < count };
}

/**
 * What a paper cited.
 *
 * @param source - Which index it is in: `MED`, `PMC` or `PPR`.
 * @param id - Its ID in that index.
 * @param options - `page` counts from 1; `limit` is how many on a page.
 * @returns One page of its reference list.
 * @throws {@link EuropePmcError} if it could not be asked for.
 *
 * @example
 * ```ts
 * import { referencesOf } from "@biolibs/europepmc";
 *
 * const back = await referencesOf("MED", "40723902");
 * back.papers.filter((one) => /casein/i.test(one.title));
 * ```
 */
export const referencesOf = (source: string, id: string, options: { page?: number; limit?: number } = {}): Promise<Trail> =>
  page("references", source, id, options);

/**
 * Who has cited a paper since.
 *
 * @param source - Which index it is in.
 * @param id - Its ID in that index.
 * @param options - `page` counts from 1; `limit` is how many on a page.
 * @returns One page of the papers citing it, the most recent first as the service gives them.
 * @throws {@link EuropePmcError} if it could not be asked for.
 */
export const citationsOf = (source: string, id: string, options: { page?: number; limit?: number } = {}): Promise<Trail> =>
  page("citations", source, id, options);
