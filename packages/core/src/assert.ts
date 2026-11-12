import { BioError } from "./errors.js";

/**
 * Assertion helper: throws a {@link BioError} unless `cond` is truthy.
 * Also narrows types for TypeScript via an `asserts` signature.
 *
 * @param cond - Condition that must hold.
 * @param message - Message for the thrown error when the condition fails.
 * @throws {@link BioError} if `cond` is falsy.
 *
 * @example
 * ```ts
 * assert(seq.length % 3 === 0, "length must be a multiple of 3");
 * ```
 */
export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new BioError(message);
}
