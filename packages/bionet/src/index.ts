/**
 * @packageDocumentation
 * `@biolibs/bionet`: labs publishing what they hold, so a cloning plan can be acted on and not just read.
 *
 * This package is **not a port**. Everything else in biolibs is measured against a Python library
 * case by case; this has no upstream to be measured against. What it has instead is a question it is
 * trying to answer honestly: a plan that replays is a plan you can believe, but belief is not a
 * plasmid. Somebody has to have the parts.
 *
 * So a lab writes down what it holds, names each part by checksum rather than by its own name for it,
 * signs the list with its key, and publishes it at a fixed path on its own web address. Fetch one and
 * three separate things are settled: that the document is an inventory, that its signatures hold, and
 * that it came from the address it claims. None of those is "this lab is who it says it is" — that you
 * knew before you typed the address, or do not know at all. See `origin.ts`, which is blunt about it.
 *
 * - `model.ts` — what an inventory is
 * - `inventory.ts` — writing one, signing one, reading a stranger's
 * - `origin.ts` — where one lives, and what fetching it proves
 * - `fetch.ts` — fetching and checking one
 * - `discover.ts` — finding labs you were never told about, by walking from ones you were
 * - `trust.ts` — remembering which key answered last time, so a change gets noticed
 * - `match.ts` — what a plan needs, and who has it
 * - `log.ts` — one signed change inside a lab, and the log it belongs to
 * - `merge.ts` — what a lab holds, worked out from every key's log together
 * - `sync.ts` — getting entries from one machine to another, and deciding who may have them
 *
 * @example
 * ```ts
 * import { fetchInventory, partsNeeded, settled, whoHas } from "@biolibs/bionet";
 *
 * const found = await fetchInventory("wrenlab.example");
 * // From a cloning plan, or, with `methodNeeds`, from a published method.
 * const sourcing = whoHas(partsNeeded(plan.document), settled(found) ? [found] : []);
 *
 * for (const { needed, holders } of sourcing) {
 *   console.log(needed.name, holders.map((holder) => holder.lab));
 * }
 * ```
 */

export * from "./model.js";
export * from "./inventory.js";
export * from "./method.js";
export * from "./origin.js";
export * from "./fetch.js";
export * from "./discover.js";
export * from "./trust.js";
export * from "./match.js";
export * from "./log.js";
export * from "./merge.js";
export * from "./sync.js";
