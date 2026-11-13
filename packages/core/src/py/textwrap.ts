/** Python's `textwrap.fill`, with the default options of `TextWrapper` except for the ones the caller sets. */

/** Options of {@link pyTextwrapFill} (Python's `TextWrapper` arguments, snake case turned to camel case). */
export interface TextwrapOptions {
  /** Maximum line length, indents included. Default 70. */
  width?: number;
  /** Prefix of the first line. Default `""`. */
  initialIndent?: string;
  /** Prefix of every other line. Default `""`. */
  subsequentIndent?: string;
  /** Split words longer than a line. Default true. */
  breakLongWords?: boolean;
}

const WS = "[\\t\\n\\x0b\\x0c\\r ]";
const NWS = "[^\\t\\n\\x0b\\x0c\\r ]";
const WORD_PUNCT = "[\\p{L}\\p{N}_!\"'&.,?]";
const LETTER = "[\\p{L}\\p{M}\\p{Nl}\\p{No}_]";
/** `TextWrapper.wordsep_re`: whitespace runs, em-dashes between words, and words that may break after a hyphen. */
const WORDSEP = new RegExp(
  `(${WS}+|(?<=${WORD_PUNCT})-{2,}(?=[\\p{L}\\p{N}_])|${NWS}+?(?:-(?:(?<=${LETTER}{2}-)|(?<=${LETTER}-${LETTER}-))(?=${LETTER}-?${LETTER})|(?=${WS}|(?![\\s\\S]))|(?<=${WORD_PUNCT})(?=-{2,}[\\p{L}\\p{N}_])))`,
  "gu",
);

/** `str.expandtabs(8)`: tabs advance to the next multiple of 8 columns; the column restarts after a newline or carriage return. */
function expandTabs(text: string): string {
  let out = "";
  let column = 0;
  for (const ch of text) {
    if (ch === "\t") { const n = 8 - (column % 8); out += " ".repeat(n); column += n; }
    else { out += ch; if (ch === "\n" || ch === "\r") column = 0; else column += 1; }
  }
  return out;
}

/** `re.split` of the word-separator pattern, with empty pieces dropped (`TextWrapper._split`). */
function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  let last = 0;
  WORDSEP.lastIndex = 0;
  for (let m = WORDSEP.exec(text); m !== null; m = WORDSEP.exec(text)) {
    if (m.index > last) chunks.push(text.slice(last, m.index));
    chunks.push(m[1]!);
    last = m.index + m[0].length;
  }
  if (last < text.length) chunks.push(text.slice(last));
  return chunks.filter((c) => c.length > 0);
}

const cpLen = (s: string): number => Array.from(s).length;
const isBlank = (s: string): boolean => /^[\s]*$/u.test(s);

/**
 * Wrap `text` into lines no longer than `width` and join them with newlines (`textwrap.fill`).
 *
 * Tabs are expanded and other white space is turned into spaces first; lines break at white space and after
 * hyphens inside words; leading and trailing white space on wrapped lines is dropped.
 *
 * @param text - The text.
 * @param options - Width, indents and whether long words may be broken.
 * @returns The wrapped text without a final newline (empty for empty text).
 */
export function pyTextwrapFill(text: string, options: TextwrapOptions = {}): string {
  const width0 = options.width ?? 70;
  const initial = options.initialIndent ?? "";
  const subsequent = options.subsequentIndent ?? "";
  const breakLongWords = options.breakLongWords ?? true;
  const chunks = splitChunks(expandTabs(text).replace(/[\t\n\x0b\x0c\r]/g, " ")).reverse();
  const lines: string[] = [];
  while (chunks.length > 0) {
    let cur: string[] = [];
    let curLen = 0;
    const indent = lines.length > 0 ? subsequent : initial;
    const width = width0 - cpLen(indent);
    if (isBlank(chunks[chunks.length - 1]!) && lines.length > 0) chunks.pop();
    while (chunks.length > 0) {
      const l = cpLen(chunks[chunks.length - 1]!);
      if (curLen + l <= width) { cur.push(chunks.pop()!); curLen += l; } else break;
    }
    if (chunks.length > 0 && cpLen(chunks[chunks.length - 1]!) > width) {
      // `_handle_long_word`
      const spaceLeft = width < 1 ? 1 : width - curLen;
      if (breakLongWords && spaceLeft > 0) {
        let end = spaceLeft;
        const chunk = Array.from(chunks[chunks.length - 1]!);
        if (chunk.length > spaceLeft) {
          const hyphen = chunk.slice(0, spaceLeft).lastIndexOf("-");
          if (hyphen > 0 && chunk.slice(0, hyphen).some((c) => c !== "-")) end = hyphen + 1;
        }
        cur.push(chunk.slice(0, end).join(""));
        chunks[chunks.length - 1] = chunk.slice(end).join("");
      } else if (cur.length === 0) cur.push(chunks.pop()!);
      curLen = cur.reduce((n, c) => n + cpLen(c), 0);
    }
    if (cur.length > 0 && isBlank(cur[cur.length - 1]!)) { curLen -= cpLen(cur[cur.length - 1]!); cur = cur.slice(0, -1); }
    if (cur.length > 0) lines.push(indent + cur.join(""));
  }
  return lines.join("\n");
}
