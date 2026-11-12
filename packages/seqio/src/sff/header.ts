/** SFF file header and index helpers (a port of the matching functions in Biopython's `SeqIO.SffIO`). */

import { AssertionError, ValueError, pyBytesRepr, warn } from "@biolibs/core";
import { decodeAscii } from "../binary/ascii.js";
import { calcsize, unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";

/** The magic numbers of the file and of its index blocks. */
export const MAGIC = { sff: ".sff", hsh: ".hsh", srt: ".srt", mft: ".mft" } as const;
const PARSER = "BiopythonParserWarning";

/** The common-header fields of an SFF file. */
export interface SffHeader {
  headerLength: number;
  indexOffset: number;
  indexLength: number;
  numberOfReads: number;
  numberOfFlowsPerRead: number;
  flowChars: string;
  keySequence: string;
}

/** Whether a byte run is all NULs. */
const allNull = (b: Uint8Array): boolean => b.every((x) => x === 0);

/** Python `bytes.count(b"\x00")` compared with the length. */
export const nullCount = (b: Uint8Array): number => b.reduce((n, x) => n + (x === 0 ? 1 : 0), 0);

/** The magic number as text. */
const magicText = (b: Uint8Array): string => String.fromCharCode(...b);

/**
 * Read the SFF common header.
 *
 * @throws {@link ValueError} for an empty or short file, a wrong magic number or version, or unsupported flowgram format.
 */
export function readFileHeader(handle: BinaryStream): SffHeader {
  const data = handle.read(31);
  if (data.length === 0) throw new ValueError("Empty file.");
  if (data.length < 31) throw new ValueError("File too small to hold a valid SFF header.");
  const [magic, ver0, ver1, ver2, ver3, indexOffset, indexLength, numberOfReads, headerLength, keyLength, flows, flowgramFormat] =
    unpack(">4s4BQIIHHHB", data) as [Uint8Array, number, number, number, number, bigint, number, number, number, number, number, number];
  const magicName = magicText(magic);
  if (magicName === MAGIC.hsh || magicName === MAGIC.srt || magicName === MAGIC.mft) throw new ValueError("Handle seems to be at SFF index block, not start");
  if (magicName !== MAGIC.sff) throw new ValueError(`SFF file did not start '.sff', but ${pyBytesRepr(magic)}`);
  if (ver0 !== 0 || ver1 !== 0 || ver2 !== 0 || ver3 !== 1) throw new ValueError(`Unsupported SFF version in header, ${ver0}.${ver1}.${ver2}.${ver3}`);
  if (flowgramFormat !== 1) throw new ValueError(`Flowgram format code ${flowgramFormat} not supported`);
  const offset = Number(indexOffset);
  if ((offset !== 0) !== (indexLength !== 0)) throw new ValueError(`Index offset ${offset} but index length ${indexLength}`);
  const flowChars = decodeAscii(handle.read(flows));
  const keySequence = decodeAscii(handle.read(keyLength));
  if (headerLength % 8 !== 0) throw new AssertionError();
  const padding = headerLength - flows - keyLength - 31;
  if (!(padding >= 0 && padding < 8)) throw new AssertionError(String(padding));
  if (nullCount(handle.read(padding)) !== padding) warn(`Your SFF file is invalid, post header ${padding} byte null padding region contained data.`, PARSER);
  return { headerLength, indexOffset: offset, indexLength, numberOfReads, numberOfFlowsPerRead: flows, flowChars, keySequence };
}

/** Where the pieces of a Roche index live. */
export interface RocheIndexInfo {
  numberOfReads: number;
  headerLength: number;
  indexOffset: number;
  indexLength: number;
  xmlOffset: number;
  xmlSize: number;
  readIndexOffset: number;
  readIndexSize: number;
}

/**
 * Locate the Roche index (`.mft` or `.srt`) of a file.
 *
 * @throws {@link ValueError} if there is no index, it is truncated, or it is of an unsupported kind.
 */
export function findRocheIndex(handle: BinaryStream): RocheIndexInfo {
  handle.seek(0);
  const h = readFileHeader(handle);
  if (handle.tell() !== h.headerLength) throw new AssertionError();
  if (!h.indexOffset || !h.indexLength) throw new ValueError("No index present in this SFF file");
  handle.seek(h.indexOffset);
  const fmtSize = calcsize(">4s4B");
  const data = handle.read(fmtSize);
  if (data.length === 0) throw new ValueError(`Premature end of file? Expected index of size ${h.indexLength} at offset ${h.indexOffset}, found nothing`);
  if (data.length < fmtSize) throw new ValueError(`Premature end of file? Expected index of size ${h.indexLength} at offset ${h.indexOffset}, found ${pyBytesRepr(data)}`);
  const [magic, v0, v1, v2, v3] = unpack(">4s4B", data) as [Uint8Array, number, number, number, number];
  const name = magicText(magic);
  const versionOk = v0 === 49 && v1 === 46 && v2 === 48 && v3 === 48;
  if (name === MAGIC.mft) {
    if (!versionOk) throw new ValueError(`Unsupported version in .mft index header, ${v0}.${v1}.${v2}.${v3}`);
    const fmt2Size = calcsize(">LL");
    const [xmlSize, dataSize] = unpack(">LL", handle.read(fmt2Size)) as [number, number];
    if (h.indexLength !== fmtSize + fmt2Size + xmlSize + dataSize) {
      throw new ValueError(`Problem understanding .mft index header, ${h.indexLength} != ${fmtSize} + ${fmt2Size} + ${xmlSize} + ${dataSize}`);
    }
    return {
      numberOfReads: h.numberOfReads, headerLength: h.headerLength, indexOffset: h.indexOffset, indexLength: h.indexLength,
      xmlOffset: h.indexOffset + fmtSize + fmt2Size, xmlSize, readIndexOffset: h.indexOffset + fmtSize + fmt2Size + xmlSize, readIndexSize: dataSize,
    };
  }
  if (name === MAGIC.srt) {
    if (!versionOk) throw new ValueError(`Unsupported version in .srt index header, ${v0}.${v1}.${v2}.${v3}`);
    const nulls = handle.read(4);
    if (nulls.length !== 4 || !allNull(nulls)) throw new ValueError("Did not find expected null four bytes in .srt index");
    return {
      numberOfReads: h.numberOfReads, headerLength: h.headerLength, indexOffset: h.indexOffset, indexLength: h.indexLength,
      xmlOffset: 0, xmlSize: 0, readIndexOffset: h.indexOffset + fmtSize + 4, readIndexSize: h.indexLength - fmtSize - 4,
    };
  }
  if (name === MAGIC.hsh) throw new ValueError("Hash table style indexes (.hsh) in SFF files are not (yet) supported");
  throw new ValueError(`Unknown magic number ${pyBytesRepr(magic)} in SFF index header:\n${pyBytesRepr(data)}`);
}

/**
 * The XML manifest stored in a Roche SFF index.
 *
 * @param handle - The file as a `BinaryStream`.
 * @throws {@link ValueError} if the file has no index or no manifest.
 */
export function readRocheXmlManifest(handle: BinaryStream): string {
  const info = findRocheIndex(handle);
  if (!info.xmlOffset || !info.xmlSize) throw new ValueError("No XML manifest found");
  handle.seek(info.xmlOffset);
  const bytes = handle.read(info.xmlSize);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValueError("'utf-8' codec can't decode bytes: invalid data");
  }
}
