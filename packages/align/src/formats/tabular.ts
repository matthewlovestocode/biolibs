/** Tabular BLAST (`-outfmt 7`) and FASTA (`-m 8CB`, `-m 8CC`) output (Biopython's `Bio.Align.tabular`); read only. */

import { AssertionError, TypeError_ } from "./tabular-errors.js";
import { UnboundLocalError, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { rstrip, strip } from "./rows.js";
import type { TextStream } from "./stream.js";

const BLAST_PROGRAMS = ["BLASTN", "BLASTP", "BLASTX", "TBLASTN", "TBLASTX", "DELTABLAST", "PSIBLAST", "RPSBLAST", "RPSTBLASTN"];

/** What Biopython keeps as attributes of the parser (`_fields`, `_query_id`, ...): present or absent, like Python attributes. */
interface State {
  fields?: string[];
  queryId?: string | null;
  queryDescription?: string | null;
  querySize?: number | null;
  finalPrefix?: string;
}

/** Python's `AttributeError` on a missing attribute (reported as `TypeError` with no message in the goldens). */
const missing = (): never => { throw new TypeError_(); };

/** `str.split(None, 1)`; fewer than two words is the `ValueError` of tuple unpacking. */
function splitWordPair(s: string): [string, string] {
  const m = /^\s*(\S+)\s+(\S[\s\S]*)$/.exec(s);
  if (m === null) throw new ValueError(`not enough values to unpack (expected 2, got ${/\S/.test(s) ? 1 : 0})`);
  return [m[1]!, m[2]!];
}

/** Python's `a < b` for two ints that may be None. */
function lt(a: number | null, b: number | null): boolean {
  if (a === null || b === null) throw new TypeError(`'<' not supported between instances of '${a === null ? "NoneType" : "int"}' and '${b === null ? "NoneType" : "int"}'`);
  return a < b;
}

/** Reads tabular BLAST or FASTA output as pairwise alignments. */
export class TabularIterator extends AlignmentIterator {
  static override fmt: string | null = "Tabular";
  private declare st: State;

  private state(): State { return (this.st ??= {}); }

  protected override readHeader(stream: TextStream): void {
    const line = stream.readline();
    if (!line) throw new ValueError("Empty file.");
    if (!line.startsWith("# ")) throw new ValueError("Missing header.");
    this.parseHeader(stream, rstrip(line));
  }

  /** Parse a header block (the lines of `#` comments) into `metadata` and the parser state. */
  private parseHeader(stream: TextStream, line0: string): void {
    const st = this.state();
    const metadata: Record<string, unknown> = {};
    let line = line0;
    let program: string | undefined, version: string | undefined;
    let blast = false;
    try {
      [program, version] = splitWordPair(line.slice(2));
      if (!BLAST_PROGRAMS.includes(program)) throw new ValueError("Not a BLAST program");
      blast = true;
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
    }
    if (!blast) {
      metadata["Command line"] = line.slice(2);
      line = stream.readline();
      if (!line.startsWith("# ")) throw new AssertionError("");
      const [p, v] = splitWordPair(rstrip(line.slice(2)));
      metadata["Program"] = p; metadata["Version"] = v;
      st.finalPrefix = "# FASTA processed ";
    } else {
      metadata["Program"] = program; metadata["Version"] = version;
      st.finalPrefix = "# BLAST processed ";
    }
    for (const raw of stream) {
      line = strip(raw);
      if (!line.startsWith("# ")) throw new AssertionError("");
      const parts = line.slice(2).split(": ");
      if (parts.length !== 2) {
        const suffix = " hits found";
        if (!line.endsWith(suffix)) throw new AssertionError("");
        pyInt(line.slice(2, line.length - suffix.length));
        break;
      }
      const [prefix, value] = parts as [string, string];
      if (prefix === "Query") {
        let queryLine: string;
        if (metadata["Program"] === "FASTA") {
          const k = value.lastIndexOf(" - ");
          if (k < 0) throw new ValueError("not enough values to unpack (expected 2, got 1)");
          queryLine = value.slice(0, k);
          const sizeUnit = value.slice(k + 3).split(/\s+/).filter(Boolean);
          if (sizeUnit.length !== 2) throw new ValueError(sizeUnit.length < 2 ? `not enough values to unpack (expected 2, got ${sizeUnit.length})` : "too many values to unpack (expected 2)");
          st.querySize = pyInt(sizeUnit[0]!);
          if (sizeUnit[1] !== "nt" && sizeUnit[1] !== "aa") throw new AssertionError("");
        } else { queryLine = value; st.querySize = null; }
        try { [st.queryId, st.queryDescription] = splitWordPair(queryLine); } catch (e) {
          if (!(e instanceof ValueError)) throw e;
          st.queryId = strip(queryLine); st.queryDescription = null;
        }
      } else if (prefix === "Database") metadata["Database"] = value;
      else if (prefix === "Fields") st.fields = value.split(", ");
      else if (prefix === "RID") metadata["RID"] = value;
    }
    (this as { metadata?: Record<string, unknown> }).metadata = metadata;
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const st = this.state();
    let line: string | undefined;
    for (const raw of stream) {
      line = rstrip(raw);
      if (line.startsWith("# ")) {
        if (st.finalPrefix !== undefined && line.startsWith(st.finalPrefix) && line.endsWith(" queries")) {
          // `del self._fields` and so on, in order: a missing one is an AttributeError after the earlier ones are gone.
          for (const key of ["fields", "queryId", "queryDescription", "querySize", "finalPrefix"] as const) {
            if (st[key] === undefined) missing();
            delete st[key];
          }
          return null;
        }
        if (st.finalPrefix === undefined) missing();
        this.parseHeader(stream, line);
      } else break;
    }
    return this.buildAlignment(line, st);
  }

  private buildAlignment(line: string | undefined, st: State): Alignment {
    let alignmentLength: number | null = null;
    let btopCoordinates: number[][] | null = null;
    let score: number | null = null;
    let queryId: string | null = null, targetId: string | null = null;
    let queryStart: number | null = null, queryEnd: number | null = null, targetStart: number | null = null, targetEnd: number | null = null;
    let querySequence: string | null = null, targetSequence: string | null = null;
    let targetLength: number | null = null;
    let coordinates: number[][] | null = null;
    if (st.querySize === undefined) missing();
    let querySize = st.querySize as number | null;
    // The loop above may never have run, leaving `line` unbound; Python only notices here.
    if (line === undefined) throw new UnboundLocalError("cannot access local variable 'line' where it is not associated with a value");
    const columns = line.split("\t");
    if (st.fields === undefined) missing();
    const fields = st.fields!;
    if (columns.length !== fields.length) throw new AssertionError("");
    const annotations = new Map<string, unknown>();
    const queryAnnotations = new Map<string, unknown>();
    const targetAnnotations = new Map<string, unknown>();
    const n = Math.min(columns.length, fields.length);
    for (let i = 0; i < n; i++) {
      const column = columns[i]!, field = fields[i]!;
      switch (field) {
        case "query id":
          queryId = column;
          if (st.queryId === undefined) missing();
          if (st.queryId !== null && queryId !== st.queryId) throw new AssertionError("");
          break;
        case "subject id": targetId = column; break;
        case "% identity": annotations.set(field, pyFloat(column)); break;
        case "alignment length": alignmentLength = pyInt(column); break;
        case "mismatches": case "gap opens": annotations.set(field, pyInt(column)); break;
        case "q. start": queryStart = pyInt(column); break;
        case "q. end": queryEnd = pyInt(column); break;
        case "s. start": targetStart = pyInt(column); break;
        case "s. end": targetEnd = pyInt(column); break;
        case "evalue": annotations.set("evalue", pyFloat(column)); break;
        case "bit score": annotations.set("bit score", pyFloat(column)); break;
        case "BTOP": coordinates = parseBtop(column); break;
        case "aln_code": coordinates = parseCigar(column); break;
        case "query gi": queryAnnotations.set("gi", column); break;
        case "query acc.": queryAnnotations.set("acc.", column); break;
        case "query acc.ver": queryAnnotations.set("acc.ver", column); if (queryId === null) queryId = column; break;
        case "query length":
          if (querySize === null) querySize = pyInt(column);
          else if (querySize !== pyInt(column)) throw new AssertionError("");
          break;
        case "subject ids": targetAnnotations.set("ids", column); break;
        case "subject gi": targetAnnotations.set("gi", column); break;
        case "subject gis": targetAnnotations.set("gis", column); break;
        case "subject acc.": targetAnnotations.set("acc.", column); break;
        case "subject accs.": targetAnnotations.set("accs.", column); break;
        case "subject tax ids": targetAnnotations.set("tax ids", column); break;
        case "subject sci names": targetAnnotations.set("sci names", column); break;
        case "subject com names": targetAnnotations.set("com names", column); break;
        case "subject blast names": targetAnnotations.set("blast names", column); break;
        case "subject super kingdoms": targetAnnotations.set("super kingdoms", column); break;
        case "subject title": targetAnnotations.set("title", column); break;
        case "subject titles": targetAnnotations.set("titles", column); break;
        case "subject strand": targetAnnotations.set("strand", column); break;
        case "% subject coverage": targetAnnotations.set("% coverage", pyFloat(column)); break;
        case "subject acc.ver": targetAnnotations.set("acc.ver", column); if (targetId === null) targetId = column; break;
        case "subject length": targetLength = pyInt(column); break;
        case "query seq": querySequence = column; break;
        case "subject seq": targetSequence = column; break;
        case "score": score = pyInt(column); break;
        case "identical": case "positives": case "gaps": annotations.set(field, pyInt(column)); break;
        case "% positives": case "% hsp coverage": annotations.set(field, pyFloat(column)); break;
        case "query/sbjct frames": annotations.set(field, column); break;
        case "query frame": queryAnnotations.set("frame", column); break;
        case "sbjct frame": targetAnnotations.set("frame", column); break;
        default: throw new ValueError(`Unexpected field '${field}'`);
      }
    }
    const program = (this as { metadata?: Record<string, unknown> }).metadata!["Program"] as string;
    if (coordinates === null && alignmentLength !== null) annotations.set("alignment length", alignmentLength);
    if (queryStart !== null && queryEnd !== null) { if (queryStart < queryEnd) queryStart -= 1; else queryEnd -= 1; }
    if (targetStart !== null && targetEnd !== null) { if (targetStart < targetEnd) targetStart -= 1; else targetEnd -= 1; }
    if (coordinates === null || program === "BLASTX" || program === "TBLASTX") {
      if (queryStart !== null) queryAnnotations.set("start", queryStart);
      if (queryEnd !== null) queryAnnotations.set("end", queryEnd);
    } else if (lt(queryStart, queryEnd)) {
      const q = queryStart as number;
      coordinates[1] = coordinates[1]!.map((c) => c + q);
    } else {
      const q = queryStart as number;
      coordinates[1] = coordinates[1]!.map((c) => q - c);
    }
    if (coordinates === null || program === "TBLASTN" || program === "TBLASTX") {
      if (targetStart !== null) targetAnnotations.set("start", targetStart);
      if (targetEnd !== null) targetAnnotations.set("end", targetEnd);
    } else {
      if (targetStart === null) throw new TypeError("unsupported operand type(s) for +=: 'int' and 'NoneType'");
      const t = targetStart;
      coordinates[0] = coordinates[0]!.map((c) => c + t);
    }
    let querySeq: Seq | null;
    if (querySequence === null) querySeq = querySize === null ? null : new Seq(null, querySize);
    else {
      querySequence = querySequence.replaceAll("-", "");
      const len = Array.from(querySequence).length;
      if (program === "TBLASTN") {
        if (queryEnd === null || queryStart === null) throw new TypeError("unsupported operand type(s) for -: 'NoneType' and 'NoneType'");
        if (len !== queryEnd - queryStart) throw new AssertionError("");
        querySeq = new Seq(new Map([[queryStart, new TextEncoder().encode(querySequence)]]), querySize);
      } else if (program === "TBLASTX") {
        queryAnnotations.set("start", queryStart); queryAnnotations.set("end", queryEnd);
        querySeq = new Seq(querySequence);
      } else throw new PythonException(`Unknown program ${program}`);
    }
    const query = new SeqRecord(querySeq, queryId, undefined, st.queryDescription ?? undefined, null, null, queryAnnotations.size > 0 ? queryAnnotations : null);
    let targetSeq: Seq | null = null;
    if (program === "TBLASTN" || program === "TBLASTX") {
      targetAnnotations.set("length", targetLength);
      if (targetSequence !== null) targetSeq = new Seq(targetSequence.replaceAll("-", ""));
    } else if (targetSequence === null) {
      if (targetEnd !== null) targetSeq = new Seq(null, targetEnd);
    } else {
      targetSequence = targetSequence.replaceAll("-", "");
      if (targetStart !== null && targetEnd !== null) {
        if (Array.from(targetSequence).length !== targetEnd - targetStart) throw new AssertionError("");
        targetSeq = new Seq(new Map([[targetStart, new TextEncoder().encode(targetSequence)]]), targetEnd);
      } else targetSeq = undefined as unknown as null; // `target_seq` is never assigned: Python raises UnboundLocalError below
    }
    if ((targetSeq as unknown) === undefined) throw new UnboundLocalError("cannot access local variable 'target_seq' where it is not associated with a value");
    const target = new SeqRecord(targetSeq, targetId, undefined, undefined, null, null, targetAnnotations.size > 0 ? targetAnnotations : null);
    const alignment = new Alignment([target, query], coordinates);
    alignment.annotations = annotations;
    if (score !== null) alignment.score = score;
    return alignment;
  }
}

/** Python's bare `Exception`. */
class PythonException extends Error { override name = "Exception"; }

/** Coordinates from a BTOP (BLAST trace-back operations) string. */
export function parseBtop(btop: string): number[][] {
  const target = [0], query = [0];
  let state: "match" | "queryGap" | "targetGap" | "none" = "none";
  const last = (a: number[]): number => a[a.length - 1]!;
  for (const token of btop.match(/[A-Z\-*]{2}|\d+/g) ?? []) {
    if (token.startsWith("-")) {
      if (state !== "queryGap") { target.push(last(target)); query.push(last(query)); state = "queryGap"; }
      target[target.length - 1]! += 1;
    } else if (token.endsWith("-")) {
      if (state !== "targetGap") { target.push(last(target)); query.push(last(query)); state = "targetGap"; }
      query[query.length - 1]! += 1;
    } else {
      const length = /^\d+$/.test(token) ? pyInt(token) : 1;
      if (state === "match") { target[target.length - 1]! += length; query[query.length - 1]! += length; }
      else { target.push(last(target) + length); query.push(last(query) + length); state = "match"; }
    }
  }
  return [target, query];
}

/** Coordinates from a CIGAR string (only M, D and I count). */
export function parseCigar(cigar: string): number[][] {
  const target = [0], query = [0];
  let t = 0, q = 0;
  const tokens = cigar.match(/M|D|I|\d+/g) ?? [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const length = pyInt(tokens[i]!);
    const op = tokens[i + 1]!;
    if (op === "M") { t += length; q += length; } else if (op === "I") t += length; else if (op === "D") q += length;
    target.push(t); query.push(q);
  }
  return [target, query];
}

registerFormat("tabular", { AlignmentIterator: TabularIterator });
