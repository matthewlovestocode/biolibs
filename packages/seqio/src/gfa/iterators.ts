/** Readers for Graphical Fragment Assembly files (`gfa1`, `gfa2`): the segment (`S`) lines become records. */

import { ValueError, pyInt, warn } from "@biolibs/core";
import { Seq, UndefinedSequenceData } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { sha256Hex } from "./sha256.js";

/** Optional-field regexes by tag type, from the GFA 1.0 specification (anchored: Python `re.fullmatch`). */
const TYPE_CHECKS: Record<string, [RegExp, string]> = {
  A: [/^[!-~]$/, "printable character"],
  i: [/^[-+]?[0-9]+$/, "signed integer"],
  f: [/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/, "float"],
  Z: [/^[ !-~]+$/, "printable string"],
  J: [/^[ !-~]+$/, "JSON excluding new-line and tab characters"],
  H: [/^[0-9A-F]+$/, "byte array in hex format"],
  B: [/^[cCsSiIf](,[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)+$/, "array of integers or floats"],
};

/**
 * Check the `LN` (length) and `SH` (SHA-256) tags of a segment against its sequence.
 * A missing sequence (`*`) with an `LN` tag becomes an undefined sequence of that length.
 *
 * @param seq - The segment sequence, replaced when it is empty and `LN` gives a length.
 * @param tags - Optional fields of the segment line.
 * @returns The (possibly replaced) sequence.
 */
function checkTags(seq: Seq, tags: string[]): Seq {
  for (const tag of tags) {
    if (tag.slice(0, 2) === "LN") {
      const n = pyInt(tag.slice(5));
      // Python swaps the data in directly, so even LN:i:0 gives *undefined* data (unlike Seq(None, length=0)).
      if (seq.length === 0) seq = new Seq(new UndefinedSequenceData(n));
      else if (n !== seq.length) warn(`Segment line has incorrect length. Expected ${tag.slice(5)} but got ${seq.length}.`);
    } else if (tag.slice(0, 2) === "SH") {
      const checksum = sha256Hex(seq.toString());
      if (checksum.toUpperCase() !== tag.slice(5)) warn(`Segment line has incorrect checksum. Expected ${tag.slice(5)} but got ${checksum}.`);
    }
  }
  return seq;
}

/**
 * Turn optional fields (`NAME:TYPE:VALUE`) into an annotations map of `[type, value]` pairs, warning about
 * badly named, mistyped or malformed fields.
 *
 * @throws {@link ValueError} for a field with fewer than three `:`-separated parts.
 */
function tagsToAnnotations(tags: string[]): Map<string, unknown> {
  const annotations = new Map<string, unknown>();
  for (const tag of tags) {
    const parts = tag.split(":");
    if (parts.length < 3) throw new ValueError(`Segment line has invalid tag: ${tag}.`);
    if (!/^[A-Za-z][A-Za-z0-9]$/.test(parts[0]!)) warn(`Tag has invalid name: ${parts[0]}. Are they tab delimited?`);
    const value = parts.slice(2).join(":");
    annotations.set(parts[0]!, [parts[1]!, value]);
    // Python's `parts[1] not in "AifZJHB"` is a substring test: "" and multi-letter runs such as "if" pass it.
    if (!"AifZJHB".includes(parts[1]!)) warn(`Tag has invalid type: ${parts[1]}`);
    else {
      const check = TYPE_CHECKS[parts[1]!];
      if (check && !check[0].test(value)) warn(`Tag has incorrect type. Expected ${check[1]}, got ${value}.`);
    }
  }
  return annotations;
}

/** Shared segment-line loop for both GFA versions. */
abstract class GfaIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  /** Number of leading fields a segment line needs before its tags. */
  protected abstract readonly minFields: number;
  /** Message for a segment line with too few fields. */
  protected abstract tooShort(line: string): string;
  /** Position of the sequence field. */
  protected abstract readonly seqField: number;
  /** Validation hook run before the sequence is read (GFA 2 checks the length field). */
  protected validate(_fields: string[], _line: string): void {}

  protected nextRecord(): SeqRecord | null {
    let fields: string[] | null = null;
    let line = "";
    for (line of this.stream!) {
      if (line === "\n") { warn("GFA data has a blank line."); continue; }
      const f = line.replace(/^\n+|\n+$/g, "").split("\t");
      if (f[0] === "S") { fields = f; break; }
    }
    if (fields === null) return null;
    if (fields.length < this.minFields) throw new ValueError(this.tooShort(line));
    this.validate(fields, line);
    const raw = fields[this.seqField]!;
    const tags = fields.slice(this.seqField + 1);
    const seq = checkTags(raw === "*" ? new Seq(null, 0) : new Seq(raw), tags);
    return new SeqRecord(seq, fields[1], fields[1], undefined, null, null, tagsToAnnotations(tags));
  }
}

/** Reads GFA 1.x segment lines (`S name sequence [tags]`). */
export class Gfa1Iterator extends GfaIterator {
  protected readonly minFields = 3;
  protected readonly seqField = 2;
  protected tooShort(line: string): string { return `Segment line must have name and sequence fields: ${line}.`; }
  /** @param source - File contents. */
  constructor(source: unknown) { super(source, null, "GFA 1.0"); }
}

/** Reads GFA 2.0 segment lines (`S name length sequence [tags]`). */
export class Gfa2Iterator extends GfaIterator {
  protected readonly minFields = 4;
  protected readonly seqField = 3;
  protected tooShort(line: string): string { return `Segment line must have name, length, and sequence fields: ${line}.`; }
  protected override validate(fields: string[], line: string): void {
    try { pyInt(fields[2]!); } catch { throw new ValueError(`Segment line must have an integer length: ${line}.`); }
  }
  /** @param source - File contents. */
  constructor(source: unknown) { super(source, null, "GFA 2.0"); }
}
