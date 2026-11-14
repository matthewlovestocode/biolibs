/** Replays the matrix-exponential cases (reference/golden/gen_expm_cases.py): the port against scipy's output. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expm } from "../src/analysis/expm.js";

type Cell = number | "nan" | "inf" | "-inf";
interface Case { kind: string; n: number; a: Cell[][]; e: Cell[][] }

/** The numbers JSON cannot hold, as the generator writes them. */
const num = (x: Cell): number => (x === "nan" ? Number.NaN : x === "inf" ? Infinity : x === "-inf" ? -Infinity : x);

describe("matrix exponential", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./golden/expm.json", import.meta.url), "utf8")) as { cases: Case[] };

  it(`matches scipy.linalg.expm (${cases.length} cases)`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = expm(c.a.map((row) => row.map(num)));
      let worst = 0;
      let where = "";
      for (let i = 0; i < c.n; i++) {
        for (let j = 0; j < c.n; j++) {
          const want = num(c.e[i]![j]!), mine = got[i]![j]!;
          if (!Number.isFinite(want)) {
            if (Number.isFinite(mine)) bad.push(`${c.kind} n=${c.n} [${i}][${j}]: want ${want} got ${mine}`);
            continue;
          }
          const err = Math.abs(mine - want) / Math.max(1, Math.abs(want));
          if (err > worst) { worst = err; where = `[${i}][${j}] want ${want} got ${mine}`; }
        }
      }
      // Two implementations of this algorithm differ in the last bits of their inner linear solve, and the
      // squarings at the end multiply that up: a matrix of 1-norm 10000 needs eleven of them. A rate matrix of
      // the kind the methods here exponentiate needs few or none, so it is held to a tighter figure.
      const limit = c.kind === "rate" ? 1e-13 : 1e-10;
      if (worst > limit) bad.push(`${c.kind} n=${c.n}: relative error ${worst.toExponential(2)} at ${where}`);
    }
    expect(bad.length, `${bad.length} of ${cases.length}:\n${bad.slice(0, 8).join("\n")}`).toBe(0);
  });
});
