/**
 * Turning a label into something that could be a Python name.
 *
 * `pydna.utils.identifier_from_string` is used by the record layer to name a slice after whichever feature
 * it mostly covers, so a piece cut out of a plasmid comes back called something a person can read. It is
 * ported here rather than with the rest of `pydna.utils`, which belongs with `Dseqrecord`.
 */

/**
 * Python's keywords, which cannot be used as names and so get an underscore in front of them.
 *
 * Taken from `keyword.kwlist` on CPython 3.15. The soft keywords (`match`, `case`, `type`, `_`, `lazy`) are
 * *not* in this list, because `keyword.iskeyword` does not count them either — `identifier_from_string`
 * leaves `match` alone and prefixes `class`.
 */
const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
  "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

/**
 * Whether a single character could begin a Python name, which is `str.isidentifier()` on one character.
 *
 * A letter or an underscore can; a digit cannot. Only ASCII is considered, because the caller has already
 * thrown everything else away.
 *
 * @param ch - The character.
 * @returns Whether a name may start with it.
 */
const startsAName = (ch: string): boolean => /[A-Za-z_]/.test(ch);

/**
 * A label reduced to something that could be a Python name.
 *
 * Whitespace becomes underscores, anything that is not a letter, digit or underscore is dropped, and a
 * result that could not start a name — because it begins with a digit, or is a keyword — gets an underscore
 * in front. An empty label stays empty.
 *
 * **Hyphens are dropped, not turned into underscores.** Upstream intends otherwise: it calls
 * `s.replace("-", "_")` and throws the result away, since Python strings are immutable and the line is
 * missing its assignment. The hyphen then falls to the next step, which removes it. So `"ab-cd"` comes back
 * as `"abcd"` rather than `"ab_cd"`, and this reproduces that rather than quietly fixing it.
 *
 * @param s - The label.
 * @returns A name, or an empty string if nothing usable was left.
 * @example
 * ```ts
 * identifierFromString(" a b ");   // "a_b"
 * identifierFromString("1abc");    // "_1abc"
 * identifierFromString("class");   // "_class"
 * identifierFromString("ab-cd");   // "abcd" — the hyphen is lost, not converted
 * ```
 */
export function identifierFromString(s: string): string {
  let out = s.trim().replace(/\s+/g, "_");
  // The line that would turn hyphens into underscores has no effect upstream, so it has none here either.
  out = out.replace(/[^0-9a-zA-Z_]/g, "");
  if ((out !== "" && !startsAName(out[0]!)) || KEYWORDS.has(out)) out = `_${out}`;
  return out;
}
