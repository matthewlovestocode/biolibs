import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diff, runCase, type Case } from "./golden-runner";

const file = new URL("./golden/seq.json", import.meta.url);
const { biopython, cases } = JSON.parse(readFileSync(file, "utf8")) as { biopython: string; cases: Case[] };

// Group by operation so a failure names the method that diverges.
const groups = new Map<string, Case[]>();
for (const c of cases) {
  const key = c.func ? `Bio.Seq.${c.func}` : c.ctor ? `${c.ctor}()` : (c.op as string);
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
}

describe(`Bio.Seq parity with Biopython ${biopython}`, () => {
  for (const [key, list] of [...groups].sort()) {
    it(`${key} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const d = diff(c, runCase(c));
        if (d) bad.push(`${JSON.stringify({ recv: c.recv, args: c.args })}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 8).join("\n")}`).toBe(0);
    });
  }
});
