/** Module-level functions of `Bio.Seq`: `transcribe`, `translate`, `reverse_complement`, ... */

import * as pb from "../pybytes/index.js";
import { SeqAbstractBaseClass } from "./base/index.js";
import { dnaComplementTable, rnaComplementTable } from "./complement-tables.js";
import { MutableSeq } from "./mutable-seq.js";
import { tyName } from "./pytypes.js";
import { Seq } from "./seq.js";
import { isSeqRecord } from "./seq-record-brand.js";
import { translateArgs, translateStr, type TableArg } from "./translate.js";

/** `s.replace(a, b).replace(c, d)` on a Python `str`, rejecting other types like Python does. */
function strReplace(s: unknown, a: string, b: string, c: string, d: string): string {
  if (typeof s === "string") return s.replaceAll(a, b).replaceAll(c, d);
  if (s instanceof Uint8Array) throw new TypeError("a bytes-like object is required, not 'str'");
  throw new TypeError(`'${tyName(s)}' object has no attribute 'replace'`);
}

/**
 * Transcribe DNA to RNA. Accepts a string (returns a string), `Seq` or `MutableSeq`.
 */
export function transcribe(dna: string): string;

/** Transcribe a `Seq` or `MutableSeq`; returns a `Seq`. */
export function transcribe(dna: Seq | MutableSeq): Seq;

export function transcribe(dna: string | Seq | MutableSeq): string | Seq {
  if (dna instanceof Seq) return dna.transcribe();
  if (dna instanceof MutableSeq) return new Seq(dna).transcribe();
  return strReplace(dna, "T", "U", "t", "u");
}

/**
 * Back-transcribe RNA to DNA. Accepts a string (returns a string), `Seq` or `MutableSeq`.
 */
export function backTranscribe(rna: string): string;

/** Back-transcribe a `Seq` or `MutableSeq`; returns a `Seq`. */
export function backTranscribe(rna: Seq | MutableSeq): Seq;

export function backTranscribe(rna: string | Seq | MutableSeq): string | Seq {
  if (rna instanceof Seq) return rna.backTranscribe();
  if (rna instanceof MutableSeq) return new Seq(rna).backTranscribe();
  return strReplace(rna, "U", "T", "u", "t");
}

/**
 * Translate a nucleotide string, `Seq` or `MutableSeq` to protein.
 * For strings the `gap` default is `null`; for sequences the method's `"-"`.
 */
export function translate(sequence: string, table?: TableArg, stopSymbol?: string, toStop?: boolean, cds?: boolean, gap?: string | null): string;

/** Translate a `Seq` or `MutableSeq`; returns a `Seq`. */
export function translate(sequence: Seq | MutableSeq, table?: TableArg, stopSymbol?: string, toStop?: boolean, cds?: boolean, gap?: string | null): Seq;

export function translate(sequence: string | Seq | MutableSeq, table?: TableArg, stopSymbol?: string, toStop?: boolean, cds?: boolean, gap?: string | null): string | Seq {
  if (sequence instanceof Seq) return sequence.translate(table, stopSymbol, toStop, cds);
  if (sequence instanceof MutableSeq) return new Seq(sequence).translate(table, stopSymbol, toStop, cds);
  const a = translateArgs(table, stopSymbol, toStop, cds, gap, null);
  return translateStr(sequence, a.table, a.stopSymbol, a.toStop, a.cds, "X", a.gap);
}

/** Shared body of the four string/Seq/SeqRecord module functions. */
function transformModule<T extends string | Seq | MutableSeq>(
  sequence: T,
  inplace: boolean,
  table: Uint8Array,
  reverse: boolean,
  seqMethod: "complement" | "complementRna" | "reverseComplement" | "reverseComplementRna",
): unknown {
  if (sequence instanceof SeqAbstractBaseClass) return sequence[seqMethod](inplace);
  if (isSeqRecord(sequence)) {
    if (inplace) throw new TypeError("SeqRecords are immutable");
    return (sequence as unknown as Record<string, () => unknown>)[seqMethod]!();
  }
  if (inplace) throw new TypeError("strings are immutable");
  if (typeof sequence !== "string") throw new TypeError(`'${tyName(sequence)}' object has no attribute 'encode'`);
  let data = pb.translateBytes(pb.encodeAscii(sequence), table);
  if (reverse) data = pb.bytesSlice(data, null, null, -1);
  return pb.decodeAscii(data);
}

/** Complement of a DNA string (returns a string) or sequence. */
export function complement(sequence: string, inplace?: boolean): string;

/** `complement` of a `Seq` or `MutableSeq`; returns the same kind (the receiver itself when `inplace` is true). */
export function complement<T extends Seq | MutableSeq>(sequence: T, inplace?: boolean): T;

export function complement(sequence: string | Seq | MutableSeq, inplace = false): unknown {
  return transformModule(sequence, inplace, dnaComplementTable, false, "complement");
}

/** Complement of an RNA string or sequence. */
export function complementRna(sequence: string, inplace?: boolean): string;

/** `complementRna` of a `Seq` or `MutableSeq`; returns the same kind (the receiver itself when `inplace` is true). */
export function complementRna<T extends Seq | MutableSeq>(sequence: T, inplace?: boolean): T;

export function complementRna(sequence: string | Seq | MutableSeq, inplace = false): unknown {
  return transformModule(sequence, inplace, rnaComplementTable, false, "complementRna");
}

/** Reverse complement of a DNA string or sequence. */
export function reverseComplement(sequence: string, inplace?: boolean): string;

/** `reverseComplement` of a `Seq` or `MutableSeq`; returns the same kind (the receiver itself when `inplace` is true). */
export function reverseComplement<T extends Seq | MutableSeq>(sequence: T, inplace?: boolean): T;

export function reverseComplement(sequence: string | Seq | MutableSeq, inplace = false): unknown {
  return transformModule(sequence, inplace, dnaComplementTable, true, "reverseComplement");
}

/** Reverse complement of an RNA string or sequence. */
export function reverseComplementRna(sequence: string, inplace?: boolean): string;

/** `reverseComplementRna` of a `Seq` or `MutableSeq`; returns the same kind (the receiver itself when `inplace` is true). */
export function reverseComplementRna<T extends Seq | MutableSeq>(sequence: T, inplace?: boolean): T;

export function reverseComplementRna(sequence: string | Seq | MutableSeq, inplace = false): unknown {
  return transformModule(sequence, inplace, rnaComplementTable, true, "reverseComplementRna");
}
