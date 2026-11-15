/**
 * The parameters of a request: what the caller gave, plus who is asking.
 *
 * `constructParams` is Biopython's `_construct_params` and `formatIds` its `_format_ids`.
 */
import { pyStrip, warn } from "@biolibs/core";
import { pyText, pyTypeOf } from "./pytext.js";
import { settings } from "./settings.js";

/** A value an E-utility parameter can take. `null` and `undefined` both mean "leave this out". */
export type ParamValue = string | number | bigint | boolean | null | undefined | Uint8Array | readonly ParamValue[];

/**
 * The parameters of a request, in the order they should be sent: a plain object, a `Map`, or pairs.
 *
 * A plain object is the natural way to write Python's keyword arguments. JavaScript moves keys that
 * look like whole numbers to the front of an object, so use a `Map` or pairs if a key is one.
 */
export type Params = Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown> | Iterable<readonly [string, unknown]>;

/** What Biopython warns with when no email address has been given, word for word. */
export const EMAIL_WARNING = `
            Email address is not specified.

            To make use of NCBI's E-utilities, NCBI requires you to specify your
            email address with each request.  As an example, if your email address
            is A.N.Other@example.com, you can specify it as follows:
               from Bio import Entrez
               Entrez.email = 'A.N.Other@example.com'
            In case of excessive usage of the E-utilities, NCBI will attempt to contact
            a user at the email address provided before blocking access to the
            E-utilities.`;

/**
 * Parameters as an ordered map, whichever way they were written.
 *
 * @param params - A plain object, a `Map`, pairs, or nothing. @returns A new map in the same order.
 */
export function toMap(params: Params | null | undefined): Map<string, unknown> {
  if (params === null || params === undefined) return new Map();
  if (Symbol.iterator in params) return new Map(params as Iterable<readonly [string, unknown]>);
  return new Map(Object.entries(params));
}

/**
 * Biopython's `_format_ids`: one or many identifiers as the comma-separated text NCBI expects.
 *
 * @param ids - A whole number, text that may already hold commas, or a list.
 * @returns The identifiers joined with commas. Text is split on commas and each piece trimmed; the
 *   elements of a list are each written as Python's `str()` writes them, untrimmed.
 * @throws TypeError for a value that is neither a whole number, text nor a list, as Python's `map`
 *   raises when it is asked to iterate one.
 * @example
 * ```ts
 * formatIds(19304878);          // "19304878"
 * formatIds(" 1 , 2 ,3 ");      // "1,2,3"
 * formatIds([1, "2", 3]);       // "1,2,3"
 * ```
 */
export function formatIds(ids: unknown): string {
  if (typeof ids === "bigint" || typeof ids === "boolean" || (typeof ids === "number" && Number.isInteger(ids))) return pyText(ids);
  if (typeof ids === "string") return ids.split(",").map(pyStrip).join(",");
  if (Array.isArray(ids) || ids instanceof Uint8Array) return Array.from(ids as ArrayLike<unknown>, pyText).join(",");
  throw new TypeError(`'${pyTypeOf(ids)}' object is not iterable`);
}

/**
 * Biopython's `_construct_params`: add who is asking, drop what was left out, and join the identifiers.
 *
 * `tool`, `email` and `api_key` are appended from {@link settings} unless the caller gave them. A
 * parameter whose value is `null` or `undefined` is then removed, which is how a caller leaves one of
 * those three out on purpose.
 *
 * @param params - What the caller gave.
 * @param joinIds - Join an `id` list into one comma-separated value (default true). `elink` passes
 *   false, because for it a repeated `id` means something different from a joined one.
 * @returns The parameters to send, in order.
 * @throws TypeError if `id` cannot be joined; see {@link formatIds}.
 * @example
 * ```ts
 * settings.email = "a.n.other@example.com";
 * [...constructParams({ db: "pubmed", id: [1, 2] })];
 * // [["db", "pubmed"], ["id", "1,2"], ["tool", "biopython"], ["email", "a.n.other@example.com"]]
 * ```
 */
export function constructParams(params?: Params | null, joinIds = true): Map<string, unknown> {
  const out = toMap(params);
  // Tell Entrez what is asking and who, unless the caller has said so already.
  if (!out.has("tool")) out.set("tool", settings.tool);
  if (!out.has("email")) out.set("email", settings.email);
  if (!out.has("api_key")) out.set("api_key", settings.apiKey);
  for (const [key, value] of [...out]) if (value === null || value === undefined) out.delete(key);
  if (!out.has("email")) warn(EMAIL_WARNING, "UserWarning");
  if (joinIds && out.has("id")) out.set("id", formatIds(out.get("id")));
  return out;
}
