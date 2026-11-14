/**
 * Random access to an SFF file: `SeqIO.index` over the reads, through the Roche index when the file carries one and
 * by scanning the reads when it does not.
 *
 * An SFF file is binary and fixed-width, so unlike the text formats there is nothing to search for: either the file
 * has a Roche index block (`.srt1.00` or `.mft1.00`) that lists every read's name and offset, or every read has to
 * be stepped over to learn where the next one starts. Biopython tries the index first and falls back silently —
 * Ion Torrent's files carry none — and this does the same.
 */

import { pyDecodeUtf8, pyBytesRepr, AssertionError, ValueError, warn } from "@biolibs/core";
import { SeqFileRandomAccess, type Entry } from "../indexing/proxies.js";
import type { SeqRecord } from "@biolibs/seqrecord";
import { calcsize, unpack } from "../binary/struct.js";
import { SffIterator } from "./iterator.js";
import { BinaryStream } from "../handles.js";
import { READ_HEADER_FMT, READ_HEADER_SIZE, checkEof, findRocheIndex, nullCount, readFileHeader, type SffHeader } from "./header.js";

/** The warning category Biopython uses for a damaged but readable SFF file. */
const PARSER = "BiopythonParserWarning";

/** The byte Roche's index uses to end an entry; it also keeps every offset digit below 255. */
const FLAG = 0xff;

/** Python's `ValueError` for the index itself, which the caller may catch to fall back on scanning. */
const valueError = (message: string): Error => Object.assign(new Error(message), { name: "ValueError" });

/**
 * One read's raw bytes, from the current position.
 *
 * The lengths come out of the read's own header, so this walks the same fields the record reader does and warns
 * about the same damaged padding, but returns the bytes rather than a record.
 *
 * @param stream - Positioned at the start of a read.
 * @param readFlowSize - Bytes of flowgram values per read, from the file header.
 * @returns The offset just past the read, so the caller can take the bytes between.
 * @throws {@link ValueError} for a header whose length is impossible.
 */
export function readRawRecord(stream: BinaryStream, readFlowSize: number): number {
  // `">2HI"`, not the full read header: Biopython reads the three lengths, then the clip values and the name
  // together, so the padding is measured from there.
  const shortSize = calcsize(">2HI");
  const [readHeaderLength, nameLength, seqLen] = unpack(">2HI", stream.read(shortSize)) as number[];
  if (readHeaderLength! < 10 || readHeaderLength! % 8 !== 0) throw new ValueError(`Malformed read header, says length is ${readHeaderLength}`);
  stream.read(8 + nameLength!);
  let padding = readHeaderLength! - shortSize - 8 - nameLength!;
  if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post name ${padding} byte padding region contained data`, PARSER);
  const size = readFlowSize + seqLen! * 3;
  stream.read(size);
  padding = size % 8;
  if (padding) {
    padding = 8 - padding;
    if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post quality ${padding} byte padding region contained data`, PARSER);
  }
  return stream.tell();
}

/**
 * The read names and offsets out of a file's Roche index block.
 *
 * The offsets are base 255, not 256, so that 0xFF can end an entry whatever the name's length. Four digits is all
 * Roche's own tools write, which caps the index at just under 4 GB; a fifth is refused rather than guessed at.
 *
 * @param stream - The file.
 * @returns Each read's name and the offset of its data.
 * @throws A `ValueError` for a truncated or unexpected index, which is how the caller knows to scan instead.
 */
export function* readRocheIndex(stream: BinaryStream): Generator<[string, number]> {
  const info = findRocheIndex(stream);
  stream.seek(info.readIndexOffset);
  for (let read = 0; read < info.numberOfReads; read++) {
    const parts: number[] = [...stream.read(6)];
    for (;;) {
      const more = stream.read(1);
      if (more.length === 0) throw valueError("Premature end of file!");
      parts.push(more[0]!);
      if (more[0] === FLAG) break;
    }
    // Biopython decodes the name, and an invalid byte there is a UnicodeDecodeError -- a ValueError, so it
    // sends the caller down the slow path like any other damaged index.
    const name = pyDecodeUtf8(Uint8Array.from(parts.slice(0, -6)));
    const [off4, off3, off2, off1, off0] = parts.slice(-6, -1);
    if (off4) throw valueError("Expected a null terminator to the read name.");
    yield [name, off0! + 255 * off1! + 65025 * off2! + 16581375 * off3!];
  }
  const end = info.readIndexOffset + info.readIndexSize;
  if (stream.tell() !== end) throw valueError(`Problem with index length? ${stream.tell()} vs ${end}`);
}

/**
 * The read names and offsets found by stepping over every read.
 *
 * Slower than the index block but always available. An index block that sits among the reads is stepped over, as
 * the record reader does.
 *
 * @param stream - The file.
 * @param header - Its already-parsed header.
 * @returns Each read's name and offset.
 * @throws {@link ValueError} for a read header whose length is impossible.
 */
export function* slowIndex(stream: BinaryStream, _header: SffHeader): Generator<[string, number]> {
  // The header is read again here, as Biopython reads it: a file whose padding or header length is wrong says so
  // once more, and an impossible header length is an assertion rather than a complaint about the reads.
  stream.seek(0);
  const header = readFileHeader(stream);
  const readFlowSize = calcsize(`>${header.numberOfFlowsPerRead}H`);
  for (let read = 0; read < header.numberOfReads; read++) {
    let recordOffset = stream.tell();
    if (recordOffset === header.indexOffset) {
      let offset = header.indexOffset + header.indexLength;
      if (offset % 8) offset += 8 - (offset % 8);
      stream.seek(offset);
      recordOffset = offset;
    }
    const raw = stream.read(READ_HEADER_SIZE);
    const [readHeaderLength, nameLength, seqLen] = unpack(READ_HEADER_FMT, raw) as number[];
    // The slow walk prints the bytes with its complaint, unlike the two readers that say only the length.
    if (readHeaderLength! < 10 || readHeaderLength! % 8 !== 0) {
      throw new ValueError(`Malformed read header, says length is ${readHeaderLength}:\n${pyBytesRepr(raw)}`);
    }
    // Biopython decodes the name, so an invalid byte here is a UnicodeDecodeError with Python's own wording.
    const name = pyDecodeUtf8(stream.read(nameLength!));
    let padding = readHeaderLength! - READ_HEADER_SIZE - nameLength!;
    if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post name ${padding} byte padding region contained data`, PARSER);
    // The header has to have taken exactly as many bytes as it said, which a truncated file breaks.
    if (recordOffset + readHeaderLength! !== stream.tell()) throw new AssertionError();
    const size = readFlowSize + 3 * seqLen!;
    stream.seek(stream.tell() + size);
    padding = size % 8;
    if (padding) {
      padding = 8 - padding;
      if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post quality ${padding} byte padding region contained data`, PARSER);
    }
    yield [name, recordOffset];
  }
  if (stream.tell() % 8 !== 0) throw new ValueError("After scanning reads, did not end on a multiple of 8");
}

/** Random access to the reads of an SFF file. */
export class SffRandomAccess extends SeqFileRandomAccess {
  /** The file header, which every read's layout depends on. */
  protected readonly header: SffHeader;
  /** Bytes of flowgram values per read. */
  protected readonly readFlowSize: number;

  /** The file as a seekable stream; `ByteHandle` reads lines, which a binary format has none of. */
  protected readonly stream: BinaryStream;

  /** @param bytes - The file. @param format - `"sff"` or `"sff-trim"`. */
  constructor(bytes: Uint8Array, format: string) {
    super(bytes, format);
    this.stream = new BinaryStream(bytes);
    this.header = readFileHeader(this.stream);
    this.readFlowSize = calcsize(`>${this.header.numberOfFlowsPerRead}H`);
  }

  /**
   * Every read's name and offset: from the Roche index when there is one, otherwise by scanning.
   *
   * A broken index block is reported as a warning and the scan takes over, which is what Biopython does; a file
   * with no index block at all falls back without a word, since Ion Torrent writes none.
   *
   * @returns Each read's key, offset and a length of 0 (a read's length comes from its own header).
   * @throws A `ValueError` when the number of reads found is not the number the header promised.
   */
  *iterate(): Generator<Entry> {
    const stream = this.stream;
    // Biopython reads the file header again here, and once more inside the index search, so a file whose header
    // padding is not what it should be warns about it each time.
    stream.seek(0);
    const { indexOffset, indexLength, numberOfReads } = readFileHeader(stream);
    if (indexOffset && indexLength) {
      // The entries go out as they are read, not once they are all in: whoever is building the index sees each
      // one immediately, so a duplicate key is its complaint rather than this one's.
      let count = 0;
      let maxOffset = 0;
      try {
        for (const [name, offset] of readRocheIndex(stream)) {
          maxOffset = Math.max(maxOffset, offset);
          yield [name, offset, 0];
          count += 1;
        }
        if (count !== numberOfReads) throw valueError(`Indexed ${count} records, expected ${numberOfReads}`);
      } catch (e) {
        if ((e as Error).name !== "ValueError") throw e;
        warn(`Could not parse the SFF index: ${(e as Error).message}`, PARSER);
        // Entries already handed over cannot be taken back, and Biopython asserts rather than carrying on.
        if (count !== 0) throw new AssertionError("Partially populated index");
        // Only a seek here: the walk reads the header itself, which is what warns about it once more.
        stream.seek(0);
        yield* this.scan(stream, numberOfReads);
        return;
      }
      // Biopython checks the end of the file even when the index spared it the walk: the last read has to be
      // stepped over first, since the index says where the reads start but not where they end.
      if (indexOffset + indexLength <= maxOffset) {
        stream.seek(maxOffset);
        readRawRecord(stream, this.readFlowSize);
      }
      checkEof(stream, stream.tell(), indexOffset, indexLength);
      return;
    }
    yield* this.scan(stream, numberOfReads);
  }

  /**
   * Walk the reads, checking that the file holds as many as it claims.
   *
   * @param stream - The file.
   * @param numberOfReads - What the header promised.
   * @returns Each read's key, offset and a length of 0.
   * @throws A `ValueError` for a count that does not match.
   */
  private *scan(stream: BinaryStream, numberOfReads: number): Generator<Entry> {
    let count = 0;
    for (const [name, offset] of slowIndex(stream, this.header)) {
      yield [name, offset, 0];
      count += 1;
    }
    if (count !== numberOfReads) throw valueError(`Indexed ${count} records, expected ${numberOfReads}`);
    checkEof(stream, stream.tell(), this.header.indexOffset, this.header.indexLength);
  }

  /**
   * The record that starts at an offset.
   *
   * The generic path would run the format's reader over the raw bytes, which cannot work here: one read is not an
   * SFF file. Biopython reuses the iterator's own reader instead, and so does this.
   *
   * @param offset - Where the read starts.
   * @returns The record, with the clipped regions kept.
   */
  override get(offset: number): SeqRecord {
    return new SffIterator(this.handle.bytes, null, this.trimmed).readAt(offset);
  }

  /** Whether this indexer trims the clipped regions, which `sff-trim` does. */
  protected get trimmed(): boolean { return false; }

  /**
   * One read's bytes.
   *
   * @param offset - Where the read starts.
   * @returns The bytes as a binary string, as the other indexers return them.
   */
  override getRaw(offset: number): string {
    this.stream.seek(offset);
    const end = readRawRecord(this.stream, this.readFlowSize);
    return this.handle.data.slice(offset, end);
  }
}

/** Random access to the reads of an SFF file, with the clipped regions removed (`sff-trim`). */
export class SffTrimmedRandomAccess extends SffRandomAccess {
  protected override get trimmed(): boolean { return true; }
}
