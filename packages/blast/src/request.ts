/**
 * The two requests a search is made of, as parameters in the order Biopython writes them.
 *
 * Both are built without sending anything, so what goes to NCBI can be read, compared and tested on
 * its own. Order matters: `urlencode` writes the pairs in the order they are given, and a request
 * that differs only in order is still a different string to compare against Biopython's.
 */
import { urlencode } from "@biolibs/entrez";
import { PyFloat, ValueError } from "@biolibs/core";
import { NCBI_BLAST_URL, settings } from "./settings.js";

/** The five programs NCBI's URL API takes. */
export const PROGRAMS: readonly string[] = ["blastn", "blastp", "blastx", "tblastn", "tblastx"];

/** How the results come back. `XML` is the default and the only one anything here reads. */
export type FormatType = "XML" | "HTML" | "Text" | "XML2" | "JSON2" | "Tabular";

/** What to search for, and how. Every field but the first three is optional, as in Biopython. */
export interface Search {
  /** `blastn`, `blastp`, `blastx`, `tblastn` or `tblastx`, in lower case. */
  program: string;
  /** Which database to search: `nr`, `nt`, `refseq_protein`, and so on. */
  database: string;
  /** The sequence to search with, as bases or residues, or as FASTA. */
  sequence: string;
  /** Where to send it. NCBI's own endpoint unless you are running your own BLAST. */
  urlBase?: string;
  autoFormat?: string; compositionBasedStatistics?: string; dbGeneticCode?: number;
  endpoints?: string; entrezQuery?: string; expect?: number; filter?: string;
  gapcosts?: string; geneticCode?: number; hitlistSize?: number; iThresh?: number;
  layout?: string; lcaseMask?: string; matrixName?: string; nuclPenalty?: number;
  nuclReward?: number; otherAdvanced?: string; percIdent?: number; phiPattern?: string;
  queryFile?: string; queryBelieveDefline?: string; queryFrom?: number; queryTo?: number;
  searchspEff?: number; service?: string; threshold?: number; ungappedAlignment?: string;
  wordSize?: number; shortQuery?: string | null; megablast?: string;
  templateType?: string; templateLength?: number;
  /** How many alignments and descriptions to ask for when the results are fetched. */
  alignments?: number; descriptions?: number; alignmentView?: string;
  entrezLinksNewWindow?: string; expectLow?: number; expectHigh?: number;
  formatEntrezQuery?: string; formatObject?: string; formatType?: FormatType;
  ncbiGi?: string; resultsFile?: string; showOverview?: string;
}

/** A warning raised where Biopython raises one, carrying the same words. */
export interface Warned { message: string }

/** The parameters a search is submitted with, and anything that had to be said about it. */
export interface Put {
  /** The parameters, in Biopython's order. */
  parameters: Map<string, unknown>;
  /** The body, as it would be sent. */
  body: string;
  /** Warnings Biopython would have raised while working the parameters out. */
  warnings: Warned[];
}

const SHORT_QUERY_WARNING =
  '"SHORT_QUERY_ADJUST" is incorrectly implemented (by NCBI) for blastn. We bypass the problem by manually'
  + " adjusting the search parameters. Thus, results may slightly differ from web page searches.";

/**
 * The parameters that submit a search.
 *
 * @param search - What to search for, and how.
 * @returns The parameters in order, the body they encode to, and any warning raised on the way.
 * @throws {@link ValueError} naming the program, where it is not one of the five NCBI takes. The
 *   wording is Biopython's.
 *
 * @example
 * ```ts
 * const put = putOf({ program: "blastn", database: "nt", sequence: "ACGT" });
 * put.body;   // "DATABASE=nt&ENTREZ_QUERY=%28none%29&EXPECT=10.0&HITLIST_SIZE=50&PROGRAM=blastn&QUERY=ACGT&CMD=Put"
 * ```
 */
export function putOf(search: Search): Put {
  if (!PROGRAMS.includes(search.program)) {
    throw new ValueError(`Program specified is ${search.program}. Expected one of ${PROGRAMS.join(", ")}`);
  }
  const warnings: Warned[] = [];
  // NCBI's SHORT_QUERY_ADJUST is wired up wrongly on their side for blastn, so Biopython sets the
  // parameters it stands for by hand instead — and only for a sequence short enough to want them.
  // Python tells a float from an int and writes them differently: EXPECT=10.0, not EXPECT=10. The
  // default and anything a caller gives are floats; the short-query override assigns an int, and
  // Biopython sends it as one.
  let { shortQuery, wordSize, nuclReward, filter, lcaseMask } = search;
  let expect: number | PyFloat = new PyFloat(search.expect ?? 10.0);
  if (shortQuery && search.program === "blastn") {
    shortQuery = null;
    if (search.sequence.length < 31) {
      expect = 1000; wordSize = 7; nuclReward = 1; filter = undefined; lcaseMask = undefined;
      warnings.push({ message: SHORT_QUERY_WARNING });
    }
  }
  const urlBase = search.urlBase ?? NCBI_BLAST_URL;
  const given: [string, unknown][] = [
    ["AUTO_FORMAT", search.autoFormat],
    ["COMPOSITION_BASED_STATISTICS", search.compositionBasedStatistics],
    ["DATABASE", search.database],
    ["DB_GENETIC_CODE", search.dbGeneticCode],
    ["ENDPOINTS", search.endpoints],
    ["ENTREZ_QUERY", search.entrezQuery ?? "(none)"],
    ["EXPECT", expect],
    ["FILTER", filter],
    ["GAPCOSTS", search.gapcosts],
    ["GENETIC_CODE", search.geneticCode],
    ["HITLIST_SIZE", search.hitlistSize ?? 50],
    ["I_THRESH", search.iThresh],
    ["LAYOUT", search.layout],
    ["LCASE_MASK", lcaseMask],
    ["MEGABLAST", search.megablast],
    ["MATRIX_NAME", search.matrixName],
    ["NUCL_PENALTY", search.nuclPenalty],
    ["NUCL_REWARD", nuclReward],
    ["OTHER_ADVANCED", search.otherAdvanced],
    ["PERC_IDENT", search.percIdent],
    ["PHI_PATTERN", search.phiPattern],
    ["PROGRAM", search.program],
    ["QUERY", search.sequence],
    ["QUERY_FILE", search.queryFile],
    ["QUERY_BELIEVE_DEFLINE", search.queryBelieveDefline],
    ["QUERY_FROM", search.queryFrom],
    ["QUERY_TO", search.queryTo],
    ["SEARCHSP_EFF", search.searchspEff],
    ["SERVICE", search.service],
    ["SHORT_QUERY_ADJUST", shortQuery],
    ["TEMPLATE_TYPE", search.templateType],
    ["TEMPLATE_LENGTH", search.templateLength],
    ["THRESHOLD", search.threshold],
    ["UNGAPPED_ALIGNMENT", search.ungappedAlignment],
    ["WORD_SIZE", wordSize],
    ["CMD", "Put"],
  ];
  // Who is asking, but only when asking NCBI: a BLAST of your own has no use for it.
  if (urlBase === NCBI_BLAST_URL) given.push(["email", settings.email], ["tool", settings.tool]);
  const parameters = new Map(given.filter(([, value]) => value !== undefined && value !== null));
  return { parameters, body: urlencode(parameters), warnings };
}

/**
 * The parameters that fetch a search's results.
 *
 * @param search - The same search, for the formatting it asked for.
 * @param rid - The request identifier the submission answered with.
 * @returns The parameters in order, and the body they encode to.
 *
 * @example
 * ```ts
 * getOf({ program: "blastn", database: "nt", sequence: "ACGT" }, "ABC123").body;
 * // "ALIGNMENTS=500&DESCRIPTIONS=500&FORMAT_TYPE=XML&RID=ABC123&CMD=Get"
 * ```
 */
export function getOf(search: Search, rid: string): { parameters: Map<string, unknown>; body: string } {
  const given: [string, unknown][] = [
    ["ALIGNMENTS", search.alignments ?? 500],
    ["ALIGNMENT_VIEW", search.alignmentView],
    ["DESCRIPTIONS", search.descriptions ?? 500],
    ["ENTREZ_LINKS_NEW_WINDOW", search.entrezLinksNewWindow],
    ["EXPECT_LOW", search.expectLow],
    ["EXPECT_HIGH", search.expectHigh],
    ["FORMAT_ENTREZ_QUERY", search.formatEntrezQuery],
    ["FORMAT_OBJECT", search.formatObject],
    ["FORMAT_TYPE", search.formatType ?? "XML"],
    ["NCBI_GI", search.ncbiGi],
    ["RID", rid],
    ["RESULTS_FILE", search.resultsFile],
    ["SERVICE", search.service],
    ["SHOW_OVERVIEW", search.showOverview],
    ["CMD", "Get"],
  ];
  const parameters = new Map(given.filter(([, value]) => value !== undefined && value !== null));
  return { parameters, body: urlencode(parameters) };
}
