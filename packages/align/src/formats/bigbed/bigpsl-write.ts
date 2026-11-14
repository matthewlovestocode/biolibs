/** Writing bigPsl files (`Bio.Align.bigpsl.AlignmentWriter`). */

import { AssertionError, ValueError } from "@biolibs/core";
import { Seq, UndefinedSequenceError, reverseComplement } from "@biolibs/seq";
import { CompoundLocation, SimpleLocation, insdcLocationString } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import type { ByteWriter } from "../byte-writer.js";
import { BIGPSL_DECLARATION } from "./declarations.js";
import { BigBedWriter } from "./writer.js";

/** A target or query as the writer finds it: a record, a sequence, or plain text. */
type Sequence = string | Seq;

/** @param s - A sequence. @returns Its length, as Python's `len`. */
const lengthOf = (s: Sequence): number => (typeof s === "string" ? Array.from(s).length : s.length);

/**
 * `bytes(sequence[a:b])`, or null when the contents are not known.
 *
 * @param s - The sequence. @param a - Where to start. @param b - Where to stop.
 * @returns Those bytes, or null for a sequence of known length but unknown content.
 */
function bytesOf(s: Sequence, a: number, b: number): Uint8Array | null {
  if (typeof s === "string") {
    const text = Array.from(s).slice(a, b).join("");
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out;
  }
  try { return s.slice(a, b).toBytes(); } catch (e) {
    if (e instanceof UndefinedSequenceError) return null;
    throw e;
  }
}

const upper = (b: Uint8Array): number[] => Array.from(b, (c) => (c >= 97 && c <= 122 ? c - 32 : c));
const lower = (b: Uint8Array): number[] => Array.from(b, (c) => (c >= 65 && c <= 90 ? c + 32 : c));

/** What a bigPsl writer may be told. */
export interface BigPslOptions {
  /** The chromosomes, in the order the alignments use them. */
  targets?: SeqRecord[] | null;
  /** Compress the data blocks with zlib (the default). */
  compress?: boolean;
  /** Accepted, as Biopython accepts it, but it never reaches the bigBed writer and so changes nothing. */
  extraIndex?: readonly string[];
  /** Write the query's CDS feature in NCBI style. */
  cds?: boolean;
  /** Include the query sequence in the file. */
  fa?: boolean;
  /** `"lower"` or `"upper"`: count matches in masked target regions as `repMatches`. */
  mask?: string | null;
  /** The letter whose alignments count as `nCount`. */
  wildcard?: string | null;
}

/**
 * Writes alignments as a bigPsl file: a bigBed file of twelve columns plus the thirteen a PSL alignment needs.
 *
 * The extra columns are worked out the way `Bio.Align.psl` works them out for a PSL line — the match, mismatch,
 * repeat and N counts over the aligned blocks, the query's own start, end, size, strand and block starts — and
 * then set as the alignment's annotations, which the bigBed writer reads off. Biopython leaves those annotations
 * behind on the alignments it was given, and so does this.
 */
export class BigPslWriter {
  /** The format name used in messages. */
  static fmt: string | null = "bigPsl";
  /** Binary, so `write` refuses a text target. */
  static mode: "t" | "b" = "b";
  private readonly wildcard: number | null;

  /** @param target - Where to write; a {@link ByteWriter}. @param options - As {@link BigPslOptions}. */
  constructor(private readonly target: ByteWriter | null = null, private readonly options: BigPslOptions = {}) {
    const wildcard = options.wildcard === undefined ? "N" : options.wildcard;
    this.wildcard = wildcard === null ? null
      : (options.mask === "upper" ? wildcard.toLowerCase() : wildcard.toUpperCase()).codePointAt(0)!;
  }

  /**
   * @param alignments - The alignments to write.
   * @returns Nothing, as Biopython's writer returns no count.
   * @throws TypeError without a target, or for anything that is not an alignment.
   */
  write(alignments: Iterable<Alignment>): number | undefined {
    if (this.target === null) throw new TypeError("'NoneType' object has no attribute 'write'");
    this.writeFile(this.target, alignments);
    return undefined;
  }

  /**
   * Write the whole file.
   *
   * @param stream - Where to write. @param alignments - The alignments, whose annotations this fills in.
   * @throws TypeError for anything that is not an alignment, or when no targets are given; AssertionError for
   *   block steps that are neither equal nor three to one.
   */
  writeFile(stream: ByteWriter, alignments: Iterable<Alignment>): void {
    const { cds, fa, mask } = this.options;
    const { wildcard } = this;
    const fixed: Alignment[] = [];
    for (const alignment of alignments) {
      if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
      let coordinates = alignment.coordinates!;
      if (coordinates.every((row) => row.length === 0)) continue;
      const [targetRecord, queryRecord] = alignment.sequences as [unknown, unknown];
      let target: Sequence = targetRecord instanceof SeqRecord ? (targetRecord.seq as Seq) : (targetRecord as Sequence);
      let query: Sequence = queryRecord instanceof SeqRecord ? (queryRecord.seq as Seq) : (queryRecord as Sequence);
      const tSize = lengthOf(target), qSize = lengthOf(query);
      const n = coordinates[0]!.length;
      let dnax: boolean | null = null;
      let strand: string;
      if (coordinates[1]![0]! > coordinates[1]![n - 1]!) {
        // The query is mapped to the reverse strand, so it is the query that is turned around.
        strand = "-";
        query = reverseComplement(query as never) as Sequence;
        coordinates = [coordinates[0]!, coordinates[1]!.map((c) => qSize - c)];
      } else if (coordinates[0]![0]! > coordinates[0]![n - 1]!) {
        // A protein mapped to the reverse strand of DNA: the target is turned around instead.
        strand = "-";
        target = reverseComplement(target as never) as Sequence;
        coordinates = [coordinates[0]!.map((c) => tSize - c), coordinates[1]!];
        dnax = true;
      } else {
        strand = "+";
      }
      let matches = 0, misMatches = 0, repMatches = 0, nCount = 0;
      const blockSizes: number[] = [], qStarts: number[] = [], tStarts: number[] = [];
      let tStart = coordinates[0]![0]!, qStart = coordinates[1]![0]!;
      let qCount = 0;
      for (let c = 1; c < n; c++) {
        const tEnd = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
        if (tStart === tEnd) { qStart = qEnd; continue; }
        if (qStart === qEnd) { tStart = tEnd; continue; }
        const tCount = tEnd - tStart;
        qCount = qEnd - qStart;
        tStarts.push(tStart);
        qStarts.push(qStart);
        blockSizes.push(qCount);
        if (tCount === qCount) {
          if (dnax === true) throw new AssertionError("");
          dnax = false;
        } else {
          if (tCount !== 3 * qCount) throw new AssertionError("");
          if (dnax === false) throw new AssertionError("");
          dnax = true;
        }
        const tSeq = bytesOf(target, tStart, tEnd), qSeq = bytesOf(query, qStart, qEnd);
        if (tSeq === null || qSeq === null) {
          // At least one sequence is unknown, so every aligned letter counts as a match.
          matches += qCount;
        } else {
          const fold = mask === "upper" ? lower : upper;
          const a = fold(tSeq), b = fold(qSeq);
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const u1 = a[i]!, u2 = b[i]!;
            if (u1 === wildcard || u2 === wildcard) nCount += 1;
            else if (u1 === u2) {
              if (mask === "lower" || mask === "upper") { if (u1 === tSeq[i]) matches += 1; else repMatches += 1; }
              else matches += 1;
            } else misMatches += 1;
          }
        }
        tStart = tEnd;
        qStart = qEnd;
      }
      if (alignment.matches !== undefined) matches = alignment.matches;
      if (alignment.misMatches !== undefined) misMatches = alignment.misMatches;
      if (alignment.repMatches !== undefined) repMatches = alignment.repMatches;
      if (alignment.nCount !== undefined) nCount = alignment.nCount;
      let qS = qStarts[0]!;
      let qE = qStarts[qStarts.length - 1]! + qCount;
      let oStrand = "+";
      let outQStarts = qStarts;
      if (strand === "-") {
        if (dnax === true) {
          // A translated alignment keeps its own strand and counts the query's blocks from the far end.
          oStrand = "-";
          outQStarts = qStarts.map((s, i) => qSize - (s + blockSizes[i]!)).reverse();
          alignment.coordinates = alignment.coordinates!.map((row) => [...row].reverse());
        } else {
          [qS, qE] = [qSize - qE, qSize - qS];
        }
      }
      const oSequence = fa === true ? String((alignment.sequences[1] as SeqRecord).seq) : "";
      let oCDS = "";
      if (cds === true) {
        oCDS = "n/a";
        for (const feature of (alignment.sequences[1] as SeqRecord).features) {
          if (feature.type === "CDS") {
            oCDS = insdcLocationString(feature.location as SimpleLocation | CompoundLocation,
              lengthOf((alignment.sequences[1] as SeqRecord).seq as Seq));
            break;
          }
        }
      }
      const moleculeType = (alignment.sequences[1] as SeqRecord).annotations.get("molecule_type");
      const seqType = moleculeType === "DNA" ? "1" : moleculeType === "protein" ? "2" : "0";
      const annotations = alignment.annotations ?? new Map<string, unknown>();
      annotations.set("oChromStart", String(qS));
      annotations.set("oChromEnd", String(qE));
      annotations.set("oStrand", oStrand);
      annotations.set("oChromSize", String(qSize));
      annotations.set("oChromStarts", outQStarts.join(","));
      annotations.set("oSequence", oSequence);
      annotations.set("oCDS", oCDS);
      annotations.set("chromSize", String(tSize));
      annotations.set("match", String(matches));
      annotations.set("misMatch", String(misMatches));
      annotations.set("repMatch", String(repMatches));
      annotations.set("nCount", String(nCount));
      annotations.set("seqType", seqType);
      alignment.annotations = annotations;
      fixed.push(alignment);
    }
    fixed.sort((a, b) => {
      const ida = String((a.sequences[0] as SeqRecord).id), idb = String((b.sequences[0] as SeqRecord).id);
      if (ida !== idb) return ida < idb ? -1 : 1;
      return a.coordinates![0]![0]! - b.coordinates![0]![0]!;
    });
    const targets = this.options.targets ?? (alignments as { targets?: SeqRecord[] }).targets ?? null;
    if (targets === null) throw new TypeError("'Array' object has no attribute 'targets'");
    // `extraIndex` is not handed on: Biopython's bigPsl writer accepts it and then never passes it to the
    // bigBed writer, so asking for an extra index makes no difference to the file.
    new BigBedWriter(stream, {
      bedN: 12, declaration: BIGPSL_DECLARATION, targets, compress: this.options.compress ?? true,
    }).writeFile(stream, fixed);
  }
}
