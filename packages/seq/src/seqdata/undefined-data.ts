/** Content of known length but entirely unknown (GenBank `CONTIG` records). */

import * as pb from "../pybytes/index.js";
import type { PySlice } from "../pybytes/index.js";
import {
  NOT_IMPLEMENTED,
  SequenceDataAbstractBaseClass,
  UndefinedSequenceError,
  bytesOf,
  lenOf,
  type SeqDataLike,
} from "./abstract.js";
import { PartiallyDefinedSequenceData } from "./partial-data.js";

/**
 * Sequence of known length whose content is entirely unknown, as in GenBank
 * `CONTIG` records. Created by `new Seq(null, length)`.
 */
export class UndefinedSequenceData extends SequenceDataAbstractBaseClass {
  /** @param _length - Number of undefined residues; negative values raise `ValueError`. */
  constructor(private readonly _length: number) {
    super();
    pb.sliceIndices({ stop: 0 }, _length); // raises ValueError for a negative length
  }

  /** The declared length (content is unknown, but the length is known). */
  get length(): number { return this._length; }

  /** Any single-residue read fails: the content is undefined. */
  getItem(): number { throw new UndefinedSequenceError("Sequence content is undefined"); }

  /** A slice is again undefined, of the length Python's slicing would give; an empty slice is empty bytes. */
  getSlice(s: PySlice): SeqDataLike {
    const [a, b, st] = pb.sliceIndices(s, this._length);
    const size = pb.rangeLength(a, b, st);
    if (size === 0) return new Uint8Array(0);
    return new UndefinedSequenceData(size);
  }

  /** Reading the content raises {@link UndefinedSequenceError}. */
  toBytes(): Uint8Array { throw new UndefinedSequenceError("Sequence content is undefined"); }

  /** Concatenate. Undefined + undefined stays undefined; undefined + defined becomes partially defined (the defined part follows this one). */
  add(other: SeqDataLike): SeqDataLike | typeof NOT_IMPLEMENTED {
    const length = this.length + lenOf(other);
    let ob: Uint8Array;
    try {
      ob = bytesOf(other);
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
      return other instanceof UndefinedSequenceData ? new UndefinedSequenceData(length) : NOT_IMPLEMENTED;
    }
    return new PartiallyDefinedSequenceData(length, new Map([[this.length, ob]]));
  }

  /** `other + this`: the defined `other` comes first, then this undefined stretch. */
  radd(other: SeqDataLike): SeqDataLike {
    return new PartiallyDefinedSequenceData(lenOf(other) + this.length, new Map([[0, bytesOf(other)]]));
  }

  /** Case conversion of unknown content is unknown (same length). */
  upper(): SeqDataLike { return new UndefinedSequenceData(this._length); }
  /** Case conversion of unknown content is unknown (same length). */
  lower(): SeqDataLike { return new UndefinedSequenceData(this._length); }
  /** Cannot tell: raises {@link UndefinedSequenceError}. */
  isupper(): boolean { throw new UndefinedSequenceError("Sequence content is undefined"); }
  /** Cannot tell: raises {@link UndefinedSequenceError}. */
  islower(): boolean { throw new UndefinedSequenceError("Sequence content is undefined"); }

  /** Same-length replacement cannot change which residues are defined, so the result is undefined; otherwise the length would be unknowable and an error is raised. */
  replace(old: Uint8Array, nu: Uint8Array): SeqDataLike {
    if (old.length !== nu.length) throw new UndefinedSequenceError("Sequence content is undefined");
    return new UndefinedSequenceData(this._length);
  }

  /** Always false. */
  get defined(): boolean { return false; }
  /** No ranges are defined. */
  get definedRanges(): [number, number][] { return []; }
}
