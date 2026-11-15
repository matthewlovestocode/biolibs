/** `GenBankWriter`: writes GenBank flat files. */

import { AssertionError, IndexError, ValueError, pyInt, pyRepr, pyStrip, warn } from "@biolibs/core";
import { UndefinedSequenceError } from "@biolibs/seq";
import { Reference, type SimpleLocation } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { getSeqString } from "../interfaces.js";
import { InsdcWriter } from "./writer-base.js";
import { isDigit } from "./text.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DIVISIONS = ["PRI", "ROD", "MAM", "VRT", "INV", "PLN", "BCT", "VRL", "PHG", "SYN", "UNA", "EST", "PAT", "STS", "GSS", "HTG", "HTC", "ENV", "CON", "TSA"];

/** Whether y-m-d is a real calendar date (Python's `datetime(y, m, d)` would accept it). */
function validDate(y: number, m: number, d: number): boolean {
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  return d <= days;
}

/** Python `'%s' % x` for the fixed-width fields: pad on the right. */
const ljust = (s: string, n: number) => s.padEnd(n, " ");
/** Python `str.rjust`. */
const rjust = (s: string, n: number) => s.padStart(n, " ");

/**
 * Writes records as GenBank flat files (`LOCUS`, `DEFINITION`, ..., `FEATURES`, `ORIGIN`, `//`).
 *
 * Needs `molecule_type` in the record's annotations. Warns when values do not fit the format's fixed-width fields.
 */
export class GenBankWriter extends InsdcWriter {
  protected readonly HEADER_WIDTH: number = 12;
  private readonly STRUCTURED_COMMENT_START = "-START##";
  private readonly STRUCTURED_COMMENT_END = "-END##";
  private readonly STRUCTURED_COMMENT_DELIM = " :: ";
  private readonly LETTERS_PER_LINE = 60;
  private readonly SEQUENCE_INDENT = 9;

  /** One `TAG text` line, with the tag padded to the header width. Warns if the text is too long. */
  protected writeSingleLine(tag: string, text: string): void {
    if (!(tag.length < this.HEADER_WIDTH)) throw new AssertionError();
    if (text.length > this.MAX_WIDTH - this.HEADER_WIDTH) {
      if (tag) warn(`Annotation ${pyRepr(text)} too long for ${pyRepr(tag)} line`);
      else warn(`Annotation ${pyRepr(text)} too long`);
    }
    this.handle.write(`${ljust(tag, this.HEADER_WIDTH)}${text.replaceAll("\n", " ")}\n`);
  }

  /** Text wrapped over several lines, the tag only on the first. */
  protected writeMultiLine(tag: string, text: string): void {
    const lines = InsdcWriter.splitMultiLine(text, this.MAX_WIDTH - this.HEADER_WIDTH);
    this.writeSingleLine(tag, lines[0]!);
    for (const line of lines.slice(1)) this.writeSingleLine("", line);
  }

  /** Several entries, the tag only on the first line. */
  protected writeMultiEntries(tag: string, textList: string[]): void {
    textList.forEach((text, i) => this.writeSingleLine(i === 0 ? tag : "", text));
  }

  /** The record's date as `DD-MON-YYYY`, or `01-JAN-1980` when absent or invalid (with a warning). */
  protected static getDate(record: SeqRecord): string {
    const fallback = "01-JAN-1980";
    if (!record.annotations.has("date")) return fallback;
    let date = record.annotations.get("date");
    if (Array.isArray(date) && date.length === 1) date = date[0];
    if (date instanceof Date) date = `${String(date.getUTCDate()).padStart(2, "0")}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
    if (typeof date !== "string" || date.length !== 11) {
      warn(`Invalid date format provided ${pyRepr(record.annotations.get("date"))}, using default ${pyRepr(fallback)}`);
      return fallback;
    }
    try {
      const month = MONTHS.indexOf(date.slice(3, 6));
      if (month === -1) throw new ValueError("not in list");
      if (!validDate(pyInt(date.slice(-4)), month + 1, pyInt(date.slice(0, 2)))) throw new ValueError("invalid date");
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      warn(`Invalid date provided ${pyRepr(record.annotations.get("date"))}, using default ${pyRepr(fallback)}`);
      date = fallback;
    }
    return date as string;
  }

  /** The 3-letter data file division, mapping EMBL names (`PRO`, `HUM`, ...) to GenBank ones, defaulting to `UNK`. */
  protected static getDataDivision(record: SeqRecord): string {
    let division = record.annotations.has("data_file_division") ? (record.annotations.get("data_file_division") as string) : "UNK";
    if (!DIVISIONS.includes(division)) {
      const emblToGbk: Record<string, string> = { FUN: "PLN", HUM: "PRI", MUS: "ROD", PRO: "BCT", UNC: "UNK", XXX: "UNK" };
      division = emblToGbk[division] ?? "UNK";
    }
    if (division.length !== 3) throw new AssertionError();
    return division;
  }

  /** The topology padded to 8 characters (`linear  `, `circular`), or 8 spaces. */
  protected getTopology(record: SeqRecord): string {
    const maxLen = "circular".length;
    const topology = InsdcWriter.getAnnotationStr(record, "topology", "") as string;
    return topology && topology.length <= maxLen ? ljust(topology, maxLen) : " ".repeat(maxLen);
  }

  /** Write the `LOCUS` line, checking that it ends up in the standard columns. */
  protected writeTheFirstLine(record: SeqRecord): void {
    let locus: string = record.name;
    if (!locus || locus === "<unknown name>") locus = record.id as string;
    if (!locus || locus === "<unknown id>") locus = InsdcWriter.getAnnotationStr(record, "accession", ".", true) as string;
    const length = record.length;
    if (locus.length > 16 && locus.length + 1 + String(length).length > 28) {
      warn("Increasing length of locus line to allow long name. This will result in fields that are not in usual positions.");
    }
    if (locus.split(/\s+/).filter(Boolean).length > 1) throw new ValueError(`Invalid whitespace in ${pyRepr(locus)} for LOCUS line`);
    if (length > 99999999999) {
      warn("The sequence length is very long. The LOCUS line will be increased in length to compensate. This may cause unexpected behavior.");
    }
    let molType = InsdcWriter.getAnnotationStr(record, "molecule_type", null);
    if (molType === null) throw new ValueError("missing molecule_type in annotations");
    if (molType && molType.length > 7) {
      molType = molType.replaceAll("unassigned ", "").replaceAll("genomic ", "");
      if (molType.length > 7) {
        warn(`Molecule type ${pyRepr(molType)} too long`);
        molType = "DNA";
      }
    }
    if (molType === "protein" || molType === "PROTEIN") molType = "";
    const units = molType === "" ? "aa" : "bp";
    const topology = this.getTopology(record);
    const division = GenBankWriter.getDataDivision(record);
    let nameLength: string;
    if (locus.length > 16 && String(length).length > 11 - (locus.length - 16)) {
      nameLength = `${locus} ${length}`;
    } else {
      nameLength = rjust(String(length), 28);
      nameLength = locus + nameLength.slice(locus.length);
      if (nameLength.length !== 28) throw new AssertionError(nameLength);
      if (!nameLength.includes(" ")) throw new AssertionError(nameLength);
    }
    const line = `LOCUS       ${nameLength} ${units}    ${ljust(molType, 7)} ${topology} ${division} ${GenBankWriter.getDate(record)}\n`;
    if (line.length > 80) {
      const split = line.split(/\s+/).filter(Boolean);
      if (!["bp", "aa"].includes(split[3]!)) throw new ValueError("LOCUS line does not contain size units at expected position:\n" + line);
      if (!(pyStrip(split[3]!) === "aa" || pyStrip(split[4]!).toUpperCase().includes("DNA") || pyStrip(split[4]!).toUpperCase().includes("RNA"))) {
        throw new ValueError("LOCUS line does not contain valid sequence type (DNA, RNA, ...):\n" + line);
      }
      this.handle.write(line);
      return;
    }
    if (line.length !== 80) throw new AssertionError(pyRepr(line));
    const fields = line.slice(12, 40).split(/\s+/).filter(Boolean);
    if (fields.length !== 2 || fields[0] !== locus || fields[1] !== String(length)) throw new AssertionError(line);
    if (![" bp ", " aa "].includes(line.slice(40, 44))) throw new ValueError("LOCUS line does not contain size units at expected position:\n" + line);
    if (!["   ", "ss-", "ds-", "ms-"].includes(line.slice(44, 47))) throw new ValueError("LOCUS line does not have valid strand type (Single stranded, ...):\n" + line);
    const seqType = pyStrip(line.slice(47, 54));
    if (!(seqType === "" || seqType.toUpperCase().includes("DNA") || seqType.toUpperCase().includes("RNA"))) {
      throw new ValueError("LOCUS line does not contain valid sequence type (DNA, RNA, ...):\n" + line);
    }
    if (line.slice(54, 55) !== " ") throw new ValueError("LOCUS line does not contain space at position 55:\n" + line);
    if (!["", "linear", "circular"].includes(pyStrip(line.slice(55, 63)))) throw new ValueError("LOCUS line does not contain valid entry (linear, circular, ...):\n" + line);
    if (line.slice(63, 64) !== " ") throw new ValueError("LOCUS line does not contain space at position 64:\n" + line);
    if (line.slice(67, 68) !== " ") throw new ValueError("LOCUS line does not contain space at position 68:\n" + line);
    if (line.slice(70, 71) !== "-") throw new ValueError("LOCUS line does not contain - at position 71 in date:\n" + line);
    if (line.slice(74, 75) !== "-") throw new ValueError("LOCUS line does not contain - at position 75 in date:\n" + line);
    this.handle.write(line);
  }

  /** Write the `REFERENCE` blocks (non-`Reference` items are skipped). */
  protected writeReferences(record: SeqRecord): void {
    let number = 0;
    for (const ref of record.annotations.get("references") as unknown[]) {
      if (!(ref instanceof Reference)) continue;
      number += 1;
      let data = String(number);
      if (ref.location.length === 1) {
        const molType = record.annotations.get("molecule_type") as string | undefined;
        const units = molType && molType.includes("protein") ? "residues" : "bases";
        const loc = ref.location[0] as SimpleLocation;
        data += `  (${units} ${loc.start.valueOf() + 1} to ${loc.end.valueOf()})`;
      }
      this.writeSingleLine("REFERENCE", data);
      if (ref.authors) this.writeMultiLine("  AUTHORS", ref.authors);
      if (ref.consrtm) this.writeMultiLine("  CONSRTM", ref.consrtm);
      if (ref.title) this.writeMultiLine("  TITLE", ref.title);
      if (ref.journal) this.writeMultiLine("  JOURNAL", ref.journal);
      if (ref.medlineId) this.writeMultiLine("  MEDLINE", ref.medlineId);
      if (ref.pubmedId) this.writeMultiLine("   PUBMED", ref.pubmedId);
      if (ref.comment) this.writeMultiLine("  REMARK", ref.comment);
    }
  }

  /** Write the `COMMENT`, including structured comments. */
  protected writeComment(record: SeqRecord): void {
    const lines: string[] = [];
    if (record.annotations.has("structured_comment")) {
      const comment = record.annotations.get("structured_comment") as Map<string, Map<string, string>>;
      let padding = 0;
      for (const data of comment.values()) for (const subkey of data.keys()) padding = subkey.length > padding ? subkey.length : padding;
      for (const [key, data] of comment) {
        lines.push(`##${key}${this.STRUCTURED_COMMENT_START}`);
        for (const [subkey, subdata] of data) lines.push(`${subkey}${" ".repeat(padding - subkey.length)}${this.STRUCTURED_COMMENT_DELIM}${subdata}`);
        lines.push(`##${key}${this.STRUCTURED_COMMENT_END}`);
      }
    }
    if (record.annotations.has("comment")) {
      const comment = record.annotations.get("comment");
      if (typeof comment === "string") lines.push(...comment.split("\n"));
      else if (Array.isArray(comment)) lines.push(...comment);
      else throw new ValueError("Could not understand comment annotation");
    }
    if (lines.length === 0) throw new IndexError("list index out of range");
    this.writeMultiLine("COMMENT", lines[0]!);
    for (const line of lines.slice(1)) this.writeMultiLine("", line);
  }

  /** Write the `CONTIG` line(s) of a record whose sequence is undefined. */
  protected writeContig(record: SeqRecord): void {
    const lines = this.splitContig(record, this.MAX_WIDTH - this.HEADER_WIDTH);
    this.writeSingleLine("CONTIG", lines[0]!);
    for (const text of lines.slice(1)) this.writeSingleLine("", text);
  }

  /** Write `ORIGIN` and the numbered sequence lines (lower case, blocks of ten, 60 per line). */
  protected writeSequence(record: SeqRecord): void {
    let data: string;
    try {
      data = getSeqString(record);
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
      if (record.annotations.has("contig")) this.writeContig(record);
      else this.handle.write("ORIGIN\n");
      return;
    }
    data = data.toLowerCase();
    const seqLen = data.length;
    this.handle.write("ORIGIN\n");
    for (let lineNumber = 0; lineNumber < seqLen; lineNumber += this.LETTERS_PER_LINE) {
      this.handle.write(rjust(String(lineNumber + 1), this.SEQUENCE_INDENT));
      for (let words = lineNumber; words < Math.min(lineNumber + this.LETTERS_PER_LINE, seqLen); words += 10) {
        this.handle.write(` ${data.slice(words, words + 10)}`);
      }
      this.handle.write("\n");
    }
  }

  writeRecord(record: SeqRecord): void {
    const handle = this.handle;
    this.writeTheFirstLine(record);
    let defaultAccession = record.id as string;
    if (defaultAccession.split(".").length - 1 === 1 && isDigit(defaultAccession.slice(defaultAccession.indexOf(".") + 1))) {
      defaultAccession = (record.id as string).split(".")[0]!;
    }
    const accession = InsdcWriter.getAnnotationStr(record, "accession", defaultAccession, true) as string;
    let accWithVersion = accession;
    if ((record.id as string).startsWith(accession + ".")) {
      try {
        accWithVersion = `${accession}.${pyInt((record.id as string).split(".").slice(1).join("."))}`;
      } catch (e) {
        if (!(e instanceof ValueError)) throw e;
      }
    }
    const gi = InsdcWriter.getAnnotationStr(record, "gi", ".", true) as string;
    let descr = record.description;
    if (descr === "<unknown description>") descr = "";
    descr += ".";
    this.writeMultiLine("DEFINITION", descr);
    this.writeSingleLine("ACCESSION", accession);
    this.writeSingleLine("VERSION", gi !== "." ? `${accWithVersion}  GI:${gi}` : accWithVersion);
    this.writeMultiEntries("DBLINK", record.dbxrefs.map((x) => (x.includes(": ") ? x : x.replaceAll(":", ": "))));
    let keywords: string;
    if (record.annotations.has("keywords")) {
      keywords = pyJoin("; ", record.annotations.get("keywords"));
      if (!keywords.endsWith(".")) keywords += ".";
    } else keywords = ".";
    this.writeMultiLine("KEYWORDS", keywords);
    if (record.annotations.has("segment")) {
      let segment = record.annotations.get("segment");
      if (Array.isArray(segment)) {
        if (segment.length !== 1) throw new AssertionError(pyRepr(segment));
        segment = segment[0];
      }
      this.writeSingleLine("SEGMENT", segment as string);
    }
    this.writeMultiLine("SOURCE", InsdcWriter.getAnnotationStr(record, "source") as string);
    let org = InsdcWriter.getAnnotationStr(record, "organism") as string;
    if (org.length > this.MAX_WIDTH - this.HEADER_WIDTH) org = org.slice(0, this.MAX_WIDTH - this.HEADER_WIDTH - 4) + "...";
    this.writeSingleLine("  ORGANISM", org);
    let taxonomy: string;
    if (record.annotations.has("taxonomy")) {
      taxonomy = pyJoin("; ", record.annotations.get("taxonomy"));
      if (!taxonomy.endsWith(".")) taxonomy += ".";
    } else taxonomy = ".";
    this.writeMultiLine("", taxonomy);
    if (record.annotations.has("db_source")) {
      let dbSource = record.annotations.get("db_source");
      if (Array.isArray(dbSource)) dbSource = dbSource[0];
      this.writeSingleLine("DBSOURCE", dbSource as string);
    }
    if (record.annotations.has("references")) this.writeReferences(record);
    if (record.annotations.has("comment") || record.annotations.has("structured_comment")) this.writeComment(record);
    handle.write("FEATURES             Location/Qualifiers\n");
    const recLength = record.length;
    for (const feature of record.features) this.writeFeature(feature, recLength);
    this.writeSequence(record);
    handle.write("//\n");
  }
}

/**
 * Python's `separator.join(value)`.
 *
 * An annotation that should hold a list of words sometimes holds one string instead — pydna, for one,
 * turns every annotation into text as it builds a record. Python joins a string by its characters
 * rather than refusing it, and the file it writes shows that; this does the same.
 *
 * @param separator - What to put between the parts. @param value - The list, or a string.
 * @returns The parts joined.
 */
function pyJoin(separator: string, value: unknown): string {
  if (typeof value === "string") return [...value].join(separator);
  return (value as string[]).join(separator);
}
