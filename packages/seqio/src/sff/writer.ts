/** Writer for SFF files. */

import { AssertionError, RuntimeError, ValueError, warn } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { encodeAscii } from "../binary/ascii.js";
import { calcsize, pack } from "../binary/struct.js";
import type { BytesHandle } from "../handles.js";
import { SequenceWriter } from "../interfaces.js";

/** The Biopython version whose index comment is imitated. */
const BIOPYTHON_VERSION = "1.88";
const encoder = new TextEncoder();

/** Compare byte strings the way Python sorts `bytes`. */
function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Python's `x.encode("ASCII")` for an annotation that must be text. */
function asciiOf(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new TypeError(`'${typeof value}' object has no attribute 'encode'`);
  return encodeAscii(value);
}

/** A record's annotation lookup that distinguishes "missing" (Python `KeyError`) from a value. */
const annotation = (record: SeqRecord, key: string): { found: boolean; value: unknown } => ({ found: record.annotations.has(key), value: record.annotations.get(key) });

/**
 * Writes reads to an SFF file with an optional Roche-style index. The writer goes back to the start of the
 * target to fill in the header, so the target must be seekable (a `BytesHandle`).
 *
 * @param target - A seekable byte target. @param index - Write an index block (default true). @param xml - Text for the index's XML manifest.
 * @throws {@link ValueError} for records lacking flow data, qualities or clipping values, or an empty record list.
 */
export class SffWriter extends SequenceWriter {
  get modes(): string { return "b"; }
  private readonly xml: string | null;
  private index: [Uint8Array, number][] | null;
  private indexStart = 0;
  private indexLength = 0;
  private numberOfReads = 0;
  private keySequence: Uint8Array | undefined;
  private flowChars: Uint8Array | undefined;
  private numberOfFlowsPerRead = 0;

  /** @param target - Where to write. @param index - Write an index. @param xml - XML manifest text. */
  constructor(target: BytesHandle, index = true, xml: string | null = null) {
    super(target);
    this.xml = xml;
    this.index = index ? [] : null;
  }

  private get seekable(): BytesHandle {
    return this.handle as unknown as BytesHandle;
  }

  writeRecords(records: Iterable<SeqRecord>): number {
    this.numberOfReads = Array.isArray(records) ? records.length : 0;
    this.indexStart = 0;
    this.indexLength = 0;
    const iterator = records[Symbol.iterator]();
    const first = iterator.next();
    if (first.done) throw new ValueError("Must have at least one sequence");
    const firstRecord = first.value;
    const key = annotation(firstRecord, "flow_key");
    if (!key.found) throw new ValueError("Missing SFF flow information");
    this.keySequence = asciiOf(key.value);
    const chars = annotation(firstRecord, "flow_chars");
    if (!chars.found) throw new ValueError("Missing SFF flow information");
    this.flowChars = asciiOf(chars.value);
    this.numberOfFlowsPerRead = this.flowChars.length;
    this.writeHeader();
    this.writeRecord(firstRecord);
    let count = 1;
    for (let next = iterator.next(); !next.done; next = iterator.next()) {
      this.writeRecord(next.value);
      count += 1;
    }
    if (this.numberOfReads === 0) {
      // The number of reads was unknown at the start, so go back and rewrite the header.
      const offset = this.seekable.tell();
      this.seekable.seek(0);
      this.numberOfReads = count;
      this.writeHeader();
      this.seekable.seek(offset);
    } else if (count !== this.numberOfReads) {
      throw new AssertionError();
    }
    if (this.index !== null) this.writeIndex();
    return count;
  }

  /** Write the index block and update the header to point at it. */
  private writeIndex(): void {
    const index = this.index!;
    if (index.length !== this.numberOfReads) throw new AssertionError();
    const handle = this.seekable;
    index.sort((a, b) => compareBytes(a[0], b[0]) || a[1] - b[1]);
    this.indexStart = handle.tell();
    const xml = this.xml !== null ? encoder.encode(this.xml) : encoder.encode(
      `<!-- This file was output with Biopython ${BIOPYTHON_VERSION} -->\n` +
      "<!-- This XML and index block attempts to mimic Roche SFF files -->\n" +
      "<!-- This file may be a combination of multiple SFF files etc -->\n",
    );
    const fmt = ">I4BLL";
    const fmtSize = calcsize(fmt);
    handle.write(new Uint8Array([...new Uint8Array(fmtSize), ...xml]));
    let indexLen = 0;
    for (const [name, offset] of index) {
      // Offsets are stored in base 255 so that no byte is 255, which marks the end of the entry.
      let off3 = offset;
      const off0 = off3 % 255; off3 -= off0;
      const off1 = off3 % 65025; off3 -= off1;
      const off2 = off3 % 16581375; off3 -= off2;
      if (offset !== off0 + off1 + off2 + off3) throw new RuntimeError(`${offset} -> ${off0} ${off1} ${off2} ${off3}`);
      const digits = [Math.floor(off3 / 16581375), Math.floor(off2 / 65025), Math.floor(off1 / 255), off0];
      if (!digits.every((d) => d < 255)) throw new RuntimeError(`${offset} -> ${digits[3]} ${digits[2]} ${digits[1]} ${digits[0]}`);
      handle.write(new Uint8Array([...name, ...pack(">6B", 0, digits[0]!, digits[1]!, digits[2]!, digits[3]!, 255)]));
      indexLen += name.length + 6;
    }
    this.indexLength = fmtSize + xml.length + indexLen;
    let padding = 0;
    if (this.indexLength % 8) {
      padding = 8 - (this.indexLength % 8);
      handle.write(new Uint8Array(padding));
    }
    const offset = handle.tell();
    if (offset !== this.indexStart + this.indexLength + padding) throw new RuntimeError(`${offset} vs ${this.indexStart} + ${this.indexLength} + ${padding}`);
    handle.seek(this.indexStart);
    handle.write(new Uint8Array([...pack(fmt, 778921588, 49, 46, 48, 48, xml.length, indexLen), ...xml]));
    handle.seek(0);
    this.writeHeader();
    handle.seek(offset);
  }

  /** Write the common header (or rewrite it once counts and the index position are known). */
  writeHeader(): void {
    const keyLength = this.keySequence!.length;
    const fmt = `>I4BQIIHHHB${this.numberOfFlowsPerRead}s${keyLength}s`;
    const size = calcsize(fmt);
    const padding = size % 8 === 0 ? 0 : 8 - (size % 8);
    const headerLength = size + padding;
    const header = pack(fmt, 779314790, 0, 0, 0, 1, BigInt(this.indexStart), this.indexLength, this.numberOfReads, headerLength, keyLength, this.numberOfFlowsPerRead, 1, this.flowChars!, this.keySequence!);
    this.handle.write(new Uint8Array([...header, ...new Uint8Array(padding)]) as never);
  }

  writeRecord(record: SeqRecord): void {
    const name = encoder.encode(record.id as string);
    const nameLen = name.length;
    if (record.seq === null) throw new TypeError("cannot convert 'NoneType' object to bytes");
    const seq = record.seq.toBytes().map((b) => (b >= 97 && b <= 122 ? b - 32 : b));
    const seqLen = seq.length;
    if (!record.letterAnnotations.has("phred_quality")) throw new ValueError(`Missing PHRED qualities information for ${record.id}`);
    const quals = record.letterAnnotations.get("phred_quality") as unknown as number[];
    let flowValues: number[];
    let flowIndex: number[];
    // Mirrors one Python `try` block: a missing key is a KeyError, an unusable value an AttributeError, and the key
    // and character comparisons short-circuit.
    const missing = (): never => { throw new ValueError(`Missing SFF flow information for ${record.id}`); };
    const headerNotWritten = (): never => { throw new ValueError("Header not written yet?"); };
    const fv = annotation(record, "flow_values");
    if (!fv.found) missing();
    flowValues = fv.value as number[];
    const fi = annotation(record, "flow_index");
    if (!fi.found) missing();
    flowIndex = fi.value as number[];
    if (this.keySequence === undefined) headerNotWritten();
    const text = (key: string): Uint8Array => {
      const a = annotation(record, key);
      if (!a.found) return missing();
      if (typeof a.value !== "string") return headerNotWritten();
      return encoder.encode(a.value);
    };
    if (!sameBytes(this.keySequence, text("flow_key")) || !sameBytes(this.flowChars, text("flow_chars"))) throw new ValueError("Records have inconsistent SFF flow data");
    const clip = (key: string, plusOne: boolean): number => {
      const a = annotation(record, key);
      if (!a.found) throw new ValueError(`Missing SFF clipping information for ${record.id}`);
      let v = a.value as number;
      if (v < 0) throw new ValueError(`Negative SFF ${key} value for ${record.id}`);
      if (plusOne && v) v += 1;
      return v;
    };
    const clipQualLeft = clip("clip_qual_left", true);
    const clipQualRight = clip("clip_qual_right", false);
    const clipAdapterLeft = clip("clip_adapter_left", true);
    const clipAdapterRight = clip("clip_adapter_right", false);
    if (this.index !== null) {
      const offset = this.seekable.tell();
      if (offset > 4228250624) {
        warn(`Read ${String.fromCharCode(...name)} has file offset ${offset}, which is too large to store in the Roche SFF index structure. No index block will be recorded.`);
        this.index = null;
      } else {
        this.index.push([name, offset]);
      }
    }
    const readHeaderFmt = `>2HI4H${nameLen}s`;
    const size = calcsize(readHeaderFmt);
    const padding = size % 8 === 0 ? 0 : 8 - (size % 8);
    const readHeaderLength = size + padding;
    let data = new Uint8Array([...pack(readHeaderFmt, readHeaderLength, nameLen, seqLen, clipQualLeft, clipQualRight, clipAdapterLeft, clipAdapterRight, name), ...new Uint8Array(padding)]);
    const readFlowFmt = `>${this.numberOfFlowsPerRead}H`;
    const readFlowSize = calcsize(readFlowFmt);
    const tempFmt = `>${seqLen}B`;
    data = new Uint8Array([...data, ...pack(readFlowFmt, ...flowValues), ...pack(tempFmt, ...flowIndex), ...seq, ...pack(tempFmt, ...quals)]);
    let pad = (readFlowSize + seqLen * 3) % 8;
    if (pad) pad = 8 - pad;
    this.handle.write(new Uint8Array([...data, ...new Uint8Array(pad)]) as never);
  }
}

/** Whether two byte strings are equal (undefined counts as different). */
function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  return a !== undefined && a.length === b.length && a.every((x, i) => x === b[i]);
}
