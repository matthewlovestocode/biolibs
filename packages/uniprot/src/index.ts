/**
 * @packageDocumentation
 * `@biolibs/uniprot`: what is known about a protein, read into positions people count.
 *
 * `@biolibs/seqio` already reads UniProt's XML, faithfully, into Biopython's shapes. That is the
 * right thing for a port to do and the wrong thing to hand a lab: half-open locations counted from
 * zero, and a sequence that is the precursor rather than the thing anybody holds. This turns an
 * entry into the few facts somebody at a bench asks for — the mature chain, what is modified on it,
 * where it varies — and counts them from 1 with both ends included, as everything else here does.
 *
 * - `ask.ts`: `settings`, `ask`, `UniProtError` — one place that touches the network
 * - `search.ts`: `searchProteins`, `lookUpProtein` — finding an entry, and fetching one
 * - `protein.ts`: `readProtein`, `onTheChain` — an entry, read
 *
 * @example
 * ```ts
 * import { lookUpProtein, onTheChain, readProtein } from "@biolibs/uniprot";
 *
 * const casein = readProtein(await lookUpProtein("P02666"));
 * casein.chain?.length;                                     // what a lab collects, not the precursor
 * casein.modifications.map((one) => onTheChain(casein, one.at));   // the phosphoserines, on the chain
 * ```
 */

export * from "./ask.js";
export * from "./search.js";
export * from "./protein.js";
