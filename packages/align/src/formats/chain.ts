/** UCSC chain files (Biopython's `Bio.Align.chain`). */

import { IndexError, ValueError, pyFloat, pyFormatG, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { words as splitWords } from "./rows.js";
import type { TextStream } from "./stream.js";

/** Writes alignments as chain blocks. */
export class ChainWriter extends AlignmentWriter {
  static override fmt: string | null = "chain";

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
    const tSize = (target as { length: number }).length, qSize = (query as { length: number }).length;
    const score = alignment.score === undefined ? 0 : alignment.score;
    if (typeof score === "string") throw new ValueError("Unknown format code 'g' for object of type 'str'");
    const last = coordinates[0]!.length - 1;
    let tStrand = "+", qStrand = "+";
    if (coordinates[0]![0]! > coordinates[0]![last]!) { tStrand = "-"; coordinates = [coordinates[0]!.map((c) => tSize - c), coordinates[1]!]; }
    if (coordinates[1]![0]! > coordinates[1]![last]!) { qStrand = "-"; coordinates = [coordinates[0]!, coordinates[1]!.map((c) => qSize - c)]; }
    const head = `chain ${pyFormatG(score)} ${tName} ${tSize} ${tStrand} ${coordinates[0]![0]} ${coordinates[0]![last]} ${qName} ${qSize} ${qStrand} ${coordinates[1]![0]} ${coordinates[1]![last]}`;
    const id = alignment.annotations?.get("id");
    const lines = [id === undefined ? head : `${head} ${id}`];
    let tStart = coordinates[0]![0]!, qStart = coordinates[1]![0]!;
    let step = 0, qGap = 0, tGap = 0, tStep = 0, qStep = 0;
    const emit = (a: number, b: number, c: number): void => { lines.push(`${a}\t${b}\t${c}`); };
    for (let c = 1; c <= last; c++) {
      const tEnd = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      if (tStart === tEnd) {
        if (tGap > 0) { qGap = qEnd - qStart; emit(step, tGap, qGap); step = 0; tGap = 0; qGap = 0; }
        else if (qGap > 0) { emit(step, tGap, qGap); step = 0; qGap = qEnd - qStart; }
        else qGap = qEnd - qStart;
        qStart = qEnd;
      } else if (qStart === qEnd) {
        if (qGap > 0) { tGap = tEnd - tStart; emit(step, tGap, qGap); step = 0; tGap = 0; qGap = 0; }
        else if (tGap > 0) { emit(step, tGap, qGap); step = 0; tGap = tEnd - tStart; }
        else tGap = tEnd - tStart;
        tStart = tEnd;
      } else {
        if (step === 0) {
          tStep = tEnd - tStart; qStep = qEnd - qStart;
          if (tGap === 0 && qGap === 0) step = tStep;
          else { emit(tStep, tGap, qGap); tGap = 0; qGap = 0; }
        } else {
          emit(step, tGap, qGap);
          tStep = tEnd - tStart; qStep = qEnd - qStart;
          step = tStep; tGap = 0; qGap = 0;
        }
        if (tStep !== qStep) throw new ValueError(`Expected equal step size in target and query (found ${tStep} and ${qStep})`);
        tStart = tEnd; qStart = qEnd;
      }
    }
    if (tGap > 0 || qGap > 0) emit(0, tGap, qGap);
    lines.push(`${step}`, "");
    return lines.join("\n") + "\n";
  }
}

/** Reads UCSC chain files, one alignment per chain block; `score` and `annotations["id"]` come from the block header. */
export class ChainIterator extends AlignmentIterator {
  static override fmt: string | null = "chain";
  /** Biopython's `self._line`: the next block header (or `""`). */
  private declare pending: string;

  protected override readHeader(stream: TextStream): void {
    this.pending = "";
    for (const line of stream) {
      if (!line.startsWith("#")) { this.pending = line; break; }
    }
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    if (!this.pending) return null;
    const w0 = splitWords(this.pending);
    this.pending = "";
    let chainId: string | null;
    if (w0.length === 12) chainId = null;
    else if (w0.length === 13) chainId = w0[12]!;
    else throw new ValueError("expected line with 12 or 13 columns at the beginning of a chain block");
    if (w0[0] !== "chain") throw new ValueError("expected first line of chain block to start with 'chain '");
    const score = pyFloat(w0[1]!), tName = w0[2]!, tSize = pyInt(w0[3]!), tStrand = w0[4]!, tStart = pyInt(w0[5]!);
    pyInt(w0[6]!);
    const qName = w0[7]!, qSize = pyInt(w0[8]!), qStrand = w0[9]!, qStart = pyInt(w0[10]!);
    pyInt(w0[11]!);
    let qPosition = 0, tPosition = 0;
    const qStarts = [qPosition], tStarts = [tPosition];
    for (const line of stream) {
      const w = splitWords(line);
      if (w.length === 0) throw new IndexError("list index out of range");
      if (w[0] === "chain") { this.pending = line; break; }
      const step = pyInt(w[0]!);
      qPosition += step; tPosition += step;
      qStarts.push(qPosition); tStarts.push(tPosition);
      if (w.length === 1) break;
      if (w.length < 3) throw new IndexError("list index out of range");
      const tGap = pyInt(w[1]!), qGap = pyInt(w[2]!);
      if (tGap > 0) { tPosition += tGap; qStarts.push(qPosition); tStarts.push(tPosition); }
      if (qGap > 0) { qPosition += qGap; qStarts.push(qPosition); tStarts.push(tPosition); }
    }
    const target = new SeqRecord(new Seq(null, tSize), tName, undefined, "");
    const query = new SeqRecord(new Seq(null, qSize), qName, undefined, "");
    let t = tStarts.map((x) => x + tStart), q = qStarts.map((x) => x + qStart);
    if (tStrand === "-") t = t.map((x) => tSize - x);
    else if (tStrand !== "+") throw new ValueError(`tStrand should be '+' or '-' (found '${tStrand}')`);
    if (qStrand === "-") q = q.map((x) => qSize - x);
    else if (qStrand !== "+") throw new ValueError(`qStrand should be '+' or '-' (found '${qStrand}')`);
    const alignment = new Alignment([target, query], [t, q]);
    alignment.score = score;
    if (chainId !== null) alignment.annotations = new Map([["id", chainId]]);
    // A blank line should separate the blocks, but some tools leave it out.
    let line = stream.readline();
    if (!line.trim()) line = stream.readline();
    this.pending = line;
    return alignment;
  }
}

registerFormat("chain", { AlignmentIterator: ChainIterator, AlignmentWriter: ChainWriter as never });
