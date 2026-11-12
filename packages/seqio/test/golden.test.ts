import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diff, runCase, type Case } from "./golden-runner";

const dir = new URL("./golden/", import.meta.url);

for (const file of readdirSync(dir).filter((f) => f.startsWith("seqio-") && f.endsWith(".json")).sort()) {
  const { biopython, cases } = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { biopython: string; cases: Case[] };
  // Group by case kind and format so a failure names the reader or writer that diverges.
  const groups = new Map<string, Case[]>();
  for (const c of cases) {
    const key = `${c.kind}${c.format !== undefined && c.format !== null ? ` ${String(c.format)}` : ""}${c.cls ? ` ${c.cls}` : ""}${c.parser ? ` ${c.parser}` : ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  describe(`${file}: parity with Biopython ${biopython}`, () => {
    for (const [key, list] of [...groups].sort()) {
      it(`${key} (${list.length} cases)`, () => {
        const bad: string[] = [];
        for (const c of list) {
          const d = diff(c, runCase(c));
          if (d) bad.push(`${JSON.stringify({ format: c.format, text: c.text, bytes: c.bytes, records: c.records?.length, cls: c.cls, args: c.args })}\n    ${d}`);
        }
        expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 4).join("\n")}`).toBe(0);
      });
    }
  });
}
