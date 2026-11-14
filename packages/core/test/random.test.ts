/**
 * Replays the `random` golden cases (reference/golden/gen_random_cases.py).
 *
 * Everything the generator itself produces is compared exactly, floats included: the whole point of the
 * port is that the same bits come out of the Mersenne Twister in the same order.
 *
 * `gauss` is the one exception. It takes its two uniform draws from the same stream, so its *sequence* is
 * exact, but it then puts them through `sin` and `cos`, and Python's are the platform C library's while
 * these are the engine's. They agree on most arguments and differ by an ulp on some — `sin` more often
 * than `cos`, so it is usually the second value of a pair, the one Python keeps for the next call, that
 * moves. Biopython's own output is not reproducible across platforms for the same reason, so these values
 * are compared to within four ulps.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PyRandom } from "@biolibs/core";

interface Case {
  kind: string;
  seed: string;
  values?: (number | string)[];
  widths?: number[];
  items?: string[];
  n?: number;
  a?: number;
  b?: number;
  mu?: number;
  sigma?: number;
  exc?: string;
}

/**
 * One `gauss` value, to within four ulps of Python's.
 *
 * @param got - The port's value. @param want - Python's. @param i - Which value of the sequence it is.
 */
const closeEnough = (got: number, want: number, i: number): void => {
  expect(Math.abs(got - want), `value ${i}: ${got} against ${want}`)
    .toBeLessThanOrEqual(4 * Number.EPSILON * Math.max(1, Math.abs(want)));
};

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/random.json", import.meta.url), "utf8"));

describe("Python's random module", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.kind} (seed ${c.seed})`, () => {
      const r = new PyRandom(BigInt(c.seed));
      switch (c.kind) {
        case "random":
          expect(c.values!.map(() => r.random())).toEqual(c.values);
          break;
        case "getrandbits":
          expect(c.widths!.map((k) => r.getrandbits(k))).toEqual(c.values);
          break;
        case "getrandbits-big":
          expect(c.widths!.map((k) => r.getrandbitsBig(k).toString())).toEqual(c.values);
          break;
        case "randrange":
          expect(c.values!.map(() => r.randrange(c.n!))).toEqual(c.values);
          break;
        case "randint":
          expect(c.values!.map(() => r.randint(c.a!, c.b!))).toEqual(c.values);
          break;
        case "choice":
          expect(c.values!.map(() => r.choice(c.items!))).toEqual(c.values);
          break;
        case "shuffle": {
          const order = [...c.items!];
          r.shuffle(order);
          expect(order).toEqual(c.values);
          break;
        }
        case "gauss":
          c.values!.forEach((want, i) => closeEnough(r.gauss(c.mu, c.sigma), want as number, i));
          break;
        case "gauss-reseed": {
          // Seeding again clears the value `gauss` was keeping, so the second call repeats the first.
          const first = r.gauss(0.0, 1.0);
          r.seed(BigInt(c.seed));
          closeEnough(first, c.values![0] as number, 0);
          closeEnough(r.gauss(0.0, 1.0), c.values![1] as number, 1);
          break;
        }
        case "choice-empty":
          expect(() => r.choice([])).toThrow(c.exc);
          break;
        case "randrange-empty":
          expect(() => r.randrange(0)).toThrow(c.exc);
          break;
        default:
          throw new Error(`unknown kind ${c.kind}`);
      }
    });
  });
});
