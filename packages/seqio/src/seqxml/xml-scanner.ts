/**
 * A small non-validating XML scanner that produces the events Python's expat-based SAX reader would
 * report (with namespace processing on), each tagged with the byte offset at which it completes.
 * Anything that is not well-formed ends the scan with a {@link XmlProblem}.
 */

import { NamespaceScope } from "./xml-names.js";
import { nextPrologToken } from "./prolog-token.js";
import { ENTITIES, decodeDocument, isNameChar, isNameStart, isSpace, isXmlChar } from "./xml-chars.js";
import type { ScanOptions, XmlEvent, XmlName, XmlProblem, XmlScan } from "./xml-types.js";

/**
 * Where expat blames a declaration that has no usable `version`.
 *
 * It points at the first pseudo-attribute it managed to read — column 6 of `<?xml encoding="UTF-8"?>`, just past
 * `<?xml ` — and just past `<?xml` itself (column 5) when the declaration is empty.
 *
 * @param decl - The declaration, `<?xml` to `?>` inclusive.
 * @returns The character index to report, relative to the declaration's start.
 */
function declarationFault(decl: string): number {
  const m = /^<\?xml(\s+)\S/.exec(decl);
  return m === null ? 5 : 5 + m[1]!.length;
}
/** Thrown internally to abandon the scan at the first problem. */
class Stop extends Error {
  constructor(readonly problem: XmlProblem) { super(problem.message); }
}

class Scanner {
  private i = 0;
  private readonly events: XmlEvent[] = [];
  private readonly scope = new NamespaceScope();
  private readonly open: string[] = [];
  /** Where the construct being read began: Expat reports an unclosed token there. */
  private tokenStart = 0;

  constructor(private readonly s: string, private readonly off: Uint32Array, private readonly namespaces = true) {}

  /** Raise a well-formedness problem at character index `at`. */
  private fail(message: string, at = this.i, atEnd = false): never {
    // Running out of input mid-token is not an error until the parser is closed.
    if (at >= this.s.length) atEnd = true;
    // Expat normalises the line ends before it counts them, so a lone `\r` and a `\r\n` pair each end a line.
    const before = this.s.slice(0, Math.min(at, this.s.length)).replace(/\r\n?/g, "\n");
    const line = before.split("\n").length;
    const column = before.length - (before.lastIndexOf("\n") + 1);
    const size = this.off[this.s.length]!;
    throw new Stop({
      message: `<unknown>:${line}:${column}: ${message}`, reason: message, line, column,
      at: atEnd ? size : this.off[Math.min(at + 1, this.s.length)]!, atEnd,
    });
  }

  /** Raise the problem for input that ends inside a construct. */
  private eof(message = "unclosed token"): never {
    // A carriage return at the very end is not consumed: expat holds it back in case a newline follows, so the
    // position it reports is the one before it.
    const end = this.s.endsWith("\r") ? this.s.length - 1 : this.s.length;
    return this.fail(message, message === "unclosed token" ? this.tokenStart : end, true);
  }

  private at(): string { return this.s[this.i] ?? ""; }
  private skipSpace(): void { while (this.i < this.s.length && isSpace(this.s[this.i]!)) this.i++; }
  private startsWith(t: string): boolean { return this.s.startsWith(t, this.i); }

  /** Read an XML name. */
  private name(): string {
    // Input that stops where a name should start has not gone wrong yet: the token is merely unclosed.
    if (this.i >= this.s.length) return this.eof();
    if (!isNameStart(this.at())) return this.fail("not well-formed (invalid token)");
    const from = this.i;
    while (this.i < this.s.length && isNameChar(this.s[this.i]!)) this.i++;
    return this.s.slice(from, this.i);
  }

  /** Skip to just after `terminator`; end of input is an unclosed token. */
  private skipPast(terminator: string, unclosed = "unclosed token"): string {
    const end = this.s.indexOf(terminator, this.i);
    if (end < 0) return this.eof(unclosed);
    const body = this.s.slice(this.i, end);
    this.i = end + terminator.length;
    return body;
  }

  /**
   * Check the pseudo-attributes of an XML declaration: `version`, then optionally `encoding`, then optionally
   * `standalone`.
   */
  private checkDeclaration(decl: string): void {
    // Expat points at whatever is wrong: the keyword that may not be there, the first character of a value it
    // will not accept, or the end of `<?xml` when there is no attribute at all. The version's value is not
    // checked -- `version=""` and `version="x"` are both accepted.
    // `decl` is the body between `<?xml` and `?>`, which `skipPast` has already taken off.
    const end = decl.length;
    const order = ["version", "encoding", "standalone"];
    let pos = 5;
    let next = 0;
    const bad = (at: number): never => this.fail("XML declaration not well-formed", at);
    for (;;) {
      const wsStart = pos;
      while (pos < end && isSpace(decl[pos]!)) pos++;
      if (pos >= end) {
        if (next === 0) bad(5);
        return;
      }
      if (pos === wsStart) bad(pos);
      const nameStart = pos;
      while (pos < end && /[A-Za-z]/.test(decl[pos]!)) pos++;
      const name = decl.slice(nameStart, pos);
      const idx = next === 0 && name !== "version" ? -1 : order.indexOf(name, next);
      if (idx < 0) bad(nameStart);
      while (pos < end && isSpace(decl[pos]!)) pos++;
      if (decl[pos] !== "=") bad(pos);
      pos++;
      while (pos < end && isSpace(decl[pos]!)) pos++;
      const quote = decl[pos] ?? "";
      if (quote !== '"' && quote !== "'") bad(pos);
      const close = decl.indexOf(quote, pos + 1);
      if (close === -1 || close >= end) bad(pos);
      const value = decl.slice(pos + 1, close);
      const ok = idx === 0 || (idx === 1 ? /^[A-Za-z][A-Za-z0-9._-]*$/.test(value) : value === "yes" || value === "no");
      if (!ok) bad(pos + 1);
      next = idx + 1;
      pos = close + 1;
    }
  }

  /** Decode a reference starting at `&`; returns the text it stands for. */
  private reference(entityAt?: number): string {
    const saved = this.tokenStart;
    const amp = this.i;
    this.tokenStart = amp;
    // Expat scans the reference itself and points at the first character that cannot be part of it, which is
    // not the `&` and not some distant semicolon either.
    let j = amp + 1;
    const bad = (): never => this.fail("not well-formed (invalid token)", j);
    if (this.s[j] === "#") {
      j++;
      const digits = this.s[j] === "x" ? (j++, /[0-9a-fA-F]/) : /[0-9]/;
      const from = j;
      while (j < this.s.length && digits.test(this.s[j]!)) j++;
      if (j >= this.s.length) return this.eof();
      if (j === from) bad();
    } else {
      const from = j;
      if (j < this.s.length && isNameStart(this.s[j]!)) {
        j++;
        while (j < this.s.length && isNameChar(this.s[j]!)) j++;
      }
      if (j >= this.s.length) return this.eof();
      if (j === from) bad();
    }
    if (j >= this.s.length) return this.eof();
    if (this.s[j] !== ";") bad();
    const body = this.s.slice(amp + 1, j);
    let out: string | undefined;
    if (body.startsWith("#x")) out = String.fromCodePoint(Math.min(0x110000, parseInt(body.slice(2), 16)) % 0x110000);
    else if (body.startsWith("#")) out = String.fromCodePoint(Math.min(0x10ffff, parseInt(body.slice(1), 10)));
    else if (Object.hasOwn(ENTITIES, body)) out = ENTITIES[body]!;
    if (out === undefined) return this.fail("undefined entity", entityAt ?? this.tokenStart);
    if (!isXmlChar(out.codePointAt(0)!)) return this.fail("reference to invalid character number");
    this.i = j + 1;
    this.tokenStart = saved;
    return out;
  }

  /** Read a quoted attribute value, normalising whitespace and expanding references. */
  private attributeValue(): string {
    // A reference here is expanded once the tag is read, so expat reports an unknown entity at the tag itself.
    const tag = this.tokenStart;
    const quote = this.at();
    if (quote === "") return this.eof();
    if (quote !== '"' && quote !== "'") return this.fail("not well-formed (invalid token)");
    this.i++;
    let out = "";
    for (;;) {
      if (this.i >= this.s.length) return this.eof();
      const c = this.s[this.i]!;
      if (c === quote) { this.i++; return out; }
      if (c === "<") return this.fail("not well-formed (invalid token)");
      if (c === "&") { out += this.reference(tag); continue; }
      if (c === "\r" && this.s[this.i + 1] === "\n") this.i++;
      out += isSpace(c) ? " " : c;
      if (!isXmlChar(c.codePointAt(0)!)) return this.fail("not well-formed (invalid token)");
      this.i++;
    }
  }

  /** Parse a start tag (positioned after `<`) and emit its events. */
  private startTag(): void {
    const qname = this.name();
    const raw: [string, string][] = [];
    for (;;) {
      const hadSpace = isSpace(this.at());
      this.skipSpace();
      if (this.i >= this.s.length) return this.eof();
      const c = this.at();
      if (c === ">" || c === "/") break;
      if (!hadSpace) return this.fail("not well-formed (invalid token)");
      const nameAt = this.i;                 // expat reports a duplicate at the attribute's name, not its value
      const an = this.name();
      this.skipSpace();
      if (this.at() !== "=") return this.at() === "" ? this.eof() : this.fail("not well-formed (invalid token)");
      this.i++;
      this.skipSpace();
      if (raw.some(([n]) => n === an)) return this.fail("duplicate attribute", nameAt);
      raw.push([an, this.attributeValue()]);
    }
    const empty = this.at() === "/";
    if (empty) { this.i++; if (this.at() === "") return this.eof(); }
    if (this.at() !== ">") return this.fail("not well-formed (invalid token)");
    this.i++;

    const bindings = new Map<string, string>();
    const plain: [string, string][] = [];
    for (const [n, v] of raw) {
      if (n === "xmlns") bindings.set("", v);
      else if (n.startsWith("xmlns:")) bindings.set(n.slice(6), v);
      else plain.push([n, v]);
    }
    if (!this.namespaces) {
      // Without namespace processing names are kept as written and `xmlns` attributes are ordinary attributes.
      const end = this.off[this.i]!;
      const name: XmlName = [null, qname];
      this.events.push({ kind: "start", name, attrs: raw.map(([n, v]) => [[null, n] as XmlName, v]), end });
      if (empty) this.events.push({ kind: "end", name, end });
      else { this.open.push(qname); this.names.push(name); }
      return;
    }
    this.scope.push(bindings);
    const name = this.scope.expand(qname, false);
    // Expat blames the whole start tag for an unbound prefix, wherever in it the prefix was used.
    if (name === null) return this.fail("unbound prefix", this.tokenStart);
    const attrs: [XmlName, string][] = [];
    for (const [n, v] of plain) {
      const expanded = this.scope.expand(n, true);
      if (expanded === null) return this.fail("unbound prefix", this.tokenStart);
      if (attrs.some(([e]) => e[0] === expanded[0] && e[1] === expanded[1])) return this.fail("duplicate attribute", this.i - 1);
      attrs.push([expanded, v]);
    }
    const end = this.off[this.i]!;
    // Declarations in written order (what ElementTree's "start-ns" events report), default namespace as prefix "".
    this.events.push({ kind: "start", name, attrs, end, nsDecls: [...bindings] });
    if (empty) {
      this.events.push({ kind: "end", name, end });
      this.scope.pop();
    } else {
      this.open.push(qname);
      this.names.push(name);
    }
  }

  private readonly names: XmlName[] = [];

  /** Parse an end tag (positioned after `</`). */
  private endTag(): void {
    const nameStart = this.i;
    const qname = this.name();
    this.skipSpace();
    if (this.i >= this.s.length) return this.eof();
    if (this.at() !== ">") return this.fail("not well-formed (invalid token)");
    this.i++;
    if (this.open.pop() !== qname) return this.fail("mismatched tag", nameStart);
    this.events.push({ kind: "end", name: this.names.pop()!, end: this.off[this.i]! });
    if (this.namespaces) this.scope.pop();
  }

  /** Skip a comment (positioned after `<!--`). */
  private comment(): void {
    const body = this.skipPast("-->");
    if (body.includes("--") || body.endsWith("-")) this.fail("not well-formed (invalid token)");
    this.events.push({ kind: "comment", data: body, end: this.off[this.i]! });
  }

  /** Skip a processing instruction (positioned after `<?`). */
  private pi(): void {
    const start = this.i - 2;                // the `<?`, which is where expat puts this one
    // Unclosed comes first: expat reads the whole instruction before it can object to its target.
    if (this.s.indexOf("?>", this.i) === -1) { this.tokenStart = start; return this.eof(); }
    const target = this.name();
    if (target.toLowerCase() === "xml") this.fail("XML or text declaration not at start of entity", start);
    const data = this.skipPast("?>");
    this.events.push({ kind: "pi", target, data: data.replace(/^[ \t\r\n]+/, ""), end: this.off[this.i]! });
  }

  /** Skip a DOCTYPE declaration (positioned after `<!DOCTYPE`), including any internal subset. */
  private doctype(): void {
    let depth = 0;
    for (;;) {
      if (this.i >= this.s.length) return this.eof();
      const c = this.s[this.i++]!;
      if (c === "[") depth++;
      else if (c === "]") depth--;
      else if (c === '"' || c === "'") this.skipPast(c);
      else if (c === ">" && depth <= 0) return;
    }
  }

  /** Character data up to the next `<`, expanding references and normalising line ends. */
  private text(): void {
    let out = "";
    const start = this.i;
    while (this.i < this.s.length && this.s[this.i] !== "<") {
      const c = this.s[this.i]!;
      if (c === "&") { out += this.reference(); continue; }
      // Expat points at the `>` of the `]]>` that may not appear in content.
      if (c === "]" && this.startsWith("]]>")) return this.fail("not well-formed (invalid token)", this.i + 2);
      if (!isXmlChar(c.codePointAt(0)!)) return this.fail("not well-formed (invalid token)");
      if (c === "\r") { out += "\n"; if (this.s[this.i + 1] === "\n") this.i++; } else out += c;
      this.i++;
    }
    if (this.i > start) this.events.push({ kind: "text", data: out, end: this.off[this.i]! });
  }

  /** Scan the whole document. */
  run(): void {
    // `<?xml` at the very start is the declaration whether or not anything follows it: `<?xml?>` is a declaration
    // that lacks `version`, not a processing instruction named `xml`.
    if (this.startsWith("<?xml") && (isSpace(this.s[this.i + 5] ?? "") || this.s.startsWith("?>", this.i + 5))) {
      const decl = this.skipPast("?>");
      this.checkDeclaration(decl);
    }
    let seenRoot = false;
    // Outside the document element, expat's own prolog tokenizer decides what the next token is; which of its
    // complaints follows depends only on that and on whether the document element has been seen.
    for (;;) {
      const token = nextPrologToken(this.s, this.i);
      this.i = token.start;
      this.tokenStart = token.start;
      if (token.kind === "eof") { this.i = this.s.length; break; }
      if (token.kind === "comment" || token.kind === "pi") {
        // Scanned again the long way, so that a malformed comment or processing instruction is reported as it
        // always was. A declaration out here is not a processing instruction: before the document element it is
        // one in the wrong place, and after it, expat has stopped looking for one and calls it junk.
        if (token.kind === "comment") { this.i += 4; this.comment(); }
        else if (seenRoot && /^<\?xml($|[\s?])/i.test(this.s.slice(this.i, this.i + 7))) {
          return this.fail("junk after document element", token.start);
        } else { this.i += 2; this.pi(); }
        continue;
      }
      if (token.kind === "startTag") {
        if (seenRoot) return this.fail("junk after document element", token.start);
        seenRoot = true;
        this.i = token.start + 1;
        this.startTag();
        this.content();
        continue;
      }
      if (token.kind === "unclosed") return this.eof();
      if (token.kind === "paramEntity") {
        // A parameter entity reference belongs inside a declaration's internal subset, nowhere else.
        if (!seenRoot) return this.fail("illegal parameter entity reference", token.start);
        return this.fail("junk after document element", token.start);
      }
      if (token.kind === "invalid") return this.fail("not well-formed (invalid token)", token.at);
      // A well-formed token in the wrong place: a declaration before the document element may still be the
      // doctype, which is allowed there and has its own checks.
      if (!seenRoot && this.startsWith("<!DOCTYPE")) { this.i += 9; this.doctype(); continue; }
      return this.fail(seenRoot ? "junk after document element" : "syntax error", token.start);
    }
    if (!seenRoot) this.eof("no element found");
  }

  /** Content of the root element, until it is closed. */
  private content(): void {
    while (this.open.length > 0) {
      this.text();
      if (this.i >= this.s.length) return this.eof("no element found");
      this.tokenStart = this.i;
      this.i++; // the "<"
      if (this.startsWith("!--")) { this.i += 3; this.comment(); }
      else if (this.startsWith("![CDATA[")) {
        this.i += 8;
        const body = this.skipPast("]]>", "unclosed CDATA section").replace(/\r\n?/g, "\n");
        if (body) this.events.push({ kind: "text", data: body, end: this.off[this.i]!, cdata: true });
      } else if (this.startsWith("?")) { this.i++; this.pi(); }
      else if (this.startsWith("/")) { this.i++; this.endTag(); }
      else this.startTag();
    }
  }

  result(): XmlEvent[] { return this.events; }
}

/**
 * Scan a document.
 *
 * @param bytes - The document's bytes.
 * @returns The events up to the first problem, and that problem if there is one.
 * @example
 * ```ts
 * scanXml(new TextEncoder().encode("<a x='1'>hi</a>")).events.length;   // 3
 * ```
 */
export function scanXml(bytes: Uint8Array, options: ScanOptions = {}): XmlScan {
  const { text, offsets, badAt } = decodeDocument(bytes, options.ignoreDeclaredEncoding ?? false);
  if (text === null) {
    // The bytes before the bad one decode, and counting the lines and characters in them is where expat points.
    const good = badAt === undefined ? "" : new TextDecoder("utf-8").decode(bytes.subarray(0, badAt));
    const nl = good.lastIndexOf("\n");
    const line = badAt === undefined ? 1 : good.split("\n").length;
    const column = badAt === undefined ? 0 : Array.from(good.slice(nl + 1)).length;
    const reason = "not well-formed (invalid token)";
    return { events: [], problem: { message: `<unknown>:${line}:${column}: ${reason}`, reason, line, column, at: badAt ?? 1, atEnd: false }, size: bytes.length };
  }
  const scanner = new Scanner(text, offsets, options.namespaces ?? true);
  let problem: XmlProblem | null = null;
  try {
    scanner.run();
  } catch (e) {
    if (e instanceof Stop) problem = e.problem;
    else throw e;
  }
  return { events: scanner.result(), problem, size: bytes.length };
}
