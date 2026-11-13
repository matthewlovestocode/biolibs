/** MEME "minimal" text output (Biopython's `Bio.motifs.minimal`). */

import { ValueError, pyFloat, pyRound } from "@biolibs/core";
import { AssertionError } from "./errors.js";
import { LineReader } from "./lines.js";
import { Motif } from "./motif.js";

/** A motif from a minimal MEME file. */
export class MinimalMotif extends Motif {
  /** Number of sites (`nsites=`, default 20). */
  numOccurrences = 0;
  /** E-value (`E=`, default 0). */
  evalue = 0.0;
}

/** The motifs of a minimal MEME file with the header information. */
export class MinimalRecord extends Array<MinimalMotif> {
  /** MEME version. */
  version = "";
  /** Data file (unused). */
  datafile = "";
  /** Command (unused). */
  command = "";
  /** `ACGT` or `ACGU`. */
  alphabet: string | null = null;
  /** Background frequencies by letter. */
  background = new Map<string, number>();
  /** Sequences (unused). */
  sequences: string[] = [];
  /** @param name - A motif name. @returns The motif with that name, or null (Python `record[name]`). */
  byName(name: string): MinimalMotif | null { return this.find((m) => m.name === name) ?? null; }
}

const unbound = (name: string): Error => Object.assign(new Error(`cannot access local variable '${name}' where it is not associated with a value`), { name: "UnboundLocalError" });
const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

function readVersion(record: MinimalRecord, h: LineReader): void {
  let line: string | undefined;
  for (;;) {
    line = h.next();
    if (line === undefined) throw new ValueError("Improper input file. File should contain a line starting MEME version.");
    if (line.startsWith("MEME version")) break;
  }
  const ls = words(line.trim());
  if (ls[2] === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
  record.version = ls[2];
}

function readAlphabet(record: MinimalRecord, h: LineReader): void {
  let line: string | undefined;
  for (;;) {
    line = h.next();
    if (line === undefined) throw new ValueError("Unexpected end of stream: Expected to find line starting with 'ALPHABET'");
    if (line.startsWith("ALPHABET")) break;
  }
  if (!line.startsWith("ALPHABET= ")) throw new ValueError(`Line does not start with 'ALPHABET':\n${line}`);
  const al = line.trim().replaceAll("ALPHABET= ", "");
  if (al === "ACGT") record.alphabet = "ACGT";
  else if (al === "ACGU") record.alphabet = "ACGU";
  else throw new ValueError("Only parsing of DNA and RNA motifs is implemented");
}

function readBackground(record: MinimalRecord, h: LineReader): void {
  let found = false;
  const freqs: number[] = [];
  for (let line = h.next(); line !== undefined; line = h.next()) {
    if (line.startsWith("Background letter frequencies")) {
      found = true;
      for (let l = h.next(); l !== undefined; l = h.next()) {
        const t = l.replace(/[ \t\n\r\x0b\x0c]+$/, "");
        if (t) t.split(" ").forEach((f, i) => { if (i % 2 === 1) freqs.push(pyFloat(f)); });
        else break;
      }
      if (freqs.length === 0) throw new ValueError("Unexpected end of stream: Expected to find line starting background frequencies.");
      break;
    }
  }
  if (!found) throw new ValueError("Improper input file. File should contain a line starting background frequencies.");
  const bg = new Map<string, number>();
  [...(record.alphabet as string)].forEach((l, i) => { if (i < freqs.length) bg.set(l, freqs[i]!); });
  record.background = bg;
}

function readMotifStatistics(h: LineReader): [number | null, number, number] {
  let line: string | undefined;
  let last: string | undefined;
  for (line = h.next(); line !== undefined; line = h.next()) {
    last = line;
    if (line.startsWith("letter-probability matrix:")) break;
  }
  // Without a match the loop variable keeps the last line read, which is then parsed anyway.
  const used = line ?? last;
  if (used === undefined) throw unbound("line");
  const num = used.includes("nsites=") ? Number.parseInt(words(used.split("nsites=")[1]!)[0]!, 10) : 20;
  const length = used.includes("w=") ? Number.parseInt(words(used.split("w=")[1]!)[0]!, 10) : null;
  const evalue = used.includes("E=") ? pyFloat(words(used.split("E=")[1]!)[0]!) : 0.0;
  return [length, num, evalue];
}

function readLpm(record: MinimalRecord, h: LineReader, length: number | null, numOccurrences: number): Map<string, number[]> {
  const counts: number[][] = [[], [], [], []];
  for (let line = h.next(); line !== undefined; line = h.next()) {
    const freqs = words(line);
    if (freqs.length !== 4) break;
    for (let k = 0; k < 4; k++) counts[k]!.push(pyRound(pyFloat(freqs[k]!) * numOccurrences));
    if (length && counts[0]!.length === length) break;
  }
  return new Map([...(record.alphabet as string)].map((l, i) => [l, counts[i]!]));
}

/**
 * Read a minimal MEME file (DNA or RNA only).
 *
 * @param text - The file contents.
 * @throws ValueError for a missing version, alphabet or background section, or an unsupported alphabet.
 */
export function read(text: string): MinimalRecord {
  const h = new LineReader(text);
  let motifNumber = 0;
  const record = new MinimalRecord();
  readVersion(record, h);
  readAlphabet(record, h);
  readBackground(record, h);
  for (;;) {
    let line: string | undefined;
    for (line = h.next(); line !== undefined; line = h.next()) if (line.startsWith("MOTIF")) break;
    if (line === undefined) return record;
    const name = words(line)[1];
    if (name === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    motifNumber += 1;
    const [length, numOccurrences, evalue] = readMotifStatistics(h);
    const counts = readLpm(record, h, length, numOccurrences);
    const motif = new MinimalMotif(record.alphabet as string, null, counts);
    motif.background = record.background;
    motif.length = motif.counts!.length;
    motif.numOccurrences = numOccurrences;
    motif.evalue = evalue;
    motif.name = name;
    record.push(motif);
    if (record.length !== motifNumber) throw new AssertionError("");
  }
}
