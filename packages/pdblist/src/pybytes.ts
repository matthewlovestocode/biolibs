/** The few things Biopython does to the bytes of a list file, done as Python's `bytes` does them. */
import { utf8ErrorMessage, utf8Fault } from "@biolibs/core";
import { UnicodeDecodeError } from "@biolibs/entrez";

/** @param byte - One byte. @returns Whether `bytes.strip()` and `bytes.split()` treat it as whitespace. */
const isSpace = (byte: number): boolean => byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);

/**
 * Split a file into lines as iterating a Python file does: each line keeps its newline, and only `\n` ends one.
 *
 * @param data - The file.
 * @returns Its lines; none for an empty file.
 */
export function byteLines(data: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0a) {
      lines.push(data.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < data.length) lines.push(data.subarray(start));
  return lines;
}

/** Python's `bytes.strip()`. @param line - Some bytes. @returns Them without the whitespace at either end. */
export function byteStrip(line: Uint8Array): Uint8Array {
  let from = 0, to = line.length;
  while (from < to && isSpace(line[from]!)) from += 1;
  while (to > from && isSpace(line[to - 1]!)) to -= 1;
  return line.subarray(from, to);
}

/** Python's `bytes.split()`. @param line - Some bytes. @returns The runs between its whitespace. */
export function byteSplit(line: Uint8Array): Uint8Array[] {
  const words: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i <= line.length; i++) {
    const space = i === line.length || isSpace(line[i]!);
    if (!space && start < 0) start = i;
    if (space && start >= 0) {
      words.push(line.subarray(start, i));
      start = -1;
    }
  }
  return words;
}

/**
 * Python's `bytes.decode()`: strict UTF-8.
 *
 * @param bytes - The bytes.
 * @returns The text.
 * @throws `UnicodeDecodeError`, the entrez package's, with Python's wording, for bytes that are not UTF-8.
 */
export function decode(bytes: Uint8Array): string {
  const fault = utf8Fault(bytes);
  if (fault !== null) throw new UnicodeDecodeError(utf8ErrorMessage(bytes, fault));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** @param line - Some bytes. @param text - ASCII text. @returns Whether the bytes begin with it. */
export function startsWith(line: Uint8Array, text: string): boolean {
  if (line.length < text.length) return false;
  for (let i = 0; i < text.length; i++) if (line[i] !== text.charCodeAt(i)) return false;
  return true;
}
