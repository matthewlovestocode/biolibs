/**
 * An open-access paper's full text, read out of JATS XML into something a person can read.
 *
 * This is the part of the package that earns its keep. Europe PMC will hand over a paper's whole
 * text, but it hands it over as JATS: a hundred and eighty kilobytes of markup in which the one
 * paragraph somebody wants — which host, which promoter, what yield — is three levels down inside
 * nested `<sec>` elements, wrapped in `<italic>` and interrupted every other sentence by an
 * `<xref>` that renders as "[14]". Handing that on as it stands is not giving anybody the paper.
 *
 * So it is read into sections with their headings, tables as rows, and figures as captions, and
 * three decisions are made here rather than left to whoever reads it:
 *
 * - **A citation marker is not text.** An `<xref>` pointing at the reference list is dropped, so a
 *   sentence reads as a sentence. One pointing at a table or a figure is kept, because "as Table 2
 *   shows" is part of what the sentence says.
 * - **A table is not a paragraph.** Tables and figures are lifted out of the running text and kept
 *   apart, with their labels and captions, since a table flattened into prose is unreadable and a
 *   yield is as often in a table as in a sentence.
 * - **A heading is worth more than its words.** Section headings are kept with their depth and
 *   their numbering, and {@link sectionsNamed} matches the loose way people name them, so that
 *   asking for the methods finds "2. Materials and Methods" and "Experimental Procedures" alike.
 */
import { Element, ParseError, PullParser } from "@biolibs/seqio";
import { ask, EuropePmcError } from "./ask.js";

/** One section of a paper. */
export interface Section {
  /** Its heading, or `""` for text that came before any heading. */
  heading: string;
  /** How deeply nested it is: 0 for a top-level section, 1 for one inside that. */
  depth: number;
  /** Its own paragraphs, not counting those of the sections inside it. */
  text: string;
}

/** One table, as rows of cells. */
export interface Table {
  /** What the paper calls it, such as `Table 2`. */
  label: string;
  /** What it says the table shows. */
  caption: string;
  /** The heading row's cells, if it has one. */
  headings: string[];
  /** The body rows, each a list of cells. */
  rows: string[][];
}

/** One figure, which is a picture and so is only its words. */
export interface Figure {
  /** What the paper calls it, such as `Figure 1`. */
  label: string;
  /** What it says the figure shows. */
  caption: string;
}

/** A paper, read. */
export interface Article {
  /** Its title. */
  title: string;
  /** The journal it was published in, and when. */
  journal: string | null;
  year: number | null;
  /** The authors, surname first, as the paper writes them. */
  authors: string[];
  /** The abstract, as one piece of text. */
  abstract: string;
  /** The keywords the paper gives itself. */
  keywords: string[];
  /** Its sections, in the order they are written, each with its own paragraphs. */
  sections: Section[];
  /** Its tables and figures, lifted out of the running text. */
  tables: Table[];
  figures: Figure[];
  /** What it is licensed under, where it says. */
  licence: string | null;
}

/**
 * Tags whose content is lifted out of the running text and kept apart.
 *
 * The reference list is here because some publishers put it inside `<body>` rather than in the back
 * matter, and twenty thousand characters of citations is not something to hand anybody as the text
 * of a section. The section itself is still listed, with its heading and nothing in it.
 */
const LIFTED = new Set(["table-wrap", "fig", "supplementary-material", "table-wrap-foot", "ref-list"]);

/** Tags that are machinery rather than words. */
const SILENT = new Set(["graphic", "media", "inline-graphic", "object-id", "alt-text"]);

/** A section's own words stop where the next section begins. */
const DEEPER = new Set(["sec"]);

/**
 * Tidy a run of words that has had its markup taken out.
 *
 * The brackets are the reason this is more than collapsing whitespace. A paper writes a citation as
 * `[<xref>14</xref>]`, and taking the marker out leaves the brackets standing: "as described
 * before by Sambrook and Russell []." So an empty pair, and the commas and dashes left between
 * markers that were all dropped, go with them.
 */
const squash = (text: string): string => text
  .replace(/[ \t\r\n]+/g, " ")
  .replace(/[([][\s,;–—-]*[)\]]/g, "")
  .replace(/ ([,.;:)\]])/g, "$1")
  .replace(/([([]) /g, "$1")
  .replace(/ {2,}/g, " ")
  .replace(/ ([.,;:])/g, "$1")
  .trim();

/**
 * The words of an element and everything inside it, as running text.
 *
 * A section's own words are its own: the walk does not go down into the sections inside it, or the
 * text of every paragraph would be counted again at every level above it.
 *
 * @param element - The element.
 * @param options - `keepTitle` keeps a `<title>` child's words, which is wanted for a caption and
 *   not for a section, whose heading is taken separately.
 * @returns The text, with the markup gone and the spacing tidied.
 */
export function wordsOf(element: Element, options: { keepTitle?: boolean } = {}): string {
  const out: string[] = [];
  const walk = (one: Element, top: boolean): void => {
    // Whatever was asked for is read, however it is usually treated: a `<label>` is machinery
    // inside a paragraph and is the whole of what is wanted when a table's label is asked for.
    if (!top && (LIFTED.has(one.tag) || SILENT.has(one.tag) || DEEPER.has(one.tag))) return;
    if (one.tag === "label" && !top) return;
    if (one.tag === "title" && options.keepTitle !== true && !top) return;
    // A marker pointing at the reference list renders as "[14]" and is not part of the sentence.
    // One pointing at a table or a figure is: "as Table 2 shows" says something.
    if (one.tag === "xref" && (one.attrib.get("ref-type") ?? "bibr") === "bibr") { if (one.tail !== null) out.push(one.tail); return; }
    if (one.text !== null) out.push(one.text);
    for (const child of one.children) walk(child, false);
    // A paragraph, a list item and a heading each end a run of words; inline markup does not.
    if (!top && (one.tag === "p" || one.tag === "list-item" || one.tag === "title" || one.tag === "td" || one.tag === "th")) out.push("\n");
    if (one.tail !== null) out.push(one.tail);
  };
  walk(element, true);
  return out.join("").split("\n").map(squash).filter((one) => one !== "").join("\n\n");
}

/** The first child with a tag, anywhere inside. */
const first = (element: Element, tag: string): Element | null => {
  for (const found of element.iter(tag)) if (found !== element) return found;
  return null;
};

/** The heading of a section, which is its `<title>` if it has one. */
const headingOf = (element: Element): string => {
  const title = element.children.find((one) => one.tag === "title");
  return title === undefined ? "" : squash(wordsOf(title, { keepTitle: true }));
};

/** A table, read out of its wrapper. */
function tableOf(wrap: Element): Table {
  const label = wrap.children.find((one) => one.tag === "label");
  const caption = wrap.children.find((one) => one.tag === "caption");
  const cells = (row: Element): string[] => row.children.filter((one) => one.tag === "td" || one.tag === "th").map((one) => squash(wordsOf(one, { keepTitle: true })));
  const rowsIn = (tag: string): string[][] => {
    const part = first(wrap, tag);
    return part === null ? [] : [...part.iter("tr")].filter((one) => one.tag === "tr").map(cells);
  };
  const head = rowsIn("thead");
  const body = rowsIn("tbody");
  return {
    label: label === undefined ? "" : squash(wordsOf(label, { keepTitle: true })),
    caption: caption === undefined ? "" : squash(wordsOf(caption, { keepTitle: true })),
    // Some papers have no `thead` and put the headings in the first row of the body.
    headings: head[0] ?? [],
    rows: head.length > 0 ? body : body.slice(0),
  };
}

/**
 * Read a paper out of its JATS XML.
 *
 * @param xml - The document, as Europe PMC sends it.
 * @returns The paper.
 * @throws {@link EuropePmcError} if that is not a JATS article.
 *
 * @example
 * ```ts
 * import { fullTextOf, readArticle, sectionsNamed } from "@biolibs/europepmc";
 *
 * const paper = readArticle(await fullTextOf("PMC12292773"));
 * sectionsNamed(paper, "methods").map((one) => one.heading);
 * ```
 */
export function readArticle(xml: string): Article {
  let root: Element;
  try {
    const bytes = new TextEncoder().encode(xml);
    const parser = new PullParser(bytes);
    const events = [...parser.feed(bytes.length), ...parser.close()];
    for (const event of events) if (event.kind === "error") throw event.error;
    const started = events.find((event) => event.kind === "start");
    if (started === undefined || started.kind !== "start") throw new ParseError("no element found: line 1, column 0", [1, 0]);
    root = started.elem;
  } catch (cause) {
    throw new EuropePmcError(`That is not a paper Europe PMC could hand over: ${cause instanceof Error ? cause.message : String(cause)}`, "fullTextXML");
  }
  if (root.tag !== "article") throw new EuropePmcError(`Expected a JATS article and got <${root.tag}>. The paper may not be open access.`, "fullTextXML");

  const titleElement = first(root, "article-title");
  const journal = first(root, "journal-title");
  const abstract = first(root, "abstract");
  const year = [...root.iter("year")].find((one) => one !== root);
  const authors: string[] = [];
  for (const contributor of root.iter("contrib")) {
    if ((contributor.attrib.get("contrib-type") ?? "author") !== "author") continue;
    const surname = first(contributor, "surname")?.text ?? null;
    const given = first(contributor, "given-names")?.text ?? null;
    const name = [surname, given].filter((one) => one !== null).join(" ").trim();
    if (name !== "") authors.push(name);
  }
  const keywords = [...root.iter("kwd")].filter((one) => one !== root).map((one) => squash(wordsOf(one, { keepTitle: true }))).filter((one) => one !== "");

  const sections: Section[] = [];
  const tables: Table[] = [];
  const figures: Figure[] = [];
  const body = first(root, "body");
  if (body !== null) {
    const walk = (element: Element, depth: number): void => {
      const text = wordsOf(element);
      if (text !== "" || headingOf(element) !== "") sections.push({ heading: headingOf(element), depth, text });
      for (const child of element.children) if (child.tag === "sec") walk(child, depth + 1);
    };
    // Text written before the first section is a section of the paper with no heading. The walk
    // does not descend into the sections, so this is only what is loose.
    const loose = wordsOf(body);
    if (loose !== "") sections.push({ heading: "", depth: 0, text: loose });
    for (const child of body.children) if (child.tag === "sec") walk(child, 0);
  }
  // Lifted from the whole article, so that a table in the back matter is still found.
  for (const wrap of root.iter("table-wrap")) if (wrap !== root) tables.push(tableOf(wrap));
  for (const figure of root.iter("fig")) {
    if (figure === root) continue;
    const label = figure.children.find((one) => one.tag === "label");
    const caption = figure.children.find((one) => one.tag === "caption");
    figures.push({
      label: label === undefined ? "" : squash(wordsOf(label, { keepTitle: true })),
      caption: caption === undefined ? "" : squash(wordsOf(caption, { keepTitle: true })),
    });
  }

  return {
    title: titleElement === null ? "" : squash(wordsOf(titleElement, { keepTitle: true })),
    journal: journal === null ? null : squash(wordsOf(journal, { keepTitle: true })) || null,
    year: year === undefined || year.text === null || !/^\d{4}$/.test(year.text.trim()) ? null : Number(year.text.trim()),
    authors,
    abstract: abstract === null ? "" : wordsOf(abstract),
    keywords, sections, tables, figures,
    // The licence as a link where the paper gives one, since that is the form anybody can check,
    // and otherwise the words it is stated in.
    licence: (() => {
      const stated = first(root, "license");
      if (stated === null) return null;
      for (const link of stated.iter("ext-link")) {
        const href = link.attrib.get("{http://www.w3.org/1999/xlink}href") ?? link.attrib.get("href");
        if (href !== undefined && href.trim() !== "") return href.trim();
      }
      return squash(wordsOf(stated, { keepTitle: true })) || null;
    })(),
  };
}

/** The headings a kind of section is written under, loosest last. */
const CALLED: Readonly<Record<string, readonly string[]>> = {
  methods: ["materials and methods", "methods and materials", "experimental procedures", "experimental section",
            "materials & methods", "methods", "experimental"],
  results: ["results and discussion", "results"],
  discussion: ["discussion", "conclusions and discussion"],
  introduction: ["introduction", "background"],
  conclusion: ["conclusions", "conclusion", "concluding remarks", "summary"],
  abstract: ["abstract", "summary"],
};

/** The kinds of section that can be asked for by name. */
export const SECTION_KINDS = Object.keys(CALLED);

/**
 * The sections of a paper written under a given kind of heading.
 *
 * {@link findSection} is this, and says besides whether the heading was that name outright or only
 * contained it, which is worth knowing before passing an answer on.
 *
 * Papers do not agree about what to call anything. The methods are under "Materials and Methods",
 * "Experimental Procedures", "Methods", or a number and then one of those, and the one thing they
 * have in common is that nobody writing a tool can rely on which. So the matching is loose, the
 * numbering is ignored, and the sections *inside* a matching one come with it — a yield in "2.4.
 * Fermentation" belongs to the methods even though its own heading does not say so.
 *
 * @param article - The paper.
 * @param kind - What is wanted: `methods`, `results`, `discussion`, `introduction`, `conclusion`,
 *   or any other words, which are matched against the headings as they are.
 * @returns The sections, in the order they are written. Empty if the paper has no such heading.
 *
 * @example
 * ```ts
 * import { sectionsNamed } from "@biolibs/europepmc";
 *
 * sectionsNamed(paper, "methods");           // "2. Materials and Methods" and everything under it
 * sectionsNamed(paper, "casein");            // any heading with that word in it
 * ```
 */
export const sectionsNamed = (article: Article, kind: string): Section[] => findSection(article, kind).sections;

/**
 * The sections of a paper written under a given kind of heading, and how they were found.
 *
 * {@link sectionsNamed} is this without the second part. The second part matters when the answer is
 * going to be handed to somebody: a paper with no methods section at all still has headings with
 * the word "methods" in them, and "BNBMs by novel biosynthesis methods" is not the methods. Saying
 * which kind of match it was lets a caller pass that doubt on instead of swallowing it.
 *
 * @param article - The paper.
 * @param kind - What is wanted, as {@link sectionsNamed} takes it.
 * @returns The sections, and whether a heading was that name outright rather than merely containing it.
 */
export function findSection(article: Article, kind: string): { sections: Section[]; exact: boolean } {
  const asked = kind.trim().toLowerCase();
  if (asked === "") return { sections: [], exact: false };
  // A heading without its numbering: "2.4. Fermentation" is "fermentation".
  const bare = (heading: string): string => heading.toLowerCase().replace(/^[\d.\s]+/, "").replace(/[.:]\s*$/, "").trim();
  const wanted = CALLED[asked] ?? [asked];
  // A heading that is one of the names outright wins over one that merely contains it, so that
  // "Methods" is preferred to "Supplementary Methods" wherever the paper has both.
  const exact = article.sections.findIndex((one) => wanted.some((name) => bare(one.heading) === name));
  const found = exact >= 0 ? exact
    : article.sections.findIndex((one) => one.heading !== "" && wanted.some((name) => bare(one.heading).includes(name)));
  if (found < 0) return { sections: [], exact: false };
  // Everything under it is part of it, down to the next heading at the same depth or shallower.
  const start = article.sections[found]!;
  const out = [start];
  for (const one of article.sections.slice(found + 1)) {
    if (one.depth <= start.depth) break;
    out.push(one);
  }
  return { sections: out, exact: exact >= 0 };
}

/**
 * Fetch one open-access paper's full text.
 *
 * @param pmcid - Its PubMed Central ID, such as `PMC12292773`.
 * @returns The JATS XML, to be read with {@link readArticle}.
 * @throws {@link EuropePmcError} if there is no full text to be had, which for a paper that is not
 *   open access is the usual answer.
 *
 * @example
 * ```ts
 * import { fullTextOf } from "@biolibs/europepmc";
 *
 * const xml = await fullTextOf("PMC12292773");
 * ```
 */
export async function fullTextOf(pmcid: string): Promise<string> {
  const id = pmcid.trim().toUpperCase();
  if (!/^PMC\d{1,12}$/.test(id)) throw new EuropePmcError(`${JSON.stringify(pmcid)} is not a PubMed Central ID. One looks like PMC12292773.`, "fullTextXML");
  try {
    return await ask(`${id}/fullTextXML`);
  } catch (cause) {
    if (cause instanceof EuropePmcError && cause.status === 404) {
      throw new EuropePmcError(`Europe PMC has no full text for ${id}. Only open-access papers can be read in full; for the rest there is the abstract.`, cause.url, 404);
    }
    throw cause;
  }
}
