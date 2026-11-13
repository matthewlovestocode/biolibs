/** Exonerate `vulgar` and `cigar` lines (Biopython's `Bio.Align.exonerate`). */

import { AssertionError, IndexError, UnboundLocalError, ValueError, pyFloat, pyFormatG, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { strip, words as splitWords } from "./rows.js";
import { MissingAttribute } from "./tabular-errors.js";
import type { TextStream } from "./stream.js";

const check = (condition: boolean): void => { if (!condition) throw new AssertionError(""); };
const unbound = (name: string): never => { throw new UnboundLocalError(`cannot access local variable '${name}' where it is not associated with a value`); };
const word = (w: string[], i: number): string => { if (i >= w.length) throw new IndexError("list index out of range"); return w[i]!; };

/** The `molecule_type` annotation of a record, if it has one. */
function moleculeType(record: unknown): unknown {
  return record instanceof SeqRecord ? record.annotations.get("molecule_type") ?? null : null;
}

/** Strand text for one end of the alignment, flipping the steps for the reverse strand. */
function strandOf(type: unknown, start: number, end: number, steps: number[]): string {
  if (type === "protein") return ".";
  if (start <= end) return "+";
  for (let i = 0; i < steps.length; i++) steps[i] = -steps[i]!;
  return "-";
}

/** Writes alignments as Exonerate `vulgar` (default) or `cigar` lines. */
export class ExonerateWriter extends AlignmentWriter {
  static override fmt: string | null = "Exonerate";
  private readonly style: string;

  /**
   * @param target - Where to write.
   * @param fmt - `"vulgar"` (default) or `"cigar"`.
   * @throws ValueError for any other value.
   */
  constructor(target: WriteTarget | null = null, fmt: string = "vulgar") {
    super(target);
    if (fmt !== "vulgar" && fmt !== "cigar") throw new ValueError(`argument fmt should be 'vulgar' or 'cigar' (received ${fmt})`);
    this.style = fmt;
  }

  override writeHeader(stream: WriteTarget, alignments: unknown): void {
    const metadata = (alignments as { metadata?: Record<string, string> } | null)?.metadata;
    stream.write(`Command line: [${metadata === undefined ? "" : metadata["Command line"] ?? ""}]\n`);
    stream.write(`Hostname: [${metadata === undefined ? "" : metadata["Hostname"] ?? ""}]\n`);
  }

  override writeFooter(stream: WriteTarget): void { stream.write("-- completed exonerate analysis\n"); }

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    const coordinates = alignment.coordinates!;
    const [tRow, qRow] = coordinates as [number[], number[]];
    const last = tRow.length - 1;
    const targetStart = tRow[0]!, targetEnd = tRow[last]!, queryStart = qRow[0]!, queryEnd = qRow[last]!;
    const targetSteps = tRow.slice(1).map((v, i) => v - tRow[i]!), querySteps = qRow.slice(1).map((v, i) => v - qRow[i]!);
    const query = alignment.query, target = alignment.target;
    const queryId = query instanceof SeqRecord ? query.id : "query";
    const targetId = target instanceof SeqRecord ? target.id : "target";
    const tType = moleculeType(target);
    const targetStrand = strandOf(tType, targetStart, targetEnd, targetSteps);
    const qType = moleculeType(query);
    const queryStrand = strandOf(qType, queryStart, queryEnd, querySteps);
    if (alignment.score === undefined) throw new MissingAttribute();
    if (typeof alignment.score === "string") throw new ValueError("Unknown format code 'g' for object of type 'str'");
    const score = pyFormatG(alignment.score);
    const cigar = this.style === "cigar";
    const words: string[] = [cigar ? "cigar:" : "vulgar:", String(queryId), String(queryStart), String(queryEnd), queryStrand, String(targetId), String(targetStart), String(targetEnd), targetStrand, score];
    const ops = alignment.operations === undefined ? undefined : new TextDecoder().decode(alignment.operations);
    if (cigar) cigarWords(words, targetSteps, querySteps, ops, tType, qType); else vulgarWords(words, targetSteps, querySteps, ops, tType, qType);
    return words.join(" ") + "\n";
  }
}

function cigarWords(words: string[], ts: number[], qs: number[], ops: string | undefined, tType: unknown, qType: unknown): void {
  const n = ops === undefined ? ts.length : Math.min(ts.length, Array.from(ops).length);
  const opChars = ops === undefined ? [] : Array.from(ops);
  for (let i = 0; i < n; i++) {
    const t = ts[i]!, q = qs[i]!;
    let operation: string, step: number;
    if (ops === undefined) {
      if (t === q) { operation = "M"; step = t; }
      else if (q === 0) { operation = "D"; step = t; }
      else if (t === 0) { operation = "I"; step = q; }
      else if (tType !== "protein" && qType === "protein") { operation = "M"; step = t; }
      else if (tType === "protein" && qType !== "protein") { operation = "M"; step = q; }
      else throw new ValueError(`Unexpected step target ${t}, query ${q} for molecule type ${tType === null ? "None" : tType}, ${qType === null ? "None" : qType}`);
    } else {
      operation = opChars[i]!;
      const split = (): void => {
        if (t > 0) words.push("D", String(t));
        if (q > 0) words.push("I", String(q));
      };
      if (operation === "M") {
        if (t === q) step = t;
        else if (t === 3 * q) { step = t; check(qType === "protein"); check(tType !== "protein"); }
        else if (q === 3 * t) { step = q; check(qType !== "protein"); check(tType === "protein"); }
        else throw new ValueError("Unexpected steps target %d, query %s for operation 'M'");
      } else if (operation === "5" || operation === "3") {
        if (q === 0) { step = t; operation = "D"; }
        else if (t === 0) { step = q; operation = "I"; }
        else { check(q === t); step = t; operation = "M"; }
      } else if (operation === "N") {
        if (q === 0) { step = t; operation = "D"; }
        else if (t === 0) { step = q; operation = "I"; }
        else throw new ValueError(`Unexpected intron with steps target ${t}, query ${q}`);
      } else if (operation === "C") { check(t === q); step = t; operation = "M"; }
      else if (operation === "D") { check(q === 0); step = t; }
      else if (operation === "I") { check(t === 0); step = q; }
      else if (operation === "U" || operation === "S") { split(); continue; }
      else if (operation === "F") {
        if (t === 0) { step = q; operation = "I"; }
        else if (q === 0) { step = t; operation = "D"; }
        else throw new ValueError("Expected target step or query step to be 0");
      } else throw new ValueError(`Unknown operation ${operation}`);
    }
    words.push(operation, String(step));
  }
}

function vulgarWords(words: string[], ts: number[], qs: number[], ops: string | undefined, tType: unknown, qType: unknown): void {
  if (ops === undefined) {
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!, q = qs[i]!;
      let operation: string;
      if (t === q) operation = "M";
      else if (q === 0 || t === 0) operation = "G";
      else if ((qType === "protein") !== (tType === "protein")) operation = "M";
      else throw new ValueError("Both target and query step are zero");
      words.push(operation, String(q), String(t));
    }
    return;
  }
  const opChars = Array.from(ops);
  const n = opChars.length;
  const at = (i: number): [number, number] => {
    if (i >= ts.length) throw new IndexError(`index ${i} is out of bounds for axis 0 with size ${ts.length}`);
    return [ts[i]!, qs[i]!];
  };
  let i = 0;
  while (i < n) {
    let [t, q] = at(i);
    let operation = opChars[i]!;
    if (operation === "M") {
      if (t === q) { /* match */ }
      else if (t === 3 * q) { check(qType === "protein"); check(tType !== "protein"); }
      else if (q === 3 * t) { check(qType !== "protein"); check(tType === "protein"); }
      else throw new ValueError(`Unexpected steps target ${t}, query ${q} for operation 'M'`);
    } else if (operation === "5" || operation === "3") check(t === 2 || q === 2);
    else if (operation === "N") { operation = "I"; check(q === 0 || t === 0); }
    else if (operation === "C") check(t === q);
    else if (operation === "D") { check(q === 0); operation = "G"; }
    else if (operation === "I") { check(t === 0); operation = "G"; }
    else if (operation === "U") {
      if (t === 0) { check(q > 0); i += 1; const [t2, dummy] = at(i); t = t2; check(dummy === 0); }
      if (q === 0) { check(t > 0); i += 1; const [dummy, q2] = at(i); q = q2; check(dummy === 0); }
      if (i >= opChars.length) throw new IndexError("string index out of range");
      operation = opChars[i]!;
      check(operation === "U");
      operation = "N";
    } else if (operation === "S" || operation === "F") { /* kept as is */ }
    else throw new ValueError(`Unknown operation ${operation}`);
    words.push(operation, String(q), String(t));
    i += 1;
  }
}

/** Reads Exonerate text output with `vulgar:` or `cigar:` lines; the header sets `metadata`. */
export class ExonerateIterator extends AlignmentIterator {
  static override fmt: string | null = "Exonerate";

  protected override readHeader(stream: TextStream): void {
    const md: Record<string, unknown> = { Program: "exonerate" };
    (this as { metadata?: Record<string, unknown> }).metadata = md;
    for (const [prefix, key] of [["Command line: ", "Command line"], ["Hostname: ", "Hostname"]] as const) {
      const line = stream.readline();
      check(line.startsWith(prefix));
      const text = strip(line.slice(prefix.length));
      check(text.startsWith("["));
      check(text.endsWith("]"));
      md[key] = text.slice(1, -1);
    }
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    for (const raw of stream) {
      const line = strip(raw);
      if (line === "-- completed exonerate analysis") {
        if (stream.readline()) throw new ValueError("Found additional data after 'completed exonerate analysis'; corrupt file?");
        return null;
      }
      if (line.startsWith("vulgar: ")) return parseVulgar(splitWords(line.slice(8)));
      if (line.startsWith("cigar: ")) return parseCigar(splitWords(line.slice(7)));
      return unbound("alignment");
    }
    throw new ValueError("Failed to find 'completed exonerate analysis'; truncated file?");
  }
}

/** The records and alignment common to both line types. */
function finish(w: string[], coordinates: number[][], tStart: number, qStart: number, tEnd: number, qEnd: number, tStrand: string, qStrand: string, protein: (which: "t" | "q") => void, operations: Uint8Array | null): Alignment {
  let targetLength: number | undefined, queryLength: number | undefined;
  let tType: string | null = null, qType: string | null = null;
  if (tStrand === "+") { coordinates[0] = coordinates[0]!.map((c) => c + tStart); targetLength = tEnd; }
  else if (tStrand === "-") { coordinates[0] = coordinates[0]!.map((c) => tStart - c); targetLength = tStart; }
  else if (tStrand === ".") { protein("t"); coordinates[0] = coordinates[0]!.map((c) => c + tStart); tType = "protein"; targetLength = tEnd; }
  if (qStrand === "+") { coordinates[1] = coordinates[1]!.map((c) => c + qStart); queryLength = qEnd; }
  else if (qStrand === "-") { coordinates[1] = coordinates[1]!.map((c) => qStart - c); queryLength = qStart; }
  else if (qStrand === ".") { protein("q"); coordinates[1] = coordinates[1]!.map((c) => c + qStart); qType = "protein"; queryLength = qEnd; }
  if (targetLength === undefined) unbound("target_length");
  if (queryLength === undefined) unbound("query_length");
  const target = new SeqRecord(new Seq(null, targetLength!), w[4]!, undefined, "");
  const query = new SeqRecord(new Seq(null, queryLength!), w[0]!, undefined, "");
  if (tType !== null) target.annotations.set("molecule_type", tType);
  if (qType !== null) query.annotations.set("molecule_type", qType);
  const alignment = new Alignment([target, query], coordinates);
  if (operations !== null) alignment.operations = operations;
  alignment.score = pyFloat(w[8]!);
  return alignment;
}

/** The nine fixed fields at the start of both line types. */
function header(w: string[]): [number, number, string, number, number, string] {
  const queryStart = pyInt(word(w, 1)), queryEnd = pyInt(word(w, 2)), queryStrand = word(w, 3);
  word(w, 0); word(w, 4);
  const targetStart = pyInt(word(w, 5)), targetEnd = pyInt(word(w, 6)), targetStrand = word(w, 7);
  pyFloat(word(w, 8));
  return [queryStart, queryEnd, queryStrand, targetStart, targetEnd, targetStrand];
}

function parseCigar(w: string[]): Alignment {
  const [queryStart, queryEnd, queryStrand, targetStart, targetEnd, targetStrand] = header(w);
  let qs = 0, ts = 0;
  const target = [0], query = [0];
  for (let k = 9; k + 1 < w.length; k += 2) {
    const operation = w[k]!, step = pyInt(w[k + 1]!);
    if (operation === "M") { ts += step; qs += step; }
    else if (operation === "I") qs += queryStrand === "." && targetStrand !== "." ? step * 3 : step;
    else if (operation === "D") ts += targetStrand === "." && queryStrand !== "." ? step * 3 : step;
    else throw new ValueError(`Unknown operation ${operation} in cigar string`);
    target.push(ts); query.push(qs);
  }
  const coordinates = [target, query];
  return finish(w, coordinates, targetStart, queryStart, targetEnd, queryEnd, targetStrand, queryStrand, (which) => {
    if (which === "t" && queryStrand !== ".") coordinates[0] = coordinates[0]!.map((c) => Math.floor((c + 2) / 3));
    if (which === "q" && targetStrand !== ".") coordinates[1] = coordinates[1]!.map((c) => -Math.floor(c / -3));
  }, null);
}

function parseVulgar(w: string[]): Alignment {
  const [queryStart, queryEnd, queryStrand, targetStart, targetEnd, targetStrand] = header(w);
  const ops: string[] = [], qSteps: string[] = [], tSteps: string[] = [];
  for (let k = 9; k < w.length; k += 3) ops.push(w[k]!);
  for (let k = 10; k < w.length; k += 3) qSteps.push(w[k]!);
  for (let k = 11; k < w.length; k += 3) tSteps.push(w[k]!);
  const n = Math.trunc((w.length - 8) / 3) + ops.filter((o) => o === "N").length;
  if (n + 1 < 0) throw new ValueError("negative dimensions are not allowed");
  // `np.empty` leaves unused cells uninitialised; they are taken as zero here.
  const target = new Array<number>(n + 1).fill(0), query = new Array<number>(n + 1).fill(0);
  const operations = new Uint8Array(n);
  let qs = 0, ts = 0, i = 0;
  const put = (): void => {
    if (i + 1 >= n + 1) throw new IndexError(`index ${i + 1} is out of bounds for axis 1 with size ${n + 1}`);
    target[i + 1] = ts; query[i + 1] = qs;
  };
  const setOp = (operation: string): void => {
    if (i >= n) throw new IndexError("bytearray index out of range");
    operations[i] = operation.charCodeAt(0);
  };
  const count = Math.min(ops.length, qSteps.length, tSteps.length);
  for (let k = 0; k < count; k++) {
    let operation = ops[k]!;
    const queryStep = pyInt(qSteps[k]!), targetStep = pyInt(tSteps[k]!);
    if (operation === "M") { /* match */ }
    else if (operation === "5" || operation === "3") check(targetStep === 2 || queryStep === 2);
    else if (operation === "I") operation = "N";
    else if (operation === "C") { check(targetStep % 3 === 0); check(queryStep % 3 === 0); }
    else if (operation === "G") {
      if (queryStep === 0) operation = "D";
      else if (targetStep === 0) operation = "I";
      else throw new ValueError(`Unexpected gap operation with steps ${queryStep}, ${targetStep} in vulgar line`);
    } else if (operation === "N") {
      operation = "U";
      if (targetStep > 0) { ts += targetStep; put(); setOp(operation); i += 1; }
      if (queryStep > 0) { qs += queryStep; put(); setOp(operation); i += 1; }
      continue;
    } else if (operation === "S" || operation === "F") { /* kept */ }
    else throw new ValueError(`Unknown operation ${operation} in vulgar string`);
    ts += targetStep; qs += queryStep;
    put(); setOp(operation); i += 1;
  }
  return finish(w, [target, query], targetStart, queryStart, targetEnd, queryEnd, targetStrand, queryStrand, () => { /* no rescaling for vulgar */ }, operations);
}

registerFormat("exonerate", { AlignmentIterator: ExonerateIterator, AlignmentWriter: ExonerateWriter as never });
