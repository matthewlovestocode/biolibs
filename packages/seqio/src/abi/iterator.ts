/** Reader for Applied Biosystems ABIF trace files (`abi` and `abi-trim`). */

import { ValueError, pyBytesRepr, pyStr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { calcsize, unpack } from "../binary/struct.js";
import { SequenceIterator } from "../interfaces.js";
import { HEADFMT, decodeUtf8, parseHeader, type TagValue } from "./parse.js";
import { abiTrim } from "./trim.js";

/** Tags copied into the annotations under a friendlier name. */
const EXTRACT: Record<string, string> = { TUBE1: "sample_well", DySN1: "dye", GTyp1: "polymer", MODL1: "machine_model" };

/** A tag read as text, or `fallback` when absent. */
function stringTag(value: TagValue | undefined, fallback: string | null): string | null {
  if (value === undefined || value === null) return fallback;
  if (!(value instanceof Uint8Array)) throw new TypeError(`'${typeof value}' object has no attribute 'decode'`);
  return decodeUtf8(value);
}

/**
 * Reads ABIF files (`.ab1`, `.fsa`). Sequence traces give the called bases with PHRED qualities; `.fsa` files
 * (no base calls) give an empty sequence. All tags are kept in `annotations["abif_raw"]`.
 *
 * `abi-trim` is the same reader with low-quality ends removed (see {@link AbiTrimIterator}).
 *
 * @throws {@link ValueError} for an empty file, a wrong signature, a truncated file, or (with `trim`) missing qualities.
 */
export class AbiIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private readonly trim: boolean;

  /** @param source - The file's bytes. @param trim - Trim low-quality ends. */
  constructor(source: unknown, trim = false) {
    super(source, null, "ABI");
    const marker = this.bytes!.read(4);
    if (marker.length === 0) throw new ValueError("Empty file.");
    if (pyBytesRepr(marker) !== "b'ABIF'") throw new ValueError(`File should start with ABIF, not ${pyBytesRepr(marker)}`);
    this.trim = trim;
  }

  protected nextRecord(): SeqRecord | null {
    const stream = this.bytes!;
    const times: Record<string, TagValue> = { RUND1: "", RUND2: "", RUNT1: "", RUNT2: "" };
    const annot = new Map<string, unknown>(Object.values(EXTRACT).map((k) => [k, null]));
    const size = calcsize(HEADFMT);
    const data = stream.read(size);
    if (data.length === 0) return null;
    if (data.length < size) throw new ValueError("premature end of file");
    const header = unpack(HEADFMT, data);
    let sampleId: string | null = "<unknown id>";
    const raw = new Map<string, TagValue>();
    let seq: string | null = null;
    let qual: number[] | null = null;
    for (const tag of parseHeader(header, stream)) {
      const key = tag.name + String(tag.number);
      raw.set(key, tag.value);
      if (key === "PBAS2") seq = decodeUtf8(this.asBytes(tag.value));
      else if (key === "PCON2") qual = [...decodeUtf8(this.asBytes(tag.value))].map((c) => c.codePointAt(0)!);
      else if (key === "SMPL1") sampleId = stringTag(tag.value, sampleId);
      else if (Object.hasOwn(times, key)) times[key] = tag.value;
      else if (Object.hasOwn(EXTRACT, key)) annot.set(EXTRACT[key]!, tag.value);
    }
    annot.set("run_start", `${pyStr(times.RUND1)} ${pyStr(times.RUNT1)}`);
    annot.set("run_finish", `${pyStr(times.RUND2)} ${pyStr(times.RUNT2)}`);
    annot.set("abif_raw", raw);
    const isFsa = !raw.has("PBAS1") && !raw.has("PBAS2");
    let record: SeqRecord;
    if (isFsa) {
      // Without a file name (we only see bytes) the record name stays empty, as for Python streams that have no `name`.
      sampleId = stringTag(raw.get("LIMS1"), sampleId);
      const description = stringTag(raw.get("CTID1"), "<unknown description>")!;
      record = new SeqRecord(new Seq(""), sampleId, "", description, null, null, annot);
    } else {
      // With PBAS1 but no PBAS2 the sequence is None, which Seq refuses.
      record = new SeqRecord(new Seq(seq as string), sampleId, "", "", null, null, annot);
    }
    if (qual && qual.length > 0) record.letterAnnotations.set("phred_quality", qual);
    else if (!isFsa && this.trim) throw new ValueError("The 'abi-trim' format can not be used for files without quality values.");
    if (this.trim && !isFsa) record = abiTrim(record);
    record.annotations.set("molecule_type", "DNA");
    stream.seekEnd();
    return record;
  }

  /** The bytes of a tag that Biopython decodes as text (anything else is an `AttributeError` in Python). */
  private asBytes(value: TagValue): Uint8Array {
    if (!(value instanceof Uint8Array)) throw new TypeError(`'${typeof value}' object has no attribute 'decode'`);
    return value;
  }
}

/** The `abi-trim` reader: ABIF with low-quality ends trimmed. */
export class AbiTrimIterator extends AbiIterator {
  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, true);
  }
}

