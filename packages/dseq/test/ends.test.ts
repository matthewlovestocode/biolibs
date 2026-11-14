/**
 * Replays the end-modifying enzyme golden cases (reference/golden/gen_dseqends_cases.py).
 *
 * Each case runs every enzyme over one molecule and compares the whole result, the dscode string
 * included, so an end left single stranded where pydna filled it in is caught either way.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Dseq, exo1End, exo1Front, fillIn, klenow, mung, nibbleFivePrimeLeft, nibbleFivePrimeRight,
  nibbleThreePrimeLeft, nibbleThreePrimeRight, nibbleToBlunt, t4, T4, terminalTransferase,
  user } from "@biolibs/dseq";

interface Snapshot {
  data: string;
  watson: string;
  crick: string;
  len: number;
  ovhg: number | null;
  right_ovhg: number | null;
  str: string;
  circular: boolean;
  five: [string, string];
  three: [string, string];
  blunt: boolean;
}
interface Case {
  data: string;
  circular: boolean;
  ops: [string, (string | number)[]][];
  snap?: Snapshot;
  ops_out?: ({ snap: Snapshot } | { exc: { type: string; msg: string } })[];
  exc?: { type: string; msg: string };
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/dseq-ends.json", import.meta.url), "utf8"));

/** @param d - A molecule. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (d: Dseq): Snapshot => ({
  data: d.code, watson: d.watson, crick: d.crick, len: d.length, ovhg: d.ovhg, right_ovhg: d.rightOvhg,
  str: d.toString(), circular: d.circular, five: d.fivePrimeEnd(), three: d.threePrimeEnd(),
  blunt: d.isblunt(),
});

/** @param d - A molecule. @param name - The enzyme. @param args - Its arguments. @returns The result. */
function runOp(d: Dseq, name: string, args: (string | number)[]): Dseq {
  switch (name) {
    case "fill_in": return fillIn(d, args.length === 0 ? null : (args[0] as string));
    case "klenow": return klenow(d, args.length === 0 ? null : (args[0] as string));
    case "T4": return T4(d, args.length === 0 ? null : (args[0] as string));
    case "t4": return t4(d, args.length === 0 ? null : (args[0] as string));
    case "mung": return mung(d);
    case "nibble_to_blunt": return nibbleToBlunt(d);
    case "nibble_five_prime_left": return nibbleFivePrimeLeft(d, args[0] as number);
    case "nibble_five_prime_right": return nibbleFivePrimeRight(d, args[0] as number);
    case "nibble_three_prime_left": return nibbleThreePrimeLeft(d, args[0] as number);
    case "nibble_three_prime_right": return nibbleThreePrimeRight(d, args[0] as number);
    case "exo1_front": return exo1Front(d, args[0] as number);
    case "exo1_end": return exo1End(d, args[0] as number);
    case "terminal_transferase": return terminalTransferase(d, args.length === 0 ? undefined : (args[0] as string));
    case "user": return user(d);
    default: throw new Error(`unknown op ${name}`);
  }
}

describe("pydna.dseq.Dseq: the end-modifying enzymes", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.circular ? "circular" : "linear"} ${JSON.stringify(c.data)}`, () => {
      if (c.exc) {
        let err: { name?: string; message?: string } = {};
        try { new Dseq(c.data, null, null, c.circular); } catch (e) { err = e as Error; }
        expect(err.name, "exception type").toBe(c.exc.type);
        expect(err.message).toBe(c.exc.msg);
        return;
      }
      const d = new Dseq(c.data, null, null, c.circular);
      expect(snap(d), "molecule").toEqual(c.snap);
      c.ops.forEach(([name, args], i) => {
        const want = c.ops_out![i]!;
        let got: Dseq | undefined;
        let err: Error | undefined;
        try { got = runOp(d, name, args); } catch (e) { err = e as Error; }
        const where = `op ${i} ${name}(${JSON.stringify(args)})`;
        if ("exc" in want) {
          expect(err?.name, `${where}: expected ${want.exc.type}`).toBe(want.exc.type);
          expect(err?.message, where).toBe(want.exc.msg);
        } else {
          expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
          expect(snap(got!), where).toEqual(want.snap);
        }
      });
    });
  });
});
