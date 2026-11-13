/**
 * A small non-validating XML scanner that produces the events Python's expat-based SAX reader would
 * report (with namespace processing on), each tagged with the byte offset at which it completes.
 * Anything that is not well-formed ends the scan with a {@link XmlProblem}.
 */

import { NamespaceScope } from "./xml-names.js";
import { ENTITIES, decodeDocument, isNameChar, isNameStart, isSpace, isXmlChar } from "./xml-chars.js";
import type { ScanOptions, XmlEvent, XmlName, XmlProblem, XmlScan } from "./xml-types.js";

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
    const before = this.s.slice(0, Math.min(at, this.s.length));
    const line = before.split("\n").length;
    const column = before.length - (before.lastIndexOf("\n") + 1);
    const size = this.off[this.s.length]!;
    throw new Stop({ message: `<unknown>:${line}:${column}: ${message}`, at: atEnd ? size : this.off[Math.min(at + 1, this.s.length)]!, atEnd });
  }

  /** Raise the problem for input that ends inside a construct. */
  private eof(message = "unclosed token"): never {
    return this.fail(message, message === "unclosed token" ? this.tokenStart : this.s.length, true);
  }

  private at(): string { return this.s[this.i] ?? ""; }
  private skipSpace(): void { while (this.i < this.s.length && isSpace(this.s[this.i]!)) this.i++; }
  private startsWith(t: string): boolean { return this.s.startsWith(t, this.i); }

  /** Read an XML name. */
  private name(): string {
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
   * Check the pseudo-attributes of an XML declaration: `version`, then optionally `encoding`, then optionally `standalone`.
   * Expat reports the first one that is out of place at its own column (a missing `version` at column 0).
   */
  private checkDeclaration(decl: string): void {
    const attr = /\s+([A-Za-z]+)\s*=\s*("[^"]*"|'[^']*')/y;
    let pos = 5;
    const order = ["version", "encoding", "standalone"];
    let next = 0;
    for (;;) {
      attr.lastIndex = pos;
      const m = attr.exec(decl);
      if (m === null) {
        // Only whitespace may remain before `?>`; `version` is required.
        if (next === 0) this.fail("XML declaration not well-formed", 0);
        const rest = decl.slice(pos, decl.length - 2);
        if (rest.trim() !== "") this.fail("XML declaration not well-formed", pos + rest.length - rest.trimStart().length);
        return;
      }
      const at = pos + m[0].length - m[0].trimStart().length;
      const idx = next === 0 && m[1] !== "version" ? -1 : order.indexOf(m[1]!, next);
      const value = m[2]!.slice(1, -1);
      const valid = idx >= 0 && (idx === 0 ? value.length > 0 : idx === 1 ? /^[A-Za-z][A-Za-z0-9._-]*$/.test(value) : value === "yes" || value === "no");
      if (!valid) this.fail("XML declaration not well-formed", next === 0 ? 0 : at);
      next = idx + 1;
      pos += m[0].length;
    }
  }

  /** Decode a reference starting at `&`; returns the text it stands for. */
  private reference(): string {
    const saved = this.tokenStart;
    this.tokenStart = this.i;
    const semi = this.s.indexOf(";", this.i);
    if (semi < 0) return this.eof();
    const body = this.s.slice(this.i + 1, semi);
    let out: string | undefined;
    if (body.startsWith("#x") && /^#x[0-9a-fA-F]+$/.test(body)) out = String.fromCodePoint(Math.min(0x110000, parseInt(body.slice(2), 16)) % 0x110000);
    else if (/^#[0-9]+$/.test(body)) out = String.fromCodePoint(Math.min(0x10ffff, parseInt(body.slice(1), 10)));
    else if (Object.hasOwn(ENTITIES, body)) out = ENTITIES[body]!;
    if (out === undefined) return this.fail(/^[A-Za-z_]/.test(body) ? "undefined entity" : "not well-formed (invalid token)");
    if (!isXmlChar(out.codePointAt(0)!)) return this.fail("reference to invalid character number");
    this.i = semi + 1;
    this.tokenStart = saved;
    return out;
  }

  /** Read a quoted attribute value, normalising whitespace and expanding references. */
  private attributeValue(): string {
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
      if (c === "&") { out += this.reference(); continue; }
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
      const an = this.name();
      this.skipSpace();
      if (this.at() !== "=") return this.at() === "" ? this.eof() : this.fail("not well-formed (invalid token)");
      this.i++;
      this.skipSpace();
      if (raw.some(([n]) => n === an)) return this.fail("duplicate attribute");
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
    if (name === null) return this.fail("unbound prefix", this.i - 1);
    const attrs: [XmlName, string][] = [];
    for (const [n, v] of plain) {
      const expanded = this.scope.expand(n, true);
      if (expanded === null) return this.fail("unbound prefix", this.i - 1);
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
    const target = this.name();
    if (target.toLowerCase() === "xml") this.fail("XML or text declaration not at start of entity");
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
      if (c === "]" && this.startsWith("]]>")) return this.fail("not well-formed (invalid token)");
      if (!isXmlChar(c.codePointAt(0)!)) return this.fail("not well-formed (invalid token)");
      if (c === "\r") { out += "\n"; if (this.s[this.i + 1] === "\n") this.i++; } else out += c;
      this.i++;
    }
    if (this.i > start) this.events.push({ kind: "text", data: out, end: this.off[this.i]! });
  }

  /** Scan the whole document. */
  run(): void {
    if (this.startsWith("<?xml") && isSpace(this.s[this.i + 5] ?? "")) {
      const decl = this.skipPast("?>");
      this.checkDeclaration(decl);
    }
    let seenRoot = false;
    // Prolog and epilog: whitespace, comments, PIs and (before the root) one DOCTYPE.
    for (;;) {
      this.skipSpace();
      if (this.i >= this.s.length) break;
      this.tokenStart = this.i;
      if (this.startsWith("<!--")) { this.i += 4; this.comment(); continue; }
      if (this.startsWith("<?")) { this.i += 2; this.pi(); continue; }
      if (!seenRoot && this.startsWith("<!DOCTYPE")) { this.i += 9; this.doctype(); continue; }
      if (this.at() !== "<") return seenRoot ? this.fail("junk after document element") : this.fail("syntax error");
      if (seenRoot) return this.fail("junk after document element");
      seenRoot = true;
      this.i++;
      this.startTag();
      this.content();
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
  const { text, offsets } = decodeDocument(bytes, options.ignoreDeclaredEncoding ?? false);
  if (text === null) {
    return { events: [], problem: { message: "<unknown>:1:0: not well-formed (invalid token)", at: 1, atEnd: false }, size: bytes.length };
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
