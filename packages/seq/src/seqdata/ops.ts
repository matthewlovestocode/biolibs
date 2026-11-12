/** Operations that combine providers. */

import { NOT_IMPLEMENTED, type SeqDataLike, type SequenceDataAbstractBaseClass } from "./abstract.js";
import { BytesData } from "./bytes-data.js";

/**
 * Wrap raw bytes in a {@link BytesData}; pass providers through unchanged.
 *
 * @param x - Raw bytes or an existing provider.
 */
export function toData(x: SeqDataLike): SequenceDataAbstractBaseClass {
  return x instanceof Uint8Array ? new BytesData(x) : x;
}

/**
 * Concatenate two providers (Python `a + b` on the underlying data), trying
 * `a.add(b)` and then `b.radd(a)` like Python's operator protocol.
 *
 * @throws TypeError if neither side can handle the operation.
 */
export function addData(a: SequenceDataAbstractBaseClass, b: SequenceDataAbstractBaseClass): SequenceDataAbstractBaseClass {
  const r = a.add(b);
  if (r !== NOT_IMPLEMENTED) return toData(r);
  const r2 = b.radd(a);
  if (r2 !== NOT_IMPLEMENTED) return toData(r2);
  throw new TypeError("unsupported operand type(s) for +");
}
