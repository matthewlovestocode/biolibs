/** `Bio.Sequencing.Ace.parse`: iterate over the contigs of an ACE file. */

import { IndexError, ValueError, pyInt, pySplit, pyStrip } from "@biolibs/core";
import { openText, type LineStream } from "../handles.js";
import { Af, Bs, Contig, Ct, Ds, Qa, Reads, Rt, Wa, Wr } from "./records.js";

/** Next line of the stream, or null at the end (Python `next(stream)` / the end of a `for` loop). */
const nl = (s: LineStream): string | null => {
  const l = s.readline();
  return l === "" ? null : l;
};

/** The last element of a list that Python indexes with `[-1]`. @throws {@link IndexError} when empty. */
function last<T>(items: T[] | null): T {
  const v = items?.at(-1);
  if (v === undefined) throw new IndexError("list index out of range");
  return v;
}

/** Read the tag block that follows a read's `RT{` line, then return. */
function readRt(stream: LineStream, read: Reads): void {
  if (read.rt === null) read.rt = [];
  for (let n = nl(stream); n !== null; n = nl(stream)) {
    const line = pyStrip(n);
    if (line.startsWith("COMMENT{")) {
      if (pyStrip(line.slice(8))) last(read.rt).comment.push(line.slice(8));
      for (let m = nl(stream); m !== null; m = nl(stream)) {
        const l2 = pyStrip(m);
        if (l2.endsWith("C}")) break;
        last(read.rt).comment.push(l2);
      }
    } else if (line === "}") break;
    else read.rt.push(new Rt(line));
  }
}

/**
 * Parse a contig's tag/ read tail: DS line then any RT, WR, WA, CT blocks, stopping at the first other line.
 *
 * @returns The line that ended the tags (empty after a block), as Python leaves it in `line`.
 */
function readTags(stream: LineStream, record: Contig, read: Reads, line: string): string {
  for (;;) {
    // Skip blank lines; the end of the file ends the tags.
    for (;;) {
      if (pyStrip(line)) break;
      const n = nl(stream);
      if (n === null) return line;
      line = n;
    }
    if (line.startsWith("RT{")) {
      readRt(stream, read);
    } else if (line.startsWith("WR{")) {
      if (read.wr === null) read.wr = [];
      for (let n = nl(stream); n !== null; n = nl(stream)) {
        const l = pyStrip(n);
        if (l === "}") break;
        read.wr.push(new Wr(l));
      }
    } else if (line.startsWith("WA{")) {
      if (record.wa === null) record.wa = [];
      const header = nl(stream);
      if (header === null) throw new ValueError("Failed to read WA block");
      record.wa.push(new Wa(header));
      for (let n = nl(stream); n !== null; n = nl(stream)) {
        const l = pyStrip(n);
        if (l === "}") break;
        last(record.wa).info.push(l);
      }
    } else if (line.startsWith("CT{")) {
      if (record.ct === null) record.ct = [];
      const header = nl(stream);
      if (header === null) throw new ValueError("Failed to read CT block");
      record.ct.push(new Ct(header));
      for (let n = nl(stream); n !== null; n = nl(stream)) {
        const l = pyStrip(n);
        if (l === "COMMENT{") {
          for (let m = nl(stream); m !== null; m = nl(stream)) {
            const l2 = pyStrip(m);
            if (l2.endsWith("C}")) break;
            last(record.ct).comment.push(l2);
          }
        } else if (l === "}") break;
        else last(record.ct).info.push(l);
      }
    } else return line;
    line = "";
  }
}

/** Parse one contig starting at its `CO` line; mirrors the control flow of Biopython's `_parse` exactly. */
function parseContig(stream: LineStream, first: string): { record: Contig; line: string } {
  const record = new Contig(first);
  let line = first;
  for (let n = nl(stream); n !== null; n = nl(stream)) {
    line = pyStrip(n);
    if (!line) break;
    record.sequence += line;
  }
  for (let n = nl(stream); n !== null; n = nl(stream)) {
    line = n;
    if (pyStrip(line)) break;
  }
  if (!line.startsWith("BQ")) throw new ValueError("Failed to find BQ line");
  for (let n = nl(stream); n !== null; n = nl(stream)) {
    line = n;
    if (!pyStrip(line)) break;
    for (const x of pySplit(line)) record.quality.push(pyInt(x));
  }
  for (let n = nl(stream); n !== null; n = nl(stream)) {
    line = n;
    if (pyStrip(line)) break;
  }
  while (line.startsWith("AF ")) {
    record.af.push(new Af(line));
    const n = nl(stream);
    if (n === null) throw new ValueError("Unexpected end of AF block");
    line = n;
  }
  while (!pyStrip(line)) {
    const n = nl(stream);
    if (n === null) throw new ValueError("Unexpected end of file");
    line = n;
  }
  while (line.startsWith("BS ")) {
    record.bs.push(new Bs(line));
    const n = nl(stream);
    if (n === null) throw new ValueError("Failed to find end of BS block");
    line = n;
  }
  for (;;) {
    while (!line.startsWith("RD ")) {
      const n = nl(stream);
      if (n === null) throw new ValueError("Failed to find RD line");
      line = n;
    }
    const read = new Reads(line);
    record.reads.push(read);
    for (let n = nl(stream); n !== null; n = nl(stream)) {
      line = pyStrip(n);
      if (!line) break;
      read.rd!.sequence += line;
    }
    for (let n = nl(stream); n !== null; n = nl(stream)) {
      line = n;
      if (pyStrip(line)) break;
    }
    if (!line.startsWith("QA ")) throw new ValueError("Failed to find QA line");
    read.qa = new Qa(line);
    let found = false;
    for (let n = nl(stream); n !== null; n = nl(stream)) {
      line = n;
      if (pyStrip(line)) { found = true; break; }
    }
    if (!found) break; // the file ended: this was the last read
    if (line.startsWith("DS ")) {
      read.ds = new Ds(line);
      line = "";
    }
    line = readTags(stream, record, read, line);
    if (!line.startsWith("RD")) break;
  }
  return { record, line };
}

/**
 * Iterate over the contigs of an ACE file, one at a time.
 *
 * @param source - The file's text (or a `LineStream`).
 * @throws {@link ValueError} for a malformed file; {@link IndexError} for a header with too few fields.
 */
export function* parseAce(source: unknown): Generator<Contig> {
  const stream = openText(source, "ACE");
  let line = "";
  for (;;) {
    while (!line.startsWith("CO")) {
      const n = nl(stream);
      if (n === null) return;
      line = n;
    }
    const parsed = parseContig(stream, line);
    // Python carries `line` over: the line that ended the contig may already be the next contig's header.
    line = parsed.line;
    yield parsed.record;
  }
}
