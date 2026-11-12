/**
 * `FeatureConsumer`: receives parsed GenBank/EMBL pieces from a scanner and assembles a `SeqRecord`
 * (Biopython's `Bio.GenBank._FeatureConsumer`).
 */

import { AssertionError, ValueError, pyInt, pyRepr, pyStrip, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { Location, LocationParserError, Reference, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import type { FeatureValueCleaner } from "./cleaner.js";
import { isDigit } from "./text.js";

const PARSER = "BiopythonParserWarning";

/** Raised when the consumer meets a value it cannot accept (Biopython's `ParserFailureError`). Subclass of {@link ValueError}. */
export class ParserFailureError extends ValueError {
  /** @param message - What was unexpected. */
  constructor(message: string) {
    super(message);
    this.name = "ParserFailureError";
  }
}

/** Python `str.count(sub)` for non-empty `sub`. */
const count = (s: string, sub: string) => s.split(sub).length - 1;

/**
 * Builds a `SeqRecord` from scanner callbacks. After {@link FeatureConsumer.recordEnd} the finished record is in `data`
 * (or `data` is null when the scanner found no more records).
 */
export class FeatureConsumer {
  /** The record being built. */
  data: SeqRecord | null;
  private seqType = "";
  private readonly seqData: string[] = [];
  private curReference: Reference | null = null;
  private curFeature: SeqFeature | null = null;
  private expectedSize: number | null = null;

  /**
   * @param useFuzziness - Unused (kept for signature parity; fuzzy positions are always kept).
   * @param featureCleaner - Optional cleaner applied to qualifier values.
   */
  constructor(private readonly useFuzziness: boolean, private readonly featureCleaner: FeatureValueCleaner | null = null) {
    this.data = new SeqRecord(null, null);
    this.data.id = null;
    this.data.description = "";
  }

  private get rec(): SeqRecord {
    return this.data!;
  }

  // --- splitting helpers --------------------------------------------------------------------

  /** Split a `KEYWORDS` value on `;` (dropping a trailing full stop). */
  static splitKeywords(keywordString: string): string[] {
    let keywords: string;
    if (keywordString === "" || keywordString === ".") keywords = "";
    else if (keywordString.slice(-1) === ".") keywords = keywordString.slice(0, -1);
    else keywords = keywordString;
    return keywords.split(";").map((x) => pyStrip(x));
  }

  /** Split an `ACCESSION` value on whitespace and `;`. */
  static splitAccessions(accessionString: string): string[] {
    return accessionString.replaceAll("\n", " ").replaceAll(";", " ").split(/\s+/).map(pyStrip).filter(Boolean);
  }

  /** Split a taxonomy lineage on `;` and newlines. */
  static splitTaxonomy(taxonomyString: string): string[] {
    if (!taxonomyString || taxonomyString === ".") return [];
    const info = taxonomyString.slice(-1) === "." ? taxonomyString.slice(0, -1) : taxonomyString;
    return info.split(";").flatMap((item) => item.split("\n").filter(Boolean).map(pyStrip));
  }

  /** Remove all whitespace from a location string. */
  static cleanLocation(locationString: string): string {
    return locationString.split(/\s+/).join("");
  }

  // --- LOCUS / ID line ----------------------------------------------------------------------

  /** The record name. */
  locus(locusName: string): void {
    this.rec.name = locusName;
  }

  /** The declared sequence length. @throws {@link ValueError} if not an integer. */
  size(content: string): void {
    this.expectedSize = pyInt(content);
  }

  /** The residue type text (for example `"DNA"` or `"mRNA"`), used to decide `molecule_type`. */
  residueType(type: string): void {
    this.seqType = pyStrip(type);
  }

  /** `linear` or `circular`. @throws {@link ParserFailureError} otherwise. */
  topology(topology: string): void {
    if (topology) {
      if (topology !== "linear" && topology !== "circular") throw new ParserFailureError(`Unexpected topology ${pyRepr(topology)} should be linear or circular`);
      this.rec.annotations.set("topology", topology);
    }
  }

  /** The molecule type. @throws {@link ParserFailureError} if it still includes the topology. */
  moleculeType(molType: string): void {
    if (molType) {
      if (molType.includes("circular") || molType.includes("linear")) throw new ParserFailureError(`Molecule type ${pyRepr(molType)} should not include topology`);
      const tail = molType.slice(-3);
      if (["DNA", "RNA"].includes(tail.toUpperCase()) && tail !== tail.toUpperCase()) warn(`Non-upper case molecule type in LOCUS line: ${molType}`, PARSER);
      this.rec.annotations.set("molecule_type", molType);
    }
  }

  /** The GenBank data file division, such as `BCT`. */
  dataFileDivision(division: string): void {
    this.rec.annotations.set("data_file_division", division);
  }

  /** The record's date text. */
  date(submitDate: string): void {
    this.rec.annotations.set("date", submitDate);
  }

  // --- DEFINITION, ACCESSION, VERSION ---------------------------------------------------------

  /** Append to the description (continuation lines are joined with a space). */
  definition(definition: string): void {
    this.rec.description = this.rec.description ? `${this.rec.description} ${definition}` : definition;
  }

  /** Add accession numbers; the first becomes the record id if none is set. */
  accession(accNum: string): void {
    const newAccNums = FeatureConsumer.splitAccessions(accNum);
    const existing = this.rec.annotations.get("accessions") as string[] | undefined;
    if (existing !== undefined) {
      for (const acc of newAccNums) if (!existing.includes(acc)) existing.push(acc);
    } else {
      this.rec.annotations.set("accessions", newAccNums);
    }
    if (!this.rec.id && newAccNums.length > 0) this.rec.id = (this.rec.annotations.get("accessions") as string[])[0]!;
  }

  /** TLS range, kept as `[first, last]`. */
  tls(content: string): void { this.rec.annotations.set("tls", content.split("-")); }
  /** TSA range, kept as `[first, last]`. */
  tsa(content: string): void { this.rec.annotations.set("tsa", content.split("-")); }
  /** WGS range, kept as `[first, last]`. */
  wgs(content: string): void { this.rec.annotations.set("wgs", content.split("-")); }
  /** Another WGS scaffold range. */
  addWgsScafld(content: string): void {
    const list = (this.rec.annotations.get("wgs_scafld") as string[][] | undefined) ?? [];
    list.push(content.split("-"));
    this.rec.annotations.set("wgs_scafld", list);
  }
  /** The (obsolete) NID line. */
  nid(content: string): void { this.rec.annotations.set("nid", content); }
  /** The (obsolete) PID line. */
  pid(content: string): void { this.rec.annotations.set("pid", content); }

  /** `ACC.N`: sets the accession and sequence version; any other non-empty value becomes the id. */
  version(versionId: string): void {
    if (count(versionId, ".") === 1 && isDigit(versionId.split(".")[1]!)) {
      this.accession(versionId.split(".")[0]!);
      this.versionSuffix(versionId.split(".")[1]!);
    } else if (versionId) {
      this.rec.id = versionId;
    }
  }

  /** Project cross-references (`GenomeProject:` is normalised to `Project:`). */
  project(content: string): void {
    this.rec.dbxrefs.push(...content.replaceAll("GenomeProject:", "Project:").split(/\s+/).filter(Boolean));
  }

  /** A DBLINK cross-reference, normalised to `Name:id`. */
  dblink(content: string): void {
    while (content.includes(": ")) content = content.replaceAll(": ", ":");
    if (!this.rec.dbxrefs.includes(pyStrip(content))) this.rec.dbxrefs.push(pyStrip(content));
  }

  /** The numeric sequence version. */
  versionSuffix(version: string): void {
    if (!isDigit(version)) throw new AssertionError();
    this.rec.annotations.set("sequence_version", pyInt(version));
  }

  /** DBSOURCE text. */
  dbSource(content: string): void { this.rec.annotations.set("db_source", content.trimEnd()); }
  /** GI number. */
  gi(content: string): void { this.rec.annotations.set("gi", content); }

  /** Add keywords (repeated KEYWORDS lines accumulate). */
  keywords(content: string): void {
    const words = FeatureConsumer.splitKeywords(content);
    const existing = this.rec.annotations.get("keywords") as string[] | undefined;
    if (existing) existing.push(...words);
    else this.rec.annotations.set("keywords", words);
  }

  /** SEGMENT text. */
  segment(content: string): void { this.rec.annotations.set("segment", content); }

  /** SOURCE text without a trailing full stop. */
  source(content: string): void {
    this.rec.annotations.set("source", content === "" ? "" : content.slice(-1) === "." ? content.slice(0, -1) : content);
  }

  /** The organism name. */
  organism(content: string): void { this.rec.annotations.set("organism", content); }

  /** Add lineage entries. */
  taxonomy(content: string): void {
    const lineage = FeatureConsumer.splitTaxonomy(content);
    const existing = this.rec.annotations.get("taxonomy") as string[] | undefined;
    if (existing) existing.push(...lineage);
    else this.rec.annotations.set("taxonomy", lineage);
  }

  // --- references -------------------------------------------------------------------------

  /** Start a new reference (the previous one is stored). */
  referenceNum(_content: string): void {
    if (this.curReference !== null) (this.rec.annotations.get("references") as Reference[]).push(this.curReference);
    else this.rec.annotations.set("references", []);
    this.curReference = new Reference();
  }

  /** The base range a reference applies to, as `(bases 1 to 100; 200 to 300)`. */
  referenceBases(content: string): void {
    if (!content.endsWith(")")) throw new AssertionError(content);
    let refBaseInfo = content.slice(1, -1);
    const allLocations: SimpleLocation[] = [];
    if (refBaseInfo.includes("bases") && refBaseInfo.includes("to")) {
      refBaseInfo = refBaseInfo.slice(5);
      allLocations.push(...this.splitReferenceLocations(refBaseInfo));
    } else if (refBaseInfo.includes("residues") && refBaseInfo.includes("to")) {
      refBaseInfo = refBaseInfo.slice(refBaseInfo.indexOf("residues") + "residues ".length);
      allLocations.push(...this.splitReferenceLocations(refBaseInfo));
    } else if (refBaseInfo === "sites" || pyStrip(refBaseInfo) === "bases") {
      // no locations
    } else {
      throw new ValueError(`Could not parse base info ${refBaseInfo} in record ${this.rec.id}`);
    }
    this.curReference!.location = allLocations;
  }

  private splitReferenceLocations(locationString: string): SimpleLocation[] {
    return locationString.split(";").map((baseInfo) => {
      const parts = baseInfo.split("to");
      if (parts.length !== 2) throw new ValueError(parts.length < 2 ? `not enough values to unpack (expected 2, got ${parts.length})` : "too many values to unpack (expected 2)");
      const start = pyInt(parts[0]!.trim());
      const end = pyInt(parts[1]!.trim());
      return new SimpleLocation(start - 1, end);
    });
  }

  /** Append to the current reference's authors. */
  authors(content: string): void {
    const r = this.curReference!;
    r.authors = r.authors ? `${r.authors} ${content}` : content;
  }

  /** Append to the current reference's consortium. */
  consrtm(content: string): void {
    const r = this.curReference!;
    r.consrtm = r.consrtm ? `${r.consrtm} ${content}` : content;
  }

  /** Append to the current reference's title (warns if there is no reference). */
  title(content: string): void {
    if (this.curReference === null) warn("GenBank TITLE line without REFERENCE line.", PARSER);
    else this.curReference.title = this.curReference.title ? `${this.curReference.title} ${content}` : content;
  }

  /** Append to the current reference's journal. */
  journal(content: string): void {
    const r = this.curReference!;
    r.journal = r.journal ? `${r.journal} ${content}` : content;
  }

  /** MEDLINE id of the current reference. */
  medlineId(content: string): void { this.curReference!.medlineId = content; }
  /** PubMed id of the current reference. */
  pubmedId(content: string): void { this.curReference!.pubmedId = content; }

  /** REMARK text of the current reference. */
  remark(content: string): void {
    const r = this.curReference!;
    r.comment = r.comment ? `${r.comment} ${content}` : content;
  }

  /** Add comment lines (joined by newlines). */
  comment(content: string[]): void {
    const existing = this.rec.annotations.get("comment") as string | undefined;
    this.rec.annotations.set("comment", existing !== undefined ? `${existing}\n${content.join("\n")}` : content.join("\n"));
  }

  /** A structured comment (`-START##` ... `-END##` block) as nested maps. */
  structuredComment(content: Map<string, Map<string, string>>): void {
    this.rec.annotations.set("structured_comment", content);
  }

  // --- features -------------------------------------------------------------------------------

  /** The `FEATURES` header line. */
  featuresLine(_content: string): void { this.startFeatureTable(); }

  /** Called before the first feature: stores any pending reference. */
  startFeatureTable(): void {
    if (this.curReference !== null) {
      (this.rec.annotations.get("references") as Reference[]).push(this.curReference);
      this.curReference = null;
    }
  }

  /** Start a new feature of the given type. */
  featureKey(content: string): void {
    this.curFeature = new SeqFeature();
    this.curFeature.type = content;
    this.rec.features.push(this.curFeature);
  }

  /** Parse the current feature's location; an unparsable one becomes `null` with a warning. */
  location(content: string): void {
    let locationLine = FeatureConsumer.cleanLocation(content);
    if (locationLine.includes("replace")) {
      const commaPos = locationLine.indexOf(",");
      locationLine = locationLine.slice(8, commaPos);
    }
    const length = this.expectedSize;
    const topology = this.rec.annotations.get("topology") as string | undefined;
    const isCircular = (topology ?? "").toLowerCase().includes("circular");
    const stranded = !this.seqType.toUpperCase().includes("PROTEIN");
    let location: SimpleLocation | null = null;
    try {
      location = Location.fromstring(locationLine, length, isCircular, stranded) as SimpleLocation;
    } catch (e) {
      if (!(e instanceof LocationParserError)) throw e;
      warn(`${e.message}; setting feature location to None.`, PARSER);
    }
    this.curFeature!.location = location;
  }

  /** Add a qualifier to the current feature (`value` null is a flag qualifier). Quotes are removed and `""` unescaped. */
  featureQualifier(key: string, value: string | null): void {
    const qualifiers = this.curFeature!.qualifiers;
    if (value === null) {
      if (!qualifiers.has(key)) qualifiers.set(key, [""]);
      return;
    }
    if (value.length > 1 && value[0] === '"' && value.slice(-1) === '"') value = value.slice(1, -1);
    if (/[^"]"[^"]|^"[^"]|[^"]"$/.test(value)) {
      warn(`The NCBI states double-quote characters like " should be escaped as "" (two double - quotes), but here it was not: ${pyRepr(value)}`, PARSER);
    }
    value = value.replaceAll('""', '"');
    if (this.featureCleaner !== null) value = this.featureCleaner.cleanValue(key, value);
    const existing = qualifiers.get(key) as string[] | undefined;
    if (existing) existing.push(value);
    else qualifiers.set(key, [value]);
  }

  /** CONTIG location text. */
  contigLocation(content: string): void { this.rec.annotations.set("contig", content); }
  /** ORIGIN name (ignored). */
  originName(_content: string): void {}
  /** BASE COUNT line (ignored). */
  baseCount(_content: string): void {}
  /** Base number (ignored). */
  baseNumber(_content: string): void {}

  /** Add a chunk of sequence (upper-cased). */
  sequence(content: string): void {
    if (content.includes(" ")) throw new AssertionError();
    this.seqData.push(content.toUpperCase());
  }

  /** Finish the record: settle the id (appending the version), set `molecule_type` and the sequence. */
  recordEnd(_content: string): void {
    const data = this.rec;
    if (!data.id) {
      if (data.annotations.has("accessions")) throw new ValueError("Problem adding version number to accession: " + pyRepr(data.annotations.get("accessions")));
      data.id = data.name;
    } else if (count(data.id, ".") === 0) {
      if (data.annotations.has("sequence_version")) data.id += `.${data.annotations.get("sequence_version")}`;
    }
    const sequence = this.seqData.join("");
    if (this.expectedSize !== null && sequence.length !== 0 && this.expectedSize !== sequence.length) {
      warn(`Expected sequence length ${this.expectedSize}, found ${sequence.length} (${data.id}).`, PARSER);
    }
    let moleculeType: string | null = null;
    if (this.seqType) {
      const upper = this.seqType.toUpperCase();
      if (upper.includes("DNA") || upper.includes("MRNA")) moleculeType = "DNA";
      else if (upper.includes("RNA")) moleculeType = "RNA";
      else if (upper.includes("PROTEIN") || this.seqType === "PRT") moleculeType = "protein";
      else if (["circular", "linear", "unspecified"].includes(this.seqType)) moleculeType = null;
      else throw new ValueError(`Could not determine molecule_type for seq_type ${this.seqType}`);
    }
    if (moleculeType !== null) data.annotations.set("molecule_type", data.annotations.has("molecule_type") ? data.annotations.get("molecule_type") : moleculeType);
    if (!sequence && this.expectedSize) data.seq = new Seq(null, this.expectedSize);
    else data.seq = new Seq(sequence);
  }
}

