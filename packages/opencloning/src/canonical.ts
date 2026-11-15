/**
 * One document, one string of bytes.
 *
 * Nothing in this file is pydna's. It exists because a signature is over bytes, and the same plan can
 * be written out as JSON in many ways: keys in a different order, different spacing. Two programs that
 * disagree about the bytes disagree about the signature, even though they agree about the plan — and
 * `@biolibs/opencloning` already has to read documents whose keys arrive in any order, because the
 * official library and this one emit them differently.
 *
 * So before signing, a document is written in a canonical form: object keys sorted by their UTF-16 code
 * units, no insignificant space, following RFC 8785 for everything a plan can contain. A plan holds
 * strings, whole numbers, booleans, nulls, arrays and objects. It holds no fractional numbers, and
 * rather than guess at how one should be written this refuses them, so that nobody ever signs bytes
 * another implementation would have produced differently.
 */

/**
 * Write a value the one way, so that two programs holding the same plan sign the same bytes.
 *
 * @param value - Anything a plan can contain.
 * @returns The canonical JSON text.
 * @throws If it contains a fractional or non-finite number, or a value JSON cannot hold.
 *
 * @example
 * ```ts
 * import { canonicalJson } from "@biolibs/opencloning";
 *
 * canonicalJson({ b: 1, a: [true, null] });  // '{"a":[true,null],"b":1}'
 * ```
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`A plan cannot be signed while it holds the number ${String(value)}: only whole numbers have one agreed spelling.`);
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((one) => canonicalJson(one === undefined ? null : one)).join(",")}]`;
  if (typeof value === "object") {
    const parts: string[] = [];
    for (const key of Object.keys(value as object).sort()) {
      const held = (value as Record<string, unknown>)[key];
      if (held !== undefined) parts.push(`${JSON.stringify(key)}:${canonicalJson(held)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`A plan cannot be signed while it holds a ${typeof value}.`);
}

/** @param bytes - Any bytes. @returns Them in base64, with `-` and `_` and no padding, so they survive a URL. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Read base64 back, accepting both the URL alphabet and the ordinary one.
 *
 * @param text - The encoded bytes.
 * @returns The bytes.
 * @throws If it is not base64 at all.
 */
export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new TypeError("This is not base64.");
  }
}
