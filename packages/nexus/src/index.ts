/**
 * @packageDocumentation
 * `@biolibs/nexus`: a TypeScript port of Biopython's `Bio.Nexus` — all **84 items** at parity, verified
 * against Biopython 1.88 by 425 recorded sessions, and by 706 more reaching this package through
 * `@biolibs/seqio`'s `nexus` format.
 *
 * NEXUS is the format PAUP and MrBayes use: blocks, a character matrix, character and taxon sets, and
 * trees whose taxa are usually numbers resolved through a `translate` table. The constructor takes the
 * file's *text*, and writing goes to any object with `write(text)` — `exportFasta` and `exportPhylip`
 * still return the filename Biopython would have derived, so that logic is there to inspect.
 *
 * - `errors.ts`: `NexusError`, `TreeError`, the node exceptions
 * - `char-buffer.ts`: `CharBuffer`, the character-at-a-time reader the parser runs on
 * - `helpers.ts`: `safename` (NEXUS quoting), `quotestrip`, comment stripping, `Commandline`,
 *   `StepMatrix`, `scanfile` — the last reproducing Biopython's C scanner `cnexus`, which is the path
 *   Biopython itself takes whenever that extension is built
 * - `standard-data.ts`: `StandardData`, what a `datatype=standard` matrix becomes
 * - `nodes.ts`, `trees.ts`: `Chain`, `Node`, `Tree` and `consensus`. **Most `Tree` methods take node
 *   ids, not taxon names** (`searchTaxon` converts), and `isMonophyletic` returns the clade's id or −1
 * - `nexus-parser.ts`, `nexus.ts`: the `Nexus` class, one handler per NEXUS command
 *
 * `Tree.randomize` and `bootstrap` work here, because `@biolibs/core` ports Python's Mersenne Twister:
 * seed `pyRandom` and the same trees come out as in Biopython.
 */

export * from "./errors.js";
export * from "./char-buffer.js";
export * from "./helpers.js";
export * from "./standard-data.js";
export * from "./nodes.js";
export * from "./trees.js";
export * from "./nexus-parser.js";
export * from "./nexus.js";
