/** PSL files: the reader (Biopython's `Bio.Align.psl.AlignmentIterator`). */

import { UnboundLocalError, ValueError, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { CompoundLocation, ExactPosition, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { words as splitWords } from "./rows.js";
import type { TextStream } from "./stream.js";

/** `s.rstrip(",").split(",")`. */
const commaList = (s: string): string[] => s.replace(/,+$/, "").split(",");

/** Reads PSL and PSLX files, one alignment per line; the header (if any) sets `metadata["psLayout version"]`. */
export class PslIterator extends AlignmentIterator {
  static override fmt: string | null = "PSL";
  /** Biopython's `self._line`: the first line, kept when a file has no header. */
  private declare pending: string | undefined;

  protected override readHeader(stream: TextStream): void {
    let line = stream.readline();
    if (line.startsWith("psLayout ")) {
      const w = splitWords(line);
      if (w[1] !== "version") throw new ValueError(`Unexpected word '${w[1]}' in header line`);
      (this as { metadata?: Record<string, unknown> }).metadata = { "psLayout version": w[2] };
      for (let i = 0; i < 4; i++) line = stream.readline();
      if (line.replace(/^-+/, "").trim() !== "") throw new ValueError("End of header not found");
    } else this.pending = line;
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    let line: string;
    if (this.pending !== undefined) { line = this.pending; this.pending = undefined; } else {
      const next = stream.readline();
      if (next === "") return null;
      line = next;
    }
    const w = splitWords(line);
    let pslx: boolean;
    if (w.length === 23) pslx = true;
    else if (w.length === 21) pslx = false;
    else throw new ValueError(`line has ${w.length} columns; expected 21 or 23`);
    const strand = w[8]!, qName = w[9]!, qSize = pyInt(w[10]!), tName = w[13]!, tSize = pyInt(w[14]!), blockCount = pyInt(w[17]!);
    const blockSizes = commaList(w[18]!).map(pyInt);
    const qStarts = commaList(w[19]!).map(pyInt);
    const tStarts = commaList(w[20]!).map(pyInt);
    if (blockSizes.length !== blockCount) throw new ValueError(`Inconsistent number of blocks (${blockSizes.length} found, expected ${blockCount})`);
    if (qStarts.length !== blockCount) throw new ValueError(`Inconsistent number of query start positions (${qStarts.length} found, expected ${blockCount})`);
    if (tStarts.length !== blockCount) throw new ValueError(`Inconsistent number of target start positions (${tStarts.length} found, expected ${blockCount})`);
    const protein = strand === "++" || strand === "+-";
    const tBlockSizes = protein ? blockSizes.map((b) => 3 * b) : blockSizes;
    let qPosition = qStarts[0]!, tPosition = tStarts[0]!;
    const pairs: [number, number][] = [[tPosition, qPosition]];
    blockSizes.forEach((qBlockSize, i) => {
      const tStart = tStarts[i]!, qStart = qStarts[i]!;
      if (tStart !== tPosition) { pairs.push([tStart, qPosition]); tPosition = tStart; }
      if (qStart !== qPosition) { pairs.push([tPosition, qStart]); qPosition = qStart; }
      tPosition += tBlockSizes[i]!;
      qPosition += qBlockSize;
      pairs.push([tPosition, qPosition]);
    });
    const coordinates: number[][] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
    let qNumInsert = 0, qBaseInsert = 0, tNumInsert = 0, tBaseInsert = 0;
    let tStart = coordinates[0]![0]!, qStart = coordinates[1]![0]!;
    for (let c = 1; c < pairs.length; c++) {
      const tEnd = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      const tCount = tEnd - tStart, qCount = qEnd - qStart;
      if (tCount === 0) { if (qStart > 0 && qEnd < qSize) { qNumInsert += 1; qBaseInsert += qCount; } qStart = qEnd; }
      else if (qCount === 0) { if (tStart > 0 && tEnd < tSize) { tNumInsert += 1; tBaseInsert += tCount; } tStart = tEnd; }
      else { tStart = tEnd; qStart = qEnd; }
    }
    if (qNumInsert !== pyInt(w[4]!)) throw new ValueError(`Inconsistent qNumInsert found (${w[4]}, expected ${qNumInsert})`);
    if (qBaseInsert !== pyInt(w[5]!)) throw new ValueError(`Inconsistent qBaseInsert found (${w[5]}, expected ${qBaseInsert})`);
    if (tNumInsert !== pyInt(w[6]!)) throw new ValueError(`Inconsistent tNumInsert found (${w[6]}, expected ${tNumInsert})`);
    if (tBaseInsert !== pyInt(w[7]!)) throw new ValueError(`Inconsistent tBaseInsert found (${w[7]}, expected ${tBaseInsert})`);
    qStart = pyInt(w[11]!);
    let qEnd = pyInt(w[12]!);
    tStart = pyInt(w[15]!);
    let tEnd = pyInt(w[16]!);
    if (strand === "-") { [qStart, qEnd] = [qEnd, qStart]; coordinates[1] = coordinates[1]!.map((c) => qSize - c); }
    else if (strand === "+-") { [tStart, tEnd] = [tEnd, tStart]; coordinates[0] = coordinates[0]!.map((c) => tSize - c); }
    const last = pairs.length - 1;
    if (tStart !== coordinates[0]![0]) throw new ValueError(`Inconsistent tStart found (${tStart}, expected ${coordinates[0]![0]})`);
    if (tEnd !== coordinates[0]![last]) throw new ValueError(`Inconsistent tEnd found (${tEnd}, expected ${coordinates[0]![last]})`);
    if (qStart !== coordinates[1]![0]) throw new ValueError(`Inconsistent qStart found (${qStart}, expected ${coordinates[1]![0]})`);
    if (qEnd !== coordinates[1]![last]) throw new ValueError(`Inconsistent qEnd found (${qEnd}, expected ${coordinates[1]![last]})`);
    let feature: SeqFeature | null = null;
    let targetSequence: Seq, querySequence: Seq;
    if (pslx) {
      const qSeqs = commaList(w[21]!), tSeqs = commaList(w[22]!);
      const zip = (keys: number[], values: string[]): Map<number, string> => {
        const m = new Map<number, string>();
        for (let i = 0; i < Math.min(keys.length, values.length); i++) m.set(keys[i]!, values[i]!);
        return m;
      };
      const qSeq = zip(qStarts, qSeqs);
      if (protein) {
        targetSequence = new Seq(null, tSize);
        querySequence = new Seq(qSeq, qSize);
        feature = proteinFeature(strand === "++", coordinates, tSeqs.join(""));
      } else {
        targetSequence = new Seq(zip(tStarts, tSeqs), tSize);
        querySequence = new Seq(qSeq, qSize);
        if (strand === "-") querySequence = querySequence.reverseComplement() as Seq;
      }
    } else { targetSequence = new Seq(null, tSize); querySequence = new Seq(null, qSize); }
    const target = new SeqRecord(targetSequence, tName, undefined, "");
    const query = new SeqRecord(querySequence, qName, undefined, "");
    if (feature !== null) target.features.push(feature);
    const alignment = new Alignment([target, query], coordinates);
    alignment.matches = pyInt(w[0]!);
    alignment.misMatches = pyInt(w[1]!);
    alignment.repMatches = pyInt(w[2]!);
    alignment.nCount = pyInt(w[3]!);
    return alignment;
  }
}

/** The CDS feature Biopython adds for a protein aligned to translated DNA (strand `++` or `+-`), with the translation as a qualifier. */
function proteinFeature(forward: boolean, coordinates: number[][], translation: string): SeqFeature {
  const locations: SimpleLocation[] = [];
  const n = coordinates[0]!.length;
  let tStart: number, tEnd: number, qStart: number;
  if (forward) {
    tStart = coordinates[0]![0]!; qStart = coordinates[1]![0]!;
    for (let c = 1; c < n; c++) {
      const tE = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      if (qStart < qEnd && tStart < tE) locations.push(new SimpleLocation(new ExactPosition(tStart), new ExactPosition(tE), 1));
      qStart = qEnd; tStart = tE;
    }
  } else {
    tEnd = coordinates[0]![0]!; qStart = coordinates[1]![0]!;
    for (let c = 1; c < n; c++) {
      const tS = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      if (qStart < qEnd && tS < tEnd) locations.push(new SimpleLocation(new ExactPosition(tS), new ExactPosition(tEnd), -1));
      tEnd = tS; qStart = qEnd;
    }
  }
  // Python's `location` is only bound once the loop has created one.
  if (locations.length === 0) throw new UnboundLocalError("cannot access local variable 'location' where it is not associated with a value");
  const location = locations.length > 1 ? new CompoundLocation(locations, "join") : locations[0]!;
  return new SeqFeature(location, "CDS", undefined, { translation: [translation] });
}

registerFormat("psl", { AlignmentIterator: PslIterator });
