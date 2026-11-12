/** Byte-level helpers for the record indexers: a seekable line reader and ASCII string functions that behave like Python's `bytes`. */

import { ValueError, pyBytesRepr } from "@biolibs/core";

/** ASCII whitespace, which is all `bytes.strip()` and `bytes.split()` treat as white. */
const WS = new Set([" ", "\t", "\n", "\r", "\x0b", "\x0c"]);

/**
 * A seekable in-memory file. Lines are *binary strings*: one JavaScript character per byte (Latin-1), so offsets and
 * lengths are byte counts, as in the Python code that reads files in binary mode.
 */
export class ByteHandle {
  private pos = 0;
  /** The whole content as a binary string. */
  readonly data: string;

  /** @param bytes - The file contents. */
  constructor(readonly bytes: Uint8Array) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    this.data = s;
  }

  /** @returns The current offset. */
  tell(): number { return this.pos; }

  /** @param offset - Where to move to. */
  seek(offset: number): void { this.pos = offset; }

  /** @returns The next line including its `\n` (or the rest of the file), `""` at the end. */
  readline(): string {
    if (this.pos >= this.data.length) return "";
    const nl = this.data.indexOf("\n", this.pos);
    const end = nl === -1 ? this.data.length : nl + 1;
    const line = this.data.slice(this.pos, end);
    this.pos = end;
    return line;
  }

  /** Release the data (a no-op in memory). */
  close(): void { /* nothing to release */ }
}

/** Python `bytes.strip()`. @param s - A binary string. */
export function bstrip(s: string): string {
  let a = 0, b = s.length;
  while (a < b && WS.has(s[a]!)) a++;
  while (b > a && WS.has(s[b - 1]!)) b--;
  return s.slice(a, b);
}

/** Python `bytes.rstrip()`. @param s - A binary string. */
export function brstrip(s: string): string {
  let b = s.length;
  while (b > 0 && WS.has(s[b - 1]!)) b--;
  return s.slice(0, b);
}

/** Python `bytes.split()` on whitespace runs. @param s - A binary string. @returns The tokens (empty for blank input). */
export function bsplit(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (WS.has(ch)) { if (cur) { out.push(cur); cur = ""; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** `s[0]` of a split that must have a first token. @throws IndexError ("list index out of range") for blank input. */
export function firstToken(s: string): string {
  const t = bsplit(s)[0];
  if (t === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
  return t;
}

/** A binary string as bytes. @param s - A binary string. */
export function toBytes(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/**
 * Python `bytes.decode()` (UTF-8, strict).
 *
 * @param s - A binary string.
 * @throws ValueError (Python's UnicodeDecodeError is a ValueError) for invalid UTF-8.
 */
export function decodeUtf8(s: string): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(toBytes(s)); } catch { throw new ValueError("invalid UTF-8"); }
}

/** Python `repr(bytes)` of a binary string. @param s - A binary string. */
export function reprBytes(s: string): string {
  return pyBytesRepr(toBytes(s));
}

/** An `AssertionError` as raised by a failed `assert` (the message is optional). */
export class AssertionError extends Error {
  override name = "AssertionError";
}
