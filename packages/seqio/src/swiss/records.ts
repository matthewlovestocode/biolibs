/** Data classes produced by the SwissProt parser (Biopython's `Bio.SwissProt`). */

import { ValueError } from "@biolibs/core";
import { SeqFeature } from "@biolibs/seqfeature";

/**
 * Raised when a SwissProt file cannot be parsed. Subclass of {@link ValueError}; `line` holds the offending line.
 */
export class SwissProtParserError extends ValueError {
  /** The line that could not be parsed, if known. */
  readonly line: string | null;

  /** @param message - What went wrong. @param line - The offending line. */
  constructor(message: string, line: string | null = null) {
    super(message);
    this.name = "SwissProtParserError";
    this.line = line;
  }
}

/** One `GN` gene-name group: `Name` is a string, the other keys hold lists of names. */
export type GeneName = Map<string, string | string[]>;

/** A date line (`DT`) value: the date and a version, which is a number or (rarely) a dotted string. */
export type DateVersion = [string, number | string];

/**
 * A literature reference (`RN` block). The list fields are collected line by line and joined into
 * strings when the entry ends (`//`), so after parsing `authors`, `title` and `location` are strings.
 */
export class SwissProtReference {
  /** Reference number. */
  number: number | null = null;
  /** `RP` lines. */
  positions: string[] = [];
  /** `RC` comments as `[token, text]` pairs (a pair becomes plain text if a continuation line is merged into it, as in Biopython). */
  comments: ([string, string] | string)[] = [];
  /** `RX` cross-references as `[database, id]` pairs. */
  references: [string, string][] = [];
  /** Authors (lines before the entry ends, then one string). */
  authors: string[] | string = [];
  /** Title (lines before the entry ends, then one string). */
  title: string[] | string = [];
  /** Journal (lines before the entry ends, then one string). */
  location: string[] | string = [];
  /** Evidence codes from the `RN` line, if present. */
  evidence?: string[];
}

/** A feature from an `FT` line; just a `SeqFeature` with a name of its own. */
export class FeatureTable extends SeqFeature {}

/**
 * One SwissProt entry. Fields mirror Biopython's `Bio.SwissProt.Record`; the list-valued fields
 * `description`, `organism` and `gene_name` become a string / string / list of {@link GeneName} when the entry ends.
 */
export class SwissProtRecord {
  entryName: string | null = null;
  dataClass: string | null = null;
  moleculeType: string | null = null;
  sequenceLength: number | null = null;
  accessions: string[] = [];
  created: DateVersion | null = null;
  sequenceUpdate: DateVersion | null = null;
  annotationUpdate: DateVersion | null = null;
  description: string[] | string = [];
  geneName: (string | GeneName)[] = [];
  organism: string[] | string = [];
  organelle = "";
  organismClassification: string[] = [];
  taxonomyId: string[] = [];
  hostOrganism: string[] = [];
  hostTaxonomyId: string[] = [];
  references: SwissProtReference[] = [];
  comments: string[] = [];
  crossReferences: string[][] = [];
  keywords: string[] = [];
  features: FeatureTable[] = [];
  proteinExistence: number | "" = "";
  seqinfo: [number, number, string] | null = null;
  sequence = "";
}
