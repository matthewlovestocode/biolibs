/** Character-level helpers for the XML scanner: decoding bytes and byte offsets. */

/** Declared or detected text encodings the scanner can decode. */
type Encoding = "utf-8" | "iso-8859-1" | "us-ascii";

/**
 * Decode a document and compute, for every character index, its byte offset in the input.
 *
 * @returns The text, an offset table (`offsets[i]` is the byte offset of character `i`, with one extra entry for the end),
 *   or `null` text if the bytes are not valid in the document's encoding.
 */
export function decodeDocument(bytes: Uint8Array, ignoreDeclaredEncoding = false): { text: string | null; offsets: Uint32Array; badAt?: number } {
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  // The XML declaration is ASCII, so it can be read before decoding to find the encoding.
  const head = new TextDecoder("latin1").decode(bytes.subarray(start, start + 200));
  const m = /^<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z][A-Za-z0-9._-]*)["']/.exec(head);
  const name = ignoreDeclaredEncoding ? "utf-8" : (m?.[1] ?? "utf-8").toLowerCase();
  let encoding: Encoding;
  if (name === "utf-8" || name === "utf8") encoding = "utf-8";
  else if (name === "iso-8859-1" || name === "latin1" || name === "latin-1") encoding = "iso-8859-1";
  else if (name === "us-ascii" || name === "ascii") encoding = "us-ascii";
  else return { text: null, offsets: new Uint32Array(1) };

  const body = bytes.subarray(start);
  if (encoding === "utf-8") {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      // Expat points at the byte that is not valid UTF-8, so the bytes up to it are what gives its position.
      return { text: null, offsets: new Uint32Array(1), badAt: start + firstInvalidUtf8(body) };
    }
    const offsets = new Uint32Array(text.length + 1);
    let at = start;
    for (let i = 0; i < text.length; i++) {
      offsets[i] = at;
      const c = text.charCodeAt(i);
      if (c < 0x80) at += 1;
      else if (c < 0x800) at += 2;
      else if (c >= 0xd800 && c < 0xdc00) at += 4; // high surrogate carries the whole 4-byte sequence
      else if (c >= 0xdc00 && c < 0xe000) at += 0;
      else at += 3;
    }
    offsets[text.length] = at;
    return { text, offsets };
  }
  if (encoding === "us-ascii" && body.some((b) => b > 0x7f)) return { text: null, offsets: new Uint32Array(1) };
  const text = new TextDecoder("latin1").decode(body);
  const offsets = new Uint32Array(text.length + 1);
  for (let i = 0; i <= text.length; i++) offsets[i] = start + i;
  return { text, offsets };
}

/** Whether `c` may start an XML name (letters, `_`, `:` and any non-ASCII letter). */
export function isNameStart(c: string): boolean {
  return /[A-Za-z_:]/.test(c) || c > "\u007f";
}

/** Whether `c` may continue an XML name. */
export function isNameChar(c: string): boolean {
  return /[A-Za-z0-9_:.\-]/.test(c) || c > "\u007f";
}

/** Whether `c` is XML whitespace (space, tab, CR, LF). */
export function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

/** Whether a code point is allowed in an XML document. */
export function isXmlChar(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || (code >= 0x20 && code !== 0xfffe && code !== 0xffff);
}

/** The predefined entities. */
export const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/**
 * Where a run of bytes stops being valid UTF-8.
 *
 * @param bytes - The bytes to check.
 * @returns The index of the first byte that cannot be decoded, or the length if they all can.
 */
export function firstInvalidUtf8(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let len: number;
    if (b < 0x80) len = 1;
    else if (b >= 0xc2 && b <= 0xdf) len = 2;
    else if (b >= 0xe0 && b <= 0xef) len = 3;
    else if (b >= 0xf0 && b <= 0xf4) len = 4;
    else return i;
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if (c === undefined || c < 0x80 || c > 0xbf) return i;
    }
    // The ranges that encode a code point two ways, or one that does not exist.
    if (len === 3 && b === 0xe0 && bytes[i + 1]! < 0xa0) return i;
    if (len === 3 && b === 0xed && bytes[i + 1]! > 0x9f) return i;
    if (len === 4 && b === 0xf0 && bytes[i + 1]! < 0x90) return i;
    if (len === 4 && b === 0xf4 && bytes[i + 1]! > 0x8f) return i;
    i += len;
  }
  return bytes.length;
}
