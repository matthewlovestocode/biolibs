/** MAST XML output (Biopython's `Bio.motifs.mast`): the motifs searched for and a diagram of the hits in each sequence. */

import { ValueError } from "@biolibs/core";
import { PythonException } from "./errors.js";
import { intOf } from "./convert.js";
import { MemeMotif } from "./meme.js";
import { ParseError, attr, find, parseXml, type Element } from "./xml.js";

/** The motifs of a MAST XML file, with the diagrams of where they hit. */
export class MastRecord extends Array<MemeMotif> {
  /** The sequence names. */
  sequences: (string | null)[] = [];
  /** MAST version. */
  version: string | null = "";
  /** The sequence database. */
  database: string | null = "";
  /** Hit diagram by sequence name. */
  diagrams = new Map<string | null, string>();
  /** The alphabet name. */
  alphabet: string | null = null;
  /** `combine` or `unstranded`. */
  strandHandling: string | null = "";
  /** @param name - A motif name. @returns The motif with that name, or null (Python `record[name]`). */
  byName(name: string): MemeMotif | null { return this.find((m) => m.name === name) ?? null; }
}

/**
 * Read a MAST XML file.
 *
 * @param text - The file contents.
 * @throws ValueError for text that is not XML; PythonException for an unknown strand handling option.
 */
export function read(text: string): MastRecord {
  const record = new MastRecord();
  let root: Element;
  try { root = parseXml(text); } catch (e) {
    if (e instanceof ParseError) throw new ValueError("Improper MAST XML input file. XML root tag should start with <mast version= ...");
    throw e;
  }
  record.version = root.attrib.get("version") ?? null;
  record.database = attr(find(find(root, "sequence_dbs"), "sequence_db"), "source");
  record.alphabet = attr(find(root, "alphabet"), "name");
  record.strandHandling = attr(find(root, "settings"), "strand_handling");
  find(root, "motifs")!.children.filter((c) => c.tag === "motif").forEach((mt, i) => {
    const motif = new MemeMotif(record.alphabet as string);
    motif.name = String(i + 1);
    motif.id = mt.attrib.get("id") ?? null;
    motif.altId = mt.attrib.get("alt") ?? null;
    motif.length = intOf(mt.attrib.get("length") ?? null);
    record.push(motif);
  });
  for (const seqTree of find(root, "sequences")!.children.filter((c) => c.tag === "sequence")) {
    const name = seqTree.attrib.get("name") ?? null;
    record.sequences.push(name);
    record.diagrams.set(name, makeDiagram(record, seqTree));
  }
  return record;
}

function makeDiagram(record: MastRecord, seqTree: Element): string {
  const sequenceLength = intOf(seqTree.attrib.get("length") ?? null);
  const hitEles: Element[] = [], hitMotifs: MemeMotif[] = [], gaps: number[] = [];
  for (const seg of seqTree.children.filter((c) => c.tag === "seg")) {
    for (const hit of seg.children.filter((c) => c.tag === "hit")) {
      const pos = intOf(hit.attrib.get("pos") ?? null);
      const gap = hitEles.length === 0 ? pos - 1 : pos - intOf(hitEles[hitEles.length - 1]!.attrib.get("pos") ?? null) - hitMotifs[hitMotifs.length - 1]!.length!;
      gaps.push(gap);
      const idx = intOf(hit.attrib.get("idx") ?? null);
      const m = record[idx < 0 ? record.length + idx : idx];
      if (m === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
      hitMotifs.push(m);
      hitEles.push(hit);
    }
  }
  if (hitEles.length === 0) return String(sequenceLength);
  let motifStrs: string[];
  if (record.strandHandling === "combine") motifStrs = hitEles.map((h, i) => `[${h.attrib.get("rc") === "y" ? "-" : "+"}${hitMotifs[i]!.name}]`);
  else if (record.strandHandling === "unstranded") motifStrs = hitMotifs.map((m) => `[${m.name}]`);
  else throw new PythonException(`Strand handling option ${record.strandHandling} not parsable`);
  const last = hitEles[hitEles.length - 1]!;
  const tail = sequenceLength - intOf(last.attrib.get("pos") ?? null) - hitMotifs[hitMotifs.length - 1]!.length! + 1;
  const parts = [...gaps.flatMap((g, i) => [String(g), motifStrs[i]!]), String(tail)].filter((s) => s !== "0");
  return parts.join("-");
}
