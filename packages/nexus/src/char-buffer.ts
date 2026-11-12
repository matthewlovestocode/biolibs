/** A character buffer with NEXUS-aware word reading (Biopython's `CharBuffer`). */

import { IndexError, pyStrip } from "@biolibs/core";

/** Characters that are tokens of their own in NEXUS. */
export const PUNCTUATION = "()[]{}\\,;:=*\\'\"`+-<>";
/** Whitespace as NEXUS sees it. */
export const WHITESPACE = " \t\n";

/**
 * A string consumed from the front. Methods return `null` where Biopython returns `None`.
 *
 * @example
 * ```ts
 * const b = new CharBuffer("foo = 'a b'");
 * b.nextWord();   // "foo"
 * ```
 */
export class CharBuffer {
  private text: string;
  private pos = 0;

  /** @param string - The text to read. */
  constructor(string: string | null | undefined) {
    this.text = string ? string : "";
  }

  /** The next character without consuming it, or null. */
  peek(): string | null {
    return this.pos < this.text.length ? this.text[this.pos]! : null;
  }

  /** The next non-whitespace character without consuming anything, or null. */
  peekNonwhitespace(): string | null {
    const b = pyStrip(this.text.slice(this.pos));
    return b ? b[0]! : null;
  }

  /** Consume and return the next character, or null at the end. */
  next(): string | null {
    return this.pos < this.text.length ? this.text[this.pos++]! : null;
  }

  /** Consume up to and including the next non-whitespace character and return it, or null. */
  nextNonwhitespace(): string | null {
    for (;;) {
      const p = this.next();
      if (p === null) break;
      if (!WHITESPACE.includes(p)) return p;
    }
    return null;
  }

  /** Skip leading whitespace. @throws {@link IndexError} if the buffer is empty. */
  skipWhitespace(): void {
    for (;;) {
      if (this.pos >= this.text.length) throw new IndexError("list index out of range");
      if (!WHITESPACE.includes(this.text[this.pos]!)) return;
      this.pos++;
    }
  }

  /**
   * Take text up to the first occurrence of the first character of `target` that occurs at all (note: not the earliest
   * of them), leaving the buffer at that character; null if none occurs.
   */
  nextUntil(target: string): string | null {
    for (const t of target) {
      const at = this.text.indexOf(t, this.pos);
      if (at >= 0) {
        const found = this.text.slice(this.pos, at);
        this.pos = at;
        return found;
      }
    }
    return null;
  }

  /** Whether the buffer starts with `word`. */
  peekWord(word: string): boolean {
    return this.text.slice(this.pos, this.pos + word.length) === word;
  }

  /** Read the next word: a quoted string, a single punctuation character, or a run of other characters; null at the end. */
  nextWord(): string | null {
    const word: string[] = [];
    let quoted: string | false = false;
    const first = this.nextNonwhitespace();
    if (!first) return null;
    word.push(first);
    if (first === "'") quoted = "'";
    else if (first === '"') quoted = '"';
    else if (PUNCTUATION.includes(first)) return first;
    for (;;) {
      const c = this.peek();
      if (c !== null && c === quoted) {
        word.push(this.next()!);
        if (this.peek() === quoted) this.next();
        else if (quoted) break;
      } else if (quoted) {
        word.push(this.next()!);
      } else if (!c || PUNCTUATION.includes(c) || WHITESPACE.includes(c)) {
        break;
      } else {
        word.push(this.next()!);
      }
    }
    return word.join("");
  }

  /** The unread remainder. */
  rest(): string {
    return this.text.slice(this.pos);
  }
}
