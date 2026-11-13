/** AlignACE output (Biopython's `Bio.motifs.alignace`). */

import { Alignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { pyFloat, pyInt } from "@biolibs/core";
import { AssertionError, PythonException } from "./errors.js";
import { splitLines } from "./lines.js";
import { Motif } from "./motif.js";

/** A motif found by AlignACE, with its score and number. */
export class AlignAceMotif extends Motif {
  /** The MAP score. */
  score = 0;
  /** The motif number. */
  number = 0;
}

/** The motifs of an AlignACE file, with the version, command line, parameters and input sequence names. */
export class AlignAceRecord extends Array<AlignAceMotif> {
  /** The program's parameters (null before a `Parameter` line). */
  parameters: Record<string, string> | null = null;
  /** First line. */
  version = "";
  /** Second line. */
  command = "";
  /** The names of the input sequences (set by an `Input` line). */
  sequences?: string[];
}

class StopIteration extends Error {
  override name = "StopIteration";
}

/**
 * Read AlignACE output.
 *
 * @param text - The file contents.
 * @throws StopIteration for a file with fewer than two lines; ValueError for an unrecognised line; AssertionError / TypeError for out-of-order content, as Biopython.
 */
export function read(text: string): AlignAceRecord {
  const lines = splitLines(text);
  let pos = 0;
  const next = (): string => { if (pos >= lines.length) throw new StopIteration(""); return lines[pos++]!; };
  const record = new AlignAceRecord();
  record.version = next().trim();
  record.command = next().trim();
  let mask: string | null = null;
  let number: number | null = null;
  let instances: Seq[] | undefined;
  while (pos < lines.length) {
    const line = lines[pos++]!.trim();
    if (line === "") { /* skip */ }
    else if (line.slice(0, 4) === "Para") record.parameters = {};
    else if (line[0] === "#") {
      const seqName = line.split("\t")[1];
      if (seqName === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
      if (record.sequences === undefined) throw new TypeError("'AlignAceRecord' object has no attribute 'sequences'");
      record.sequences.push(seqName);
    } else if (line.includes("=")) {
      const parts = line.split("=");
      if (parts.length !== 2) throw new PythonException(parts.length > 2 ? "too many values to unpack (expected 2, got " + parts.length + ")" : "");
      if (record.parameters === null) throw new TypeError("'NoneType' object does not support item assignment");
      record.parameters[parts[0]!.trim()] = parts[1]!.trim();
    } else if (line.slice(0, 5) === "Input") record.sequences = [];
    else if (line.slice(0, 5) === "Motif") {
      const words = line.split(/\s+/).filter(Boolean);
      if (words[0] !== "Motif") throw new AssertionError("");
      if (words[1] === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
      number = pyInt(words[1]);
      instances = [];
    } else if (line.slice(0, 3) === "MAP") {
      if (instances === undefined) throw Object.assign(new Error("cannot access local variable 'instances' where it is not associated with a value"), { name: "UnboundLocalError" });
      const motif = new AlignAceMotif("ACGT", new Alignment(instances));
      const words = line.split(/\s+/).filter(Boolean);
      motif.score = pyFloat(words[words.length - 1]!);
      motif.number = number as number;
      motif.mask = mask;
      record.push(motif);
    } else if (line.split("\t").length === 4) {
      if (instances === undefined) throw Object.assign(new Error("cannot access local variable 'instances' where it is not associated with a value"), { name: "UnboundLocalError" });
      instances.push(new Seq(line.split("\t")[0]!));
    } else if (line.includes("*")) mask = line.replace(/^[\r\n]+|[\r\n]+$/g, "");
    else throw Object.assign(new Error(line), { name: "ValueError" });
  }
  return record;
}
