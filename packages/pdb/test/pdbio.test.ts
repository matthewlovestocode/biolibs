/** Replays the Bio.PDB writer golden cases (reference/golden/gen_pdbio_cases.py): PDBIO, MMCIFIO and mmCIF dictionary output. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { MMCIF2Dict, MMCIFIO, PDBIO, PDBParser, Select } from "@biolibs/pdb";
import { canon, excOk, type Exc } from "./encode.js";

interface Spec { models?: number[]; chains?: string[]; het?: string; atoms?: string[]; ret?: string }
interface Case {
  kind: "pdb" | "mmcif" | "dict" | "repr"; pqr: boolean; text: string; muts: [string, number[], any][]; target: number[]; orphan: boolean; select: Spec;
  opts: { use_model_flag: number; write_end: boolean; preserve: boolean }; dict: [string, string | string[]][];
  written?: string; exc?: Exc; warnings: string[]; reparsed?: [string, unknown][]; reparse_exc?: Exc;
}

const SPECIAL: Record<string, number> = { nan: NaN, inf: Infinity, "-inf": -Infinity };
const val = (v: unknown): any => (typeof v === "string" && Object.hasOwn(SPECIAL, v) ? SPECIAL[v] : v);

/** Walk model, chain, residue and atom indices; residues and atoms come from the unpacked lists. */
function unode(s: any, path: number[]): any {
  let x = s;
  path.forEach((i, depth) => { x = depth < 2 ? x.childList[i] : x.getUnpackedList()[i]; });
  return x;
}

function applyMut(s: any, [kind, path, v]: [string, number[], any]): void {
  const x = unode(s, path);
  switch (kind) {
    case "bfactor": x.bfactor = v === null ? null : Number(val(v)); break;
    case "occupancy": x.occupancy = v === null ? null : Number(val(v)); break;
    case "charge": x.pqrCharge = v === null ? null : Number(val(v)); break;
    case "radius": x.radius = v === null ? null : Number(val(v)); break;
    case "coord": x.setCoord(Float32Array.from(v.map((c: unknown) => Number(val(c))))); break;
    case "serial": x.serialNumber = v === "nan" ? Number.NaN : v; break;
    case "element": x.element = v; break;
    case "altloc": x.altloc = v; break;
    case "fullname": x.fullname = v; break;
    case "resname": x.resname = v; break;
    case "segid": x.segid = v; break;
    case "chain_id": x.id = v; break;
    case "res_id": x.id = v; break;
    case "model_serial": x.serialNum = v; break;
    default: throw new Error(kind);
  }
}

/** A Select driven by the same JSON spec the generator uses. */
class SpecSelect extends Select {
  constructor(private spec: Spec) { super(); }
  private ret(ok: boolean): unknown { const r = this.spec.ret ?? "int"; return r === "int" ? (ok ? 1 : 0) : r === "bool" ? ok : ok ? 1 : null; }
  override acceptModel(m: any): unknown { return this.ret(this.spec.models === undefined || this.spec.models.includes(m.serialNum)); }
  override acceptChain(c: any): unknown { return this.ret(this.spec.chains === undefined || this.spec.chains.includes(c.id)); }
  override acceptResidue(r: any): unknown { return this.ret(this.spec.het === undefined || (r.id[0] === " ") === (this.spec.het === "no_het")); }
  override acceptAtom(a: any): unknown { return this.ret(this.spec.atoms === undefined || this.spec.atoms.includes(a.name)); }
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    if (c.kind === "repr") { out["written"] = new Select().repr(); return; }
    if (c.kind === "dict") {
      const io = new MMCIFIO();
      io.setDict(new Map(c.dict));
      const text = io.save();
      out["written"] = text;
      try { out["reparsed"] = [...new MMCIF2Dict(text)]; } catch (e) { out["reparse_exc"] = { type: (e as Error).name, msg: (e as Error).message }; }
      return;
    }
    const parsed = captureWarnings(() => new PDBParser({ permissive: true, quiet: true, isPqr: c.pqr }).getStructure("x", c.text));
    if (parsed.error !== undefined) throw parsed.error;
    const s = parsed.result as any;
    for (const m of c.muts) applyMut(s, m);
    let target = unode(s, c.target);
    if (c.orphan) target = target.copy();
    const sel = new SpecSelect(c.select);
    if (c.kind === "pdb") {
      const w = new PDBIO({ useModelFlag: c.opts.use_model_flag, isPqr: c.pqr });
      w.setStructure(target);
      out["written"] = w.save(sel, c.opts.write_end, c.opts.preserve);
    } else {
      const w = new MMCIFIO();
      w.setStructure(target);
      out["written"] = w.save(sel, c.opts.preserve);
    }
  });
  if (cap.error !== undefined) { delete out["written"]; out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message }; }
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

describe("PDBIO / MMCIFIO: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/pdbio.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`write (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = run(c);
      let why = "";
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc && (c as any).written !== got["written"]) why = (() => { const a = (c as any).written as string, b = got["written"] as string; let i = 0; while (i < a.length && a[i] === b?.[i]) i++; return `text differs at ${i}: want ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 80))} got ${JSON.stringify(b?.slice(Math.max(0, i - 60), i + 80))}`; })();
      else if (!c.exc && c.kind === "dict" && canon(c.reparsed) !== canon(got["reparsed"])) why = "reparsed dictionary differs";
      else if (!c.exc && c.kind === "dict" && !excOk(c.reparse_exc, got["reparse_exc"])) why = `reparse exc: want ${JSON.stringify(c.reparse_exc)} got ${JSON.stringify(got["reparse_exc"])}`;
      else if (JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings).slice(0, 300)} got ${JSON.stringify(got["warnings"]).slice(0, 300)}`;
      if (why) bad.push(`${c.kind} ${JSON.stringify(c.kind === "dict" ? c.dict : { muts: c.muts, target: c.target, orphan: c.orphan, select: c.select, opts: c.opts, pqr: c.pqr }).slice(0, 300)}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
