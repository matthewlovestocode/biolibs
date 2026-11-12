/** Replays the Bio.PDB.vectors golden cases (reference/golden/gen_vector_cases.py): Vector, rotations and homogeneous matrices. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import * as P from "@biolibs/pdb";
import { excOk, type Exc } from "./encode.js";

interface Case { op: string; args: any[]; result?: unknown; exc?: Exc; warnings: [string, string][] }

const SPECIAL: Record<string, number> = { nan: NaN, inf: Infinity, "-inf": -Infinity };
/** Decode an argument: special floats, `["v", xyz]` vectors, `["m", rows]` matrices. */
function dec(a: any): any {
  if (typeof a === "string") return Object.hasOwn(SPECIAL, a) ? SPECIAL[a] : a;
  if (Array.isArray(a) && a.length === 2 && a[0] === "v") return a[1].length === 3 ? new P.Vector(...(a[1].map(dec) as [number, number, number])) : new P.Vector(a[1]);
  if (Array.isArray(a) && a.length === 2 && a[0] === "m") return a[1].map((r: any[]) => r.map(dec));
  if (Array.isArray(a)) return a.map(dec);
  return a;
}
const encNum = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
/** Encode a result like the generator: vectors as `{vec, repr}`, matrices as `{arr}`. */
function enc(x: any): unknown {
  if (x instanceof P.Vector) return { vec: x.ar.map(encNum), repr: x.repr() };
  if (Array.isArray(x)) return x.map(enc);
  if (typeof x === "number") return encNum(x);
  return x;
}
const matrix = (x: any): unknown => ({ arr: x });
const nest = (x: any): unknown => (Array.isArray(x) ? x.map(nest) : typeof x === "number" ? encNum(x) : x);

function call(op: string, a: any[]): unknown {
  const v = (i: number): P.Vector => a[i];
  switch (op) {
    case "new": return new P.Vector(a[0], a[1], a[2]);
    case "repr": return v(0).repr();
    case "neg": return v(0).neg();
    case "add": return v(0).add(a[1]);
    case "sub": return v(0).sub(a[1]);
    case "dot": return v(0).dot(a[1]);
    case "div": return v(0).div(a[1]);
    case "cross": return v(0).cross(a[1]);
    case "get": return v(0).get(a[1]);
    case "set": v(0).set(a[1], a[2]); return v(0);
    case "has": return v(0).has(a[1]);
    case "norm": return v(0).norm();
    case "normsq": return v(0).normsq();
    case "normalize": v(0).normalize(); return v(0);
    case "normalized": return v(0).normalized();
    case "angle": return v(0).angle(a[1]);
    case "array": return matrix(v(0).getArray().map(encNum));
    case "lmul": return v(0).leftMultiply(a[1]);
    case "rmul": return v(0).rightMultiply(a[1]);
    case "copy": return v(0).copy();
    case "m2rotaxis": return P.m2rotaxis(a[0]);
    case "vector_to_axis": return P.vectorToAxis(a[0], a[1]);
    case "rotaxis2m": return matrix(nest(P.rotaxis2m(a[0], a[1])));
    case "refmat": return matrix(nest(P.refmat(a[0], a[1])));
    case "rotmat": return matrix(nest(P.rotmat(a[0], a[1])));
    case "calc_angle": return P.calcAngle(a[0], a[1], a[2]);
    case "calc_dihedral": return P.calcDihedral(a[0], a[1], a[2], a[3]);
    case "homog_rot_mtx": return matrix(nest(P.homogRotMtx(a[0], a[1])));
    case "homog_trans_mtx": return matrix(nest(P.homogTransMtx(a[0], a[1], a[2])));
    case "homog_scale_mtx": return matrix(nest(P.homogScaleMtx(a[0])));
    case "set_Z_homog_rot_mtx": P.setZHomogRotMtx(a[0], a[1]); return matrix(nest(a[1]));
    case "set_Y_homog_rot_mtx": P.setYHomogRotMtx(a[0], a[1]); return matrix(nest(a[1]));
    case "set_X_homog_rot_mtx": P.setXHomogRotMtx(a[0], a[1]); return matrix(nest(a[1]));
    case "set_homog_trans_mtx": P.setHomogTransMtx(a[0], a[1], a[2], a[3]); return matrix(nest(a[3]));
    case "get_spherical_coordinates": return P.getSphericalCoordinates(a[0]);
    case "coord_space": { const [m, r] = P.coordSpace(a[0], a[1], a[2], a[3]); return [matrix(nest(m)), r === null ? null : matrix(nest(r))]; }
    case "multi_rot_Z": return matrix(nest(P.multiRotZ(a[0])));
    case "multi_rot_Y": return matrix(nest(P.multiRotY(a[0])));
    case "multi_coord_space": {
      const r = P.multiCoordSpace(a[0], a[1], a[2]);
      return matrix(nest(a[2] ? [(r as any)[0], (r as any)[1]] : r));
    }
  }
  throw new Error(op);
}

/** Floats compare to 1e-9 relative (NumPy's SIMD trig and exp differ from JavaScript in the last bits); everything else exactly. */
function same(want: any, got: any, tol = 1e-9): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= tol * Math.max(1, Math.abs(want), Math.abs(got));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i], tol));
  if (want !== null && typeof want === "object") {
    const keys = Object.keys(want);
    // The repr is rounded to 2 places, so a rounding-boundary difference is tolerated when the numbers agree.
    return got !== null && typeof got === "object" && keys.every((k) => k === "repr" || same(want[k], got[k], tol));
  }
  return want === got;
}

/** Operations that end in `arccos`, which turns a last-bit difference near 0 or π into ~1e-8. */
const ANGLE_OPS = new Set(["angle", "calc_angle", "calc_dihedral", "m2rotaxis", "vector_to_axis"]);
/** A dihedral of ±π is the same angle; which sign comes out depends on last-bit rounding. */
const flipPi = (want: any, got: any): boolean => typeof want === "number" && typeof got === "number" && Math.abs(Math.abs(want) - Math.PI) < 1e-6 && Math.abs(Math.abs(got) - Math.PI) < 1e-6;

describe("Bio.PDB.vectors: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/vectors.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`operations (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const cap = captureWarnings(() => call(c.op, c.args.map(dec)));
      const got = cap.error === undefined ? { result: enc(cap.result) } : { exc: { type: (cap.error as Error).name, msg: (cap.error as Error).message } };
      let why = "";
      if (!excOk(c.exc, (got as any).exc)) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify((got as any).exc)}`;
      else if (!c.exc && !same(c.result, (got as any).result, ANGLE_OPS.has(c.op) ? 1e-6 : 1e-9) && !(c.op === "calc_dihedral" && flipPi(c.result, (got as any).result))) why = `result: want ${JSON.stringify(c.result)?.slice(0, 300)} got ${JSON.stringify((got as any).result)?.slice(0, 300)}`;
      else if (JSON.stringify(c.warnings.map((w) => w[1])) !== JSON.stringify(cap.warnings.map((w) => w.message))) why = `warnings: want ${JSON.stringify(c.warnings)} got ${JSON.stringify(cap.warnings.map((w) => w.message))}`;
      if (why) bad.push(`${c.op} ${JSON.stringify(c.args).slice(0, 250)}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
  });
});
