/** MEME XML output (Biopython's `Bio.motifs.meme`). */

import { Alignment } from "@biolibs/align";
import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { floatOf, intOf } from "./convert.js";
import { Motif } from "./motif.js";
import { ParseError, attr, find, parseXml, type Element } from "./xml.js";

/** A motif found by MEME. */
export class MemeMotif extends Motif {
  /** The E-value. */
  evalue = 0.0;
  /** The number of contributing sites. */
  numOccurrences = 0;
  /** Motif id. */
  id: string | null = null;
  /** Alternative id. */
  altId: string | null = null;
}

/** A contributing site: a sequence with the details MEME reports (`lengthAttr` is Biopython's `length` attribute). */
export type MemeInstance = Seq & { motifName?: string | null; sequenceId?: string | null; sequenceName?: string | null; start?: number; pvalue?: number; strand?: string | null; lengthAttr?: number };

/** The motifs of a MEME XML file with the run's metadata. */
export class MemeRecord extends Array<MemeMotif> {
  /** MEME version. */
  version: string | null = "";
  /** Training set file. */
  datafile: string | null = "";
  /** The command line. */
  command: string | null = "";
  /** The letters of the alphabet. */
  alphabet = "";
  /** The training sequences' ids. */
  sequences: (string | null)[] = [];
  /** @param name - A motif name. @returns The motif with that name, or null (Python `record[name]`). */
  byName(name: string): MemeMotif | null { return this.find((m) => m.name === name) ?? null; }
}

const convertStrand = (strand: string | null): string | null => (strand === "minus" ? "-" : strand === "plus" || strand === "none" ? "+" : null);

/**
 * Read a MEME XML file.
 *
 * @param text - The file contents.
 * @throws ValueError for text that is not XML; TypeError for missing elements or attributes, as Biopython's AttributeError / int(None) do.
 */
export function read(text: string): MemeRecord {
  const record = new MemeRecord();
  let root: Element;
  try { root = parseXml(text); } catch (e) {
    if (e instanceof ParseError) throw new ValueError("Improper MEME XML input file. XML root tag should start with <MEME version= ...");
    throw e;
  }
  record.version = root.attrib.get("version") ?? null;
  record.datafile = attr(find(root, "training_set"), "primary_sequences");
  const commandLine = find(find(root, "model"), "command_line");
  if (commandLine === null) throw new TypeError("'NoneType' object has no attribute 'text'");
  record.command = commandLine.text;
  const training = find(root, "training_set");
  const alphabetTree = find(find(training, "letter_frequencies"), "alphabet_array");
  for (const value of alphabetTree!.children.filter((c) => c.tag === "value")) {
    const id = value.attrib.get("letter_id");
    if (id === undefined) throw new TypeError('can only concatenate str (not "NoneType") to str');
    record.alphabet += id;
  }
  const map = new Map<string | null, string | null>(training!.children.filter((c) => c.tag === "sequence").map((s) => [s.attrib.get("id") ?? null, s.attrib.get("name") ?? null]));
  record.sequences = [...map.keys()];
  for (const motifTree of find(root, "motifs")!.children.filter((c) => c.tag === "motif")) {
    const instances: MemeInstance[] = [];
    for (const siteTree of find(motifTree, "contributing_sites")!.children.filter((c) => c.tag === "contributing_site")) {
      const letters = find(siteTree, "site")!.children.filter((c) => c.tag === "letter_ref").map((l) => l.attrib.get("letter_id") ?? null);
      if (letters.some((l) => l === null)) throw new TypeError("sequence item 0: expected str instance, NoneType found");
      const sequence = letters.join("");
      const instance: MemeInstance = new Seq(sequence);
      instance.motifName = motifTree.attrib.get("name") ?? null;
      instance.sequenceId = siteTree.attrib.get("sequence_id") ?? null;
      if (!map.has(instance.sequenceId)) throw Object.assign(new Error(String(instance.sequenceId)), { name: "KeyError" });
      instance.sequenceName = map.get(instance.sequenceId)!;
      instance.start = intOf(siteTree.attrib.get("position") ?? null) + 1;
      instance.pvalue = floatOf(siteTree.attrib.get("pvalue") ?? null);
      instance.strand = convertStrand(siteTree.attrib.get("strand") ?? null);
      instance.lengthAttr = sequence.length;   // Python's `instance.length` attribute (`length` on a Seq is its size)
      instances.push(instance);
    }
    const motif = new MemeMotif(record.alphabet, new Alignment(instances));
    motif.id = motifTree.attrib.get("id") ?? null;
    motif.name = motifTree.attrib.get("name") ?? null;
    motif.altId = motifTree.attrib.get("alt") ?? null;
    motif.length = intOf(motifTree.attrib.get("width") ?? null);
    motif.numOccurrences = intOf(motifTree.attrib.get("sites") ?? null);
    motif.evalue = floatOf(motifTree.attrib.get("e_value") ?? null);
    record.push(motif);
  }
  return record;
}
