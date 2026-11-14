/**
 * Replays what was left of the Dseq golden cases (reference/golden/gen_dseqrest_cases.py): the checksum,
 * joining, searching, the parts record's own behaviour, and whether two strands anneal.
 */
import { readFileSync } from "node:fs";
import { annealStrands, contains, Dseq, find, join, partAt, partsEqual, partsList, partsRepr,
  seguidOf } from "@biolibs/dseq";
import { describe, expect, it } from "vitest";

interface Snapshot {
  data: string;
  watson: string;
  crick: string;
  len: number;
  ovhg: number | null;
  str: string;
  circular: boolean;
}
type Guarded<T> = { value: T } | { exc: { type: string; msg: string } };
interface Case {
  data: string;
  circular: boolean;
  needles: string[];
  snap?: Snapshot;
  seguid?: Guarded<string>;
  find?: Guarded<number>[];
  contains?: Guarded<boolean>[];
  hash?: Guarded<number>;
  parts?: { repr: string; list: string[]; items: Guarded<string>[]; eq_self: boolean; eq_other: boolean };
  exc?: { type: string; msg: string };
}
interface JoinCase { separator: string; fragments: string[]; result: Guarded<Snapshot | { raw: string }> }
interface AnnealCase { a: string; b: string; result: Guarded<boolean> }

const golden = JSON.parse(readFileSync(new URL("./golden/dseq-rest.json", import.meta.url), "utf8")) as
  { cases: Case[]; joins: JoinCase[]; anneals: AnnealCase[] };

/** @param d - A molecule. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (d: Dseq): Snapshot => ({
  data: d.code, watson: d.watson, crick: d.crick, len: d.length, ovhg: d.ovhg, str: d.toString(),
  circular: d.circular,
});

/**
 * Compare one recorded value with what the port gives, whichever of the two is an error.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same<T>(want: Guarded<T>, run: () => T, where: string): void {
  let got: T | undefined;
  let err: Error | undefined;
  try { got = run(); } catch (e) { err = e as Error; }
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}`).toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
}

describe("pydna.dseq.Dseq: the checksum, joining and searching", () => {
  golden.cases.forEach((c, index) => {
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
      same(c.seguid!, () => seguidOf(d), "seguid");
      c.needles.forEach((needle, i) => {
        same(c.find![i]!, () => find(d, needle), `find ${JSON.stringify(needle)}`);
        same(c.contains![i]!, () => contains(d, needle), `contains ${JSON.stringify(needle)}`);
      });
      // Python sets `__hash__` to None because `__eq__` is defined without it, so a molecule cannot be
      // hashed; JavaScript has no hashing protocol to port, which is why the case records the refusal
      // and nothing here answers it.
      expect("exc" in c.hash!, "hashing is refused").toBe(true);
      const parts = d.getParts();
      expect(partsRepr(parts), "parts repr").toBe(c.parts!.repr);
      expect(partsList(parts), "parts list").toEqual(c.parts!.list);
      [0, 2, 6, -1, 7].forEach((index2, i) => {
        same(c.parts!.items[i]!, () => partAt(parts, index2), `part ${index2}`);
      });
      expect(partsEqual(parts, d.getParts()), "equal to itself").toBe(c.parts!.eq_self);
      expect(partsEqual(parts, new Dseq("GAATTC").getParts()), "equal to another").toBe(c.parts!.eq_other);
    });
  });
});

describe("pydna.dseq.Dseq.join", () => {
  golden.joins.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.separator)} between ${c.fragments.length}`, () => {
      same(c.result, () => {
        const result = join(new Dseq(c.separator), c.fragments.map((f) => new Dseq(f)));
        return typeof result === "string" ? { raw: result } : snap(result);
      }, "join");
    });
  });
});

describe("pydna.alphabet.anneal_strands", () => {
  golden.anneals.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.a)} against ${JSON.stringify(c.b)}`, () => {
      same(c.result, () => annealStrands(c.a, c.b), "anneal");
    });
  });
});
