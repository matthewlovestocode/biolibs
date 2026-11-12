/** Stockholm alignment files (`stockholm`, as used by Pfam and Rfam). */

import { AssertionError, ValueError, pyInt, pyStr, pyStrip } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { splitMax, unpackN } from "../insdc/text.js";
import { AlignmentIterator, SequentialAlignmentWriter } from "./interfaces.js";

const GR_MAPPING: Record<string, string> = { SS: "secondary_structure", SA: "surface_accessibility", TM: "transmembrane", PP: "posterior_probability", LI: "ligand_binding", AS: "active_site", IN: "intron" };
const GC_MAPPING: Record<string, string> = { RF: "reference_annotation", MM: "model_mask" };
const GS_MAPPING: Record<string, string> = { OS: "organism", OC: "organism_classification", LO: "look" };

/** Reverse of a mapping: annotation name to Stockholm tag. */
const invert = (m: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const GR_TAGS = invert(GR_MAPPING);
const GC_TAGS = invert(GC_MAPPING);
const GS_TAGS = invert(GS_MAPPING);

/** Python's `sorted(dict.items())` by key. */
const sortedEntries = <V>(m: Map<string, V>): [string, V][] => [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/** Writes one Stockholm block per alignment. */
export class StockholmWriter extends SequentialAlignmentWriter {
  private lengthOfSequences = 0;
  private idsWritten: string[] = [];

  writeAlignment(alignment: MultipleSeqAlignment): void {
    const count = alignment.length;
    this.lengthOfSequences = alignment.getAlignmentLength();
    this.idsWritten = [];
    if (count === 0) throw new ValueError("Must have at least one sequence");
    if (this.lengthOfSequences === 0) throw new ValueError("Non-empty sequences are required");
    this.handle.write("# STOCKHOLM 1.0\n");
    this.handle.write(`#=GF SQ ${count}\n`);
    for (const record of alignment) this.writeRecord(record);
    if (alignment.columnAnnotations.size > 0) {
      for (const [k, v] of sortedEntries(alignment.columnAnnotations)) {
        if (Object.hasOwn(GC_TAGS, k)) this.handle.write(`#=GC ${GC_TAGS[k]} ${pyStr(v)}\n`);
        else if (Object.hasOwn(GR_TAGS, k)) this.handle.write(`#=GC ${GR_TAGS[k]}_cons ${pyStr(v)}\n`);
      }
    }
    this.handle.write("//\n");
  }

  private writeRecord(record: SeqRecord): void {
    if (this.lengthOfSequences !== record.seq!.length) throw new ValueError("Sequences must all be the same length");
    let seqName = record.id as string;
    if (record.name !== null && record.name !== undefined) {
      if (record.annotations.has("accession") && record.id === record.annotations.get("accession")) seqName = record.name;
    }
    seqName = seqName.replaceAll(" ", "_");
    if (record.annotations.has("start") && record.annotations.has("end")) {
      const suffix = `/${pyStr(record.annotations.get("start"))}-${pyStr(record.annotations.get("end"))}`;
      if (seqName.slice(-suffix.length) !== suffix) seqName = `${seqName}/${pyStr(record.annotations.get("start"))}-${pyStr(record.annotations.get("end"))}`;
    }
    if (this.idsWritten.includes(seqName)) throw new ValueError(`Duplicate record identifier: ${seqName}`);
    this.idsWritten.push(seqName);
    this.handle.write(`${seqName} ${record.seq!.toString()}\n`);
    if (record.annotations.has("accession")) this.handle.write(`#=GS ${seqName} AC ${this.clean(record.annotations.get("accession") as string)}\n`);
    else if (record.id) this.handle.write(`#=GS ${seqName} AC ${this.clean(record.id)}\n`);
    if (record.description) this.handle.write(`#=GS ${seqName} DE ${this.clean(record.description)}\n`);
    for (const xref of record.dbxrefs) this.handle.write(`#=GS ${seqName} DR ${this.clean(xref)}\n`);
    for (const [key, value] of record.annotations) {
      if (Object.hasOwn(GS_TAGS, key)) {
        const data = this.clean(pyStr(value));
        if (data) this.handle.write(`#=GS ${seqName} ${this.clean(GS_TAGS[key]!)} ${data}\n`);
      }
    }
    for (const [key, value] of record.letterAnnotations) {
      if (Object.hasOwn(GR_TAGS, key) && pyStr(value).length === record.seq!.length) {
        const data = this.clean(pyStr(value));
        if (data) this.handle.write(`#=GR ${seqName} ${this.clean(GR_TAGS[key]!)} ${data}\n`);
      }
    }
  }
}

/** Reads Stockholm alignments, with the Pfam-style `#=GF`, `#=GC`, `#=GS` and `#=GR` annotations. */
export class StockholmIterator extends AlignmentIterator {
  private pendingHeader: string | null = null;
  /** Per-sequence annotations of the last alignment read (`#=GS`). */
  seqAnnotation = new Map<string, Map<string, string[]>>();
  /** Per-sequence per-column annotations of the last alignment read (`#=GR`). */
  seqColAnnotation = new Map<string, Map<string, string>>();

  nextAlignment(): MultipleSeqAlignment | null {
    const handle = this.handle;
    let line: string;
    if (this.pendingHeader === null) line = handle.readline();
    else {
      line = this.pendingHeader;
      this.pendingHeader = null;
    }
    if (!line) return null;
    if (pyStrip(line) !== "# STOCKHOLM 1.0") throw new ValueError("Did not find STOCKHOLM header");
    const seqs = new Map<string, string>();
    const ids = new Map<string, boolean>();
    const gs = new Map<string, Map<string, string[]>>();
    const gr = new Map<string, Map<string, string>>();
    const gc = new Map<string, string>();
    let passedEndAlignment = false;
    for (;;) {
      line = handle.readline();
      if (!line) break;
      line = pyStrip(line);
      if (line === "# STOCKHOLM 1.0") {
        this.pendingHeader = line;
        break;
      } else if (line === "//") {
        passedEndAlignment = true;
      } else if (line === "") {
        // blank line
      } else if (line[0] !== "#") {
        if (passedEndAlignment) throw new AssertionError();
        const space = line.indexOf(" ");
        const parts = (space < 0 ? [line] : [line.slice(0, space), line.slice(space + 1)]).map(pyStrip);
        if (parts.length !== 2) throw new ValueError("Could not split line into identifier and sequence:\n" + line);
        const [seqId, seq] = parts as [string, string];
        if (!ids.has(seqId)) ids.set(seqId, true);
        if (!seqs.has(seqId)) seqs.set(seqId, "");
        seqs.set(seqId, seqs.get(seqId)! + seq.replaceAll(".", "-"));
      } else if (line.length >= 5) {
        const tag = line.slice(0, 5);
        if (tag === "#=GF ") {
          // Stockholm file-level features are parsed but not kept.
          unpackN(splitMax(pyStrip(line.slice(5)), 1), 2);
        } else if (tag === "#=GC ") {
          const [feature, text] = unpackN(splitMax(pyStrip(line.slice(5)), 2), 2) as [string, string];
          gc.set(feature, (gc.get(feature) ?? "") + pyStrip(text));
        } else if (tag === "#=GS ") {
          let seqId: string;
          let feature: string;
          let text: string;
          try {
            [seqId, feature, text] = unpackN(splitMax(pyStrip(line.slice(5)), 2), 3) as [string, string, string];
          } catch (e) {
            if (!(e instanceof ValueError)) throw e;
            [seqId, feature] = unpackN(splitMax(pyStrip(line.slice(5)), 1), 2) as [string, string];
            text = "";
          }
          if (!gs.has(seqId)) gs.set(seqId, new Map());
          const features = gs.get(seqId)!;
          if (!features.has(feature)) features.set(feature, [text]);
          else features.get(feature)!.push(text);
        } else if (tag === "#=GR ") {
          const [seqId, feature, text] = unpackN(splitMax(pyStrip(line.slice(5)), 2), 3) as [string, string, string];
          if (!gr.has(seqId)) gr.set(seqId, new Map());
          const features = gr.get(seqId)!;
          features.set(feature, (features.get(feature) ?? "") + pyStrip(text));
        }
      }
    }
    if (!(seqs.size <= ids.size)) throw new AssertionError();
    this.seqAnnotation = gs;
    this.seqColAnnotation = gr;
    if (ids.size === 0 || seqs.size === 0) return null;
    if (this.recordsPerAlignment !== null && this.recordsPerAlignment !== ids.size) {
      throw new ValueError(`Found ${ids.size} records in this alignment, told to expect ${this.recordsPerAlignment}`);
    }
    const alignmentLength = [...seqs.values()][0]!.length;
    const records: SeqRecord[] = [];
    for (const seqId of ids.keys()) {
      const seq = seqs.get(seqId)!;
      if (alignmentLength !== seq.length) throw new ValueError("Sequences have different lengths, or repeated identifier");
      const [name, start, end] = this.identifierSplit(seqId);
      const record = new SeqRecord(new Seq(seq), seqId, name, seqId, null, null, new Map([["accession", name]]));
      record.annotations.set("accession", name);
      if (start !== null) record.annotations.set("start", start);
      if (end !== null) record.annotations.set("end", end);
      this.populateMetaData(seqId, record);
      records.push(record);
    }
    for (const [k, v] of gc) if (v.length !== alignmentLength) throw new ValueError(`${k} length ${v.length}, expected ${alignmentLength}`);
    const alignment = new MultipleSeqAlignment(records);
    for (const [k, v] of sortedEntries(gc)) {
      if (Object.hasOwn(GC_MAPPING, k)) alignment.columnAnnotations.set(GC_MAPPING[k]!, v);
      else if (k.endsWith("_cons") && Object.hasOwn(GR_MAPPING, k.slice(0, -5))) alignment.columnAnnotations.set(GR_MAPPING[k.slice(0, -5)]!, v);
      else alignment.columnAnnotations.set("GC:" + k, v);
    }
    return alignment;
  }

  /** Split `name/start-end` into its parts; anything else is just a name. */
  private identifierSplit(identifier: string): [string, number | null, number | null] {
    if (identifier.includes("/")) {
      const slash = identifier.lastIndexOf("/");
      const name = identifier.slice(0, slash);
      const startEnd = identifier.slice(slash + 1);
      if (startEnd.split("-").length - 1 === 1) {
        const [start, end] = startEnd.split("-") as [string, string];
        try {
          return [name, pyInt(start), pyInt(end)];
        } catch (e) {
          if (!(e instanceof ValueError)) throw e;
        }
      }
    }
    return [identifier, null, null];
  }

  /** Merge the `#=GS`/`#=GR` entries for an identifier (and for its name without `/start-end`). */
  private metaData<V>(identifier: string, meta: Map<string, Map<string, V>>): Map<string, V> {
    const [name] = this.identifierSplit(identifier);
    const keys = name === identifier ? [identifier] : [identifier, name];
    const answer = new Map<string, V>();
    for (const key of keys) {
      const features = meta.get(key);
      if (features) for (const [k, v] of features) answer.set(k, v);
    }
    return answer;
  }

  private populateMetaData(identifier: string, record: SeqRecord): void {
    for (const [feature, values] of this.metaData(identifier, this.seqAnnotation)) {
      if (feature === "AC") {
        if (values.length !== 1) throw new AssertionError();
        record.annotations.set("accession", values[0]);
      } else if (feature === "DE") {
        record.description = values.join("\n");
      } else if (feature === "DR") {
        record.dbxrefs = values;
      } else if (Object.hasOwn(GS_MAPPING, feature)) {
        record.annotations.set(GS_MAPPING[feature]!, values.join(", "));
      } else {
        record.annotations.set("GS:" + feature, values.join(", "));
      }
    }
    for (const [feature, value] of this.metaData(identifier, this.seqColAnnotation)) {
      record.letterAnnotations.set(Object.hasOwn(GR_MAPPING, feature) ? GR_MAPPING[feature]! : "GR:" + feature, value);
    }
  }
}
