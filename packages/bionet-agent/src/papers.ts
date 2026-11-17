/**
 * Reading the literature: Europe PMC, through `@biolibs/europepmc`.
 *
 * Every other thing an adviser has either reads the lab or works something out from a sequence.
 * These read what other people have published, and that is a different kind of knowing, so they
 * are kept apart and say so in their own descriptions.
 *
 * It is worth being clear about why this exists at all. An adviser without it answers a question
 * like "which host should we express casein in?" out of whatever it happens to know, and what it
 * happens to know has no date on it and cannot be checked. With it, the answer can be a paper: this
 * group used this host with this promoter and got this much, here is the section that says so, and
 * here is where to read it. That is a different thing to hand a lab member, and the difference is
 * the whole point.
 *
 * Three things follow from reaching outside, and all three are decided here rather than left to the
 * agent:
 *
 * - **Nothing of the lab's goes out.** A query is words the agent writes, capped short enough that
 *   a sequence cannot be pasted into one. Nothing reads the freezer.
 * - **A paper is somebody's claim.** What comes back is what a group reported, not something this
 *   lab has seen, and every answer says so rather than leaving it to be assumed.
 * - **Only the open ones can be read.** Most papers are not open access, and for those there is the
 *   abstract and a link. Saying that plainly is better than an agent trying four ways to get at a
 *   full text that was never going to be there.
 */
import { EuropePmcError, citationsOf, findSection, fullTextOf, readArticle, referencesOf, searchArticles, settings,
         MOST_FOUND, SECTION_KINDS, type Article, type Corpus } from "@biolibs/europepmc";
import type { AgentTool } from "./tools.js";

/** The longest a query may be. Short enough that a sequence cannot be put in one. */
export const LONGEST_QUERY = 400;

/** The most characters of a paper handed back in one go. A section, not a book. */
export const MOST_READ = 24_000;

/** How an adviser reaches Europe PMC. */
export interface PaperOptions {
  /** Whether to offer these tools at all. On unless a host says otherwise. */
  papers?: boolean;
  /** What to call this software to Europe PMC. Never a person's name. */
  tool?: string;
  /**
   * An address Europe PMC could use to get in touch about heavy use, if somebody has given one for
   * that. It is never taken from the lab or from the device.
   */
  email?: string | null;
}

const text = (value: unknown, what: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${what} has to be given, as text.`);
  return value.trim();
};
const whole = (value: unknown, what: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${what} has to be a whole number.`);
  return value;
};

/** What Europe PMC said went wrong, in words the agent can do something about. */
const asTrouble = (cause: unknown): Error => {
  if (cause instanceof EuropePmcError) {
    if (cause.status === 429) return new Error("Europe PMC is being asked too often just now. Wait a little and ask again.");
    // Only a request that was actually sent and got no answer means the device may be offline. An
    // ID of the wrong shape never leaves this machine, and saying "offline" would send somebody to
    // check their network when what is wrong is what they typed.
    if (cause.offline) return new Error("Europe PMC could not be reached. This device may be offline.");
    return new Error(cause.message);
  }
  return cause instanceof Error ? cause : new Error(String(cause));
};

/** As much of a section as fits, with what was left said rather than quietly dropped. */
function asMuchAs(pieces: { heading: string; text: string }[], room: number): { parts: { heading: string; text: string }[]; cut: number } {
  const parts: { heading: string; text: string }[] = [];
  let left = room;
  let cut = 0;
  for (const piece of pieces) {
    if (left <= 0) { cut += 1; continue; }
    if (piece.text.length <= left) { parts.push(piece); left -= piece.text.length; continue; }
    parts.push({ heading: piece.heading, text: `${piece.text.slice(0, left)}…` });
    left = 0;
  }
  return { parts, cut };
}

/** The most headings listed at once. A review nests forty of them, which as one sentence is a wall. */
const MOST_HEADINGS = 40;

/**
 * What a paper's shape says it is worth asking for next.
 *
 * The headings go back as a list and not as a sentence. A review has forty of them nested four
 * deep, and run together with semicolons they are unreadable by anything, which is the opposite of
 * what this is for.
 */
function whatElse(article: Article): Record<string, unknown> {
  const headings = article.sections.filter((one) => one.heading !== "");
  const shown = headings.slice(0, MOST_HEADINGS);
  return {
    ...(shown.length === 0 ? {} : { sections: shown.map((one) => ({ heading: one.heading, under: one.depth, characters: one.text.length })) }),
    ...(headings.length > shown.length ? { more_sections: headings.length - shown.length } : {}),
    ...(article.tables.length === 0 ? {} : { tables: article.tables.length, tables_note: "A yield is as often in a table as in a sentence. Ask for \"tables\"." }),
    ask_for: "Any heading above, by name, or one of: " + [...SECTION_KINDS, "tables", "figures", "all"].join(", "),
  };
}

/**
 * The tools that read the literature.
 *
 * @param options - Whether to offer them, and what to tell Europe PMC about who is asking.
 * @returns The tools, or none if a host asked for none.
 *
 * @example
 * ```ts
 * import { paperTools } from "@biolibs/bionet-agent";
 *
 * paperTools({ tool: "bionet-adviser" }).map((one) => one.name);
 * // ["search_papers", "read_paper", "papers_around"]
 * ```
 */
export function paperTools(options: PaperOptions = {}): AgentTool[] {
  if (options.papers === false) return [];
  // Said once, before anything is asked. Europe PMC wants a client to name itself; it is told the
  // software's name and nothing about the lab or the person at it.
  settings.tool = options.tool ?? "bionet-adviser";
  if (options.email !== undefined) settings.email = options.email;

  const query = (value: unknown): string => {
    const asked = text(value, "The query");
    if (asked.length > LONGEST_QUERY) throw new Error(`A query is at most ${LONGEST_QUERY} characters. This searches by words; a sequence is not something to put in one.`);
    return asked;
  };

  return [
    {
      name: "search_papers", title: "Search the literature", readOnly: true,
      description: [
        "Search Europe PMC, which indexes PubMed, PubMed Central, preprints and patents together, for what has been published about something.",
        "Use it when the question is what is known rather than what this lab holds: which host somebody expressed a protein in and what they got, whether a promoter works in a given organism, what a sensible yield looks like, whether an approach has already failed for somebody.",
        "The query takes plain words, phrases in quotes, and fields: `TITLE:`, `ABSTRACT:`, `METHODS:` (which searches the methods sections of open papers and is the one to use for a technique), `AUTH:`, `JOURNAL:`, `PUB_YEAR:`. `AND`, `OR` and `NOT` join them. For example: `\"kappa-casein\" AND \"Pichia pastoris\"` or `METHODS:\"Gibson assembly\" AND casein`.",
        "Each result says whether its full text can actually be read, which is what read_paper needs; most papers are not open, and for those there is the abstract and a link.",
        "This reaches the internet. Only the query is sent, so write it yourself and do not put the lab's own sequences, part names or notes in it; nothing is read from the freezer.",
      ].join(" "),
      input: { type: "object", required: ["query"], additionalProperties: false, properties: {
        query: { type: "string", description: `What to look for, at most ${LONGEST_QUERY} characters.` },
        corpus: { type: "string", enum: ["all", "open-access", "preprints", "reviews"],
                  description: "Narrow it: open-access for papers that can be read in full, preprints for the newest work, reviews for a way into a field. All of it if not given." },
        sort: { type: "string", enum: ["relevance", "cited", "date"], description: "cited brings the papers others built on, which for a broad query means the famous rather than the fitting; date brings the newest. Relevance if not given, and usually what you want." },
        abstracts: { type: "boolean", description: "Bring the abstracts too. Worth it for a few results, not for many." },
        limit: { type: "integer", description: `How many, up to ${MOST_FOUND}. 10 if not given.` },
      } },
      run: async (args) => {
        const asked = query(args["query"]);
        try {
          const found = await searchArticles(asked, {
            ...(args["corpus"] === undefined ? {} : { corpus: text(args["corpus"], "The corpus") as Corpus }),
            ...(args["sort"] === undefined ? {} : { sort: text(args["sort"], "The sort") as "cited" | "date" | "relevance" }),
            ...(args["abstracts"] === true ? { abstracts: true } : {}),
            ...(args["limit"] === undefined ? {} : { limit: whole(args["limit"], "The limit") }),
          });
          if (found.results.length === 0) {
            return { query: found.query, matched: 0, results: [],
                     note: "Nothing matched. Try fewer words, or drop a quoted phrase: a phrase has to appear exactly as written." };
          }
          return {
            query: found.query, matched: found.matched, showing: found.results.length,
            results: found.results.map((one) => ({
              id: one.id, source: one.source, title: one.title, authors: one.authors.slice(0, 6),
              journal: one.journal, year: one.year, cited_by: one.citedBy,
              ...(one.pmcid === null ? {} : { pmcid: one.pmcid }), ...(one.doi === null ? {} : { doi: one.doi }),
              can_read_in_full: one.fullText,
              ...(one.hasSupplement ? { has_supplementary_data: true } : {}),
              look_at: one.lookAt,
              ...(one.abstract === null ? {} : { abstract: one.abstract }),
            })),
            ...(found.matched > found.results.length
              ? { note: `${found.matched.toLocaleString("en-US")} matched in all; these are the first ${found.results.length}. Narrow the query rather than asking for many more.` }
              : {}),
            from_outside: "These are what other groups have published. Nothing here has been checked by this lab. Use read_paper on one whose full text can be read.",
          };
        } catch (cause) { throw asTrouble(cause); }
      },
    },
    {
      name: "read_paper", title: "Read an open-access paper", readOnly: true,
      description: [
        "Read one open-access paper from Europe PMC: its abstract, a named section of it, or its tables.",
        "This is the one that answers a real question. A paper's methods are where the recipe is — which strain, which plasmid, what the medium was, what it was induced with and for how long — and `section: \"methods\"` gives that section and everything under it. `section: \"results\"` gives what came of it. `section: \"tables\"` gives the tables as rows, which is where a yield usually is.",
        "Ask for it by the PubMed Central ID that search_papers gives as `pmcid`, for a result whose `can_read_in_full` is true. A paper that is not open access cannot be read here however it is asked for; there is its abstract from search_papers, and its link.",
        "Without a section it gives the abstract and the list of headings, which is the cheap way to see what is worth asking for. A section longer than what one read brings back is cut, and says it was.",
        "What a paper says is what that group reported. It is not something this lab has seen, and a method that worked for them may not work here; say whose result it is when you use it.",
        "This reaches the internet. Only the paper's ID is sent.",
      ].join(" "),
      input: { type: "object", required: ["pmcid"], additionalProperties: false, properties: {
        pmcid: { type: "string", description: "The PubMed Central ID, such as PMC11767299." },
        section: { type: "string", description: `Which part: ${SECTION_KINDS.join(", ")}, "tables", "figures", "all", or any words to match a heading with, such as "yeast".` },
      } },
      run: async (args) => {
        const pmcid = text(args["pmcid"], "The paper's ID");
        const wanted = args["section"] === undefined ? null : text(args["section"], "The section").toLowerCase();
        let paper: Article;
        try { paper = readArticle(await fullTextOf(pmcid)); } catch (cause) { throw asTrouble(cause); }
        const about = {
          pmcid: pmcid.toUpperCase(), title: paper.title, journal: paper.journal, year: paper.year,
          authors: paper.authors.slice(0, 8), ...(paper.licence === null ? {} : { licence: paper.licence }),
          from_outside: "This is what this group reported. It is not something this lab has seen.",
        };
        if (wanted === "tables") {
          const { parts, cut } = asMuchAs(paper.tables.map((one) => ({ heading: `${one.label} ${one.caption}`.trim(), text: JSON.stringify({ headings: one.headings, rows: one.rows }) })), MOST_READ);
          return { ...about, tables: paper.tables.slice(0, parts.length).map((one) => ({ label: one.label, caption: one.caption, headings: one.headings, rows: one.rows })),
                   ...(cut === 0 ? {} : { note: `${cut} more ${cut === 1 ? "table is" : "tables are"} not shown: they would not fit in one read.` }) };
        }
        if (wanted === "figures") return { ...about, figures: paper.figures };
        if (wanted === null) {
          return { ...about, abstract: paper.abstract, keywords: paper.keywords,
                   table_captions: paper.tables.map((one) => `${one.label}: ${one.caption}`),
                   what_else: whatElse(paper) };
        }
        const whole = wanted === "all";
        const match = whole ? { sections: paper.sections.filter((one) => one.text !== ""), exact: true } : findSection(paper, wanted);
        const sections = match.sections;
        if (sections.length === 0) {
          return { ...about, found_nothing: `This paper has no section matching ${JSON.stringify(wanted)}.`, what_else: whatElse(paper) };
        }
        const { parts, cut } = asMuchAs(sections.map((one) => ({ heading: one.heading, text: one.text })), MOST_READ);
        return {
          ...about, section: wanted,
          // A paper with no methods section still has headings with the word in them. Saying the
          // match was loose is the difference between an answer and a wrong answer confidently given.
          ...(match.exact ? {} : { not_an_exact_match: `No heading of this paper is ${JSON.stringify(wanted)}. These merely contain the word, so they may not be what you are after. The headings are in what_else.`,
                                   what_else: whatElse(paper) }),
          parts: parts.filter((one) => one.text !== "" || one.heading !== ""),
          ...(cut === 0 ? {} : { note: `${cut} further ${cut === 1 ? "part" : "parts"} of this section would not fit in one read. Ask for one of them by its heading.` }),
        };
      },
    },
    {
      name: "papers_around", title: "What a paper cited, and who cited it", readOnly: true,
      description: [
        "Walk a paper's reference list, or the papers that have cited it since.",
        "This is how you get to a method that is not written down where you found it. A paper says it expressed the gene \"as described previously\" and gives a number; the number is the paper with the actual recipe, and `direction: \"back\"` finds it. Going the other way says whether anybody managed to repeat the work, and what they changed.",
        "Ask by the `id` and `source` that search_papers gives for a result, not by the PMC ID.",
        "This reaches the internet. Only the paper's ID is sent.",
      ].join(" "),
      input: { type: "object", required: ["id", "source", "direction"], additionalProperties: false, properties: {
        id: { type: "string", description: "The paper's ID, from search_papers." },
        source: { type: "string", description: "Which index it is in, from search_papers: MED, PMC or PPR." },
        direction: { type: "string", enum: ["back", "forward"], description: "back for what it cited; forward for what has cited it." },
        page: { type: "integer", description: "Which page, counting from 1. The first if not given." },
        limit: { type: "integer", description: "How many on a page. 25 if not given." },
      } },
      run: async (args) => {
        const id = text(args["id"], "The paper's ID");
        const source = text(args["source"], "The index");
        const back = text(args["direction"], "The direction") === "back";
        const page = args["page"] === undefined ? undefined : whole(args["page"], "The page");
        const limit = args["limit"] === undefined ? undefined : whole(args["limit"], "The limit");
        try {
          const trail = await (back ? referencesOf : citationsOf)(source, id, {
            ...(page === undefined ? {} : { page }), ...(limit === undefined ? {} : { limit }),
          });
          return {
            of: `${source}/${id}`, direction: back ? "what it cited" : "what has cited it",
            count: trail.count, page: trail.page, more: trail.more,
            papers: trail.papers.map((one) => ({ id: one.id, source: one.source, title: one.title, authors: one.authors, journal: one.journal, year: one.year, look_at: one.lookAt })),
            ...(trail.count === 0 ? { note: back ? "Europe PMC has no reference list for this one." : "Nothing has cited it yet, or Europe PMC does not know of it." } : {}),
          };
        } catch (cause) { throw asTrouble(cause); }
      },
    },
  ];
}
