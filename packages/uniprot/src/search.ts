/**
 * Finding a protein, and fetching the entry for one.
 *
 * A search gives little — enough to choose between entries and no more — because the whole entry
 * is large and most of a search's results are not the one wanted. The one thing it does give that
 * matters before anything else is whether each entry has been **reviewed**: Swiss-Prot entries have
 * been read out of papers by a curator, TrEMBL entries were made by machine from similarity, and
 * treating a machine's guess as a curator's reading is the easiest way to be confidently wrong
 * about a protein.
 */
import { ask, looksLikeAccession, UniProtError } from "./ask.js";

/** The most results one search gives back. */
export const MOST_FOUND = 50;

/** One result: enough to choose by. */
export interface Hit {
  /** Its accession, to fetch it by. */
  accession: string;
  /** The entry's name, such as `CASB_BOVIN`. */
  entryName: string;
  /** What the protein is called. */
  name: string;
  /** The gene, where the entry names one. */
  gene: string | null;
  /** What it is from. */
  organism: string | null;
  /** How many residues the entry's own sequence has, precursor and all. */
  length: number | null;
  /** Whether a curator has been over it. */
  reviewed: boolean;
  /** Where a person would read it. */
  lookAt: string;
}

/** What a search found. */
export interface Search {
  /** What was asked. */
  query: string;
  /** The results. */
  results: Hit[];
}

/** What the service sends back, in as much shape as is read. */
interface RawHit {
  entryType?: string;
  primaryAccession?: string;
  uniProtkbId?: string;
  organism?: { scientificName?: string; commonName?: string };
  proteinDescription?: { recommendedName?: { fullName?: { value?: string } }; submissionNames?: { fullName?: { value?: string } }[] };
  genes?: { geneName?: { value?: string } }[];
  sequence?: { length?: number };
}

const words = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** One result, read into something steady. */
export function oneHit(raw: RawHit): Hit {
  const accession = words(raw.primaryAccession) ?? "";
  const organism = words(raw.organism?.scientificName);
  const common = words(raw.organism?.commonName);
  return {
    accession,
    entryName: words(raw.uniProtkbId) ?? "",
    name: words(raw.proteinDescription?.recommendedName?.fullName?.value)
      ?? words(raw.proteinDescription?.submissionNames?.[0]?.fullName?.value) ?? "Unnamed",
    gene: words(raw.genes?.[0]?.geneName?.value),
    organism: organism === null ? null : common === null ? organism : `${organism} (${common})`,
    length: typeof raw.sequence?.length === "number" ? raw.sequence.length : null,
    // "UniProtKB reviewed (Swiss-Prot)" against "UniProtKB unreviewed (TrEMBL)".
    reviewed: /reviewed/i.test(raw.entryType ?? "") && !/unreviewed/i.test(raw.entryType ?? ""),
    lookAt: `https://www.uniprot.org/uniprotkb/${accession}`,
  };
}

/**
 * Search for a protein.
 *
 * @param query - What to look for, in UniProt's own syntax: plain words, and fields such as
 *   `gene:CSN2`, `organism_id:9913`, `taxonomy_name:"Bos taurus"`, `reviewed:true`, `length:[200 TO 300]`.
 * @param options - `limit` is how many to bring back; `reviewedOnly` adds the filter for entries a
 *   curator has been over, which is usually what somebody means.
 * @returns What matched.
 * @throws {@link UniProtError} if the service could not be reached or did not answer with results.
 *
 * @example
 * ```ts
 * import { searchProteins } from "@biolibs/uniprot";
 *
 * const found = await searchProteins("casein AND organism_id:9913", { reviewedOnly: true });
 * found.results.map((one) => [one.accession, one.gene, one.name]);
 * ```
 */
export async function searchProteins(query: string, options: { limit?: number; reviewedOnly?: boolean } = {}): Promise<Search> {
  const asked = query.trim();
  if (asked === "") throw new UniProtError("There is nothing to search for.", "", null);
  const whole = options.reviewedOnly === true ? `(${asked}) AND reviewed:true` : asked;
  const body = await ask("uniprotkb/search", {
    query: whole, format: "json",
    size: Math.max(1, Math.min(MOST_FOUND, options.limit ?? 10)),
    fields: "accession,id,protein_name,gene_names,organism_name,length,reviewed",
  });
  let answer: { results?: RawHit[] };
  try { answer = JSON.parse(new TextDecoder().decode(body)); } catch { throw new UniProtError("UniProt sent back something that is not the answer to a search.", "uniprotkb/search"); }
  return { query: whole, results: (answer.results ?? []).map(oneHit) };
}

/**
 * Fetch one entry.
 *
 * @param accession - The accession, such as `P02666`.
 * @returns The entry's XML, to be read with `readProtein`.
 * @throws {@link UniProtError} if there is no such entry, or it could not be fetched.
 *
 * @example
 * ```ts
 * import { lookUpProtein, readProtein } from "@biolibs/uniprot";
 *
 * const casein = readProtein(await lookUpProtein("P02666"));
 * ```
 */
export async function lookUpProtein(accession: string): Promise<Uint8Array> {
  const id = accession.trim().toUpperCase();
  if (!looksLikeAccession(id)) throw new UniProtError(`${JSON.stringify(accession)} is not a UniProt accession. One looks like P02666 or A0A0B4J2F0.`, "uniprotkb");
  try {
    return await ask(`uniprotkb/${id}.xml`);
  } catch (cause) {
    if (cause instanceof UniProtError && cause.status === 404) {
      throw new UniProtError(`UniProt has no entry ${id}. It may have been merged into another; searchProteins finds the one that stands.`, cause.url, 404);
    }
    throw cause;
  }
}
