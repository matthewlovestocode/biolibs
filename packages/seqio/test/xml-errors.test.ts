/**
 * Counts the expat messages this port does not reproduce yet, so that the number can only go down.
 *
 * `golden-runner.ts` lets a mismatch between two of expat's prolog and epilog reasons pass, because deciding
 * between "not well-formed (invalid token)", "syntax error" and "junk after document element" needs expat's own
 * tokenizer states. Everything else about these messages is compared exactly, and this test pins down how much is
 * still exempt: it fails if the exemption starts covering more than it does today, which a change to the scanner
 * could otherwise do unnoticed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { xmlReason } from "../src/seqxml/xml-types.js";
import { runCase, type Case } from "./golden-runner";

const EXPAT = new Set(["SAXParseException", "ExpatError", "ParseError"]);

/** Every file whose reader goes through the XML scanner, with the divergences each one still has. */
const FILES: [string, number][] = [
  ["seqio-seqxml.json", 17],
  ["seqio-uniprot-xml.json", 11],
  ["seqio-snapgene.json", 11],
];

describe("XML error messages: what expat still says differently", () => {
  for (const [file, expected] of FILES) {
    it(`${file} has ${expected} unreproduced message(s)`, () => {
      const { cases } = JSON.parse(readFileSync(new URL(`./golden/${file}`, import.meta.url), "utf8")) as { cases: Case[] };
      const seen: string[] = [];
      for (const c of cases) {
        const want = c.exc;
        if (!want || !EXPAT.has(want.type) || want.msg === null) continue;
        const got = runCase(c).exc;
        if (got === undefined || got.msg === null || got.msg === want.msg) continue;
        seen.push(`${xmlReason(want.msg)} -> ${xmlReason(got.msg)}`);
      }
      expect(seen.length, `now ${seen.length}:\n${[...new Set(seen)].join("\n")}`).toBe(expected);
    });
  }
});
