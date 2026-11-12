/** Low-level reading of the ABIF directory and tag values. */

import { AssertionError, ValueError } from "@biolibs/core";
import { calcsize, unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";
import { dateText, timeText } from "./datetime.js";

/** The struct format of each ABIF element code (an element count is put in front of it). */
const BYTEFMT: Record<number, string> = {
  1: "b", 2: "s", 3: "H", 4: "h", 5: "i", 6: "2i", 7: "f", 8: "d", 10: "h2B", 11: "4B", 12: "2i2b", 13: "B", 14: "2h", 15: "4h", 16: "2i", 17: "4i", 18: "s", 19: "s", 20: "2i",
};
/** File header: version, tag name, tag number, element code, element size, element count, data size, data offset. */
export const HEADFMT = ">H4sI2H3I";
/** One directory entry: name, number, element code, element size, element count, data size, data offset, data handle. */
export const DIRFMT = ">4sI2H4I";

/** A decoded tag value: bytes, number, text, flag, list of numbers, or null for an unknown element code. */
export type TagValue = Uint8Array | number | string | boolean | number[] | null;

/**
 * Decode the raw data of one tag according to its element code and count.
 *
 * @returns The value; text for dates and times; bytes for strings; null for an unknown element code.
 * @throws {@link AssertionError} if the data is not the size the code and count imply.
 */
export function parseTagData(elemCode: number, elemNum: number, raw: Uint8Array): TagValue {
  if (!Object.hasOwn(BYTEFMT, elemCode)) return null;
  const fmt = ">" + (elemNum === 1 ? "" : String(elemNum)) + BYTEFMT[elemCode]!;
  if (raw.length !== calcsize(fmt)) throw new AssertionError();
  const data = unpack(fmt, raw) as (number | Uint8Array)[];
  let value: (number | Uint8Array)[] | number | Uint8Array = data;
  if (elemCode !== 10 && elemCode !== 11 && data.length === 1) value = data[0]!;
  if (elemCode === 2) return value as Uint8Array;
  if (elemCode === 10) return dateText(data as number[]);
  if (elemCode === 11) return timeText((data as number[]).slice(0, 3));
  if (elemCode === 13) return Array.isArray(value) ? value.length > 0 : (value as number) !== 0;
  if (elemCode === 18) return (value as Uint8Array).slice(1);
  if (elemCode === 19) return (value as Uint8Array).slice(0, -1);
  return value as TagValue;
}

/** One directory entry's decoded content. */
export interface AbiTag { name: string; number: number; value: TagValue }

/** Python's strict UTF-8 `bytes.decode()`. */
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Python raises UnicodeDecodeError, a ValueError.
    throw new ValueError("'utf-8' codec can't decode bytes: invalid data");
  }
}

/**
 * Walk the directory of tags described by the file header, yielding each tag in file order.
 *
 * @throws StructError if the file ends inside a directory entry.
 */
export function* parseHeader(header: (number | bigint | boolean | string | Uint8Array)[], stream: BinaryStream): Generator<AbiTag> {
  const elemSize = header[4] as number;
  const elemNum = header[5] as number;
  const offset = header[7] as number;
  for (let index = 0; index < elemNum; index++) {
    const start = offset + index * elemSize;
    stream.seek(start);
    const entry = unpack(DIRFMT, stream.read(calcsize(DIRFMT))) as (number | Uint8Array)[];
    const tagName = decodeUtf8(entry[0] as Uint8Array);
    const tagNumber = entry[1] as number;
    const elemCode = entry[2] as number;
    const entryNum = entry[4] as number;
    const dataSize = entry[5] as number;
    let dataOffset = entry[6] as number;
    // Values of four bytes or fewer are stored inside the directory entry itself.
    if (dataSize <= 4) dataOffset = start + 20;
    stream.seek(dataOffset);
    yield { name: tagName, number: tagNumber, value: parseTagData(elemCode, entryNum, stream.read(dataSize)) };
  }
}

