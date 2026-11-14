/** A seekable sink of bytes, like a Python file opened for writing in binary mode. */

/**
 * Collects bytes, and lets a writer go back and patch what it has already put down.
 *
 * The bigBed writer needs that: it leaves room for its header, writes the data and the indexes to learn where
 * everything ended up, then seeks back to fill the header in. Marked `binary` so that `write` can tell a binary
 * target from a text one, as Biopython tells an open file's mode.
 */
export class ByteWriter {
  /** Distinguishes this from a text target. */
  readonly binary = true;
  private buf = new Uint8Array(1 << 16);
  private pos = 0;
  private end = 0;

  /** @param n - How many more bytes are about to be written at the current position. */
  private room(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.pos + n) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(this.buf.subarray(0, this.end));
    this.buf = bigger;
  }

  /** @param data - Bytes to write at the current position, which moves past them. */
  write(data: Uint8Array): void {
    this.room(data.length);
    this.buf.set(data, this.pos);
    this.pos += data.length;
    if (this.pos > this.end) this.end = this.pos;
  }

  /** @param n - How many zero bytes to write. */
  zeros(n: number): void { this.write(new Uint8Array(n)); }

  /** @returns The current position. */
  tell(): number { return this.pos; }

  /** @param offset - Where to move to; it may be anywhere inside what is written already. */
  seek(offset: number): void { this.pos = offset; }

  /** Move to the end of what has been written. */
  seekEnd(): void { this.pos = this.end; }

  /** @returns Everything written, as one block of bytes. */
  toBytes(): Uint8Array { return this.buf.slice(0, this.end); }
}

/**
 * Whether a write target takes bytes rather than text.
 *
 * @param target - The target `write` was given.
 * @returns True for a {@link ByteWriter}.
 */
export function isByteWriter(target: unknown): target is ByteWriter {
  return target !== null && typeof target === "object" && (target as { binary?: unknown }).binary === true;
}
