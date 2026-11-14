/** Packing the fixed records of a bigBed file, the mirror of `RecordReader`. */

/**
 * Builds one record a field at a time, in the file's byte order.
 *
 * The writer always uses the machine's own order, as Biopython's `struct` formats with `=` do, and a bigBed
 * file's magic number is what tells a reader which that was. Little-endian is what every machine this runs on
 * uses, so that is what is written.
 */
export class RecordWriter {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private pos = 0;

  /** @param size - The record's size in bytes. */
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  /** @param v - An unsigned byte. @returns This, for chaining. */
  u8(v: number): this { this.view.setUint8(this.pos, v); this.pos += 1; return this; }
  /** @param v - An unsigned 16-bit integer. @returns This. */
  u16(v: number): this { this.view.setUint16(this.pos, v, true); this.pos += 2; return this; }
  /** @param v - An unsigned 32-bit integer. @returns This. */
  u32(v: number): this { this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; return this; }
  /** @param v - An unsigned 64-bit integer. @returns This. */
  u64(v: number): this { this.view.setBigUint64(this.pos, BigInt(Math.trunc(v)), true); this.pos += 8; return this; }
  /** @param v - A 32-bit float. @returns This. */
  f32(v: number): this { this.view.setFloat32(this.pos, v, true); this.pos += 4; return this; }
  /** @param v - A 64-bit float. @returns This. */
  f64(v: number): this { this.view.setFloat64(this.pos, v, true); this.pos += 8; return this; }
  /** @param n - How many zero bytes to leave. @returns This. */
  skip(n: number): this { this.pos += n; return this; }

  /**
   * @param text - Text to write as a fixed-size field, padded with NULs.
   * @param size - The field's size.
   * @returns This.
   */
  fixed(text: string, size: number): this {
    const encoded = new TextEncoder().encode(text);
    this.bytes.set(encoded.subarray(0, size), this.pos);
    this.pos += size;
    return this;
  }

  /** @returns The record's bytes. */
  done(): Uint8Array { return this.bytes; }
}

/** @param size - How many bytes. @returns That many zero bytes, which several of the file's fields are. */
export const zeros = (size: number): Uint8Array => new Uint8Array(size);
