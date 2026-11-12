/** FASTA `-m 10` pairwise alignment output (`fasta-m10`, from the FASTA suite). */

import { AssertionError, IndexError, KeyError, RuntimeError, ValueError, pyInt, pyRepr, pyStrip, warn } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { splitMax } from "../insdc/text.js";
import { AlignmentIterator } from "./interfaces.js";
import type { LineStream } from "../handles.js";

/** The first word of `s` (Python `s.split(None, 1)[0]`). */
function firstWord(s: string): string {
  const [word] = splitMax(s, 1);
  if (word === undefined) throw new IndexError("list index out of range");
  return word;
}

/** Python's `dict[key]` on tags. */
function tag(tags: Map<string, string>, key: string): string {
  const v = tags.get(key);
  if (v === undefined) throw new KeyError(key);
  return v;
}

/** Remove characters in `chars` from both ends (Python `str.strip(chars)`). */
function stripChars(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a]!)) a++;
  while (b > a && chars.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
}

/**
 * Cut the aligned part out of a sequence shown with flanking sequence, using the start, stop and display-start tags.
 *
 * @throws {@link ValueError} if the coordinates do not fit the sequence.
 */
export function extractAlignmentRegion(alignmentSeqWithFlanking: string, annotation: Map<string, string>): string {
  const alignStripped = stripChars(alignmentSeqWithFlanking, "-");
  const displayStart = pyInt(tag(annotation, "al_display_start"));
  let start: number;
  let end: number;
  if (pyInt(tag(annotation, "al_start")) <= pyInt(tag(annotation, "al_stop"))) {
    start = pyInt(tag(annotation, "al_start")) - displayStart;
    end = pyInt(tag(annotation, "al_stop")) - displayStart + 1;
  } else {
    start = displayStart - pyInt(tag(annotation, "al_start"));
    end = displayStart - pyInt(tag(annotation, "al_stop")) + 1;
  }
  end += alignStripped.split("-").length - 1;
  if (start < 0 || start >= end || end > alignStripped.length) {
    throw new ValueError(`Problem with sequence start/stop,\n${alignmentSeqWithFlanking}[${start}:${end}]\n${pyRepr(annotation)}`);
  }
  return alignStripped.slice(start, end);
}

const PREAMBLE = -1, NONE = 0, QUERY_HEADER = 1, ALIGN_HEADER = 2, ALIGN_QUERY = 3, ALIGN_MATCH = 4, ALIGN_CONS = 5;

/** Python's `assert cond, message`. */
function check(cond: boolean, message?: string): void {
  if (!cond) throw new AssertionError(message);
}

/** Generator over the alignments of a `-m 10` file. */
function* fastaM10(handle: LineStream): Generator<MultipleSeqAlignment> {
  let state = PREAMBLE;
  let queryId: string | null = null;
  let matchId: string | null = null;
  let queryDescr = "";
  let matchDescr = "";
  const globalTags = new Map<string, string>();
  let headerTags = new Map<string, string>();
  let alignTags = new Map<string, string>();
  let queryTags = new Map<string, string>();
  let matchTags = new Map<string, string>();
  let querySeq = "";
  let matchSeq = "";
  let consSeq = "";

  const buildHsp = (): MultipleSeqAlignment => {
    if (queryTags.size === 0 && matchTags.size === 0) throw new ValueError(`No data for query ${pyRepr(queryId)}, match ${pyRepr(matchId)}`);
    check(queryTags.size > 0, "{}");
    check(matchTags.size > 0, "{}");
    const tool = (globalTags.get("tool") ?? "").toUpperCase();
    const q = extractAlignmentRegion(querySeq, queryTags);
    const m = tool === "TFASTX" && matchSeq.length === q.length ? matchSeq : extractAlignmentRegion(matchSeq, matchTags);
    if (q.length !== m.length) {
      // Biopython's message mentions `handle.name`, which a stream without a name cannot supply.
      throw new TypeError("'_io.StringIO' object has no attribute 'name'");
    }
    const annotations = new Map<string, unknown>([...headerTags, ...alignTags]);
    const records: SeqRecord[] = [];
    for (const [id, seq, name, descr, tags] of [[queryId!, q, "query", queryDescr, queryTags], [matchId!, m, "match", matchDescr, matchTags]] as const) {
      const record = new SeqRecord(new Seq(seq), id, name, descr, null, null, new Map([["original_length", pyInt(tag(tags, "sq_len"))]]));
      pyInt(tag(tags, "al_start"));
      pyInt(tag(tags, "al_stop"));
      if (tags.has("sq_type")) {
        if (tags.get("sq_type") === "D") record.annotations.set("molecule_type", "DNA");
        else if (tags.get("sq_type") === "p") record.annotations.set("molecule_type", "protein");
      }
      records.push(record);
    }
    return new MultipleSeqAlignment(records, null, annotations);
  };
  const reset = (): void => {
    alignTags = new Map(); queryTags = new Map(); matchTags = new Map();
    querySeq = ""; matchSeq = ""; consSeq = "";
  };

  for (const line of handle) {
    if (line.includes(">>>") && !line.startsWith(">>>")) {
      if (queryId && matchId) yield buildHsp();
      state = NONE;
      queryDescr = pyStrip(line.slice(line.indexOf(">>>") + 3));
      queryId = firstWord(queryDescr);
      matchId = null;
      headerTags = new Map();
      reset();
    } else if (line.startsWith("!! No ")) {
      check(state === NONE);
      check(headerTags.size === 0);
      check(alignTags.size === 0);
      check(matchTags.size === 0);
      check(queryTags.size === 0);
      check(matchId === null);
      check(!querySeq);
      check(!matchSeq);
      check(!consSeq);
      queryId = null;
    } else if (pyStrip(line) === ">>><<<" || pyStrip(line) === ">>>///") {
      if (queryId && matchId) yield buildHsp();
      state = NONE;
      queryId = null;
      matchId = null;
      headerTags = new Map();
      reset();
    } else if (line.startsWith(">>>")) {
      check(queryId !== null);
      check(line.slice(3).split(", ")[0] === queryId, line);
      check(matchId === null);
      check(headerTags.size === 0);
      check(alignTags.size === 0);
      check(queryTags.size === 0);
      check(matchTags.size === 0);
      check(!matchSeq);
      check(!querySeq);
      check(!consSeq);
      state = QUERY_HEADER;
    } else if (line.startsWith(">>")) {
      if (queryId && matchId) yield buildHsp();
      reset();
      matchDescr = pyStrip(line.slice(2));
      matchId = firstWord(matchDescr);
      state = ALIGN_HEADER;
    } else if (line.startsWith(">--")) {
      check(!!(queryId && matchId), line);
      yield buildHsp();
      reset();
      state = ALIGN_HEADER;
    } else if (line.startsWith(">")) {
      if (state === ALIGN_HEADER) {
        check(queryId !== null, line);
        check(matchId !== null, line);
        check(queryId!.startsWith(firstWord(line.slice(1))), line);
        state = ALIGN_QUERY;
      } else if (state === ALIGN_QUERY) {
        check(queryId !== null, line);
        check(matchId !== null, line);
        check(matchId!.startsWith(firstWord(line.slice(1))), line);
        state = ALIGN_MATCH;
      } else if (state === NONE) {
        // nothing to do
      } else {
        throw new RuntimeError(`state ${state} got ${pyRepr(line)}`);
      }
    } else if (line.startsWith("; al_cons")) {
      check(state === ALIGN_MATCH, line);
      state = ALIGN_CONS;
    } else if (line.startsWith("; ")) {
      let key: string;
      let value: string;
      if (line.includes(": ")) {
        const i = line.slice(2).indexOf(": ");
        key = pyStrip(line.slice(2, 2 + i));
        value = pyStrip(line.slice(2 + i + 2));
      } else {
        warn(`Missing colon in line: ${pyRepr(line)}`, "BiopythonParserWarning");
        const rest = line.slice(2);
        const i = rest.indexOf(" ");
        if (i < 0) throw new ValueError(`Bad line: ${pyRepr(line)}`);
        key = pyStrip(rest.slice(0, i));
        value = pyStrip(rest.slice(i + 1));
      }
      if (state === QUERY_HEADER) headerTags.set(key, value);
      else if (state === ALIGN_HEADER) alignTags.set(key, value);
      else if (state === ALIGN_QUERY) queryTags.set(key, value);
      else if (state === ALIGN_MATCH) matchTags.set(key, value);
      else throw new RuntimeError(`Unexpected state ${state}, ${pyRepr(line)}`);
    } else if (state === ALIGN_QUERY) {
      querySeq += pyStrip(line);
    } else if (state === ALIGN_MATCH) {
      matchSeq += pyStrip(line);
    } else if (state === ALIGN_CONS) {
      consSeq += line.replace(/^\n+|\n+$/g, "");
    } else if (state === PREAMBLE) {
      if (line.startsWith("#")) globalTags.set("command", pyStrip(line.slice(1)));
      else if (line.startsWith(" version ")) globalTags.set("version", pyStrip(line.slice(9)));
      else if (line.includes(" compares a ")) globalTags.set("tool", pyStrip(line.slice(0, line.indexOf(" compares a "))));
      else if (line.includes(" searches a ")) globalTags.set("tool", pyStrip(line.slice(0, line.indexOf(" searches a "))));
    }
  }
}

/** Reads the alignments in FASTA suite `-m 10` output; each hit is a two-row alignment of the query and the match. */
export class FastaM10Iterator extends AlignmentIterator {
  private readonly source: Generator<MultipleSeqAlignment>;

  constructor(handle: LineStream, seqCount: number | null = null) {
    super(handle, seqCount);
    this.source = fastaM10(handle);
  }

  nextAlignment(): MultipleSeqAlignment | null {
    const next = this.source.next();
    return next.done ? null : next.value;
  }
}

