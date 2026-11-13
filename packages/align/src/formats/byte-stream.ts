/** A seekable source of bytes, like a Python file opened in binary mode, for the formats that are not text. */

import { ValueError } from "@biolibs/core";

/** Mirrors `struct.error`, which Python reports as `error`: a buffer too short for the record being unpacked. */
export class StructError extends ValueError {
  override name = "error";
}

/**
 * Reading position over a block of bytes, with the integer reads the binary formats need.
 *
 * Mirrors what `Bio.Align.bigbed` does with an open binary file: it seeks to the offsets the indexes hold and
 * reads fixed-size records with `struct.unpack`. The whole file is in memory here, as the text formats' contents
 * are.
 */
export class ByteStream {
  private pos = 0;
  private readonly view: DataView;
  /** Whether multi-byte integers are read least significant byte first; set from the file's magic number. */
  little = true;

  /** @param data - The whole contents. */
  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * @param n - How many bytes to take.
   * @returns Them, or fewer at the end of the data, as Python's `read` does.
   */
  read(n: number): Uint8Array {
    const end = Math.min(this.pos + n, this.data.length);
    const out = this.data.subarray(this.pos, end);
    this.pos = end;
    return out;
  }

  /**
   * @param n - How many bytes the caller must have.
   * @returns Them.
   * @throws {@link StructError} at the end of the data, as Python's `struct.unpack` does for a short buffer.
   */
  readExact(n: number): Uint8Array {
    const out = this.read(n);
    if (out.length !== n) throw new StructError(`unpack requires a buffer of ${n} bytes`);
    return out;
  }

  /**
   * Read one fixed-size record and return a reader over it.
   *
   * This is the shape of the Python the binary formats are ported from: `data = stream.read(size)` and then
   * `formatter.unpack(data)`, which is also where the error for a file that stops early comes from.
   *
   * @param size - The record's size in bytes.
   * @returns A reader over exactly those bytes, with this stream's byte order.
   * @throws {@link StructError} when fewer bytes are left.
   */
  record(size: number): RecordReader {
    return new RecordReader(this.readExact(size), this.little);
  }

  /** @param offset - Where to move to. */
  seek(offset: number): void { this.pos = offset; }

  /** @returns The current offset. */
  tell(): number { return this.pos; }

  /**
   * @returns The next unsigned 64-bit integer as a number.
   * @throws ValueError for a value too large to hold exactly, which no real file offset reaches.
   */
  u64(): number {
    const v = this.view.getBigUint64(this.pos, this.little);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValueError(`offset ${v} is too large`);
    return Number(v);
  }

  /** @param n - How many bytes to skip. */
  skip(n: number): void { this.pos += n; }
}

/**
 * The text of a NUL-padded fixed-size field, as the B+ tree stores chromosome names.
 *
 * @param bytes - The field's bytes.
 * @returns Its text, with the padding removed.
 */
export function trimmedAscii(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Reads the fields of one fixed-size record, which {@link ByteStream.record} has already taken from the stream.
 *
 * Nothing here can run past the end of a file: the record's size was checked when it was read.
 */
export class RecordReader {
  private pos = 0;
  private readonly view: DataView;

  /** @param data - The record's bytes. @param little - Whether its integers are little-endian. */
  constructor(data: Uint8Array, private readonly little: boolean) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.bytesOf = data;
  }

  /** The record's own bytes, for the fields that are text. */
  private readonly bytesOf: Uint8Array;

  /** @returns The next unsigned byte. */
  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  /** @returns The next unsigned 16-bit integer. */
  u16(): number { const v = this.view.getUint16(this.pos, this.little); this.pos += 2; return v; }
  /** @returns The next unsigned 32-bit integer. */
  u32(): number { const v = this.view.getUint32(this.pos, this.little); this.pos += 4; return v; }

  /**
   * @returns The next unsigned 64-bit integer as a number.
   * @throws ValueError for a value too large to hold exactly, which no real file offset reaches.
   */
  u64(): number {
    const v = this.view.getBigUint64(this.pos, this.little);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValueError(`offset ${v} is too large`);
    return Number(v);
  }

  /** @param n - How many bytes to take. @returns Them. */
  bytes(n: number): Uint8Array { const out = this.bytesOf.subarray(this.pos, this.pos + n); this.pos += n; return out; }

  /** @param n - How many bytes to skip. */
  skip(n: number): void { this.pos += n; }
}
