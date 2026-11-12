/** Conversion of user-supplied "sub", "chars", "sep" ... arguments to bytes. */

import * as pb from "../pybytes/index.js";
import type { MutableSeq } from "./mutable-seq.js";
import { isSeqLike, pyType } from "./pytypes.js";
import type { Seq } from "./seq.js";

/** Anything accepted where a sequence-like argument is expected. */
export type SubLike = string | Uint8Array | Seq | MutableSeq;

/** Bytes for a "sub" argument; raises Biopython's TypeError for other types. */
export function subBytes(sub: unknown): Uint8Array {
  if (isSeqLike(sub)) return sub.toBytes();
  if (typeof sub === "string") return pb.encodeAscii(sub);
  if (sub instanceof Uint8Array) return sub;
  throw new TypeError(`a Seq, MutableSeq, str, bytes, or bytearray object is required, not '${pyType(sub)}'`);
}

/** Like {@link subBytes} but passes other types through unchanged (for strip, split, ...). */
export function looseBytes(x: unknown): unknown {
  if (isSeqLike(x)) return x.toBytes();
  if (typeof x === "string") return pb.encodeAscii(x);
  return x;
}
