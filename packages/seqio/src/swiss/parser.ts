/** The SwissProt entry parser (Biopython's `Bio.SwissProt._read`, `parse` and `read`). */

import { AssertionError, ValueError, pyInt, pyRepr, pyRstrip, pySplit, pyStrip } from "@biolibs/core";
import { type LineStream, openText } from "../handles.js";
import { readCc, readDr, readDt, readGn, readId, readKw, readOh, readOx, readPe, readRc, readRn, readRx } from "./fields.js";
import { readFt } from "./features.js";
import { SwissProtParserError, SwissProtRecord, SwissProtReference } from "./records.js";
import { rstripChars } from "./text.js";

/** The last reference of a record, or the `AssertionError` Biopython raises (`"RP: missing RN"`) when none has started. */
function lastReference(record: SwissProtRecord, key: string): SwissProtReference {
  if (record.references.length === 0) throw new AssertionError(`${key}: missing RN`);
  return record.references[record.references.length - 1]!;
}

/** Join a finished reference's collected lines into the strings users see. */
function finishReference(reference: SwissProtReference): void {
  reference.authors = rstripChars((reference.authors as string[]).join(" "), ";");
  const parts = reference.title as string[];
  let title = "";
  if (parts.length > 0) {
    title = parts[0]!;
    for (const fragment of parts.slice(1)) {
      if (!title.endsWith("-")) title += " ";
      title += fragment;
    }
    title = rstripChars(title, ";");
    // A title wrapped in quotes loses them (a lone quote becomes "").
    if (title.startsWith('"') && title.endsWith('"')) title = title.slice(1, -1);
  }
  reference.title = title;
  reference.location = (reference.location as string[]).join(" ");
}

/**
 * Read one entry from an open stream, up to and including its `//` line.
 *
 * @returns The entry, or null when the stream is exhausted.
 * @throws {@link SwissProtParserError} for a bad first line or an unknown line code.
 * @throws {@link ValueError} when the stream ends inside an entry.
 */
export function readEntry(handle: LineStream): SwissProtRecord | null {
  const first = handle.readline();
  if (first === "") return null;
  if (first.slice(0, 2) !== "ID") throw new SwissProtParserError("Failed to find ID in first line", first);
  const record = new SwissProtRecord();
  readId(record, first);
  const sequenceLines: string[] = [];
  // Text of an RC line that must be glued to the start of the next line.
  let unread: string | undefined = "";
  for (const line of handle) {
    const key = line.slice(0, 2);
    let value = pyRstrip(line.slice(5));
    if (unread) {
      value = unread + " " + value;
      unread = "";
    }
    if (key === "AC") record.accessions.push(...rstripChars(value, ";").split("; "));
    else if (key === "DT") readDt(record, line);
    else if (key === "DE") (record.description as string[]).push(pyStrip(value));
    else if (key === "GN") {
      if (value === "and") record.geneName.push("");
      else {
        if (record.geneName.length === 0) record.geneName.push("");
        record.geneName[record.geneName.length - 1] += value + " ";
      }
    } else if (key === "OS") (record.organism as string[]).push(value);
    else if (key === "OG") record.organelle += line.slice(5);
    else if (key === "OC") record.organismClassification.push(...rstripChars(value, ";.").split("; "));
    else if (key === "OX") readOx(record, line);
    else if (key === "OH") readOh(record, line);
    else if (key === "RN") {
      const reference = new SwissProtReference();
      readRn(reference, value);
      record.references.push(reference);
    } else if (key === "RP") lastReference(record, "RP").positions.push(value);
    else if (key === "RC") unread = readRc(lastReference(record, "RC"), value);
    else if (key === "RX") readRx(lastReference(record, "RX"), value);
    else if (key === "RL") (lastReference(record, "RL").location as string[]).push(value);
    else if (key === "RA") (lastReference(record, "RA").authors as string[]).push(value);
    else if (key === "RG") (lastReference(record, "RG").authors as string[]).push(value);
    else if (key === "RT") (lastReference(record, "RT").title as string[]).push(value);
    else if (key === "CC") readCc(record, line);
    else if (key === "DR") readDr(record, value);
    else if (key === "PE") readPe(record, value);
    else if (key === "KW") readKw(record, value);
    else if (key === "FT") readFt(record, line);
    else if (key === "SQ") {
      const cols = pySplit(value);
      if (cols.length !== 7) throw new AssertionError(`I don't understand SQ line ${line}`);
      record.seqinfo = [pyInt(cols[1]!), pyInt(cols[3]!), cols[5]!];
    } else if (key === "  ") sequenceLines.push(pyRstrip(value.replaceAll(" ", "")));
    else if (key === "//") {
      readGn(record);
      record.description = (record.description as string[]).join(" ");
      record.organism = (record.organism as string[]).join(" ");
      record.organelle = pyRstrip(record.organelle);
      for (const reference of record.references) finishReference(reference);
      record.sequence = sequenceLines.join("");
      return record;
    } else if (key === "**") {
      // Comment line from the SwissProt maintainers: ignored.
    } else {
      throw new SwissProtParserError(`Unknown keyword ${pyRepr(key)} found`, line);
    }
  }
  throw new ValueError("Unexpected end of stream.");
}

/**
 * Iterate over the entries of a SwissProt file.
 *
 * @param source - The file's text (or a `LineStream`).
 * @example
 * ```ts
 * for (const entry of parse(text)) console.log(entry.accessions[0]);
 * ```
 */
export function* parse(source: unknown): Generator<SwissProtRecord> {
  const handle = openText(source, "SwissProt");
  for (;;) {
    const record = readEntry(handle);
    if (record === null) return;
    yield record;
  }
}

/**
 * Read a file holding exactly one SwissProt entry.
 *
 * @throws {@link ValueError} if there is no entry, or any text follows the first.
 */
export function read(source: unknown): SwissProtRecord {
  const handle = openText(source, "SwissProt");
  const record = readEntry(handle);
  if (record === null) throw new ValueError("No SwissProt record found");
  if (handle.readline() !== "") throw new ValueError("More than one SwissProt record found");
  return record;
}
