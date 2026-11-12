import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diff, runCase, type Case } from "./golden-runner";

const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/seqfeature.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };

// Group by operation so a failure names the method that diverges.
const groups = new Map<string, Case[]>();
for (const c of cases) {
  const key = c.static ? c.static : c.ctor ? `${c.ctor}()` : (c.op as string);
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
}

describe(`Bio.SeqFeature parity with Biopython ${biopython}`, () => {
  for (const [key, list] of [...groups].sort()) {
    it(`${key} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const d = diff(c, runCase(c));
        if (d) bad.push(`${JSON.stringify({ recv: c.recv, args: c.args })}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
    });
  }
});
