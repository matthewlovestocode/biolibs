/**
 * Reading part of a file: the one thing a parser needs in order to work on a file too large to load.
 *
 * Every other reader in this package is handed the whole file. A {@link ByteSource} is instead asked
 * for the bytes between two positions and answers when it has them, so the file can stay on disk or on
 * a server. This has no counterpart in Biopython, which reads from an open file and seeks.
 */
import { ValueError } from "@biolibs/core";

/** Something that can supply any stretch of a file's bytes on request. */
export interface ByteSource {
  /** The length of the whole file, in bytes. */
  readonly size: number;
  /**
   * Read part of the file.
   *
   * @param start - The first byte wanted, counting from 0.
   * @param end - One past the last byte wanted. It may lie beyond the end of the file.
   * @returns The bytes from `start` up to `end`, or up to the end of the file if that comes first.
   */
  read(start: number, end: number): Promise<Uint8Array>;
}

/**
 * A source over bytes already in memory. Useful for tests, and for treating a small file the same way
 * as a large one.
 *
 * @param bytes - The whole file. @returns A source that slices it.
 * @example
 * ```ts
 * const source = bytesSource(new Uint8Array([1, 2, 3, 4]));
 * await source.read(1, 3);   // Uint8Array [2, 3]
 * ```
 */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return { size: bytes.length, read: async (start, end) => bytes.subarray(Math.max(0, start), Math.max(0, end)) };
}

/**
 * A source over a `Blob`, which in a browser includes a `File` the user has chosen or dropped. Only the
 * parts asked for are read from disk, so the file can be far larger than memory.
 *
 * @param blob - The file. @returns A source that reads slices of it.
 * @example
 * ```ts
 * input.addEventListener("change", async () => {
 *   const source = blobSource(input.files![0]!);
 *   source.size;                    // the file's size, known without reading it
 *   await source.read(0, 16);       // just its first 16 bytes
 * });
 * ```
 */
export function blobSource(blob: Blob): ByteSource {
  return { size: blob.size, read: async (start, end) => new Uint8Array(await blob.slice(Math.max(0, start), Math.max(0, end)).arrayBuffer()) };
}

/**
 * A source over a file on a web server, read with HTTP range requests.
 *
 * The server has to support range requests, as static file servers and object stores do; from a page on
 * another site it must also allow the `Range` header through CORS. The first request finds the file's
 * size.
 *
 * @param url - The file's address.
 * @param fetcher - What to fetch with (default: the platform's `fetch`).
 * @returns A source that fetches ranges of the file.
 * @throws {@link ValueError} if the server answers with an error, or does not say how large the file is.
 * @example
 * ```ts
 * const source = await urlSource("https://example.org/genome.2bit");
 * await source.read(0, 16);   // one request, for 16 bytes
 * ```
 */
export async function urlSource(url: string, fetcher: typeof fetch = fetch): Promise<ByteSource> {
  /** Fetch one range. @returns The response, checked for success. */
  const range = async (start: number, end: number): Promise<Response> => {
    const response = await fetcher(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (!response.ok) throw new ValueError(`${url} answered a range request with HTTP ${response.status}`);
    return response;
  };
  // A one-byte request is enough to learn the size: the reply says "bytes 0-0/<total>".
  const probe = await range(0, 1);
  const total = /\/(\d+)\s*$/.exec(probe.headers.get("content-range") ?? "")?.[1];
  // A server that ignores Range sends the whole file with status 200; its length is then the size.
  const size = total !== undefined ? Number(total) : probe.status === 200 ? Number(probe.headers.get("content-length") ?? NaN) : NaN;
  if (!Number.isFinite(size)) throw new ValueError(`${url} did not say how large the file is, so it cannot be read in parts`);
  return {
    size,
    read: async (start, end) => {
      const from = Math.max(0, start);
      const to = Math.min(size, end);
      if (to <= from) return new Uint8Array(0);
      const response = await range(from, to);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // 206 means the server sent just the range; 200 means it sent everything, so take the range out of it.
      return response.status === 206 ? bytes : bytes.subarray(from, to);
    },
  };
}

/** A {@link ByteSource} that also keeps count of what has been read through it. */
export interface CountingSource extends ByteSource {
  /** How many bytes have been read so far. */
  bytesRead: number;
  /** How many reads have been made so far. */
  requests: number;
}

/**
 * Wrap a source so that it counts what is read through it: the measure of whether a reader is really
 * taking only what it needs.
 *
 * @param source - Any source. @returns The same source, counting.
 * @example
 * ```ts
 * const counted = countingSource(blobSource(file));
 * await counted.read(0, 16);
 * counted.bytesRead;   // 16
 * counted.requests;    // 1
 * ```
 */
export function countingSource(source: ByteSource): CountingSource {
  const counted: CountingSource = {
    size: source.size,
    bytesRead: 0,
    requests: 0,
    read: async (start, end) => {
      const bytes = await source.read(start, end);
      counted.bytesRead += bytes.length;
      counted.requests++;
      return bytes;
    },
  };
  return counted;
}
