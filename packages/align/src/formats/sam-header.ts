/** SAM header lines (`@HD`, `@SQ`, ...) read into `metadata` and `targets`. */

import { AssertionError, UnboundLocalError, ValueError, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { strip } from "./rows.js";
import type { TextStream } from "./stream.js";

/** What the header leaves behind. */
export interface SamHeader {
  /** `HD` is one dict; every other tag is a list of dicts. */
  metadata: Record<string, unknown>;
  /** One record per `@SQ` line. */
  targets: SeqRecord[];
  /** Target record index by id (the last one wins for repeated ids). */
  targetIndices: Map<string, number>;
  /** The first line that is not a header line, if the file has one. */
  line: string | undefined;
}

/** `field.split(":", 1)` unpacked into key and value. */
function keyValue(field: string): [string, string] {
  const i = field.indexOf(":");
  if (i < 0) throw new ValueError("not enough values to unpack (expected 2, got 1)");
  return [field.slice(0, i), field.slice(i + 1)];
}

const unbound = (name: string): never => { throw new UnboundLocalError(`cannot access local variable '${name}' where it is not associated with a value`); };

/**
 * Read the `@` lines at the start of a SAM file.
 *
 * Like Biopython, `rname` and `length` outlive the `@SQ` line that set them: a later `@SQ` line without `SN` or `LN`
 * reuses the earlier values, and one without any earlier value fails with `UnboundLocalError`.
 *
 * @param stream - The file.
 */
export function readSamHeader(stream: TextStream): SamHeader {
  const metadata: Record<string, unknown> = {};
  const targets: SeqRecord[] = [];
  let line0: string | undefined;
  let rname: string | undefined, length: number | undefined;
  for (const line of stream) {
    if (!line.startsWith("@")) { line0 = line; break; }
    const fields = strip(line.slice(1)).split("\t");
    const tag = fields[0]!;
    if (tag === "SQ") {
      const annotations = new Map<string, unknown>();
      let description: string | null = null;
      for (const field of fields.slice(1)) {
        const [key, value] = keyValue(field);
        if (Array.from(key).length !== 2) throw new AssertionError("");
        if (key === "SN") rname = value;
        else if (key === "LN") length = pyInt(value);
        else if (key === "AH") annotations.set("alternate_locus", value);
        else if (key === "AN") annotations.set("names", value.split(","));
        else if (key === "AS") annotations.set("assembly", value);
        else if (key === "DS") description = value;
        else if (key === "M5") annotations.set("MD5", value);
        else if (key === "SP") annotations.set("species", value);
        else if (key === "TP") {
          if (value !== "linear" && value !== "circular") throw new AssertionError("");
          annotations.set("topology", value);
        } else if (key === "UR") annotations.set("URI", value);
        else annotations.set(key, value);
      }
      if (length === undefined) unbound("length");
      const sequence = new Seq(null, length!);
      if (rname === undefined) unbound("rname");
      const record = new SeqRecord(sequence, rname!, undefined, "", null, null, annotations);
      if (description !== null) record.description = description;
      targets.push(record);
    } else {
      const values: Record<string, string> = {};
      for (const field of fields.slice(1)) {
        const [key, value] = keyValue(field);
        if (Array.from(key).length !== 2) throw new AssertionError("");
        values[key] = value;
      }
      if (tag === "HD") metadata[tag] = values;
      else {
        if (!Object.hasOwn(metadata, tag)) metadata[tag] = [];
        (metadata[tag] as unknown[]).push(values);
      }
    }
  }
  const targetIndices = new Map<string, number>();
  targets.forEach((record, i) => targetIndices.set(record.id as string, i));
  return { metadata, targets, targetIndices, line: line0 };
}
