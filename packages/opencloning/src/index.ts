/**
 * @packageDocumentation
 * `@biolibs/opencloning`: a cloning plan written down, sent, and checked by running it again.
 *
 * A plan is the molecules, the primers, and for each molecule the step that made it and what went into
 * it — the [OpenCloning](https://opencloning.org) data model, which is what pydna's `CloningStrategy`
 * serialises to. The point of writing one down this way is that the receiving end does not have to take
 * it on trust: `validate()` runs every step again from the inputs, through `@biolibs/assembly2`, and
 * fails if the molecule the plan claims does not come out.
 *
 * - `strategy.ts` — `CloningStrategy`: writing a plan, reading one, replaying it, normalising it
 * - `sources.ts` — one step: written down, read back, and run again
 * - `sequences.ts` — molecules and primers in and out of a plan
 * - `locations.ts` — where two fragments were joined, as GenBank writes a position
 * - `history.ts` — the plan drawn as a tree
 * - `model.ts` — the shape of the document itself
 *
 * Three files are not pydna's and say so where they begin: `signature.ts` signs a plan and checks a
 * signature on one, over the canonical bytes `canonical.ts` writes, with keys from `keys.ts`. Replaying
 * a plan says the molecules follow from the parts; a signature says who put their name to it.
 *
 * @example
 * ```ts
 * import { CloningStrategy } from "@biolibs/opencloning";
 *
 * const plan = CloningStrategy.fromRecords([plasmid], { description: "pUC19 + insert" });
 * const sent = JSON.stringify(plan.document);
 *
 * // somewhere else
 * const received = CloningStrategy.fromDocument(JSON.parse(sent));
 * received.validate();            // throws unless every step really makes what it claims
 * received.toRecords()[0];        // the plasmid, rebuilt from the plan
 * ```
 */

export * from "./model.js";
export * from "./canonical.js";
export * from "./keys.js";
export * from "./sign.js";
export * from "./signature.js";
export * from "./locations.js";
export * from "./sequences.js";
export * from "./sources.js";
export * from "./history.js";
export * from "./strategy.js";
