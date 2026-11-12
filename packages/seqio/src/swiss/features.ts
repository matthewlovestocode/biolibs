/** Parser for SwissProt `FT` (feature table) lines, old and new layouts. */

import { IndexError, KeyError, ValueError, pyRstrip, pyLstrip } from "@biolibs/core";
import { Position, SimpleLocation } from "@biolibs/seqfeature";
import { FeatureTable, type SwissProtRecord } from "./records.js";
import { rstripChars } from "./text.js";

/**
 * Tidy a `VAR_SEQ` description such as `"AB CD -> EF (in isoform 2)"` by removing spaces
 * inside the two sequences. Descriptions without ` -> ` are returned unchanged.
 */
function tidyVarSeq(description: string): string {
  const parts = description.split(" -> ");
  if (parts.length !== 2) return description;
  let [first, second] = parts as [string, string];
  let extra = "";
  const pos = second.indexOf(" (");
  if (pos !== -1) {
    extra = second.slice(pos);
    second = second.slice(0, pos);
  }
  return first.replaceAll(" ", "") + " -> " + second.replaceAll(" ", "") + extra;
}

/** The last feature of a record, or the `IndexError` Python gives for `features[-1]` on an empty list. */
function lastFeature(record: SwissProtRecord): FeatureTable {
  if (record.features.length === 0) throw new IndexError("list index out of range");
  return record.features[record.features.length - 1]!;
}

/** Read the string stored under `key`, raising Python's `KeyError` if absent. */
function getText(feature: FeatureTable, key: string): string {
  if (!feature.qualifiers.has(key)) throw new KeyError(key);
  return feature.qualifiers.get(key) as string;
}

/**
 * Parse one `FT` line. A line with a feature name starts a new feature (either `ISOFORM:start..end`
 * in the new layout or numeric columns in the old one); a line without a name continues, or adds a qualifier to, the last feature.
 *
 * @throws {@link ValueError} for malformed qualifiers; {@link IndexError}/{@link KeyError} for continuation lines with nothing to continue.
 */
export function readFt(record: SwissProtRecord, line: string): void {
  const name = pyRstrip(line.slice(5, 13));
  if (name) {
    let fromRes: string;
    let toRes: string;
    let isoformId: string | null = null;
    const qualifiers = new Map<string, unknown>();
    if (line.slice(13, 21) === "        ") {
      let location = pyRstrip(line.slice(21, 80));
      const iso = location.split(":");
      if (iso.length === 2) { isoformId = iso[0]!; location = iso[1]!; }
      const ends = location.split("..");
      if (ends.length === 2) { fromRes = ends[0]!; toRes = ends[1]!; } else { fromRes = location; toRes = ""; }
    } else {
      fromRes = pyLstrip(line.slice(14, 20));
      toRes = pyLstrip(line.slice(21, 27));
      qualifiers.set("description", pyRstrip(line.slice(34, 75)));
    }
    const start = Position.fromstring(fromRes, -1);
    const end = toRes === "" ? start.add(1) : Position.fromstring(toRes);
    const feature = new FeatureTable(new SimpleLocation(start, end, null, isoformId), name, null as unknown as string, qualifiers);
    record.features.push(feature);
    return;
  }
  const feature = lastFeature(record);
  if (line.slice(5, 34) === " ".repeat(29)) {
    // Old-style continuation of the description (or the closing /FTId=).
    let description = pyRstrip(line.slice(34, 75));
    if (description.startsWith("/FTId=")) {
      feature.id = rstripChars(description.slice(6), ".");
      return;
    }
    const old = getText(feature, "description");
    description = old.endsWith("-") ? `${old}${description}` : `${old} ${description}`;
    if (feature.type === "VARSPLIC" || feature.type === "VAR_SEQ") description = tidyVarSeq(description);
    feature.qualifiers.set("description", description);
    return;
  }
  // New-style qualifier lines: /key="value" or continuation text.
  let value = pyRstrip(line.slice(21));
  const match = /^\/([a-z_]+)=/.exec(value);
  if (match) {
    const qualifierType = match[1]!;
    value = value.slice(match[0].length);
    if (!value.startsWith('"')) throw new ValueError("Missing starting quote in feature");
    if (qualifierType === "id") {
      if (!value.endsWith('"')) throw new ValueError("Missing closing quote for id");
      feature.id = value.slice(1, -1);
    } else {
      value = value.endsWith('"') ? value.slice(1, -1) : value.slice(1);
      if (feature.qualifiers.has(qualifierType)) throw new ValueError(`Feature qualifier '${qualifierType}' already exists for feature`);
      feature.qualifiers.set(qualifierType, value);
    }
    return;
  }
  const keys = [...feature.qualifiers.keys()];
  if (keys.length === 0) throw new IndexError("list index out of range");
  const key = keys[keys.length - 1]!;
  let description = rstripChars(value, '"');
  const old = feature.qualifiers.get(key) as string;
  description = key === "evidence" || old.endsWith("-") ? `${old}${description}` : `${old} ${description}`;
  if (feature.type === "VAR_SEQ") description = tidyVarSeq(description);
  feature.qualifiers.set(key, description);
}
