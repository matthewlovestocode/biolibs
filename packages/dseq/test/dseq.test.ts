/**
 * Replays the pydna Dseq golden cases (reference/golden/gen_dseq_cases.py).
 *
 * Each case compares the whole molecule — the dscode string the port holds internally as well as both
 * strands, the overhangs, the blunt reading, the figure, the parts, the ends and the weight — so a right
 * answer reached from a different representation would still fail.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Dseq } from "@biolibs/dseq";

interface Snapshot {
  data: string;
  watson: string;
  crick: string;
  len: number;
  ovhg: number | null;
  right_ovhg: number | null;
  str: string;
  figure: string;
  parts: string[];
  five: [string, string];
  three: [string, string];
  blunt: boolean;
  mw: number | { type: string; msg: string };
  circular: boolean;
}
interface Spec { kind: string; args: unknown[] }
interface Case extends Spec {
  ops: [string, unknown[]][];
  snap?: Snapshot;
  ops_out?: ({ snap: Snapshot } | { value: boolean } | { raw: string } | { exc: { type: string; msg: string } })[];
  exc?: { type: string; msg: string };
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/dseq.json", import.meta.url), "utf8"));

/** @param spec - A case's description of a molecule. @returns It. */
function build(spec: Spec): Dseq {
  const a = spec.args;
  switch (spec.kind) {
    case "construct": return new Dseq(a[0] as string, a[1] as string | null, a[2] as number | null, a[3] as boolean);
    case "quick": return Dseq.quick(a[0] as string, a[1] as boolean);
    case "full_and_overhangs": return Dseq.fromFullSequenceAndOverhangs(a[0] as string, a[1] as number, a[2] as number);
    case "representation": return Dseq.fromRepresentation(a[0] as string);
    default: throw new Error(`unknown kind ${spec.kind}`);
  }
}

/** @param d - A molecule. @returns Everything about it, in the generator's own JSON shape. */
function snap(d: Dseq): Snapshot {
  const p = d.getParts();
  let mw: number | { type: string; msg: string };
  try { mw = d.mw(); } catch (e) { mw = { type: (e as Error).name, msg: (e as Error).message }; }
  return {
    data: (d as unknown as { data: string }).data,
    watson: d.watson,
    crick: d.crick,
    len: d.length,
    ovhg: d.ovhg,
    right_ovhg: d.rightOvhg,
    str: d.toString(),
    figure: d.figure(),
    parts: [p.stickyLeft5, p.stickyLeft3, p.middle, p.stickyRight3, p.stickyRight5, p.singleWatson, p.singleCrick],
    five: d.fivePrimeEnd(),
    three: d.threePrimeEnd(),
    blunt: d.isblunt(),
    mw,
    circular: d.circular,
  };
}

/** @param d - A molecule. @param name - The operation. @param args - Its arguments. @returns The result. */
function runOp(d: Dseq, name: string, args: unknown[]): Dseq | boolean | string {
  switch (name) {
    case "rc": return d.rc();
    case "looped": return d.looped();
    case "shifted": return d.shifted(args[0] as number);
    case "cast_to_ds": return d.castToDs();
    case "cast_to_ds_left": return d.castToDsLeft();
    case "cast_to_ds_right": return d.castToDsRight();
    case "slice": return d.slice(args[0] as number | undefined, (args[1] ?? undefined) as number | undefined);
    case "add": return d.add(build(args[0] as Spec));
    case "add_str": return d.add(args[0] as string);
    case "multiply": return d.multiply(args[0] as number);
    case "equals": return d.equals(build(args[0] as Spec));
    default: throw new Error(`unknown op ${name}`);
  }
}

/** The weight is a float; everything else in a snapshot is compared exactly. */
const sameSnap = (got: Snapshot, want: Snapshot, where: string): void => {
  const { mw: gotMw, ...gotRest } = got;
  const { mw: wantMw, ...wantRest } = want;
  expect(gotRest, where).toEqual(wantRest);
  if (typeof wantMw === "number") {
    expect(typeof gotMw, `${where} mw`).toBe("number");
    expect(Math.abs((gotMw as number) - wantMw), `${where} mw`).toBeLessThanOrEqual(1e-9 * Math.max(1, wantMw));
  } else {
    expect(gotMw, `${where} mw`).toEqual(wantMw);
  }
};

describe("pydna.dseq.Dseq", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.kind} ${JSON.stringify(c.args).slice(0, 48)}`, () => {
      if (c.exc) {
        let err: { name?: string; message?: string } = {};
        try { build(c); } catch (e) { err = e as Error; }
        expect(err.name, "exception type").toBe(c.exc.type);
        expect(err.message).toBe(c.exc.msg);
        return;
      }
      const d = build(c);
      sameSnap(snap(d), c.snap!, "molecule");
      c.ops.forEach(([name, args], i) => {
        const want = c.ops_out![i]!;
        let got: Dseq | boolean | undefined;
        let err: Error | undefined;
        try { got = runOp(d, name, args); } catch (e) { err = e as Error; }
        if ("exc" in want) {
          expect(err?.name, `op ${i} ${name}: expected ${want.exc.type}`).toBe(want.exc.type);
          expect(err?.message, `op ${i} ${name}`).toBe(want.exc.msg);
        } else if ("value" in want) {
          expect(err, `op ${i} ${name}`).toBeUndefined();
          expect(got, `op ${i} ${name}`).toBe(want.value);
        } else if ("raw" in want) {
          // Ligating onto an empty molecule gives the other operand back untouched, string and all.
          expect(err, `op ${i} ${name}`).toBeUndefined();
          expect(got, `op ${i} ${name}`).toBe(want.raw);
        } else {
          expect(err, `op ${i} ${name}: ${err?.message ?? ""}`).toBeUndefined();
          sameSnap(snap(got as Dseq), want.snap, `op ${i} ${name}`);
        }
      });
    });
  });
});
