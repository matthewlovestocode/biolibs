/** `EmblScanner` and `ImgtScanner`: readers for EMBL flat files and their IMGT/HLA variant. */

import { AssertionError, IndexError, ValueError, pyRepr, pyRstrip, pySplit, pyStrip, warn } from "@biolibs/core";
import type { FeatureConsumer } from "./consumer.js";
import { InsdcScanner, StopIteration, lineIterator, type FeatureTuple } from "./scanner.js";
import { isDigit, rsplitLast, splitFirst } from "./text.js";

const PARSER = "BiopythonParserWarning";

/** Python `str.count(sub)` for non-empty `sub`. */
const count = (s: string, sub: string) => s.split(sub).length - 1;

/** Python `str.rstrip(chars)`. */
const rstripChars = (s: string, chars: string) => {
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1]!)) end--;
  return s.slice(0, end);
};

/**
 * Scanner for EMBL flat files (`ID`, `AC`, `DE`, `FH`/`FT` feature table, `SQ`, `//`).
 *
 * Understands the current ID-line layout (with `SV` version, topology, molecule type, data class, division, length)
 * and the older and patent layouts.
 */
export class EmblScanner extends InsdcScanner {
  protected readonly recordStart: string = "ID   ";
  protected readonly headerWidth: number = 5;
  protected readonly featureStartMarkers: string[] = ["FH   Key             Location/Qualifiers", "FH"];
  protected readonly featureEndMarkers: string[] = ["XX"];
  protected readonly featureQualifierIndent: number = 21;
  protected readonly featureQualifierSpacer: string = "FT" + " ".repeat(19);
  protected readonly sequenceHeaders: string[] = ["SQ", "CO"];
  private readonly emblIndent = 5;

  /** Read the sequence section; returns the `SQ`/`CO` lines and the sequence with coordinates and spaces removed. */
  parseFooter(): [string[], string] {
    if (!this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) {
      throw new ValueError(`Footer format unexpected: '${this.line}'`);
    }
    const miscLines: string[] = [];
    while (this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) {
      miscLines.push(this.line);
      this.line = this.handle.readline();
      if (!this.line) throw new ValueError("Premature end of file");
      this.line = pyRstrip(this.line);
    }
    if (!(this.line.slice(0, this.headerWidth) === " ".repeat(this.headerWidth) || pyStrip(this.line) === "//")) {
      throw new ValueError(`Unexpected content after SQ or CO line: ${pyRepr(this.line)}`);
    }
    const seqLines: string[] = [];
    let line = this.line;
    while (true) {
      if (!line) throw new ValueError("Premature end of file in sequence data");
      line = pyStrip(line);
      if (!line) throw new ValueError("Blank line in sequence data");
      if (line === "//") break;
      if (this.line.slice(0, this.headerWidth) !== " ".repeat(this.headerWidth)) {
        throw new ValueError("Problem with characters in header line,  or incorrect header width: " + this.line);
      }
      // Sequence lines end with a running base count.
      const parts = rsplitLast(line);
      if (parts.length === 2 && isDigit(parts[1]!)) {
        seqLines.push(parts[0]!);
      } else if (isDigit(line)) {
        // a line holding only a count
      } else {
        warn("EMBL sequence line missing coordinates", PARSER);
        seqLines.push(line);
      }
      line = this.handle.readline();
    }
    this.line = line;
    return [miscLines, seqLines.join("").replaceAll(" ", "")];
  }

  /** Dispatch on the ID line layout. @throws {@link ValueError} if it matches none. */
  protected feedFirstLine(consumer: FeatureConsumer, line: string): void {
    if (pyRstrip(line.slice(0, this.headerWidth)) !== "ID") throw new AssertionError();
    const semicolons = count(line.slice(this.headerWidth), ";");
    if (semicolons === 6) this.feedFirstLineNew(consumer, line);
    else if (semicolons === 3) {
      if (pyRstrip(line).endsWith(" SQ")) this.feedFirstLinePatents(consumer, line);
      else this.feedFirstLineOld(consumer, line);
    } else if (semicolons === 2) this.feedFirstLinePatentsKipo(consumer, line);
    else throw new ValueError("Did not recognise the ID line layout:\n" + line);
  }

  private feedFirstLinePatents(consumer: FeatureConsumer, line: string): void {
    const fields = pyStrip(line.slice(this.headerWidth)).slice(0, -3).split(";").map(pyStrip);
    if (fields.length !== 4) throw new AssertionError();
    consumer.locus(fields[0]!);
    consumer.residueType(fields[1]!);
    consumer.dataFileDivision(fields[2]!);
  }

  private feedFirstLinePatentsKipo(consumer: FeatureConsumer, line: string): void {
    if (pyRstrip(line.slice(0, this.headerWidth)) !== "ID") throw new AssertionError();
    const split = splitFirst(line.slice(this.headerWidth));
    const fields = [split[0]!];
    if (split.length < 2) throw new IndexError("list index out of range");
    fields.push(...split[1]!.split(";"));
    consumer.locus(pyStrip(fields[0]!));
    this.feedSeqLength(consumer, pyStrip(fields[3] ?? (() => { throw new IndexError("list index out of range"); })()));
  }

  private feedFirstLineOld(consumer: FeatureConsumer, line: string): void {
    if (pyRstrip(line.slice(0, this.headerWidth)) !== "ID") throw new AssertionError();
    const split = splitFirst(line.slice(this.headerWidth));
    if (split.length < 2) throw new IndexError("list index out of range");
    const fields = [split[0]!, ...split[1]!.split(";")].map(pyStrip);
    const at = (i: number) => {
      if (i >= fields.length) throw new IndexError("list index out of range");
      return fields[i]!;
    };
    consumer.locus(at(0));
    consumer.residueType(at(2));
    if (at(2).includes("circular")) {
      consumer.topology("circular");
      consumer.moleculeType(pyStrip(at(2).replaceAll("circular", "")));
    } else if (at(2).includes("linear")) {
      consumer.topology("linear");
      consumer.moleculeType(pyStrip(at(2).replaceAll("linear", "")));
    } else {
      consumer.moleculeType(pyStrip(at(2)));
    }
    consumer.dataFileDivision(at(3));
    this.feedSeqLength(consumer, at(4));
  }

  private feedFirstLineNew(consumer: FeatureConsumer, line: string): void {
    if (pyRstrip(line.slice(0, this.headerWidth)) !== "ID") throw new AssertionError();
    const fields = pyStrip(line.slice(this.headerWidth)).split(";").map(pyStrip);
    if (fields.length !== 7) throw new AssertionError();
    consumer.locus(fields[0]!);
    consumer.accession(fields[0]!);
    const versionParts = pySplit(fields[1]!);
    if (versionParts.length === 2 && versionParts[0] === "SV" && isDigit(versionParts[1]!)) consumer.versionSuffix(versionParts[1]!);
    consumer.residueType(fields.slice(2, 4).join(" "));
    consumer.topology(fields[2]!);
    consumer.moleculeType(fields[3]!);
    consumer.dataFileDivision(fields[5]!);
    this.feedSeqLength(consumer, fields[6]!);
  }

  /** Parse text like `4639675 BP.` and give the length to the consumer. */
  protected feedSeqLength(consumer: FeatureConsumer, text: string): void {
    const lengthParts = pySplit(text);
    if (lengthParts.length !== 2) throw new AssertionError(`Invalid sequence length string ${pyRepr(text)}`);
    if (!["BP", "BP.", "AA", "AA."].includes(lengthParts[1]!.toUpperCase())) throw new AssertionError();
    consumer.size(lengthParts[0]!);
  }

  /** Feed `AC`, `SV`, `DE`, `RN`, `RP`, `RT`, `RX`, `RA`, `RG`, `RL`, `OS`, `OC`, `CC`, `DR`, `PR` and `KW` lines. */
  protected feedHeaderLines(consumer: FeatureConsumer, lines: string[]): void {
    const simple: Record<string, (d: string) => void> = {
      AC: (d) => consumer.accession(d), SV: (d) => consumer.version(d), DE: (d) => consumer.definition(d), RG: (d) => consumer.consrtm(d),
      RL: (d) => consumer.journal(d), OS: (d) => consumer.organism(d), OC: (d) => consumer.taxonomy(d), CC: (d) => consumer.comment([d]),
    };
    for (const line of lines) {
      const lineType = pyStrip(line.slice(0, this.emblIndent));
      let data = pyStrip(line.slice(this.emblIndent));
      if (lineType === "XX") {
        // separator
      } else if (lineType === "RN") {
        if (data === "") throw new IndexError("string index out of range");
        if (data[0] === "[" && data.slice(-1) === "]") data = data.slice(1, -1);
        consumer.referenceNum(data);
      } else if (lineType === "RP") {
        if (pyStrip(data) !== "[-]") {
          const parts = data.split(",").filter((b) => pyStrip(b)).map((b) => pyStrip(b.replaceAll("-", " to ")));
          consumer.referenceBases(`(bases ${parts.join("; ")})`);
        }
      } else if (lineType === "RT") {
        if (data.startsWith('"')) data = data.slice(1);
        if (data.endsWith('";')) data = data.slice(0, -2);
        consumer.title(data);
      } else if (lineType === "RX") {
        const i = data.indexOf(";");
        if (i === -1) throw new ValueError("not enough values to unpack (expected 2, got 1)");
        const key = data.slice(0, i);
        let value = data.slice(i + 1);
        if (value.endsWith(".")) value = value.slice(0, -1);
        value = pyStrip(value);
        if (key === "PUBMED") consumer.pubmedId(value);
      } else if (lineType === "CC") {
        consumer.comment([data]);
      } else if (lineType === "DR") {
        const parts = rstripChars(data, ".").split(";");
        if (parts.length === 1) warn("Malformed DR line in EMBL file.", PARSER);
        else consumer.dblink(`${pyStrip(parts[0]!)}:${pyStrip(parts[1]!)}`);
      } else if (lineType === "RA") {
        consumer.authors(rstripChars(data, ";"));
      } else if (lineType === "PR") {
        if (data.startsWith("Project:")) consumer.project(rstripChars(data, ";"));
      } else if (lineType === "KW") {
        consumer.keywords(rstripChars(data, ";"));
      } else if (lineType in simple) {
        simple[lineType]!(data);
      }
    }
  }

  /** Feed `CO` (contig) and `SQ Sequence` lines. */
  protected feedMiscLines(consumer: FeatureConsumer, lines0: string[]): void {
    const it = lineIterator([...lines0, ""]);
    try {
      for (let line of it) {
        if (line.startsWith("CO   ")) {
          line = pyStrip(line.slice(5));
          let contigLocation = line;
          while (true) {
            line = it.next();
            if (!line) break;
            if (line.startsWith("CO   ")) contigLocation += pyStrip(line.slice(5));
            else throw new ValueError("Expected CO (contig) continuation line, got:\n" + line);
          }
          consumer.contigLocation(contigLocation);
        }
        if (line.startsWith("SQ   Sequence ")) {
          this.feedSeqLength(consumer, rstripChars(pyRstrip(line.slice(14)), ";").split(";")[0]!);
        }
      }
    } catch (e) {
      if (e instanceof StopIteration) throw new ValueError("Problem in misc lines before sequence");
      throw e;
    }
  }
}

/** Scanner for IMGT/HLA files: EMBL-style, with an extra ID-line layout and a lenient feature table. */
export class ImgtScanner extends EmblScanner {
  protected readonly featureStartMarkers: string[] = [
    "FH   Key             Location/Qualifiers",
    "FH   Key             Location/Qualifiers (from EMBL)",
    "FH   Key                 Location/Qualifiers",
    "FH",
  ];

  protected feedFirstLine(consumer: FeatureConsumer, line: string): void {
    if (pyRstrip(line.slice(0, this.headerWidth)) !== "ID") throw new AssertionError();
    if (count(line.slice(this.headerWidth), ";") !== 5) {
      super.feedFirstLine(consumer, line);
      return;
    }
    const fields = pyStrip(line.slice(this.headerWidth)).split(";").map(pyStrip);
    if (fields.length !== 6) throw new AssertionError();
    consumer.locus(fields[0]!);
    const versionParts = pySplit(fields[1]!);
    if (versionParts.length === 2 && versionParts[0] === "SV" && isDigit(versionParts[1]!)) consumer.versionSuffix(versionParts[1]!);
    consumer.residueType(fields[3]!);
    if (fields[3]!.includes("circular")) {
      consumer.topology("circular");
      consumer.moleculeType(pyStrip(fields[3]!.replaceAll("circular", "")));
    } else if (fields[3]!.includes("linear")) {
      consumer.topology("linear");
      consumer.moleculeType(pyStrip(fields[3]!.replaceAll("linear", "")));
    } else {
      consumer.moleculeType(pyStrip(fields[3]!));
    }
    consumer.dataFileDivision(fields[4]!);
    this.feedSeqLength(consumer, fields[5]!);
  }

  parseFeatures(skip = false): FeatureTuple[] {
    if (!this.featureStartMarkers.includes(pyRstrip(this.line))) return [];
    while (this.featureStartMarkers.includes(pyRstrip(this.line))) this.line = this.handle.readline();
    const features: FeatureTuple[] = [];
    let line = this.line;
    const indent = this.featureQualifierIndent;
    while (true) {
      if (!line) throw new ValueError("Premature end of line during features table");
      if (this.sequenceHeaders.includes(pyRstrip(line.slice(0, this.headerWidth)))) break;
      line = pyRstrip(line);
      if (line === "//") throw new ValueError("Premature end of features table, marker '//' found");
      if (this.featureEndMarkers.includes(line)) {
        line = this.handle.readline();
        break;
      }
      if (pyStrip(line.slice(2, indent)) === "") {
        line = this.handle.readline();
        continue;
      }
      if (skip) {
        line = this.handle.readline();
        while (line.slice(0, indent) === this.featureQualifierSpacer) line = this.handle.readline();
      } else {
        if (line.slice(0, 2) !== "FT") throw new AssertionError();
        let featureKey: string;
        let locationStart: string;
        const words = pySplit(pyStrip(line.slice(2)));
        if (words.length === 2) {
          [featureKey, locationStart] = words as [string, string];
        } else {
          featureKey = pyStrip(line.slice(2, 25));
          locationStart = pyStrip(line.slice(25));
        }
        const featureLines = [locationStart];
        line = this.handle.readline();
        while (line.slice(0, indent) === this.featureQualifierSpacer || pyRstrip(line) === "") {
          if (line.slice(0, 2) !== "FT") throw new AssertionError();
          featureLines.push(pyStrip(line.slice(indent)));
          line = this.handle.readline();
        }
        const [key, location0, qualifiers] = this.parseFeature(featureKey, featureLines);
        let location = location0;
        if (location.includes(">")) location = location.replace(/([0-9]+)>/g, ">$1");
        features.push([key, location, qualifiers]);
      }
    }
    this.line = line;
    return features;
  }
}
