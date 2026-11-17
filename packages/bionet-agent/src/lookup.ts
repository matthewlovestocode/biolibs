/**
 * Looking something up outside the lab: NCBI's databases, through `@biolibs/entrez`.
 *
 * Everything else an adviser has works on what the lab already holds. These two reach out to a
 * public database, which makes them different in kind, so they are kept apart and say so in their
 * own descriptions.
 *
 * Two things follow from reaching outside, and both are decided here rather than left to the agent:
 *
 * - **Nothing of the lab's goes out.** A search term is a few words the agent writes, and it is
 *   capped short enough that a sequence cannot be pasted into one. Nothing reads the freezer.
 * - **Nothing comes in by itself.** A record that is fetched is handed back to be read. It becomes a
 *   part only if the adviser then says so with `add_part`, which is written in its own name like
 *   anything else it writes, and what a record claims is marked on a sequence does not come with it.
 */
import { efetch, esearch, esummary, settings, HTTPError, URLError } from "@biolibs/entrez";
import { readSequenceFile } from "@biolibs/bionet-tools";
import type { AgentTool, ToolInput } from "./tools.js";

/** The databases that may be asked. Nothing else is reachable through these tools. */
export const DATABASES = ["nucleotide", "protein", "gene", "pubmed"] as const;

/** One of them. */
export type Database = (typeof DATABASES)[number];

/** The most results one search gives back, and the most it may be asked for. */
export const MOST_FOUND = 25;

/** The longest a search term may be. Short enough that a sequence cannot be put in one. */
export const LONGEST_TERM = 200;

/** The most bases one fetch brings back. Longer records have to be asked for a stretch at a time. */
export const MOST_FETCHED = 100_000;

/** How an adviser reaches NCBI. */
export interface LookupOptions {
  /**
   * Whether to offer these tools at all. On unless a host says otherwise: they read a public
   * database and send nothing of the lab's.
   */
  outside?: boolean;
  /** What to call this software to NCBI. Never a person's name. */
  tool?: string;
  /**
   * An address NCBI can use to get in touch about heavy use, if the person has given one for that.
   * It is never taken from the lab or from the device: somebody has to pass it in on purpose.
   */
  email?: string | null;
  /** An NCBI API key, which raises how often it may be asked. */
  apiKey?: string | null;
}

const text = (value: unknown, what: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${what} has to be given, as text.`);
  return value.trim();
};
const whole = (value: unknown, what: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${what} has to be a whole number.`);
  return value;
};
const database = (value: unknown): Database => {
  const given = text(value, "The database");
  if (!(DATABASES as readonly string[]).includes(given)) throw new Error(`There is no database called ${JSON.stringify(given)} here. There are: ${DATABASES.join(", ")}.`);
  return given as Database;
};

/** What NCBI said went wrong, in words the agent can do something about. */
const asTrouble = (cause: unknown): Error => {
  if (cause instanceof HTTPError) {
    return new Error(cause.code === 429 ? "NCBI is being asked too often just now. Wait a little and ask again."
      : `NCBI answered ${cause.code}. The database or the identifier may not be one it has.`);
  }
  if (cause instanceof URLError) return new Error("NCBI could not be reached. This device may be offline.");
  return cause instanceof Error ? cause : new Error(String(cause));
};

/** The summaries NCBI returns, which are JSON of a shape that differs by database. */
interface Summary { [field: string]: unknown }

const said = (summary: Summary, field: string): string | null => {
  const value = summary[field];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/** One result, said the same way whichever database it came from. */
function oneFound(db: Database, uid: string, summary: Summary): Record<string, unknown> {
  const organism = said(summary, "organism")
    ?? (typeof summary["organism"] === "object" && summary["organism"] !== null ? said(summary["organism"] as Summary, "scientificname") : null);
  if (db === "pubmed") {
    const authors = Array.isArray(summary["authors"]) ? (summary["authors"] as Summary[]).map((one) => said(one, "name")).filter((one) => one !== null) : [];
    return { id: uid, title: said(summary, "title"), journal: said(summary, "source"), published: said(summary, "pubdate"),
             authors: authors.slice(0, 6), doi: said(summary, "elocationid"), look_at: `https://pubmed.ncbi.nlm.nih.gov/${uid}/` };
  }
  if (db === "gene") {
    return { id: uid, symbol: said(summary, "name"), description: said(summary, "description"), organism,
             summary: said(summary, "summary"), chromosome: said(summary, "chromosome"), look_at: `https://www.ncbi.nlm.nih.gov/gene/${uid}` };
  }
  const accession = said(summary, "accessionversion") ?? said(summary, "caption") ?? uid;
  return { accession, title: said(summary, "title"), organism, length: typeof summary["slen"] === "number" ? summary["slen"] : null,
           updated: said(summary, "updatedate"), look_at: `https://www.ncbi.nlm.nih.gov/${db}/${accession}` };
}

/**
 * The tools that look something up at NCBI.
 *
 * @param options - Whether to offer them, and what to tell NCBI about who is asking.
 * @returns The tools, or none if a host asked for none.
 *
 * @example
 * ```ts
 * import { lookupTools } from "@biolibs/bionet-agent";
 *
 * const outside = lookupTools({ tool: "bionet-adviser" });
 * outside.map((one) => one.name);    // ["search_ncbi", "fetch_from_ncbi"]
 * ```
 */
export function lookupTools(options: LookupOptions = {}): AgentTool[] {
  if (options.outside === false) return [];
  // Said once, before anything is asked. NCBI wants to know what software is calling; it is told
  // the software's name and nothing about the lab or the person at it.
  settings.tool = options.tool ?? "bionet-adviser";
  if (options.email !== undefined) settings.email = options.email;
  if (options.apiKey !== undefined) settings.apiKey = options.apiKey;

  const dbField: ToolInput["properties"][string] = { type: "string", enum: [...DATABASES], description: "Which database: nucleotide, protein, gene (what a gene is and where), or pubmed (papers)." };

  return [
    {
      name: "search_ncbi", title: "Search NCBI", readOnly: true,
      description: [
        "Search a public NCBI database by keyword, in Entrez's own syntax, such as `CSN2 AND Bos taurus[orgn]` or `casein AND biosynthesis[title]`.",
        "Use it to find out what is known outside this lab: which genes a protein is made by, what a reference sequence for one is called, what has been published about it.",
        "Gives the accession (or gene or paper), what it is, which organism, and how long it is. To read a sequence itself, use fetch_from_ncbi with the accession.",
        "This reaches the internet. The search term is sent to NCBI, so write it yourself and do not put the lab's own sequences, part names or notes in it; nothing is read from the freezer.",
      ].join(" "),
      input: { type: "object", required: ["database", "term"], additionalProperties: false, properties: {
        database: dbField,
        term: { type: "string", description: `What to search for, at most ${LONGEST_TERM} characters.` },
        limit: { type: "integer", description: `How many to give back, up to ${MOST_FOUND}. 10 if not given.` },
      } },
      run: async (args) => {
        const db = database(args["database"]);
        const term = text(args["term"], "The search term");
        if (term.length > LONGEST_TERM) throw new Error(`A search term is at most ${LONGEST_TERM} characters. This is for searching by keyword; a sequence is not something to put in one.`);
        const limit = Math.max(1, Math.min(MOST_FOUND, args["limit"] === undefined ? 10 : whole(args["limit"], "The limit")));
        try {
          const found = JSON.parse((await esearch(db, term, { retmax: limit, retmode: "json" })).readText()) as { esearchresult?: { count?: string; idlist?: string[] } };
          const ids = found.esearchresult?.idlist ?? [];
          const all = Number(found.esearchresult?.count ?? ids.length);
          if (ids.length === 0) return { database: db, term, found: 0, results: [], note: "Nothing matched. Entrez syntax is strict: try fewer words, or an organism as `Bos taurus[orgn]`." };
          const summaries = JSON.parse((await esummary({ db, id: ids, retmode: "json" })).readText()) as { result?: Record<string, Summary> };
          return {
            database: db, term, found: all, showing: ids.length,
            results: ids.map((uid) => oneFound(db, uid, summaries.result?.[uid] ?? {})),
            ...(all > ids.length ? { note: `${all.toLocaleString("en-US")} matched in all; the first ${ids.length} are here. Narrow the term rather than asking for more.` } : {}),
          };
        } catch (cause) { throw asTrouble(cause); }
      },
    },
    {
      name: "fetch_from_ncbi", title: "Read a sequence from NCBI", readOnly: true,
      description: [
        "Fetch one nucleotide or protein record from NCBI by accession, and read it: what it is called, how long, which organism, and what the record says is marked on it.",
        "Nothing is added to the lab by this. To keep a sequence, read it first and then use add_part, putting the accession in the name so that whoever sees it later knows where it came from.",
        `A record longer than ${MOST_FETCHED.toLocaleString("en-US")} bases has to be asked for a stretch at a time with from and to; a whole chromosome is not something to read in one go.`,
        "What a record says about itself was written by whoever deposited it. It is what someone claims, not something this lab has checked.",
        "This reaches the internet. Only the accession is sent.",
      ].join(" "),
      input: { type: "object", required: ["database", "accession"], additionalProperties: false, properties: {
        database: { type: "string", enum: ["nucleotide", "protein"], description: "Which database the accession is in." },
        accession: { type: "string", description: "The accession, such as NM_181008.2." },
        from: { type: "integer", description: "The first base or residue wanted, counting from 1. The start if not given." },
        to: { type: "integer", description: "The last one wanted. The end if not given." },
      } },
      run: async (args) => {
        const db = database(args["database"]);
        if (db !== "nucleotide" && db !== "protein") throw new Error("A sequence is fetched from nucleotide or protein. Use search_ncbi for genes and papers.");
        const accession = text(args["accession"], "The accession");
        if (!/^[A-Za-z0-9_.]{3,40}$/.test(accession)) throw new Error("That is not an accession. One looks like NM_181008.2 or P02666.");
        const from = args["from"] === undefined ? undefined : Math.max(1, whole(args["from"], "`from`"));
        const to = args["to"] === undefined ? undefined : Math.max(1, whole(args["to"], "`to`"));
        let record;
        try {
          const handle = await efetch(db, {
            id: accession, rettype: db === "protein" ? "gp" : "gb", retmode: "text",
            ...(from === undefined ? {} : { seq_start: from }), ...(to === undefined ? {} : { seq_stop: to }),
          });
          const body = handle.readText();
          if (body.trim() === "") throw new Error(`NCBI has nothing under ${accession} in ${db}.`);
          record = readSequenceFile(`${accession}.gb`, new TextEncoder().encode(body));
        } catch (cause) { throw asTrouble(cause); }
        if (record.sequence.length > MOST_FETCHED) {
          throw new Error(`${accession} is ${record.sequence.length.toLocaleString("en-US")} long, which is more than one fetch brings back. Ask for a stretch of it with from and to.`);
        }
        return {
          accession, database: db, name: record.name, description: record.description,
          length: record.sequence.length, circular: record.circular,
          ...(from === undefined && to === undefined ? {} : { stretch: { from: from ?? 1, to: to ?? record.sequence.length } }),
          // As people count them, like everywhere else an adviser is told where something lies.
          marked: record.features.map((one) => ({ label: one.label, type: one.type, strand: one.strand === 1 ? "forward" : one.strand === -1 ? "reverse" : "either",
                                                  lies: one.parts.map((part) => ({ from: part.start + 1, to: part.end })) })),
          sequence: record.sequence,
          from_outside: "This came from NCBI and says what whoever deposited it says. Nothing has been added to the lab.",
        };
      },
    },
  ];
}
