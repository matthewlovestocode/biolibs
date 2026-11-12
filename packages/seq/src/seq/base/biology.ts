/**
 * Layer 4 of the shared base: the biological operations (translation,
 * complement, transcription). This is the class `Seq` and `MutableSeq` extend.
 */

import { warn } from "@biolibs/core";
import * as pb from "../../pybytes/index.js";
import { UndefinedSequenceData, UndefinedSequenceError, toData, type SeqDataLike } from "../../seqdata/index.js";
import { dnaComplementTable, rnaComplementTable } from "../complement-tables.js";
import { translateArgs, translateStr, type TableArg } from "../translate.js";
import { SeqEditBase } from "./edit.js";

/**
 * Shared implementation of `Seq` and `MutableSeq` (Biopython's `_SeqAbstractBaseClass`).
 *
 * Every method that returns a sequence returns an instance of the same class
 * as the receiver, except `split`/`rsplit`, which always return `Seq` parts
 * (as in Biopython). Methods with an `inplace` flag modify a `MutableSeq` and
 * throw `TypeError("Sequence is immutable")` on a `Seq`.
 */
export abstract class SeqAbstractBaseClass extends SeqEditBase {
  /** Translate into a protein sequence; see {@link TranslateOptions}. */
  translate(table?: TableArg, stopSymbol?: string, toStop?: boolean, cds?: boolean, gap?: string | null): this {
    const a = translateArgs(table, stopSymbol, toStop, cds, gap, "-");
    let data: string;
    try {
      data = this.toString();
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
      // Undefined content translates to an undefined protein of the right length.
      const n = this.length;
      if (n % 3 !== 0) warn("Partial codon, len(sequence) not a multiple of three. This may become an error in future.");
      const parts = Math.trunc(n / 3); // Seq(None, 0) is empty bytes, not an undefined sequence
      return this.makeSeq(parts === 0 ? new Uint8Array(0) : new UndefinedSequenceData(parts)) as unknown as this;
    }
    return this.make(pb.encodeAscii(translateStr(data, a.table, a.stopSymbol, a.toStop, a.cds, "X", a.gap)));
  }

  /** Apply a 256-entry byte map; undefined sequences are returned unchanged (as `null`). */
  private mapped(table: Uint8Array): SeqDataLike | null {
    try {
      return this._data.translate(table);
    } catch (e) {
      if (e instanceof UndefinedSequenceError) return null;
      throw e;
    }
  }

  /** DNA complement (IUPAC aware, case preserving). */
  complement(inplace = false): this {
    const data = this.mapped(dnaComplementTable);
    return data === null ? this : this.result(data, inplace);
  }

  /** RNA complement. */
  complementRna(inplace = false): this {
    const data = this.mapped(rnaComplementTable);
    return data === null ? this : this.result(data, inplace);
  }

  /** Reverse complement via a byte table; undefined content is returned unchanged, like Biopython. */
  private revComp(table: Uint8Array, inplace: boolean): this {
    const data = this.mapped(table);
    if (data === null) return this;
    const reversed = data instanceof Uint8Array ? pb.bytesSlice(data, null, null, -1) : data.getSlice({ step: -1 });
    return this.result(reversed, inplace);
  }

  /** Reverse complement of DNA. */
  reverseComplement(inplace = false): this { return this.revComp(dnaComplementTable, inplace); }

  /** Reverse complement of RNA. */
  reverseComplementRna(inplace = false): this { return this.revComp(rnaComplementTable, inplace); }

  /** Replace one letter in both cases (for example `T` and `t`), shared by `transcribe` and `backTranscribe`. */
  private replaceByte(from: string, to: string, inplace: boolean): this {
    const f = (s: string) => pb.encodeAscii(s);
    const first = toData(this._data.replace(f(from.toUpperCase()), f(to.toUpperCase())));
    return this.result(first.replace(f(from.toLowerCase()), f(to.toLowerCase())), inplace);
  }

  /** DNA to RNA: `T` to `U` (and `t` to `u`). */
  transcribe(inplace = false): this { return this.replaceByte("T", "U", inplace); }

  /** RNA to DNA: `U` to `T` (and `u` to `t`). */
  backTranscribe(inplace = false): this { return this.replaceByte("U", "T", inplace); }
}
