import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORDS, diff, runCase, type Case } from "./golden-runner";

const { biopython, records, cases } = JSON.parse(readFileSync(new URL("./golden/seqrecord.json", import.meta.url), "utf8")) as {
  biopython: string; records: Record<string, unknown>; cases: Case[];
};
Object.assign(RECORDS, records);

// Group by operation so a failure names the method that diverges.
const groups = new Map<string, Case[]>();
for (const c of cases) {
  const key = c.ctor ? "SeqRecord()" : c.func ? `Bio.Seq.${c.func}` : (c.op as string);
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
}

describe(`Bio.SeqRecord parity with Biopython ${biopython}`, () => {
  for (const [key, list] of [...groups].sort()) {
    it(`${key} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const d = diff(c, runCase(c));
        if (d) bad.push(`${JSON.stringify({ recv: c.recv, args: c.args })}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
    });
  }
});
