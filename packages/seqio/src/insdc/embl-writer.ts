/** `EmblWriter` and `ImgtWriter`: write EMBL (and IMGT/HLA) flat files. */

import { AssertionError, ValueError, pyRepr, warn } from "@biolibs/core";
import { UndefinedSequenceError } from "@biolibs/seq";
import { Reference, type SimpleLocation } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { getSeqString } from "../interfaces.js";
import { isDigit } from "./text.js";
import { InsdcWriter } from "./writer-base.js";

const DIVISIONS = ["PHG", "ENV", "FUN", "HUM", "INV", "MAM", "VRT", "MUS", "PLN", "PRO", "ROD", "SYN", "TGN", "UNC", "VRL", "XXX"];

/** Python `str.rjust` / `str.ljust`. */
const rjust = (s: string, n: number) => s.padStart(n, " ");
const ljust = (s: string, n: number) => s.padEnd(n, " ");

/** Number of occurrences of a one-character string. */
const countChar = (s: string, c: string) => s.split(c).length - 1;

/**
 * Writes records as EMBL flat files (`ID`, `AC`, `DE`, `KW`, `OS`/`OC`, `RN`..., `FH`/`FT`, `SQ`, `//`).
 *
 * Needs `molecule_type` in the annotations. The `ID` line includes the version (`SV n`) taken from the record id.
 */
export class EmblWriter extends InsdcWriter {
  protected readonly HEADER_WIDTH: number = 5;
  protected readonly QUALIFIER_INDENT: number = 21;
  protected readonly QUALIFIER_INDENT_STR: string = "FT" + " ".repeat(19);
  protected readonly QUALIFIER_INDENT_TMP: string = "FT   %s                ";
  /** The `FH` lines that open the feature table. */
  protected readonly FEATURE_HEADER: string = "FH   Key             Location/Qualifiers\nFH\n";
  private readonly LETTERS_PER_BLOCK = 10;
  private readonly BLOCKS_PER_LINE = 6;
  private readonly LETTERS_PER_LINE = 60;
  private readonly POSITION_PADDING = 10;

  /** Write the `CO` (contig) lines. */
  protected writeContig(record: SeqRecord): void {
    for (const text of this.splitContig(record, this.MAX_WIDTH - this.HEADER_WIDTH)) this.writeSingleLine("CO", text);
  }

  /** Write `SQ` (with base counts for DNA) and the sequence in blocks of ten with a running position. */
  protected writeSequence(record: SeqRecord): void {
    const handle = this.handle;
    let data: string;
    try {
      data = getSeqString(record);
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
      if (record.annotations.has("contig")) this.writeContig(record);
      else handle.write("SQ   \n");
      return;
    }
    data = data.toLowerCase();
    const seqLen = data.length;
    const molType = record.annotations.get("molecule_type") as string | undefined;
    if (molType !== undefined && molType !== null && molType.includes("DNA")) {
      const a = countChar(data, "A") + countChar(data, "a");
      const c = countChar(data, "C") + countChar(data, "c");
      const g = countChar(data, "G") + countChar(data, "g");
      const t = countChar(data, "T") + countChar(data, "t");
      const other = seqLen - (a + c + g + t);
      handle.write(`SQ   Sequence ${seqLen} BP; ${a} A; ${c} C; ${g} G; ${t} T; ${other} other;\n`);
    } else {
      handle.write("SQ   \n");
    }
    const perLine = this.LETTERS_PER_LINE;
    for (let lineNumber = 0; lineNumber < Math.floor(seqLen / perLine); lineNumber++) {
      handle.write("    ");
      for (let block = 0; block < this.BLOCKS_PER_LINE; block++) {
        const index = perLine * lineNumber + this.LETTERS_PER_BLOCK * block;
        handle.write(` ${data.slice(index, index + this.LETTERS_PER_BLOCK)}`);
      }
      handle.write(rjust(String((lineNumber + 1) * perLine), this.POSITION_PADDING));
      handle.write("\n");
    }
    if (seqLen % perLine) {
      const lineNumber = Math.floor(seqLen / perLine);
      handle.write("    ");
      for (let block = 0; block < this.BLOCKS_PER_LINE; block++) {
        const index = perLine * lineNumber + this.LETTERS_PER_BLOCK * block;
        handle.write(ljust(` ${data.slice(index, index + this.LETTERS_PER_BLOCK)}`, 11));
      }
      handle.write(rjust(String(seqLen), this.POSITION_PADDING));
      handle.write("\n");
    }
  }

  /** One `TAG   text` line. */
  protected writeSingleLine(tag: string, text: string): void {
    if (tag.length !== 2) throw new AssertionError();
    const line = `${tag}   ${text}`;
    if (text.length > this.MAX_WIDTH) warn(`Line ${pyRepr(line)} too long`);
    this.handle.write(line + "\n");
  }

  /** Text wrapped over several `TAG   text` lines. */
  protected writeMultiLine(tag: string, text: string): void {
    for (const line of InsdcWriter.splitMultiLine(text, this.MAX_WIDTH - this.HEADER_WIDTH)) this.writeSingleLine(tag, line);
  }

  /** Write the `ID` and `AC` lines (each followed by `XX`). */
  protected writeTheFirstLines(record: SeqRecord): void {
    const id = record.id as string;
    let version: string;
    let accession: string;
    const dot = id.lastIndexOf(".");
    if (dot !== -1 && isDigit(id.slice(dot + 1))) {
      version = "SV " + id.slice(dot + 1);
      accession = InsdcWriter.getAnnotationStr(record, "accession", id.slice(0, dot), true) as string;
    } else {
      version = "";
      accession = InsdcWriter.getAnnotationStr(record, "accession", id, true) as string;
    }
    if (accession.includes(";")) throw new ValueError(`Cannot have semi-colon in EMBL accession, '${accession}'`);
    if (accession.includes(" ")) throw new ValueError(`Cannot have spaces in EMBL accession, '${accession}'`);
    const topology = InsdcWriter.getAnnotationStr(record, "topology", "") as string;
    let molType = record.annotations.has("molecule_type") ? (record.annotations.get("molecule_type") as string) : null;
    if (molType === null) throw new ValueError("missing molecule_type in annotations");
    if (!["DNA", "genomic DNA", "unassigned DNA", "mRNA", "RNA", "protein"].includes(molType)) warn(`Non-standard molecule type: ${molType}`);
    const upper = molType.toUpperCase();
    let units: string;
    if (upper.includes("DNA")) units = "BP";
    else if (upper.includes("RNA")) units = "BP";
    else if (upper.includes("PROTEIN")) {
      molType = "PROTEIN";
      units = "AA";
    } else throw new ValueError(`failed to understand molecule_type '${molType}'`);
    const division = EmblWriter.getDataDivision(record);
    this.writeSingleLine("ID", `${accession}; ${version}; ${topology}; ${molType}; ; ${division}; ${record.length} ${units}.`);
    this.handle.write("XX\n");
    this.writeSingleLine("AC", accession + ";");
    this.handle.write("XX\n");
  }

  /** The 3-letter division, mapping GenBank names (`BCT`, `UNK`) to EMBL ones, defaulting to `UNC`. */
  protected static getDataDivision(record: SeqRecord): string {
    let division = record.annotations.has("data_file_division") ? (record.annotations.get("data_file_division") as string) : "UNC";
    if (!DIVISIONS.includes(division)) {
      const gbkToEmbl: Record<string, string> = { BCT: "PRO", UNK: "UNC" };
      division = gbkToEmbl[division] ?? "UNC";
    }
    if (division.length !== 3) throw new AssertionError();
    return division;
  }

  /** Write the `KW` lines. */
  protected writeKeywords(record: SeqRecord): void {
    for (const keyword of record.annotations.get("keywords") as string[]) this.writeSingleLine("KW", keyword);
    this.handle.write("XX\n");
  }

  /** Write the `RN`/`RP`/`RX`/`RG`/`RA`/`RT`/`RL` blocks. */
  protected writeReferences(record: SeqRecord): void {
    let number = 0;
    for (const ref of record.annotations.get("references") as unknown[]) {
      if (!(ref instanceof Reference)) continue;
      number += 1;
      this.writeSingleLine("RN", `[${number}]`);
      if (ref.location.length === 1) {
        const loc = ref.location[0] as SimpleLocation;
        this.writeSingleLine("RP", `${loc.start.valueOf() + 1}-${loc.end.valueOf()}`);
      }
      if (ref.pubmedId) this.writeSingleLine("RX", `PUBMED; ${ref.pubmedId}.`);
      if (ref.consrtm) this.writeSingleLine("RG", `${ref.consrtm}`);
      if (ref.authors) this.writeMultiLine("RA", ref.authors + ";");
      if (ref.title) this.writeMultiLine("RT", `"${ref.title}";`);
      if (ref.journal) this.writeMultiLine("RL", ref.journal);
      this.handle.write("XX\n");
    }
  }

  /** Write the `CC` comment lines. */
  protected writeComment(record: SeqRecord): void {
    const comment = record.annotations.get("comment");
    let lines: string[];
    if (typeof comment === "string") lines = comment.split("\n");
    else if (Array.isArray(comment)) lines = comment;
    else throw new ValueError("Could not understand comment annotation");
    if (lines.length === 0) return;
    for (const line of lines) this.writeMultiLine("CC", line);
    this.handle.write("XX\n");
  }

  writeRecord(record: SeqRecord): void {
    const handle = this.handle;
    this.writeTheFirstLines(record);
    for (const xref of [...record.dbxrefs].sort()) {
      if (xref.startsWith("BioProject:")) {
        this.writeSingleLine("PR", xref.slice(3) + ";");
        handle.write("XX\n");
        break;
      }
      if (xref.startsWith("Project:")) {
        this.writeSingleLine("PR", xref + ";");
        handle.write("XX\n");
        break;
      }
    }
    let descr = record.description;
    if (descr === "<unknown description>") descr = ".";
    this.writeMultiLine("DE", descr);
    handle.write("XX\n");
    if (record.annotations.has("keywords")) this.writeKeywords(record);
    this.writeMultiLine("OS", InsdcWriter.getAnnotationStr(record, "organism") as string);
    const taxonomy = record.annotations.has("taxonomy") ? (record.annotations.get("taxonomy") as string[]).join("; ") + "." : ".";
    this.writeMultiLine("OC", taxonomy);
    handle.write("XX\n");
    if (record.annotations.has("references")) this.writeReferences(record);
    if (record.annotations.has("comment")) this.writeComment(record);
    handle.write(this.FEATURE_HEADER);
    const recLength = record.length;
    for (const feature of record.features) this.writeFeature(feature, recLength);
    handle.write("XX\n");
    this.writeSequence(record);
    handle.write("//\n");
  }
}

/** Writes IMGT/HLA files: EMBL with wider feature columns. */
export class ImgtWriter extends EmblWriter {
  protected readonly HEADER_WIDTH: number = 5;
  protected readonly QUALIFIER_INDENT: number = 25;
  protected readonly QUALIFIER_INDENT_STR: string = "FT" + " ".repeat(23);
  protected readonly QUALIFIER_INDENT_TMP: string = "FT   %s                    ";
  protected readonly FEATURE_HEADER: string = "FH   Key                 Location/Qualifiers\nFH\n";
}
