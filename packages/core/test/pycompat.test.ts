/**
 * Replays the Python-compatibility golden cases (reference/golden/gen_pycompat_cases.py).
 *
 * `py/` exists so a port can give Python's answers and Python's error messages. Most of it had no direct
 * test before this file — it was covered only by whichever package happened to call it, which is a
 * coverage figure that disappears the moment that caller changes, and it meant CPython had never actually
 * been asked what these functions should return. Every expectation here came from running it.
 *
 * Values cross the golden file tagged, because JSON has one number type and one array type: without the
 * tag a tuple arrives as a list and `1.0` as `1`. The port draws exactly those distinctions, with
 * `PyTuple` and `PyFloat`, because JavaScript cannot either.
 */
import { readFileSync } from "node:fs";
import {
  base64, pyBytesRepr, pyChr, pyClassRepr, pyContains, pyEquals, pyFirstWord, pyFloat, PyFloat, pyFloatRepr,
  pyFormatFixed, pyFormatG, pyInt, pyIsAscii, pyIsLower, pyIsPrintable, pyLstrip, pyPercent, pyRepr,
  pyRound, pyRoundTo, pyRstrip, pySplit, pyStr, pyStrip, pySum, pyTextwrapFill, pyTruthy, PyTuple,
  pyTypeName, sha1,
} from "@biolibs/core";
import { describe, expect, it } from "vitest";

type Guarded<T> = { value: T } | { exc: { type: string; msg: string } };
interface Tagged { t: string; v?: unknown }

const golden = JSON.parse(
  readFileSync(new URL("./golden/pycompat.json", import.meta.url), "utf8"),
) as { python: string; cases: Record<string, Array<Record<string, unknown>>> };

/**
 * Rebuild the Python value a tagged case describes.
 *
 * @param tag - The tagged form the generator wrote.
 * @returns The equivalent JavaScript value: a `PyTuple` for a tuple, a `Map` for a dict, a `PyFloat` for
 *   a float whose value is whole — which is the only way to tell Python's `1.0` from its `1` here.
 */
function decode(tag: Tagged): unknown {
  switch (tag.t) {
    case "none": return null;
    case "bool": return tag.v as boolean;
    case "int": return tag.v as number;
    case "float": {
      const n = Number(tag.v as string);
      // A whole-numbered float has to stay distinguishable from an int, which is what PyFloat is for.
      return Number.isInteger(n) ? new PyFloat(n) : n;
    }
    case "str": return tag.v as string;
    case "tuple": return PyTuple.from((tag.v as Tagged[]).map(decode));
    case "list": return (tag.v as Tagged[]).map(decode);
    case "dict": return new Map((tag.v as Array<[Tagged, Tagged]>)
      .map(([k, v]) => [decode(k), decode(v)]));
    default: throw new Error(`unknown tag ${tag.t}`);
  }
}

/**
 * Compare one recorded answer with the port's, whichever of the two is an error.
 *
 * @param want - What CPython did. @param run - How to get the port's answer. @param where - The label.
 */
function same<T>(want: Guarded<T>, run: () => T, where: string): void {
  let got: T | undefined;
  let err: Error | undefined;
  try { got = run(); } catch (e) { err = e as Error; }
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}, got ${err?.name}: ${err?.message ?? ""}`)
      .toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.name ?? ""}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
}

/** @param name - A case group. @returns Its cases. */
const group = (name: string): Array<Record<string, unknown>> => golden.cases[name]!;

describe(`py/: parity with CPython ${golden.python}`, () => {
  it("pyInt matches int()", () => {
    for (const c of group("pyInt")) {
      same(c.result as Guarded<number>, () => pyInt(c.text as string), `int(${JSON.stringify(c.text)})`);
    }
  });

  it("pyFloat matches float()", () => {
    for (const c of group("pyFloat")) {
      // Recorded as Python's repr so that inf and nan survive the JSON.
      same(c.result as Guarded<string>, () => pyFloatRepr(pyFloat(c.text as string)),
           `float(${JSON.stringify(c.text)})`);
    }
  });

  it("pyChr matches chr()", () => {
    for (const c of group("pyChr")) {
      same(c.result as Guarded<string>, () => pyChr(c.n as number), `chr(${String(c.n)})`);
    }
  });

  it("pyFloatRepr matches repr() of a float", () => {
    for (const c of group("pyFloatRepr")) {
      const text = c.repr_of as string;
      expect(pyFloatRepr(pyFloat(text)), `repr(${text})`).toBe(c.result as string);
    }
  });

  it("pyRound and pyRoundTo match round()", () => {
    for (const c of group("pyRound")) {
      const x = pyFloat(c.x as string);
      const n = c.ndigits as number | null;
      same(c.result as Guarded<string>,
           () => (n === null ? String(pyRound(x)) : pyFloatRepr(pyRoundTo(x, n))),
           `round(${c.x as string}${n === null ? "" : `, ${n}`})`);
    }
  });

  it("pyFormatG matches format(x, '.Ng')", () => {
    for (const c of group("pyFormatG")) {
      same(c.result as Guarded<string>,
           () => pyFormatG(pyFloat(c.x as string), c.precision as number),
           `format(${c.x as string}, '.${String(c.precision)}g')`);
    }
  });

  it("pyFormatFixed matches format(x, '.Nf')", () => {
    for (const c of group("pyFormatFixed")) {
      same(c.result as Guarded<string>,
           () => pyFormatFixed(pyFloat(c.x as string), c.digits as number),
           `format(${c.x as string}, '.${String(c.digits)}f')`);
    }
  });

  it("pySum matches sum()", () => {
    for (const c of group("pySum")) {
      const total = pySum(c.values as number[]);
      const got = c.is_float as boolean ? pyFloatRepr(total) : String(total);
      expect(got, `sum(${JSON.stringify(c.values)})`).toBe(c.result as string);
    }
  });

  it("pyPercent matches fmt % (args,) -- the tuple form", () => {
    for (const c of group("pyPercent")) {
      // The generator always applies a tuple, so the port is handed a PyTuple: that is what tells it to
      // name the argument's index in a complaint, as Python does for the tuple form.
      const args = PyTuple.from((c.args as Tagged[]).map(decode));
      same(c.result as Guarded<string>, () => pyPercent(c.fmt as string, args),
           `${JSON.stringify(c.fmt)} % ${JSON.stringify(c.args)}`);
    }
  });

  it("pyPercent matches fmt % value -- the single-value form", () => {
    for (const c of group("pyPercentSingle")) {
      same(c.result as Guarded<string>,
           () => pyPercent(c.fmt as string, decode(c.arg as Tagged)),
           `${JSON.stringify(c.fmt)} % ${JSON.stringify(c.arg)}`);
    }
  });

  it("pyRepr matches repr()", () => {
    for (const c of group("pyRepr")) {
      expect(pyRepr(decode(c.value as Tagged)), JSON.stringify(c.value)).toBe(c.result as string);
    }
  });

  it("pyStr matches str()", () => {
    for (const c of group("pyStr")) {
      expect(pyStr(decode(c.value as Tagged)), JSON.stringify(c.value)).toBe(c.result as string);
    }
  });

  it("pyTypeName matches type(x).__name__", () => {
    for (const c of group("pyTypeName")) {
      expect(pyTypeName(decode(c.value as Tagged)), JSON.stringify(c.value)).toBe(c.result as string);
    }
  });

  it("pyClassRepr matches str(type(x))", () => {
    for (const c of group("pyClassRepr")) {
      expect(pyClassRepr(decode(c.value as Tagged)), JSON.stringify(c.value)).toBe(c.result as string);
    }
  });

  it("pyEquals matches ==", () => {
    for (const c of group("pyEquals")) {
      expect(pyEquals(decode(c.a as Tagged), decode(c.b as Tagged)),
             `${JSON.stringify(c.a)} == ${JSON.stringify(c.b)}`).toBe(c.result as boolean);
    }
  });

  it("pyTruthy matches bool()", () => {
    for (const c of group("pyTruthy")) {
      expect(pyTruthy(decode(c.value as Tagged)), JSON.stringify(c.value)).toBe(c.result as boolean);
    }
  });

  it("pyContains matches in", () => {
    for (const c of group("pyContains")) {
      expect(pyContains(decode(c.needle as Tagged), decode(c.haystack as Tagged)),
             `${JSON.stringify(c.needle)} in ${JSON.stringify(c.haystack)}`).toBe(c.result as boolean);
    }
  });

  const strFns: Record<string, (s: string) => unknown> = {
    pyStrip, pyLstrip, pyRstrip, pySplit, pyIsAscii, pyIsLower, pyIsPrintable,
  };
  for (const [name, fn] of Object.entries(strFns)) {
    it(`${name} matches its Python counterpart`, () => {
      for (const c of group(name)) {
        expect(fn(c.s as string), `${name}(${JSON.stringify(c.s)})`).toEqual(c.result);
      }
    });
  }

  it("pyFirstWord matches s.split()[0], raising where that raises", () => {
    for (const c of group("pyFirstWord")) {
      same(c.result as Guarded<string>, () => pyFirstWord(c.s as string),
           `firstWord(${JSON.stringify(c.s)})`);
    }
  });

  it("pyPercent honours the # flag", () => {
    for (const c of group("pyPercentHashG")) {
      const args = (c.args as Tagged[]).map(decode);
      same(c.result as Guarded<string>, () => pyPercent(c.fmt as string, ...args),
           `${JSON.stringify(c.fmt)} % ${JSON.stringify(c.args)}`);
    }
  });

  it("pyTextwrapFill matches textwrap.fill()", () => {
    for (const c of group("pyTextwrapFill")) {
      const o = c.options as Record<string, unknown>;
      const got = pyTextwrapFill(c.text as string, {
        width: o.width as number | undefined,
        initialIndent: o.initial_indent as string | undefined,
        subsequentIndent: o.subsequent_indent as string | undefined,
        breakLongWords: o.break_long_words as boolean | undefined,
      });
      expect(got, `fill(${JSON.stringify(c.text)}, ${JSON.stringify(o)})`).toBe(c.result as string);
    }
  });
});

describe("hash/: parity with hashlib and base64", () => {
  /** @param s - A latin-1 string from the golden file. @returns Its bytes. */
  const bytesOf = (s: string): Uint8Array =>
    Uint8Array.from([...s].map((ch) => ch.charCodeAt(0)));
  /** @param b - A digest. @returns It as lower-case hex. */
  const hex = (b: Uint8Array): string =>
    [...b].map((n) => n.toString(16).padStart(2, "0")).join("");

  it("sha1 matches hashlib.sha1", () => {
    for (const c of golden.cases.sha1!) {
      const digest = sha1(bytesOf(c.bytes as string));
      expect(hex(digest), `sha1(${JSON.stringify(c.bytes)})`).toBe(c.hex as string);
      expect(base64(digest), `b64(sha1(${JSON.stringify(c.bytes)}))`).toBe(c.base64 as string);
    }
  });

  it("pyBytesRepr matches repr(bytes)", () => {
    for (const c of golden.cases.pyBytesRepr!) {
      const bytes = Uint8Array.from([...(c.bytes as string)].map((ch) => ch.charCodeAt(0)));
      expect(pyBytesRepr(bytes), `repr(${JSON.stringify(c.bytes)})`).toBe(c.result as string);
    }
  });

  it("base64 matches base64.b64encode", () => {
    for (const c of golden.cases.base64!) {
      expect(base64(bytesOf(c.bytes as string)), `b64(${JSON.stringify(c.bytes)})`)
        .toBe(c.result as string);
    }
  });
});
