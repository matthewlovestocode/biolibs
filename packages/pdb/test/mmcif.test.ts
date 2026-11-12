/** Replays Bio.PDB mmCIF golden cases (reference/golden/gen_mmcif_cases.py) against MMCIF2Dict, MMCIFParser and FastMMCIFParser. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { FastMMCIFParser, MMCIF2Dict, MMCIFParser } from "@biolibs/pdb";
import { canon, encStructure, excOk, type Exc } from "./encode.js";

interface Case {
  kind: "dict" | "parse"; text: string; parser?: string;
  opts?: { auth_chains: boolean; auth_residues: boolean; quiet: boolean; permissive: boolean };
  exc?: Exc; dict?: [string, unknown][]; structure?: unknown; header?: unknown; warnings: string[];
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    if (c.kind === "dict") { out["dict"] = [...new MMCIF2Dict(c.text).entries()]; return; }
    const o = c.opts!;
    const common = { authChains: o.auth_chains, authResidues: o.auth_residues, quiet: o.quiet };
    if (c.parser === "fast") out["structure"] = encStructure(new FastMMCIFParser(common).getStructure("x", c.text));
    else {
      const p = new MMCIFParser({ ...common, permissive: o.permissive });
      out["structure"] = encStructure(p.getStructure("x", c.text));
      out["header"] = p.header;
    }
  });
  if (cap.error !== undefined) out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

describe("mmCIF: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/mmcif.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`MMCIF2Dict, MMCIFParser, FastMMCIFParser (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = run(c);
      let why = "";
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc) {
        for (const k of ["dict", "structure", "header"] as const) {
          if (!why && canon((c as any)[k]) !== canon(got[k])) why = `${k}: want ${canon((c as any)[k])?.slice(0, 300)} got ${canon(got[k])?.slice(0, 300)}`;
        }
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings).slice(0, 300)} got ${JSON.stringify(got["warnings"]).slice(0, 300)}`;
      if (why) bad.push(`${c.kind}/${c.parser ?? ""} ${JSON.stringify(c.text.slice(0, 100))}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
