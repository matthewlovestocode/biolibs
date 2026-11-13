/** Stockholm files: the reader (Biopython's `Bio.Align.stockholm.AlignmentIterator`). */

import { AssertionError, IndexError, KeyError, UnboundLocalError, ValueError, pyInt, pyRepr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { decode, encode, strip } from "./rows.js";
import { registerFormat } from "./registry.js";
import { GC_MAPPING, GF_MAPPING, GR_MAPPING, GS_MAPPING } from "./stockholm-maps.js";
import type { TextStream } from "./stream.js";

/** Python's `StopIteration` leaking out of `next(lines)`; the iterator protocol reads it as the end of the alignments. */
class StopIterationSignal extends Error {}

type Reference = Map<string, unknown>;

/** `str.split(None, maxsplit)`. */
function splitMax(s: string, maxsplit: number): string[] {
  const parts: string[] = [];
  let rest = s.replace(/^\s+/, "");
  while (rest.length > 0 && parts.length < maxsplit) {
    const m = /^(\S+)(\s+|$)/.exec(rest)!;
    parts.push(m[1]!);
    rest = rest.slice(m[0].length);
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/** Tuple unpacking of `parts` into `n` names, with Python's `ValueError`s. */
function unpack(parts: string[], n: number): string[] {
  if (parts.length < n) throw new ValueError(`not enough values to unpack (expected ${n}, got ${parts.length})`);
  if (parts.length > n) throw new ValueError(`too many values to unpack (expected ${n}, got ${parts.length})`);
  return parts;
}

const unbound = (name: string): never => { throw new UnboundLocalError(`cannot access local variable '${name}' where it is not associated with a value`); };

/** Reads Stockholm files: possibly several alignments, each ending with `//`. */
export class StockholmIterator extends AlignmentIterator {
  static override fmt: string | null = "Stockholm";

  protected readNextAlignment(stream: TextStream): Alignment | null {
    try { return this.read(stream); } catch (e) { if (e instanceof StopIterationSignal) return null; throw e; }
  }

  private read(stream: TextStream): Alignment | null {
    // Biopython's locals: they exist only once a `# STOCKHOLM 1.0` line has been seen, and some outlive a restart.
    let started = false;
    let records!: SeqRecord[], alignedSequences!: string[], references!: Reference[], referenceComments!: string[], databaseReferences!: Record<string, unknown>[], nestedDomains!: Record<string, unknown>[];
    let gf!: Map<string, string[]>, gc!: Map<string, string>, gs!: Map<string, Map<string, string | string[]>>, gr!: Map<string, Map<string, string>>;
    let length: number | null = null;
    let operations: number[] | undefined, reference: Reference | undefined, databaseReference: Record<string, unknown> | undefined, nestedDomain: Record<string, unknown> | undefined, seqname: string | undefined;
    const need = <T>(v: T | undefined, name: string): T => (v === undefined ? unbound(name) : v);
    const gsEntry = (name: string): Map<string, string | string[]> => {
      let e = gs.get(name);
      if (e === undefined) { e = new Map<string, string | string[]>([["DR", []]]); gs.set(name, e); }
      return e;
    };

    for (const raw of stream) {
      const line = strip(raw);
      if (!line) continue;
      if (line === "# STOCKHOLM 1.0") {
        started = true;
        records = []; alignedSequences = []; references = []; referenceComments = []; databaseReferences = []; nestedDomains = [];
        gf = new Map(); gc = new Map(); gs = new Map(); gr = new Map(); length = null;
      } else if (line === "//") {
        if (!started) unbound("aligned_sequences");
        return this.finish(records, alignedSequences, references, databaseReferences, nestedDomains, gf, gc, gs, gr, operations);
      } else if (!line.startsWith("#")) {
        const parts = splitMax(line, 1);
        if (parts.length < 2) throw new ValueError("Could not split line into sequence name and aligned sequence:\n" + line);
        seqname = parts[0]!;
        let aligned = parts[1]!;
        if (!started) unbound("length");
        const n = Array.from(aligned).length;
        if (length === null) { length = n; operations = new Array<number>(n).fill(77); } // "M"
        else if (length !== n) throw new ValueError(`Aligned sequence ${seqname} consists of ${n} letters, expected ${length} letters)`);
        Array.from(aligned).forEach((letter, i) => {
          if (letter === "-") { if (operations![i] === 73) throw new AssertionError(""); operations![i] = 68; }
          else if (letter === ".") { if (operations![i] === 68) throw new AssertionError(""); operations![i] = 73; }
        });
        aligned = aligned.replaceAll(".", "-");
        alignedSequences.push(aligned);
        records.push(new SeqRecord(null, seqname, undefined, ""));
      } else if (line.startsWith("#=GF ")) {
        const [feature, text] = unpack(splitMax(strip(line.slice(5)), 1), 2) as [string, string];
        if (feature === "RN") {
          if (!text.startsWith("[")) throw new AssertionError("");
          if (!text.endsWith("]")) throw new AssertionError("");
          const number = pyInt(text.slice(1, -1));
          reference = new Map<string, unknown>([["number", number]]);
          if (!started) unbound("reference_comments");
          if (referenceComments.length > 0) { reference.set("comment", referenceComments.join(" ")); referenceComments = []; }
          references.push(reference);
        } else if (feature === "RM") {
          const r = need(reference, "reference");
          if (r.has("medline") && r.get("medline")) throw new AssertionError("");
          r.set("medline", text);
        } else if (feature === "RT" || feature === "RA" || feature === "RL") {
          const r = need(reference, "reference");
          const key = feature === "RT" ? "title" : feature === "RA" ? "author" : "location";
          if (!r.has(key)) r.set(key, []);
          (r.get(key) as string[]).push(text);
        } else if (feature === "RC") {
          if (!started) unbound("reference_comments");
          referenceComments.push(text);
        } else if (feature === "DR") {
          if (!started) unbound("database_references");
          databaseReference = { reference: text };
          databaseReferences.push(databaseReference);
        } else if (feature === "DC") {
          const d = need(databaseReference, "database_reference");
          if ("comment" in d) throw new AssertionError("");
          d["comment"] = text;
        } else if (feature === "NE") {
          if (!started) unbound("nested_domains");
          nestedDomain = { accession: text };
          nestedDomains.push(nestedDomain);
        } else if (feature === "NL") {
          const d = need(nestedDomain, "nested_domain");
          if ("location" in d) throw new AssertionError("");
          d["location"] = text;
        } else {
          if (!started) unbound("gf");
          if (!gf.has(feature)) gf.set(feature, []);
          gf.get(feature)!.push(text);
        }
      } else if (line.startsWith("#=GC ")) {
        const [feature, text] = unpack(splitMax(strip(line.slice(5)), 2), 2) as [string, string];
        if (!started) unbound("gc");
        gc.set(feature, (gc.get(feature) ?? "") + strip(text));
      } else if (line.startsWith("#=GS ")) {
        const rest = strip(line.slice(5));
        let name: string, feature: string, text: string;
        const three = splitMax(rest, 2);
        if (three.length === 3) [name, feature, text] = three as [string, string, string];
        else { [name, feature] = unpack(splitMax(rest, 1), 2) as [string, string]; text = ""; }
        if (!started) unbound("gs");
        const entry = gsEntry(name);
        if (feature === "DR") (entry.get("DR") as string[]).push(text);
        else {
          if (entry.has(feature)) throw new AssertionError("");
          entry.set(feature, text);
        }
      } else if (line.slice(0, 5) === "#=GR ") {
        const terms = splitMax(line.slice(5), 2);
        if (terms.length === 0) throw new IndexError("list index out of range");
        if (terms[0] !== need(seqname, "seqname")) throw new AssertionError("");
        if (terms.length < 2) throw new IndexError("list index out of range");
        const feature = terms[1]!;
        if (terms.length < 3) throw new IndexError("list index out of range");
        if (!gr.has(seqname!)) gr.set(seqname!, new Map());
        gr.get(seqname!)!.set(feature, strip(terms[2]!));
      }
    }
    return null;
  }

  /** What Biopython does at `//`: build the alignment and attach every kind of annotation. */
  private finish(records: SeqRecord[], alignedSequences: string[], references: Reference[], databaseReferences: Record<string, unknown>[], nestedDomains: Record<string, unknown>[],
    gf: Map<string, string[]>, gc: Map<string, string>, gs: Map<string, Map<string, string | string[]>>, gr: Map<string, Map<string, string>>, operations0: number[] | undefined): Alignment {
    if (alignedSequences.length === 0) throw new ValueError("Calling nonzero on 0d arrays is not allowed. Use np.atleast_1d(scalar).nonzero() instead. If the context of this error is of the form `arr[nonzero(cond)]`, just use `arr[cond]`.");
    if (operations0 === undefined) unbound("operations");
    const rows = alignedSequences.map(encode);
    const ncol = rows[0]!.length;
    const skipped: number[] = [];
    for (let c = 0; c < ncol; c++) if (rows.every((r) => r[c] === 45)) skipped.push(c);
    const skip = new Set(skipped);
    const kept = rows.map((r) => r.filter((_, c) => !skip.has(c)));
    const parsed = Alignment.parsePrintedAlignment(kept);
    records.forEach((record, i) => { record.seq = new Seq(decode(parsed.sequences[i]!)); });
    const alignment = new Alignment(records, parsed.coordinates);
    alignment.operations = Uint8Array.from(operations0!.filter((_, c) => !skip.has(c)));
    alignment.annotations = new Map();
    if (references.length > 0) {
      alignment.annotations.set("references", references.map((r) => {
        const d: Record<string, unknown> = Object.fromEntries(r);
        for (const key of ["title", "author", "location"]) {
          if (!(key in d)) throw new KeyError(key);
          d[key] = (d[key] as string[]).join(" ");
        }
        return d;
      }));
    }
    if (databaseReferences.length > 0) alignment.annotations.set("database references", databaseReferences);
    if (nestedDomains.length > 0) alignment.annotations.set("nested domains", nestedDomains);
    const [nrows, columns] = alignment.shape;
    storePerFile(alignment, gf, nrows);
    storePerColumn(alignment, gc, columns, skipped);
    storePerSequence(alignment, gs);
    storePerLetter(alignment, gr);
    return alignment;
  }
}

function storePerFile(alignment: Alignment, gf: Map<string, string[]>, rows: number): void {
  for (const [key, list] of gf) {
    let value: unknown = list;
    if (key === "WK") {
      const lines = list[Symbol.iterator]();
      const out: string[] = [];
      for (let r = lines.next(); !r.done; r = lines.next()) {
        let line = r.value;
        let reference = "";
        while (line.endsWith("/")) {
          reference += line.slice(0, -1);
          const nx = lines.next();
          if (nx.done) throw new StopIterationSignal();
          line = nx.value;
        }
        out.push(reference + line);
      }
      value = out;
    } else if (key === "SM" || key === "CC" || key === "**") value = list.join(" ");
    else if (key === "SQ") {
      if (list.length !== 1) throw new AssertionError("");
      if (pyInt(list[list.length - 1]!) !== rows) throw new ValueError("Inconsistent number of sequences in alignment");
      continue;
    } else if (key === "AU") { /* keep the list */ }
    else {
      if (list.length !== 1) throw new AssertionError(pyRepr([key, list]).replace(/^\[/, "(").replace(/\]$/, ")"));
      value = list[0];
    }
    const name = GF_MAPPING.get(key);
    if (name !== undefined) alignment.annotations!.set(name, value);
  }
}

function storePerColumn(alignment: Alignment, gc: Map<string, string>, columns: number, skipped: number[]): void {
  if (gc.size === 0) return;
  alignment.columnAnnotations = new Map();
  const skip = new Set(skipped);
  for (const [key, value0] of gc) {
    let value = value0;
    if (skipped.length > 0) value = Array.from(value).filter((_, i) => !skip.has(i)).join("");
    const n = Array.from(value).length;
    if (n !== columns) throw new ValueError(`${key} length is ${n}, expected ${columns}`);
    alignment.columnAnnotations.set(GC_MAPPING.get(key) ?? key, value);
  }
}

function findRecord(alignment: Alignment, seqname: string): SeqRecord {
  for (const record of alignment.sequences as SeqRecord[]) if (record.id === seqname) return record;
  throw new ValueError(`Failed to find seqname ${seqname}`);
}

function storePerSequence(alignment: Alignment, gs: Map<string, Map<string, string | string[]>>): void {
  for (const [seqname, annotations] of gs) {
    const record = findRecord(alignment, seqname);
    for (const [key, value] of annotations) {
      if (key === "DE") record.description = value as string;
      else if (key === "DR") record.dbxrefs = value as string[];
      else record.annotations.set(GS_MAPPING.get(key) ?? key, value);
    }
  }
}

function storePerLetter(alignment: Alignment, gr: Map<string, Map<string, string>>): void {
  for (const [seqname, letterAnnotations] of gr) {
    const record = findRecord(alignment, seqname);
    for (const [key, value] of letterAnnotations) {
      const feature = GR_MAPPING.get(key) ?? key;
      record.letterAnnotations.set(feature, key === "CSA" ? value.replaceAll("-", "") : value.replaceAll(".", ""));
    }
  }
}

registerFormat("stockholm", { AlignmentIterator: StockholmIterator });
