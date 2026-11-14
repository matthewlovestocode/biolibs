/**
 * Replays the SEGUID golden cases (reference/golden/gen_seguid_cases.py).
 *
 * The checksums are compared character for character — the whole point of them is that two tools agree —
 * along with the rotation a circular checksum is taken from and the alphabet tables underneath.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cdseguid, csseguid, type Form, ldseguid, lsseguid, minRotation, rotate, rotateToMin, seguid,
  tableFactory } from "@biolibs/seguid";

type Guarded<T> = { value: T } | { exc: { type: string; msg: string } };
interface ChecksumCase { kind: string; args: (string | Form)[]; value?: string | string[]; exc?: { type: string; msg: string } }
interface RotationCase {
  seq: string;
  min_rotation: Guarded<number>;
  rotate_to_min: Guarded<string>;
  rotations: Guarded<string>[];
}
interface TableCase { spec: string; table: Guarded<[string, string][]> }

const golden = JSON.parse(readFileSync(new URL("./golden/seguid.json", import.meta.url), "utf8")) as
  { checksums: ChecksumCase[]; rotations: RotationCase[]; tables: TableCase[] };

/**
 * The complaint about unknown symbols lists them in the order a Python set iterates them, which is not
 * reproducible; the generator sorts them and so does this.
 *
 * @param message - An error message. @returns It, with any symbol list sorted.
 */
function normalise(message: string): string {
  const m = /^Detected symbols '(.*)' not in the 'alphabet'$/.exec(message);
  if (m === null) return message;
  return `Detected symbols '${m[1]!.split(" ").sort().join(" ")}' not in the 'alphabet'`;
}

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
    // An AssertionError has no message worth comparing; the ValueErrors do.
    expect(err, `${where}: expected ${want.exc.type}`).toBeDefined();
    if (want.exc.type !== "AssertionError") {
      expect(err!.name, where).toBe(want.exc.type);
      expect(normalise(err!.message), where).toBe(want.exc.msg);
    }
  } else {
    expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
}

describe("seguid: the checksums", () => {
  golden.checksums.forEach((c, index) => {
    it(`${index} ${c.kind}(${c.args.map((a) => JSON.stringify(a)).join(", ")})`, () => {
      const a = c.args as string[];
      const run = (): string | string[] => {
        switch (c.kind) {
          case "seguid": return seguid(a[0]!, a[1], a[2] as Form);
          case "lsseguid": return lsseguid(a[0]!, a[1], a[2] as Form);
          case "csseguid": return csseguid(a[0]!, a[1], a[2] as Form);
          case "ldseguid": return ldseguid(a[0]!, a[1]!, a[2], a[3] as Form);
          case "cdseguid": return cdseguid(a[0]!, a[1]!, a[2], a[3] as Form);
          default: throw new Error(`unknown kind ${c.kind}`);
        }
      };
      const want: Guarded<string | string[]> = c.exc ? { exc: c.exc } : { value: c.value! };
      same(want, run, c.kind);
    });
  });
});

describe("seguid: the smallest rotation", () => {
  golden.rotations.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.seq)}`, () => {
      same(c.min_rotation, () => minRotation(c.seq), "min rotation");
      same(c.rotate_to_min, () => rotateToMin(c.seq), "rotate to min");
      [0, 1, 3, -1, 7].forEach((amount, i) => {
        same(c.rotations[i]!, () => rotate(c.seq, amount), `rotate by ${amount}`);
      });
    });
  });
});

describe("seguid: the alphabets", () => {
  golden.tables.forEach((c, index) => {
    it(`${index} ${c.spec}`, () => {
      same(c.table, () => [...tableFactory(c.spec)], "table");
    });
  });
});
