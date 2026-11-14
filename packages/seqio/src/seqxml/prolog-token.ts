/**
 * Expat's tokenizer for the prolog and the epilog, which is what decides between its three complaints there.
 *
 * Everything outside the document element goes through `XmlPrologTok` in expat, and which of "not well-formed
 * (invalid token)", "syntax error", "junk after document element" and "unclosed token" comes out — and at which
 * column — depends on how far that tokenizer gets before it gives up. This module is that tokenizer, in the
 * shape the scanner needs: it says what the next token is and where it ends, and the scanner turns that into an
 * error according to whether the document element has been seen.
 *
 * The classes below were measured against Python's own expat rather than read off the C source, so the oddities
 * are deliberate: `)` looks one character ahead for a quantifier, `[` ends a name run while `(` does not, and a
 * single `]` is a token of its own unless another `]` follows it.
 */

/** What the tokenizer found. */
export type PrologTokenKind =
  /** Nothing but the end of the input. */
  | "eof"
  /** A complete comment, which is allowed on both sides of the document element. */
  | "comment"
  /** A complete processing instruction, likewise. */
  | "pi"
  /** The start of the document element. */
  | "startTag"
  /** A token that is well formed but not allowed where it is: a name, a literal, `>`, `]]>`, a declaration. */
  | "misplaced"
  /** A parameter entity reference, which has a complaint of its own before the document element. */
  | "paramEntity"
  /** A token that cannot be completed before the input ends. */
  | "unclosed"
  /** Something that is not a token at all. */
  | "invalid";

/** Where the tokenizer got to, and what it made of it. */
export interface PrologToken {
  /** What was found. */
  kind: PrologTokenKind;
  /** Where the token starts, after any whitespace. */
  start: number;
  /** Where it ends; for `comment` and `pi` this is where scanning should carry on. */
  end: number;
  /** Where an `invalid` token's offending character is, which is not always its start. */
  at: number;
}

/** Characters that cannot begin a token out here at all. */
const INVALID_FIRST = new Set([..."&!$*+/;=?@\\^`{}~"]);
/** Characters that are a token in their own right, which out here means one in the wrong place. */
const SOLO = new Set([..."(,[|>"]);
/** Characters that end a run of name characters, leaving a name token behind. */
const TERMINATOR = new Set([..." \t\r\n>)[,?*+|%"]);

/** @param c - A character. @returns Whether it may start an XML name. */
const isNameStart = (c: string): boolean => /[A-Za-z_:À-˿Ͱ-῿⁰-퟿豈-﷏ﷰ-�]/.test(c);
/** @param c - A character. @returns Whether it may continue one, which also covers an NMTOKEN's first character. */
const isNameChar = (c: string): boolean => isNameStart(c) || /[-.0-9·̀-ͯ‿⁀]/.test(c);
/** @param c - A character. @returns Whether XML allows it at all. */
const isXmlChar = (c: string): boolean => {
  const n = c.codePointAt(0)!;
  return n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || n >= 0x10000;
};

/**
 * The next token outside the document element.
 *
 * @param s - The whole text. @param from - Where to look from; whitespace is skipped first.
 * @returns What was found and where it ends.
 */
export function nextPrologToken(s: string, from: number): PrologToken {
  let i = from;
  while (i < s.length && " \t\r\n".includes(s[i]!)) i++;
  const start = i;
  const token = (kind: PrologTokenKind, end: number, at = start): PrologToken => ({ kind, start, end, at });
  if (i >= s.length) return token("eof", i);
  const c = s[i]!;

  if (!isXmlChar(c) || INVALID_FIRST.has(c)) return token("invalid", i + 1);

  if (c === "<") {
    const next = s[i + 1];
    if (next === undefined) return token("unclosed", s.length);
    if (next === "!") {
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        return end === -1 ? token("unclosed", s.length) : token("comment", end + 3);
      }
      if (s.startsWith("<![", i)) return token("misplaced", i + 3);
      // `<!` and a name is a declaration: the name has to finish, and then be followed by something that may
      // follow it, or expat points at whatever is there instead.
      let j = i + 2;
      while (j < s.length && isNameChar(s[j]!)) j++;
      if (j >= s.length) return token("unclosed", s.length);
      if (!TERMINATOR.has(s[j]!)) return token("invalid", j + 1, j);
      return token("misplaced", j);
    }
    if (next === "?") {
      const end = s.indexOf("?>", i + 2);
      if (end !== -1) return token("pi", end + 2);
      // No `?>`: the target name must still be followed by whitespace, and anything else is where expat points.
      let j = i + 2;
      while (j < s.length && isNameChar(s[j]!)) j++;
      if (j >= s.length) return token("unclosed", s.length);
      if (!TERMINATOR.has(s[j]!)) return token("invalid", j + 1, j);
      return token("unclosed", s.length);
    }
    if (isNameStart(next)) return token("startTag", i + 1);
    // `</`, `<-`, `<0`: whatever follows the `<` cannot begin a tag, and that is where expat points.
    return token("invalid", i + 2, i + 1);
  }

  if (c === "'" || c === '"') {
    const end = s.indexOf(c, i + 1);
    if (end === -1) return token("unclosed", s.length);
    if (end + 1 < s.length && !TERMINATOR.has(s[end + 1]!)) return token("invalid", end + 2, end + 1);
    return token("misplaced", end + 1);
  }

  if (c === "#") {
    // `#NAME`, as a content model uses: the name must finish, and then be followed by something that may
    // follow a name.
    let j = i + 1;
    while (j < s.length && isNameChar(s[j]!)) j++;
    if (j === i + 1) return token("unclosed", s.length);
    if (j < s.length && !TERMINATOR.has(s[j]!)) return token("invalid", j + 1, j);
    return token("misplaced", j);
  }

  if (c === "%") {
    // A parameter entity reference, which needs its semicolon.
    let j = i + 1;
    while (j < s.length && isNameChar(s[j]!)) j++;
    if (j >= s.length) return token("unclosed", s.length);
    if (s[j] === ";") return token("paramEntity", j + 1);
    return token("invalid", j + 1, j);
  }

  if (c === "]") {
    // `]]>` is a token of its own; `]]` with the input ending is incomplete, and with anything else after it
    // the brackets are simply two tokens in the wrong place.
    if (s[i + 1] === "]") {
      if (s[i + 2] === ">") return token("misplaced", i + 3);
      return i + 2 >= s.length ? token("unclosed", s.length) : token("misplaced", i + 2);
    }
    return token("misplaced", i + 1);
  }

  if (c === ")") {
    // One character of lookahead: a content-model quantifier is taken with it, and anything else that may
    // follow a name may follow this too.
    const next = s[i + 1];
    if (next === undefined) return token("misplaced", i + 1);
    if ("?*+".includes(next)) return token("misplaced", i + 2);
    if (TERMINATOR.has(next)) return token("misplaced", i + 1);
    return token("invalid", i + 2, i + 1);
  }

  if (SOLO.has(c)) return token("misplaced", i + 1);

  if (isNameChar(c)) {
    let j = i + 1;
    while (j < s.length && isNameChar(s[j]!)) j++;
    // A name is a token only if what follows it could follow a name; anything else is where expat points.
    if (j >= s.length || TERMINATOR.has(s[j]!)) return token("misplaced", j);
    return token("invalid", j + 1, j);
  }

  return token("invalid", i + 1);
}
