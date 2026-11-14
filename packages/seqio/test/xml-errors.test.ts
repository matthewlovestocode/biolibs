/**
 * Replays the XML scanner's error cases (reference/golden/gen_xmlerr_cases.py).
 *
 * Expat chooses between "not well-formed (invalid token)", "syntax error", "junk after document element" and
 * "unclosed token" — and the column it points at — from the state of its own tokenizer, so these cases measure
 * it directly: every shape of junk before and after the document element, references in content and in attribute
 * values, documents that simply stop, bytes that are not valid UTF-8, and declarations out of place.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanXml } from "../src/seqxml/xml-scanner.js";

interface Case {
  /** Which group the case belongs to, for the report. */
  kind: string;
  /** The document's bytes, as hex. */
  bytes: string;
  /** Set when expat parsed it without complaint. */
  ok?: boolean;
  /** Set when Python itself refused the encoding before expat saw it. */
  lookup?: string;
  /** Expat's reason. */
  reason?: string;
  /** The line it pointed at. */
  line?: number;
  /** The column. */
  column?: number;
}

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));

describe("XML scanner: expat's own messages", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./golden/xmlerr.json", import.meta.url), "utf8")) as { cases: Case[] };

  it(`reason and position match expat (${cases.length} cases)`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      if (c.lookup !== undefined) continue;             // Python refused the encoding; nothing for the scanner to do
      const text = JSON.stringify(new TextDecoder().decode(bytes(c.bytes)));
      const problem = scanXml(bytes(c.bytes)).problem;
      if (c.ok === true) {
        if (problem !== null) bad.push(`${c.kind} ${text}: expected no error, got ${problem.reason} at ${problem.line}:${problem.column}`);
        continue;
      }
      if (problem === null) { bad.push(`${c.kind} ${text}: expected ${c.reason} at ${c.line}:${c.column}, got no error`); continue; }
      if (problem.reason !== c.reason || problem.line !== c.line || problem.column !== c.column) {
        bad.push(`${c.kind} ${text}: want ${c.reason} at ${c.line}:${c.column}, got ${problem.reason} at ${problem.line}:${problem.column}`);
      }
    }
    expect(bad.length, `${bad.length} of ${cases.length}:\n${bad.slice(0, 25).join("\n")}`).toBe(0);
  });
});
