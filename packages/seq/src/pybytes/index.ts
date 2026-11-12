/**
 * @packageDocumentation
 * Python `bytes` / `slice` semantics on `Uint8Array`.
 *
 * Biopython's `Seq` stores its data as Python `bytes` and delegates nearly
 * every method to the bytes implementation. To reproduce Biopython's behaviour
 * exactly (negative indices, clamping, empty-needle rules, whitespace
 * splitting, ...) this package re-implements the relevant `bytes` methods, following
 * CPython's `Objects/bytes_methods.c` and `Objects/stringlib`.
 *
 * - `slice.ts`: slices and index arithmetic
 * - `ascii.ts`: ASCII/UTF-8 conversion
 * - `basic.ts`: concat, repeat, compare, index checks
 * - `search.ts`: find/count/startswith families
 * - `split-strip.ts`: split and strip families
 * - `transform.ts`: case, replace, translate
 */

export * from "./slice.js";
export * from "./ascii.js";
export * from "./basic.js";
export * from "./search.js";
export * from "./split-strip.js";
export * from "./transform.js";
