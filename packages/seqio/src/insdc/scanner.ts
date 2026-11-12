/**
 * `InsdcScanner`: the line-oriented scanner shared by the GenBank, EMBL and IMGT readers.
 *
 * A scanner reads one record at a time from a shared {@link LineStream}: it finds the start of a record, collects
 * the header lines, the feature table and the sequence footer, and feeds them to a consumer. Subclasses supply the
 * format-specific constants and the parsing of the first line, header lines and footer.
 */

import { AssertionError, ValueError, pyRepr, pyRstrip, pyStrip, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { LineStream } from "../handles.js";
import { FeatureValueCleaner } from "./cleaner.js";
import { FeatureConsumer } from "./consumer.js";
import { charAt, splitFirst, unpackTwo } from "./text.js";

const PARSER = "BiopythonParserWarning";

/** One parsed feature: its key, raw location text and qualifiers (`value` is null for a flag such as `/pseudo`). */
export type FeatureTuple = [key: string, location: string, qualifiers: [string, string | null][]];

/** Signals the end of a line iterator inside `parseFeature` (Python's `StopIteration`). */
class StopIteration extends Error {}

/** A plain forward iterator over strings with Python's `next()` behaviour. */
class Lines {
  private i = 0;
  constructor(private readonly items: string[]) {}
  next(): string {
    if (this.i >= this.items.length) throw new StopIteration();
    return this.items[this.i++]!;
  }
  [Symbol.iterator](): Iterator<string> {
    return { next: () => (this.i >= this.items.length ? { done: true, value: undefined } : { done: false, value: this.items[this.i++]! }) };
  }
}

/** Build a line iterator that drops empty strings and supports `next()` (shared by `parseFeature` and the header feeders). */
export function lineIterator(lines: string[]): Lines {
  return new Lines(lines);
}

/** The error raised when a line iterator runs out mid-parse. */
export { StopIteration };

/** Base class of the format scanners. */
export abstract class InsdcScanner {
  /** Text a record's first line starts with. */
  protected abstract readonly recordStart: string;
  /** Width of the header-keyword column. */
  protected abstract readonly headerWidth: number;
  /** Lines that open the feature table. */
  protected abstract readonly featureStartMarkers: string[];
  /** Lines that close the feature table (empty for GenBank). */
  protected abstract readonly featureEndMarkers: string[];
  /** Column at which a feature's location/qualifiers begin. */
  protected abstract readonly featureQualifierIndent: number;
  /** The prefix of qualifier continuation lines. */
  protected abstract readonly featureQualifierSpacer: string;
  /** Keywords that start the sequence section. */
  protected abstract readonly sequenceHeaders: string[];

  /** The input being read. */
  protected handle!: LineStream;
  /** The current (look-ahead) line. */
  protected line = "";

  /** @param debug - Unused diagnostic level, kept for signature parity. */
  constructor(protected readonly debug = 0) {}

  /** Start reading from a stream. */
  setHandle(handle: LineStream): void {
    this.handle = handle;
    this.line = "";
  }

  /** Skip to the first line of the next record. Returns it, or null at the end of the input. */
  findStart(): string | null {
    let line: string;
    while (true) {
      if (this.line) {
        line = this.line;
        this.line = "";
      } else {
        line = this.handle.readline();
      }
      if (!line) return null;
      if (line.slice(0, this.headerWidth) === this.recordStart) break;
    }
    this.line = line;
    return line;
  }

  /** Read the header lines up to the feature table or sequence section. @throws {@link ValueError} on premature end. */
  parseHeader(): string[] {
    if (this.line.slice(0, this.headerWidth) !== this.recordStart) throw new ValueError("Not at start of record");
    const headerLines: string[] = [];
    let line: string;
    while (true) {
      line = this.handle.readline();
      if (!line) throw new ValueError("Premature end of line during sequence data");
      line = pyRstrip(line);
      if (this.featureStartMarkers.includes(line)) break;
      if (this.sequenceHeaders.includes(pyRstrip(line.slice(0, this.headerWidth)))) break;
      if (line === "//") throw new ValueError("Premature end of sequence data marker '//' found");
      headerLines.push(line);
    }
    this.line = line;
    return headerLines;
  }

  /**
   * Read the feature table.
   *
   * @param skip - If true, read past the table without parsing it.
   * @returns The features as `[key, location, qualifiers]` tuples.
   */
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
      if (line.length < indent) {
        warn(`line too short to contain a feature: ${pyRepr(line)}`, PARSER);
        line = this.handle.readline();
        continue;
      }
      if (skip) {
        line = this.handle.readline();
        while (line.slice(0, indent) === this.featureQualifierSpacer) line = this.handle.readline();
      } else {
        let featureKey: string;
        let featureLines: string[];
        if (charAt(line, indent) !== " " && line.slice(indent).includes(" ")) {
          // The location starts too far left, so the key and location share the first line.
          const [key, rest] = unpackTwo(splitFirst(pyStrip(line.slice(2))));
          featureKey = key;
          featureLines = [rest];
          warn(`Over indented ${featureKey} feature?`, PARSER);
        } else {
          featureKey = pyStrip(line.slice(2, indent));
          featureLines = [line.slice(indent)];
        }
        line = this.handle.readline();
        while (line.slice(0, indent) === this.featureQualifierSpacer || (line !== "" && pyRstrip(line) === "")) {
          featureLines.push(pyStrip(line.slice(indent)));
          line = this.handle.readline();
        }
        features.push(this.parseFeature(featureKey, featureLines));
      }
    }
    this.line = line;
    return features;
  }

  /**
   * Parse one feature from its key and lines (location first, then qualifiers).
   *
   * @throws {@link ValueError} ("Problem with 'KEY' feature") if the lines are malformed.
   */
  parseFeature(featureKey: string, lines: string[]): FeatureTuple {
    const iterator = lineIterator(lines.filter((x) => x));
    try {
      let line = iterator.next();
      let featureLocation = pyStrip(line);
      while (featureLocation.slice(-1) === ",") {
        line = iterator.next();
        featureLocation += pyStrip(line);
      }
      const count = (s: string, c: string) => s.split(c).length - 1;
      if (count(featureLocation, "(") > count(featureLocation, ")")) {
        warn("Non-standard feature line wrapping (didn't break on comma)?", PARSER);
        while (featureLocation.slice(-1) === "," || count(featureLocation, "(") > count(featureLocation, ")")) {
          line = iterator.next();
          featureLocation += pyStrip(line);
        }
      }
      const qualifiers: [string, string | null][] = [];
      let lineNumber = 0;
      let key = "";
      for (const l of iterator) {
        if (lineNumber === 0 && l.startsWith(")")) {
          featureLocation += pyStrip(l);
        } else if (l[0] === "/") {
          const i = l.indexOf("=");
          key = l.slice(1, i);
          let value = l.slice(i + 1);
          if (i && value.startsWith(" ") && value.trimStart().startsWith('"')) {
            warn("White space after equals in qualifier", PARSER);
            value = value.trimStart();
          }
          if (i === -1) {
            key = l.slice(1);
            qualifiers.push([key, null]);
          } else if (!value) {
            qualifiers.push([key, ""]);
          } else if (value === '"') {
            qualifiers.push([key, value]);
          } else if (value[0] === '"') {
            const valueList = [value];
            while (valueList[valueList.length - 1]!.slice(-1) !== '"') valueList.push(iterator.next());
            qualifiers.push([key, valueList.join("\n")]);
          } else {
            qualifiers.push([key, value]);
          }
        } else {
          // A continuation line of the previous qualifier.
          if (qualifiers.length === 0) throw new AssertionError();
          if (key !== qualifiers[qualifiers.length - 1]![0]) throw new AssertionError();
          if (qualifiers[qualifiers.length - 1]![1] === null) throw new StopIteration();
          qualifiers[qualifiers.length - 1] = [key, qualifiers[qualifiers.length - 1]![1] + "\n" + l];
        }
        lineNumber += 1;
      }
      return [featureKey, featureLocation, qualifiers];
    } catch (e) {
      if (e instanceof StopIteration) throw new ValueError(`Problem with '${featureKey}' feature:\n${lines.join("\n")}`);
      throw e;
    }
  }

  /** Read the sequence footer. Overridden by each format; the base version just skips to `//`. */
  parseFooter(): [string[], string] {
    if (this.featureEndMarkers.includes(this.line)) {
      while (!this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) {
        this.line = this.handle.readline();
        if (!this.line) throw new ValueError("Premature end of file");
        this.line = pyRstrip(this.line);
      }
    }
    if (!this.sequenceHeaders.includes(pyRstrip(this.line.slice(0, this.headerWidth)))) throw new ValueError("Not at start of sequence");
    let line: string;
    while (true) {
      line = this.handle.readline();
      if (!line) throw new ValueError("Premature end of line during sequence data");
      line = pyRstrip(line);
      if (line === "//") break;
    }
    this.line = line;
    return [[], ""];
  }

  /** Give the consumer the information on the record's first line. */
  protected abstract feedFirstLine(consumer: FeatureConsumer, line: string): void;
  /** Give the consumer the header lines. */
  protected abstract feedHeaderLines(consumer: FeatureConsumer, lines: string[]): void;
  /** Give the consumer the lines between the feature table and the sequence. */
  protected abstract feedMiscLines(consumer: FeatureConsumer, lines: string[]): void;

  /** Hand a parsed feature table to the consumer. */
  protected static feedFeatureTable(consumer: FeatureConsumer, featureTuples: FeatureTuple[]): void {
    consumer.startFeatureTable();
    for (const [featureKey, locationString, qualifiers] of featureTuples) {
      consumer.featureKey(featureKey);
      consumer.location(locationString);
      for (const [qKey, qValue] of qualifiers) {
        consumer.featureQualifier(qKey, qValue === null ? null : qValue.replaceAll("\n", " "));
      }
    }
  }

  /** Read one record into a consumer. Returns false at the end of the input. */
  feed(handle: LineStream, consumer: FeatureConsumer, doFeatures = true): boolean {
    this.setHandle(handle);
    if (!this.findStart()) {
      consumer.data = null;
      return false;
    }
    this.feedFirstLine(consumer, this.line);
    this.feedHeaderLines(consumer, this.parseHeader());
    if (doFeatures) InsdcScanner.feedFeatureTable(consumer, this.parseFeatures(false));
    else this.parseFeatures(true);
    const [miscLines, sequenceString] = this.parseFooter();
    this.feedMiscLines(consumer, miscLines);
    consumer.sequence(sequenceString);
    consumer.recordEnd("//");
    if (this.line !== "//") throw new AssertionError();
    return true;
  }

  /** Read one complete record, or null at the end of the input. */
  parse(handle: LineStream, doFeatures = true): SeqRecord | null {
    const consumer = new FeatureConsumer(true, new FeatureValueCleaner());
    return this.feed(handle, consumer, doFeatures) ? consumer.data : null;
  }

  /**
   * Iterate over every record in a stream.
   *
   * @throws {@link ValueError} if a record has no id, name or description.
   */
  *parseRecords(handle: LineStream, doFeatures = true): Generator<SeqRecord> {
    while (true) {
      const record = this.parse(handle, doFeatures);
      if (record === null) break;
      if (record.id === null) throw new ValueError("Failed to parse the record's ID. Invalid ID line?");
      if (record.name === "<unknown name>") throw new ValueError("Failed to parse the record's name. Invalid ID line?");
      if (record.description === "<unknown description>") throw new ValueError("Failed to parse the record's description");
      yield record;
    }
  }

  /**
   * Iterate over the CDS features of each record as protein records (`genbank-cds` / `embl-cds`).
   *
   * @param alphabet - Not supported.
   * @param tags2id - Qualifiers used for the id, name and description.
   */
  *parseCdsFeatures(handle: LineStream, alphabet: null | undefined = null, tags2id: [string, string, string] = ["protein_id", "locus_tag", "product"]): Generator<SeqRecord> {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    this.setHandle(handle);
    while (this.findStart()) {
      this.parseHeader();
      const featureTuples = this.parseFeatures();
      let line: string;
      while (true) {
        line = this.handle.readline();
        if (!line) break;
        if (line.slice(0, 2) === "//") break;
      }
      this.line = pyRstrip(line);
      for (const [key, locationString, qualifiers] of featureTuples) {
        if (key !== "CDS") continue;
        const record = new SeqRecord(null);
        const annotations = record.annotations;
        annotations.set("molecule_type", "protein");
        annotations.set("raw_location", locationString.replaceAll(" ", ""));
        for (const [qualifierName, data0] of qualifiers) {
          let qualifierData = data0;
          if (qualifierData !== null && qualifierData[0] === '"' && qualifierData.slice(-1) === '"') qualifierData = qualifierData.slice(1, -1);
          if (qualifierName === "translation") {
            if (record.seq !== null) throw new AssertionError("Multiple translations!");
            record.seq = new Seq(qualifierData!.replaceAll("\n", ""));
          } else if (qualifierName === "db_xref") {
            record.dbxrefs.push(qualifierData as string);
          } else {
            if (qualifierData !== null) qualifierData = qualifierData.replaceAll("\n", " ").replaceAll("  ", " ");
            if (annotations.has(qualifierName)) annotations.set(qualifierName, `${annotations.get(qualifierName)} ${qualifierData}`);
            else annotations.set(qualifierName, qualifierData);
          }
        }
        if (annotations.has(tags2id[0])) record.id = annotations.get(tags2id[0]) as string;
        if (annotations.has(tags2id[1])) record.name = annotations.get(tags2id[1]) as string;
        if (annotations.has(tags2id[2])) record.description = annotations.get(tags2id[2]) as string;
        yield record;
      }
    }
  }
}

