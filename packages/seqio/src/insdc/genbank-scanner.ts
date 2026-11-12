/** `GenBankScanner`: reads GenBank flat files. */

import { KeyError, ValueError, pyInt, pyRepr, pyRstrip, pySplit, pyStrip, warn } from "@biolibs/core";
import type { FeatureConsumer } from "./consumer.js";
import { InsdcScanner, StopIteration, lineIterator } from "./scanner.js";
import { collapseSpaces, rsplitWords } from "./text.js";

const PARSER = "BiopythonParserWarning";
const MAXSIZE = 9223372036854775807n;

/**
 * Scanner for GenBank flat files (`LOCUS`, `DEFINITION`, ..., `FEATURES`, `ORIGIN`, `//`).
 *
 * Handles the several LOCUS-line layouts found in the wild (current, older, truncated, minimal and malformed ones),
 * structured comments, DBLINK, REFERENCE blocks and CONTIG/WGS/TSA/TLS records.
 */
export class GenBankScanner extends InsdcScanner {
  protected readonly recordStart = "LOCUS       ";
  protected readonly headerWidth = 12;
  protected readonly featureStartMarkers = ["FEATURES             Location/Qualifiers", "FEATURES"];
  protected readonly featureEndMarkers: string[] = [];
  protected readonly featureQualifierIndent = 21;
  protected readonly featureQualifierSpacer = " ".repeat(21);
  protected readonly sequenceHeaders = ["CONTIG", "ORIGIN", "BASE COUNT", "WGS", "TSA", "TLS"];
  private readonly genbankIndent = 12;
  private readonly genbankSpacer = " ".repeat(12);
  private readonly structuredCommentStart = "-START##";
  private readonly structuredCommentEnd = "-END##";
  private readonly structuredCommentDelim = " :: ";

  /** Read the sequence section after the feature table; returns `[miscLines, sequence]`. */
  parseFooter(): [string[], string] {
    if (!this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) {
      throw new ValueError(`Footer format unexpected:  '${this.line}'`);
    }
    const miscLines: string[] = [];
    while (
      this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth))) ||
      this.line.slice(0, this.headerWidth) === " ".repeat(this.headerWidth) ||
      this.line.slice(0, 3) === "WGS"
    ) {
      miscLines.push(pyRstrip(this.line));
      this.line = this.handle.readline();
      if (!this.line) throw new ValueError("Premature end of file");
    }
    if (this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) throw new ValueError(`Eh? '${this.line}'`);
    const seqLines: string[] = [];
    let line = this.line;
    while (true) {
      if (!line) {
        warn("Premature end of file in sequence data", PARSER);
        line = "//";
        break;
      }
      line = pyRstrip(line);
      if (!line) {
        warn("Blank line in sequence data", PARSER);
        line = this.handle.readline();
        continue;
      }
      if (line === "//") break;
      if (line.startsWith("CONTIG")) break;
      if (line.length > 9 && line.slice(9, 10) !== " ") {
        warn("Invalid indentation for sequence line", PARSER);
        line = line.slice(1);
        if (line.length > 9 && line.slice(9, 10) !== " ") throw new ValueError(`Sequence line mal-formed, '${line}'`);
      }
      seqLines.push(line.slice(10));
      line = this.handle.readline();
    }
    this.line = line;
    return [miscLines, seqLines.join("").replaceAll(" ", "")];
  }

  /** Give the consumer the LOCUS line's contents, whichever of the known layouts it uses. */
  protected feedFirstLine(consumer: FeatureConsumer, line: string): void {
    const I = this.genbankIndent;
    if (line.slice(0, I) !== "LOCUS       ") throw new ValueError("LOCUS line does not start correctly:\n" + line);
    if ([" bp ", " aa ", " rc "].includes(line.slice(29, 33)) && line.slice(55, 62) === "       ") {
      if (line.slice(41, 42) !== " ") throw new ValueError("LOCUS line does not contain space at position 42:\n" + line);
      if (!["", "linear", "circular"].includes(pyStrip(line.slice(42, 51)))) throw new ValueError("LOCUS line does not contain valid entry (linear, circular, ...):\n" + line);
      if (line.slice(51, 52) !== " ") throw new ValueError("LOCUS line does not contain space at position 52:\n" + line);
      let parseDate = false;
      if (pyStrip(line.slice(62, 73))) {
        parseDate = true;
        if (line.slice(64, 65) !== "-") {
          parseDate = false;
          warn("LOCUS line does not contain - at position 65 in date:\n" + line, PARSER);
        }
        if (line.slice(68, 69) !== "-") {
          parseDate = false;
          warn("LOCUS line does not contain - at position 69 in date:\n" + line, PARSER);
        }
      }
      const nameAndLength = collapseSpaces(line.slice(I, 29)).split(" ");
      if (nameAndLength.length > 2) throw new ValueError("Cannot parse the name and length in the LOCUS line:\n" + line);
      if (nameAndLength.length === 1) throw new ValueError("Name and length collide in the LOCUS line:\n" + line);
      const [name, length] = nameAndLength as [string, string];
      if (name.length > 16) warn("GenBank LOCUS line identifier over 16 characters", PARSER);
      consumer.locus(name);
      consumer.size(length);
      if (pyStrip(line.slice(33, 51)) === "" && line.slice(29, 33) === " aa ") consumer.residueType("PROTEIN");
      else consumer.residueType(pyStrip(line.slice(33, 51)));
      consumer.moleculeType(pyStrip(line.slice(33, 41)));
      consumer.topology(pyStrip(line.slice(42, 51)));
      consumer.dataFileDivision(line.slice(52, 55));
      if (parseDate) consumer.date(line.slice(62, 73));
    } else if ([" bp ", " aa ", " rc "].includes(line.slice(40, 44)) && ["", "linear", "circular"].includes(pyStrip(line.slice(54, 64)))) {
      if (line.length < 79) {
        warn(`Truncated LOCUS line found - is this correct?\n:${pyRepr(line)}`, PARSER);
        line += " ".repeat(79 - line.length);
      }
      if (![" bp ", " aa ", " rc "].includes(line.slice(40, 44))) throw new ValueError("LOCUS line does not contain size units at expected position:\n" + line);
      if (!["   ", "ss-", "ds-", "ms-"].includes(line.slice(44, 47))) {
        const parts = pySplit(line.slice(I));
        if (parts.length >= 2) {
          warn("LOCUS line does not have valid strand type (Single stranded, ...) - falling back to minimal parsing of name and size only:\n" + line, PARSER);
          consumer.locus(parts[0]!);
          consumer.size(parts[1]!);
          return;
        }
        throw new ValueError("LOCUS line does not have valid strand type and minimal fallback parsing failed:\n" + line);
      }
      const seqType = pyStrip(line.slice(47, 54));
      if (!(seqType === "" || seqType.toUpperCase().includes("DNA") || seqType.toUpperCase().includes("RNA"))) {
        throw new ValueError("LOCUS line does not contain valid sequence type (DNA, RNA, ...):\n" + line);
      }
      if (line.slice(54, 55) !== " ") throw new ValueError("LOCUS line does not contain space at position 55:\n" + line);
      if (!["", "linear", "circular"].includes(pyStrip(line.slice(55, 63)))) throw new ValueError("LOCUS line does not contain valid entry (linear, circular, ...):\n" + line);
      if (line.slice(63, 64) !== " ") throw new ValueError("LOCUS line does not contain space at position 64:\n" + line);
      if (line.slice(67, 68) !== " ") throw new ValueError("LOCUS line does not contain space at position 68:\n" + line);
      let parseDate = false;
      if (pyStrip(line.slice(68, 79))) {
        parseDate = true;
        if (line.slice(70, 71) !== "-") {
          parseDate = false;
          warn("LOCUS line does not contain - at position 71 in date:\n" + line, PARSER);
        }
        if (line.slice(74, 75) !== "-") {
          parseDate = false;
          warn("LOCUS line does not contain - at position 75 in date:\n" + line, PARSER);
        }
      }
      const nameAndLength = collapseSpaces(line.slice(I, 40)).split(" ");
      if (nameAndLength.length > 2) throw new ValueError("Cannot parse the name and length in the LOCUS line:\n" + line);
      if (nameAndLength.length === 1) throw new ValueError("Name and length collide in the LOCUS line:\n" + line);
      consumer.locus(nameAndLength[0]!);
      consumer.size(nameAndLength[1]!);
      if (pyStrip(line.slice(44, 54)) === "" && line.slice(40, 44) === " aa ") consumer.residueType(pyStrip("PROTEIN " + line.slice(54, 63)));
      else consumer.residueType(pyStrip(line.slice(44, 63)));
      consumer.moleculeType(pyStrip(line.slice(44, 54)));
      consumer.topology(pyStrip(line.slice(55, 63)));
      if (pyStrip(line.slice(64, 76))) consumer.dataFileDivision(line.slice(64, 67));
      if (parseDate) consumer.date(line.slice(68, 79));
    } else if (!pyStrip(line.slice(I)).includes(" ")) {
      if (pyStrip(line.slice(I)) !== "") consumer.locus(pyStrip(line.slice(I)));
      else warn(`Minimal LOCUS line found - is this correct?\n:${pyRepr(line)}`, PARSER);
    } else if (pySplit(line).length === 8 && ["aa", "bp"].includes(pySplit(line)[3]!) && ["linear", "circular"].includes(pySplit(line)[5]!)) {
      const s = pySplit(line);
      consumer.locus(s[1]!);
      pyInt(s[2]!);
      if (BigInt(s[2]!.replaceAll("_", "").replace(/^\+/, "")) > MAXSIZE) {
        throw new ValueError(`Tried to load a sequence with a length ${s[2]}, your installation of python can only load sesquences of length ${MAXSIZE}`);
      }
      consumer.size(s[2]!);
      consumer.residueType(s[4]!);
      consumer.topology(s[5]!);
      consumer.dataFileDivision(s[6]!);
      consumer.date(s[7]!);
      if (line.length < 80) {
        warn(`Attempting to parse malformed locus line:\n${pyRepr(line)}\nFound locus '${s[1]}' size '${s[2]}' residue_type '${s[4]}'\nSome fields may be wrong.`, PARSER);
      }
    } else if (pySplit(line).length === 7 && ["aa", "bp"].includes(pySplit(line)[3]!)) {
      const s = pySplit(line);
      consumer.locus(s[1]!);
      consumer.size(s[2]!);
      consumer.residueType(s[4]!);
      consumer.dataFileDivision(s[5]!);
      consumer.date(s[6]!);
    } else if (pySplit(line).length >= 4 && ["aa", "bp"].includes(pySplit(line)[3]!)) {
      warn(`Malformed LOCUS line found - is this correct?\n:${pyRepr(line)}`, PARSER);
      consumer.locus(pySplit(line)[1]!);
      consumer.size(pySplit(line)[2]!);
    } else if (pySplit(line).length >= 4 && ["aa", "bp"].includes(pySplit(line).slice(-1)[0]!)) {
      warn(`Malformed LOCUS line found - is this correct?\n:${pyRepr(line)}`, PARSER);
      consumer.locus(pyStrip(rsplitWords(line.slice(5), 2)[0]!));
      consumer.size(pySplit(line).slice(-2)[0]!);
    } else {
      throw new ValueError("Did not recognise the LOCUS line layout:\n" + line);
    }
  }

  /** Feed header lines (DEFINITION, ACCESSION, VERSION, DBLINK, KEYWORDS, SOURCE/ORGANISM, REFERENCE, COMMENT, ...). */
  protected feedHeaderLines(consumer: FeatureConsumer, lines0: string[]): void {
    const I = this.genbankIndent;
    const SPACER = this.genbankSpacer;
    const simple: Record<string, (data: string) => void> = {
      DEFINITION: (d) => consumer.definition(d), ACCESSION: (d) => consumer.accession(d), NID: (d) => consumer.nid(d), PID: (d) => consumer.pid(d),
      DBSOURCE: (d) => consumer.dbSource(d), KEYWORDS: (d) => consumer.keywords(d), SEGMENT: (d) => consumer.segment(d), SOURCE: (d) => consumer.source(d),
      AUTHORS: (d) => consumer.authors(d), CONSRTM: (d) => consumer.consrtm(d), PROJECT: (d) => consumer.project(d), TITLE: (d) => consumer.title(d),
      JOURNAL: (d) => consumer.journal(d), MEDLINE: (d) => consumer.medlineId(d), PUBMED: (d) => consumer.pubmedId(d), REMARK: (d) => consumer.remark(d),
    };
    const lines = lines0.filter((x) => x);
    lines.push("");
    const it = lineIterator(lines);
    try {
      let line = it.next();
      while (true) {
        if (!line) break;
        const lineType = pyStrip(line.slice(0, I));
        let data = pyStrip(line.slice(I));
        if (lineType === "VERSION") {
          data = collapseSpaces(data);
          if (!data.includes(" GI:")) {
            consumer.version(data);
          } else {
            consumer.version(data.split(" GI:")[0]!);
            consumer.gi(data.split(" GI:")[1]!);
          }
          line = it.next();
        } else if (lineType === "DBLINK") {
          line = pyStrip(data);
          while (true) {
            const nextLine = it.next();
            if (nextLine.slice(0, I) === SPACER) {
              if (nextLine.split(":").length - 1 === 0) line += " " + pyStrip(nextLine);
              else {
                consumer.dblink(pyStrip(line));
                line = nextLine;
              }
              continue;
            }
            consumer.dblink(pyStrip(line));
            line = nextLine;
            break;
          }
        } else if (lineType === "REFERENCE") {
          data = pyStrip(data);
          while (true) {
            line = it.next();
            if (line.slice(0, I) === SPACER) data += " " + line.slice(I);
            else break;
          }
          data = collapseSpaces(data);
          if (!data.includes(" ")) {
            consumer.referenceNum(data);
          } else {
            consumer.referenceNum(data.slice(0, data.indexOf(" ")));
            consumer.referenceBases(data.slice(data.indexOf(" ") + 1));
          }
        } else if (lineType === "ORGANISM") {
          let organismData = data;
          let lineageData = "";
          while (true) {
            line = it.next();
            if (line.slice(0, I) === SPACER) {
              const rest = pyStrip(line.slice(I));
              if (lineageData || line.includes(";") || ["Bacteria.", "Archaea.", "Eukaryota.", "Unclassified.", "Viruses.", "cellular organisms.", "other sequences.", "unclassified sequences."].includes(rest)) {
                lineageData += " " + line.slice(I);
              } else if (rest === ".") {
                // a lone full stop: ignore
              } else {
                organismData += " " + rest;
              }
            } else break;
          }
          consumer.organism(organismData);
          consumer.taxonomy(pyStrip(lineageData));
        } else if (lineType === "COMMENT") {
          this.feedComment(consumer, it, line, (l) => (line = l));
        } else if (lineType in simple) {
          while (true) {
            line = it.next();
            if (line.slice(0, I) === SPACER) {
              data += " " + line.slice(I);
            } else {
              if (lineType === "DEFINITION" && data.endsWith(".")) data = data.slice(0, -1);
              simple[lineType]!(data);
              break;
            }
          }
        } else {
          line = it.next();
        }
      }
    } catch (e) {
      if (e instanceof StopIteration) throw new ValueError("Problem in header");
      throw e;
    }
  }

  /** Read a COMMENT block, including structured comments, and hand it to the consumer. `setLine` receives the first line after the block. */
  private feedComment(consumer: FeatureConsumer, it: ReturnType<typeof lineIterator>, firstLine: string, setLine: (l: string) => void): void {
    const I = this.genbankIndent;
    const SPACER = this.genbankSpacer;
    let data = firstLine.slice(I);
    const commentList: string[] = [];
    const structured = new Map<string, Map<string, string>>();
    const startRe = new RegExp(`([^#]+)${this.structuredCommentStart}$`);
    let key: string | null = null;
    const first = startRe.exec(data);
    if (first !== null) key = first[1]!;
    else commentList.push(data);
    let match: RegExpExecArray | null = null;
    const delim = pyStrip(this.structuredCommentDelim);
    while (true) {
      const line = it.next();
      data = line.slice(I);
      if (line.slice(0, I) === SPACER) {
        if (data.includes(this.structuredCommentStart)) {
          const m = startRe.exec(data);
          if (m !== null) key = m[1]!;
          else commentList.push(data);
        } else if (key !== null && data.includes(delim)) {
          match = /(.+?)\s*::\s*(.*)/.exec(data);
          if (!structured.has(key)) structured.set(key, new Map());
          structured.get(key)!.set(match![1]!, match![2]!);
        } else if (key !== null && !data.includes(this.structuredCommentEnd)) {
          if (!structured.has(key)) {
            warn(`Structured comment not parsed on malformed header line: ${line}`, PARSER);
            continue;
          }
          if (match === null) throw new Error("UnboundLocalError: cannot access local variable 'match' where it is not associated with a value");
          const previous = structured.get(key)!.get(match[1]!);
          if (previous === undefined) throw new KeyError(match[1]!);
          structured.get(key)!.set(match[1]!, previous + " " + pyStrip(line));
        } else if (data.includes(this.structuredCommentEnd)) {
          key = null;
        } else {
          commentList.push(data);
        }
      } else {
        setLine(line);
        break;
      }
    }
    if (commentList.length) consumer.comment(commentList);
    if (structured.size) consumer.structuredComment(structured);
  }

  /** Feed the lines between the features and the sequence (BASE COUNT, ORIGIN, TLS/TSA/WGS, CONTIG). */
  protected feedMiscLines(consumer: FeatureConsumer, lines0: string[]): void {
    const I = this.genbankIndent;
    const lines = [...lines0, ""];
    const it = lineIterator(lines);
    try {
      for (let line of it) {
        if (line.startsWith("BASE COUNT")) {
          line = pyStrip(line.slice(10));
          if (line) consumer.baseCount(line);
        }
        if (line.startsWith("ORIGIN")) {
          line = pyStrip(line.slice(6));
          if (line) consumer.originName(line);
        }
        if (line.startsWith("TLS ")) {
          line = pyStrip(line.slice(3));
          consumer.tls(line);
        }
        if (line.startsWith("TSA ")) {
          line = pyStrip(line.slice(3));
          consumer.tsa(line);
        }
        if (line.startsWith("WGS ")) {
          line = pyStrip(line.slice(3));
          consumer.wgs(line);
        }
        if (line.startsWith("WGS_SCAFLD")) {
          line = pyStrip(line.slice(10));
          consumer.addWgsScafld(line);
        }
        if (line.startsWith("CONTIG")) {
          line = pyStrip(line.slice(6));
          let contigLocation = line;
          while (true) {
            line = it.next();
            if (!line) break;
            if (line.slice(0, I) === this.genbankSpacer) contigLocation += pyRstrip(line.slice(I));
            else if (line.startsWith("ORIGIN")) {
              line = pyStrip(line.slice(6));
              if (line) consumer.originName(line);
              break;
            } else throw new ValueError("Expected CONTIG continuation line, got:\n" + line);
          }
          consumer.contigLocation(contigLocation);
        }
      }
    } catch (e) {
      if (e instanceof StopIteration) throw new ValueError("Problem in misc lines before sequence");
      throw e;
    }
  }
}

