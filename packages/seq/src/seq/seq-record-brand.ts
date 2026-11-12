/**
 * `Bio.Seq` functions accept a `SeqRecord`, but this package cannot import it
 * (it is defined later and depends on `Seq`). `SeqRecord` instances instead
 * carry this brand, which the functions test for.
 */

/** Brand set on `SeqRecord` so `Bio.Seq` functions can recognise it without importing it. */
export const SEQ_RECORD_BRAND: unique symbol = Symbol.for("biolibs.SeqRecord");

/** Wrap a `Seq`-like or string for the module-level functions. */
export function isSeqRecord(x: unknown): x is { complement(): unknown; complementRna(): unknown; reverseComplement(): unknown; reverseComplementRna(): unknown } {
  return x !== null && typeof x === "object" && (x as Record<symbol, unknown>)[SEQ_RECORD_BRAND] === true;
}
