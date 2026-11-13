/** PSL files: the writer (Biopython's `Bio.Align.psl.AlignmentWriter`). */

import { AssertionError, IndexError, ValueError } from "@biolibs/core";
import { Seq, UndefinedSequenceError, reverseComplement } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { PslIterator } from "./psl-read.js";
import { registerFormat } from "./registry.js";

const HEADER_BODY = `
match\tmis- \trep. \tN's\tQ gap\tQ gap\tT gap\tT gap\tstrand\tQ        \tQ   \tQ    \tQ  \tT        \tT   \tT    \tT  \tblock\tblockSizes \tqStarts\t tStarts
     \tmatch\tmatch\t   \tcount\tbases\tcount\tbases\t      \tname     \tsize\tstart\tend\tname     \tsize\tstart\tend\tcount
---------------------------------------------------------------------------------------------------------------------------------------------------------------
`;

type Sequence = string | Seq;

/** `len(sequence)`. */
const lengthOf = (s: Sequence): number => (typeof s === "string" ? Array.from(s).length : s.length);

/** `bytes(sequence[a:b])`, or null when the content is not known (Biopython catches `UndefinedSequenceError`). */
function bytesOf(s: Sequence, a: number, b: number): Uint8Array | null {
  if (typeof s === "string") {
    const text = Array.from(s).slice(a, b).join("");
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 127) throw new ValueError("'ascii' codec can't encode character");
      out[i] = text.charCodeAt(i);
    }
    return out;
  }
  try { return s.slice(a, b).toBytes(); } catch (e) {
    if (e instanceof UndefinedSequenceError) return null;
    throw e;
  }
}

const upper = (b: Uint8Array): number[] => Array.from(b, (c) => (c >= 97 && c <= 122 ? c - 32 : c));
const lower = (b: Uint8Array): number[] => Array.from(b, (c) => (c >= 65 && c <= 90 ? c + 32 : c));

/** Python's `ord(ch)` for a one-character string. */
function ord(ch: string): number {
  const n = Array.from(ch).length;
  if (n !== 1) throw new TypeError(`ord() expected a character, but string of length ${n} found`);
  return ch.codePointAt(0)!;
}

/** Writes alignments as PSL lines. */
export class PslWriter extends AlignmentWriter {
  static override fmt: string | null = "PSL";
  private readonly wildcard: number | null;

  /**
   * @param target - Where to write.
   * @param header - Write the five-line PSL header (default true).
   * @param mask - `"lower"` or `"upper"`: report matches in masked target regions as `repMatches`; null for no masking.
   * @param wildcard - Letter whose alignments count as `nCount` (default `"N"`); null for none.
   */
  constructor(target: WriteTarget | null = null, private readonly header: boolean = true, private readonly mask: string | null = null, wildcard: string | null = "N") {
    super(target);
    this.wildcard = wildcard === null ? null : ord(this.mask === "upper" ? wildcard.toLowerCase() : wildcard.toUpperCase());
  }

  override writeHeader(stream: WriteTarget, alignments: unknown): void {
    if (!this.header) return;
    const metadata = (alignments as { metadata?: Record<string, unknown> } | null)?.metadata;
    const version = metadata === undefined ? "3" : (metadata["psLayout version"] ?? "3");
    stream.write(`psLayout version ${version}\n` + HEADER_BODY);
  }

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    let coordinates = alignment.coordinates!;
    if (coordinates.every((row) => row.length === 0)) return "";
    if (alignment.sequences.length !== 2) throw new ValueError(alignment.sequences.length < 2 ? `not enough values to unpack (expected 2, got ${alignment.sequences.length})` : `too many values to unpack (expected 2, got ${alignment.sequences.length})`);
    let [target, query] = alignment.sequences as [unknown, unknown];
    const qName = query instanceof SeqRecord ? (query.id as string) : "query";
    if (query instanceof SeqRecord) query = query.seq;
    const tName = target instanceof SeqRecord ? (target.id as string) : "target";
    if (target instanceof SeqRecord) target = target.seq;
    let t = target as Sequence, q = query as Sequence;
    const tSize = lengthOf(t), qSize = lengthOf(q);
    const n = coordinates[0]!.length;
    const step = (r: number, c: number): number => Math.abs(coordinates[r]![c + 1]! - coordinates[r]![c]!);
    let tCount = 0, qCount = 0;
    for (let c = 0; c < n - 1; c++) if (Math.min(step(0, c), step(1, c)) > 0) { tCount += step(0, c); qCount += step(1, c); }
    let dnax: boolean, strand: string;
    const flip = (rows: number[][]): number[][] => rows.map((row) => [...row].reverse());
    if (tCount === qCount) {
      dnax = false;
      if (coordinates[0]![0]! > coordinates[0]![n - 1]!) coordinates = flip(coordinates);
      if (coordinates[1]![0]! > coordinates[1]![n - 1]!) {
        strand = "-";
        q = reverseComplement(q as never) as Sequence;
        coordinates = [coordinates[0]!, coordinates[1]!.map((c) => qSize - c)];
      } else strand = "+";
    } else if (tCount === 3 * qCount) {
      dnax = true;
      if (coordinates[0]![0]! > coordinates[0]![n - 1]!) {
        strand = "-";
        t = reverseComplement(t as never) as Sequence;
        coordinates = [coordinates[0]!.map((c) => tSize - c), coordinates[1]!];
      } else strand = "+";
    } else throw new ValueError(`inconsistent step sizes ${tCount}, ${qCount}`);
    const { wildcard, mask } = this;
    let matches = 0, misMatches = 0, repMatches = 0, nCount = 0, qNumInsert = 0, qBaseInsert = 0, tNumInsert = 0, tBaseInsert = 0;
    const blockSizes: number[] = [], qStarts: number[] = [], tStarts: number[] = [];
    let tStart = coordinates[0]![0]!, qStart = coordinates[1]![0]!;
    for (let c = 1; c < n; c++) {
      const tEnd = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      if (tStart === tEnd) { if (qStart > 0 && qEnd < qSize) { qNumInsert += 1; qBaseInsert += qEnd - qStart; } qStart = qEnd; }
      else if (qStart === qEnd) { if (tStart > 0 && tEnd < tSize) { tNumInsert += 1; tBaseInsert += tEnd - tStart; } tStart = tEnd; }
      else {
        tCount = tEnd - tStart; qCount = qEnd - qStart;
        tStarts.push(tStart); qStarts.push(qStart); blockSizes.push(qCount);
        if (tCount === qCount) { if (dnax) throw new AssertionError(""); }
        else { if (tCount !== 3 * qCount) throw new AssertionError(""); if (!dnax) throw new AssertionError(""); }
        const tSeq = bytesOf(t, tStart, tEnd), qSeq = bytesOf(q, qStart, qEnd);
        if (tSeq === null || qSeq === null) matches += qCount;
        else {
          const fold = mask === "upper" ? lower : upper;
          const a = fold(tSeq), b = fold(qSeq);
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const u1 = a[i]!, u2 = b[i]!;
            if (u1 === wildcard || u2 === wildcard) nCount += 1;
            else if (u1 === u2) {
              if (mask === "lower" || mask === "upper") { if (u1 === tSeq[i]) matches += 1; else repMatches += 1; } else matches += 1;
            } else misMatches += 1;
          }
        }
        tStart = tEnd; qStart = qEnd;
      }
    }
    if (alignment.matches !== undefined) matches = alignment.matches;
    if (alignment.misMatches !== undefined) misMatches = alignment.misMatches;
    if (alignment.repMatches !== undefined) repMatches = alignment.repMatches;
    if (alignment.nCount !== undefined) nCount = alignment.nCount;
    if (tStarts.length === 0) throw new IndexError("list index out of range");
    let tS = tStarts[0]!, qS = qStarts[0]!;
    let tE = tStarts[tStarts.length - 1]! + tCount, qE = qStarts[qStarts.length - 1]! + qCount;
    if (strand === "-") { if (dnax) [tS, tE] = [tSize - tE, tSize - tS]; else [qS, qE] = [qSize - qE, qSize - qS]; }
    const list = (xs: number[]): string => xs.join(",") + ",";
    return [matches, misMatches, repMatches, nCount, qNumInsert, qBaseInsert, tNumInsert, tBaseInsert, dnax ? "+" + strand : strand, qName, qSize, qS, qE, tName, tSize, tS, tE, blockSizes.length, list(blockSizes), list(qStarts), list(tStarts)].join("\t") + "\n";
  }
}

registerFormat("psl", { AlignmentIterator: PslIterator, AlignmentWriter: PslWriter as never });
