/**
 * @packageDocumentation
 * `@biolibs/europepmc`: searching the literature, and reading an open-access paper as sections,
 * tables and figures instead of as JATS XML.
 *
 * There is no Biopython counterpart to be a port of. What there is instead is a service that will
 * hand over a paper's whole text, and a format — JATS — that nobody reads by choice. Europe PMC
 * needs no key and no account; it asks only that a client name itself, which {@link settings} does
 * and which is the only thing it ever sends about who is asking.
 *
 * - `ask.ts`: `settings`, `ask`, `EuropePmcError` — one place that touches the network
 * - `search.ts`: `searchArticles`, `Found` — the literature by keyword, saying plainly whether each
 *   result's full text can actually be read
 * - `article.ts`: `fullTextOf`, `readArticle`, `sectionsNamed` — a paper, read out of its markup
 * - `trail.ts`: `referencesOf`, `citationsOf` — what a paper cited, and who has cited it
 *
 * @example
 * ```ts
 * import { fullTextOf, readArticle, searchArticles, sectionsNamed } from "@biolibs/europepmc";
 *
 * const found = await searchArticles('"kappa-casein" AND "Pichia pastoris"', { corpus: "open-access" });
 * const readable = found.results.find((one) => one.fullText);
 * if (readable?.pmcid != null) {
 *   const paper = readArticle(await fullTextOf(readable.pmcid));
 *   for (const section of sectionsNamed(paper, "methods")) console.log(section.heading, section.text.slice(0, 200));
 * }
 * ```
 */

export * from "./ask.js";
export * from "./search.js";
export * from "./article.js";
export * from "./trail.js";
