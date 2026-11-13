import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORDS, type Case, diff, runCase } from "./golden-runner";

const { biopython, records, cases } = JSON.parse(readFileSync(new URL("./golden/seqedit.json", import.meta.url), "utf8")) as {
  biopython: string; records: Record<string, unknown>; cases: Case[];
};
Object.assign(RECORDS, records);

/** The Biopython operation each kind of case is measured against. */
const AUTHORITY: Record<Case["op"], string> = {
  slice: "record[a:b] vs extractRegion(record, a, b, { edgeFeatures: 'drop' })",
  rc: "record.reverse_complement() vs reverseComplementRecord(record)",
  shift: "location + offset vs shiftLocation(location, offset)",
};

const groups = new Map<Case["op"], Case[]>();
for (const c of cases) {
  const list = groups.get(c.op) ?? [];
  list.push(c);
  groups.set(c.op, list);
}

describe(`@biolibs/seqedit parity with Biopython ${biopython}`, () => {
  it("has cases of every kind, so no claim goes unmeasured", () => {
    expect([...groups.keys()].sort()).toEqual(["rc", "shift", "slice"]);
    for (const list of groups.values()) expect(list.length).toBeGreaterThan(0);
  });

  it("measures each deliberate divergence from Biopython, and no others", () => {
    const diverging = cases.filter((c) => c.divergence);
    // One known divergence, over the record holding a feature with no location.
    expect(new Set(diverging.map((c) => c.divergence))).toEqual(new Set([
      "no-location feature: Biopython raises AttributeError, seqedit keeps the feature",
    ]));
    expect(diverging.length).toBeGreaterThan(0);
    // Every case Biopython failed on must be one we claimed, so a new Biopython failure cannot pass unnoticed.
    expect(cases.filter((c) => c.exc && !c.divergence)).toEqual([]);
  });

  for (const [op, list] of [...groups].sort()) {
    it(`${AUTHORITY[op]} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const d = diff(c, runCase(c));
        if (d) bad.push(`${JSON.stringify({ op: c.op, recv: c.recv, args: c.args })}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 3).join("\n")}`).toBe(0);
    });
  }
});
