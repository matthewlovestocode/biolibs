/** Parsers for the single-purpose SwissProt line types (everything except `FT`). */

import { AssertionError, IndexError, pyInt, pyRepr, pyRstrip, pySplit, pyLstrip, pyStrip, warn } from "@biolibs/core";
import { splitFirst, unpackTwo } from "../insdc/text.js";
import { SwissProtParserError, type GeneName, type SwissProtRecord, type SwissProtReference } from "./records.js";
import { rstripChars, rsplitOnce, splitOnce } from "./text.js";

/** Python `str.isdigit()` for ASCII digits. */
const isDigits = (s: string): boolean => /^[0-9]+$/.test(s);

/** Parse the `ID` line into entry name, data class, molecule type and length. */
export function readId(record: SwissProtRecord, line: string): void {
  const cols = pySplit(line.slice(5));
  if (cols.length === 5) {
    record.entryName = cols[0]!;
    record.dataClass = rstripChars(cols[1]!, ";");
    record.moleculeType = rstripChars(cols[2]!, ";");
    record.sequenceLength = pyInt(cols[3]!);
  } else if (cols.length === 4) {
    record.entryName = cols[0]!;
    record.dataClass = rstripChars(cols[1]!, ";");
    record.moleculeType = null;
    record.sequenceLength = pyInt(cols[2]!);
  } else {
    throw new SwissProtParserError("ID line has unrecognised format", line);
  }
  const allowed = ["STANDARD", "PRELIMINARY", "IPI", "Reviewed", "Unreviewed"];
  if (!allowed.includes(record.dataClass)) throw new SwissProtParserError(`Unrecognized data class ${pyRepr(record.dataClass)}`, line);
  if (record.moleculeType !== null && record.moleculeType !== "PRT") throw new SwissProtParserError(`Unrecognized molecule type ${pyRepr(record.moleculeType)}`, line);
}

/** Parse a `DT` line (old "Rel." style and new "version" style) into created / update tuples. */
export function readDt(record: SwissProtRecord, line: string): void {
  const value = line.slice(5);
  const upr = value.toUpperCase();
  const cols = pySplit(pyRstrip(value));
  if (upr.includes("CREATED") || upr.includes("LAST SEQUENCE UPDATE") || upr.includes("LAST ANNOTATION UPDATE")) {
    const uprcols = pySplit(upr);
    let relIndex = -1;
    for (let i = 0; i < uprcols.length; i++) if (uprcols[i]!.includes("REL.")) relIndex = i;
    if (relIndex < 0) throw new AssertionError(`Could not find Rel. in DT line: ${line}`);
    const versionIndex = relIndex + 1;
    if (versionIndex >= cols.length) throw new IndexError("list index out of range");
    const strVersion = rstripChars(cols[versionIndex]!, ",");
    // Python keeps a dotted version as text and parses the rest as an integer.
    const version: number | string = strVersion === "" ? 0 : strVersion.includes(".") ? strVersion : pyInt(strVersion);
    const date = cols[0]!;
    if (upr.includes("CREATED")) record.created = [date, version];
    else if (upr.includes("LAST SEQUENCE UPDATE")) record.sequenceUpdate = [date, version];
    else record.annotationUpdate = [date, version];
  } else if (upr.includes("INTEGRATED INTO") || upr.includes("SEQUENCE VERSION") || upr.includes("ENTRY VERSION")) {
    let version = 0;
    // Take the last all-digit piece of the final column, e.g. "version" "3.12" -> 12.
    for (const s of cols[cols.length - 1]!.split(".")) if (isDigits(s)) version = pyInt(s);
    const date = rstripChars(cols[0]!, ",");
    if (upr.includes("INTEGRATED")) record.created = [date, version];
    else if (upr.includes("SEQUENCE VERSION")) record.sequenceUpdate = [date, version];
    else record.annotationUpdate = [date, version];
  } else {
    throw new SwissProtParserError("Failed to parse DT (DaTe) line", line);
  }
}

/** Parse an `OX` line (NCBI taxonomy ids; the first line starts with `NCBI_TaxID=`). */
export function readOx(record: SwissProtRecord, line: string): void {
  line = line.split("{")[0]!;
  let ids: string;
  if (record.taxonomyId.length > 0) {
    ids = rstripChars(pyRstrip(line.slice(5)), ";");
  } else {
    const [descr, rest] = unpackTwo(rstripChars(pyRstrip(line.slice(5)), ";").split("="));
    if (descr !== "NCBI_TaxID") throw new AssertionError(`Unexpected taxonomy type ${descr}`);
    ids = rest;
  }
  record.taxonomyId.push(...ids.split(", "));
}

/** Parse an `OH` line (natural host: taxonomy id and name). */
export function readOh(record: SwissProtRecord, line: string): void {
  if (!line.slice(5).startsWith("NCBI_TaxID=")) throw new AssertionError(`Unexpected ${line}`);
  line = pyRstrip(line.slice(16));
  if (line.length === 0) throw new IndexError("string index out of range");
  if (!(line[line.length - 1] === "." && line.split(";").length - 1 === 1)) throw new AssertionError(line);
  const [taxid, name] = unpackTwo(line.slice(0, -1).split(";"));
  record.hostTaxonomyId.push(pyStrip(taxid));
  record.hostOrganism.push(pyStrip(name));
}

/** Parse an `RN` line: the reference number and optional evidence. */
export function readRn(reference: SwissProtReference, rn: string): void {
  const words = splitFirst(rn);
  if (words.length === 0) throw new IndexError("list index out of range");
  const number = words[0]!;
  if (!(number.startsWith("[") && number.endsWith("]"))) throw new AssertionError(`Missing brackets ${number}`);
  reference.number = pyInt(number.slice(1, -1));
  if (words.length > 1) {
    const evidence = words[1]!;
    if (!(evidence.startsWith("{") && evidence.endsWith("}"))) throw new AssertionError(`Missing braces ${evidence}`);
    reference.evidence = evidence.slice(1, -1).split("|");
  }
}

/**
 * Parse an `RC` line: `TOKEN=text;` pairs, where a comment may continue on the next line.
 *
 * @returns Text left over that must be glued to the next line, or undefined.
 */
export function readRc(reference: SwissProtReference, value: string): string | undefined {
  if (value.length === 0) throw new IndexError("string index out of range");
  let cols = value.split(";");
  let unread = "";
  if (value[value.length - 1] !== ";") {
    unread = cols[cols.length - 1]!;
    cols = cols.slice(0, -1);
  }
  for (const col of cols) {
    if (!col) return undefined;
    const i = col.indexOf("=");
    if (i >= 0) {
      reference.comments.push([pyLstrip(col.slice(0, i)), col.slice(i + 1)]);
    } else {
      if (reference.comments.length === 0) throw new IndexError("list index out of range");
      const comment = reference.comments[reference.comments.length - 1]!;
      // Biopython formats the stored pair itself, so the pair's repr ends up in the text.
      const shown = typeof comment === "string" ? comment : `(${pyRepr(comment[0])}, ${pyRepr(comment[1])})`;
      reference.comments[reference.comments.length - 1] = `${shown} ${col}`;
    }
  }
  return unread;
}

/** Parse an `RX` line (PubMed, DOI, ... ids), warning about lines that do not look right. */
export function readRx(reference: SwissProtReference, value: string): void {
  value = value.replaceAll(" [NCBI, ExPASy, Israel, Japan]", "");
  let bad = false;
  if (value.includes("=")) {
    const cols = value.split("; ").map((x) => pyStrip(x)).filter((x) => x);
    for (const col of cols) {
      const x = col.split("=");
      if (x.length !== 2) { bad = true; break; }
      reference.references.push([x[0]!, rstripChars(x[1]!, ";")]);
    }
  } else {
    const cols = value.split("; ");
    if (cols.length !== 2) bad = true;
    else reference.references.push([rstripChars(cols[0]!, ";"), rstripChars(cols[1]!, ".")]);
  }
  if (bad) warn(`Possibly corrupt RX line ${pyRepr(value)}`, "BiopythonParserWarning");
}

/** Parse a `CC` line: `-!-` starts a comment, three spaces continue it. */
export function readCc(record: SwissProtRecord, line: string): void {
  const key = line.slice(5, 8);
  const value = pyRstrip(line.slice(9));
  if (key === "-!-") {
    record.comments.push(value);
  } else if (key === "   ") {
    if (record.comments.length === 0) record.comments.push(value);
    else record.comments[record.comments.length - 1] += " " + value;
  }
}

/** Parse a `DR` line into a list of its `; `-separated parts. */
export function readDr(record: SwissProtRecord, value: string): void {
  record.crossReferences.push(rstripChars(value, ".").split("; "));
}

/** Parse a `PE` line: the protein-existence level. */
export function readPe(record: SwissProtRecord, value: string): void {
  record.proteinExistence = pyInt(value.split(":")[0]!);
}

/** Parse a `KW` line, dropping evidence braces. */
export function readKw(record: SwissProtRecord, value: string): void {
  for (let val of rstripChars(value, ";.").split("; ")) {
    if (val.endsWith("}")) val = rsplitOnce(val, "{")[0]!;
    record.keywords.push(pyStrip(val));
  }
}

/** Turn the collected `GN` text of each gene group into a map of its `Name`, `Synonyms`, ... fields. */
export function readGn(record: SwissProtRecord): void {
  record.geneName.forEach((text, i) => {
    const tokens = rstripChars(text as string, "; ").split("; ");
    const geneName: GeneName = new Map();
    for (const token of tokens) {
      const trimmed = pyStrip(token);
      const [key, value] = unpackTwo(splitOnce(trimmed, "="));
      if (key === "Name") {
        geneName.set("Name", value);
      } else {
        if (!["Synonyms", "OrderedLocusNames", "ORFNames"].includes(key)) throw new AssertionError();
        geneName.set(key, value.split(", "));
      }
    }
    record.geneName[i] = geneName;
  });
}
