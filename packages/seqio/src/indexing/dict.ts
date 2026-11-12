/** `IndexedSeqFileDict`: a read-only, dictionary-like view of the records in a sequence file, parsed on demand. */

import { KeyError, ValueError, pyRepr } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { toBytes } from "./bytes.js";
import type { SeqFileRandomAccess } from "./proxies.js";

/** Turns the record id into the key to index by. */
export type KeyFunction = (id: string) => string;

/**
 * Keys and file offsets are kept; records are parsed only when asked for. Iteration follows the order of the file.
 * Asking for the same key twice in a row returns the same object. Keys must be unique.
 */
export class IndexedSeqFileDict {
  private offsets = new Map<string, number>();
  private cached: [string | null, SeqRecord | null] = [null, null];

  /**
   * @param proxy - The format's random-access reader.
   * @param keyFunction - Optional transform of each record id into a key.
   * @param reprText - Text for {@link IndexedSeqFileDict.repr}.
   * @param objRepr - Name of the value type for {@link IndexedSeqFileDict.toString}.
   * @throws ValueError (`Duplicate key 'x'`) when two records have the same key; any error the indexer raises on a malformed file.
   */
  constructor(private proxy: SeqFileRandomAccess, private keyFunction: KeyFunction | null, private reprText: string, private objRepr: string) {
    for (const [key0, offset] of proxy.iterate()) {
      const key = keyFunction ? keyFunction(key0) : key0;
      if (this.offsets.has(key)) {
        proxy.handle.close();
        throw new ValueError(`Duplicate key '${key}'`);
      }
      this.offsets.set(key, offset);
    }
  }

  /** @returns Python's repr of the object, e.g. `SeqIO.index('x.fasta', 'fasta', alphabet=None, key_function=None)`. */
  repr(): string { return this.reprText; }

  /** @returns `{'first key' : SeqRecord(...), ...}`, or `{}` when empty. */
  toString(): string {
    return this.size > 0 ? `{${pyRepr([...this.offsets.keys()][0])} : ${this.objRepr}(...), ...}` : "{}";
  }

  /** The number of records. */
  get size(): number { return this.offsets.size; }

  /** @returns The keys in file order. */
  keys(): IterableIterator<string> { return this.offsets.keys(); }

  /** @returns The keys in file order. */
  [Symbol.iterator](): IterableIterator<string> { return this.offsets.keys(); }

  /**
   * Python's `key in index`. Biopython's mapping base class answers this by fetching the record, so an indexed key
   * whose record cannot be parsed raises that error instead of returning true.
   *
   * @param key - A key.
   * @returns Whether the file has such a record.
   */
  has(key: string): boolean {
    try { this.get(key); } catch (e) { if ((e as Error).name === "KeyError") return false; throw e; }
    return true;
  }

  /**
   * The record for a key, parsed from the file.
   *
   * @param key - A key.
   * @throws KeyError for an unknown key; ValueError if the parsed record's key differs from the indexed one.
   */
  get(key: string): SeqRecord {
    if (key === this.cached[0]) return this.cached[1]!;
    const offset = this.offsets.get(key);
    if (offset === undefined) throw new KeyError(key);
    const record = this.proxy.get(offset);
    const key2 = this.keyFunction ? this.keyFunction(record.id!) : record.id!;
    if (key !== key2) throw new ValueError(`Key did not match (${key} vs ${key2})`);
    this.cached = [key, record];
    return record;
  }

  /** Like Python's `dict.get`: the record, or `fallback` for an unknown key. */
  tryGet<T>(key: string, fallback: T): SeqRecord | T {
    try { return this.get(key); } catch (e) { if ((e as Error).name === "KeyError") return fallback; throw e; }
  }

  /** @returns Every record, parsed one by one in file order. */
  *values(): IterableIterator<SeqRecord> { for (const k of this.keys()) yield this.get(k); }

  /** @returns `[key, record]` pairs in file order. */
  *items(): IterableIterator<[string, SeqRecord]> { for (const k of this.keys()) yield [k, this.get(k)]; }

  /**
   * The record's raw bytes exactly as they appear in the file.
   *
   * @param key - A key.
   * @throws KeyError for an unknown key.
   */
  getRaw(key: string): Uint8Array {
    const offset = this.offsets.get(key);
    if (offset === undefined) throw new KeyError(key);
    return toBytes(this.proxy.getRaw(offset));
  }

  /** Release the file (a no-op for in-memory data, kept for API parity). */
  close(): void { this.proxy.handle.close(); }
}
