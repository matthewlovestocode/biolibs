/**
 * Behaviour that Biopython golden data cannot express because it is TypeScript-specific:
 * the options-object form of `translate`, `get()`, and custom content providers.
 */
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { BytesData, CodonTable, MutableSeq, PartiallyDefinedSequenceData, Seq, SequenceDataAbstractBaseClass, translate, type PySlice } from "@biolibs/seq";

/** Run `f`, returning its value or the error's name and message, plus warnings. */
const attempt = (f: () => unknown) => {
  const r = captureWarnings(() => String(f()));
  return { v: r.result, e: r.error ? `${(r.error as Error).name}: ${(r.error as Error).message}` : undefined, w: r.warnings.map((x) => x.message) };
};

describe("translate: options object is equivalent to positional arguments", () => {
  const seqs = ["ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG", "ATGAAATAG", "ATGAAATGA", "GATTACA", "ATG---AAA", "TTNCTNGARRAY"];
  const tables = [undefined, 1, 2, 11, "Vertebrate Mitochondrial", 99, "Bogus"] as const;
  for (const s of seqs) {
    it(`${s.slice(0, 12)}…`, () => {
      for (const table of tables) for (const stopSymbol of [undefined, "#"]) for (const toStop of [undefined, true]) for (const cds of [undefined, true]) {
        const opts = { table, stopSymbol, toStop, cds };
        const positional = attempt(() => new Seq(s).translate(table, stopSymbol, toStop, cds));
        expect(attempt(() => new Seq(s).translate(opts))).toEqual(positional);
        expect(attempt(() => new MutableSeq(s).translate(opts))).toEqual(positional);
      }
    });
  }

  it("covers the documented examples", () => {
    const s = new Seq("ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG");
    expect(s.translate({ toStop: true }).toString()).toBe("MAIVMGR");
    expect(new Seq("ATGAAATAG").translate({ table: 11, cds: true }).toString()).toBe("MK");
    expect(new Seq("ATGAAATAG").translate({ stopSymbol: "#" }).toString()).toBe("MK#");
  });

  it("module function takes options for strings (gap defaults to none) and sequences (gap '-')", () => {
    expect(translate("ATGAAATAG", { toStop: true })).toBe("MK");
    expect(() => translate("ATG---AAA")).toThrow(CodonTable.TranslationError);
    expect(translate("ATG---AAA", { gap: "-" })).toBe("M-K");
    expect(translate(new Seq("ATG---AAA")).toString()).toBe("M-K");
    // An explicit null gap is the same as the default for strings: gap codons are invalid.
    expect(() => translate("ATG---AAA", { gap: null })).toThrow(CodonTable.TranslationError);
    expect(() => translate("ATG---AAA", undefined, undefined, undefined, undefined, null)).toThrow(CodonTable.TranslationError);
  });

  it("accepts a CodonTable object as the table", () => {
    const t = CodonTable.ambiguousGenericById.get(2)!;
    expect(new Seq("AGA").translate(t).toString()).toBe("*");
    expect(new Seq("AGA").translate({ table: t }).toString()).toBe("*");
  });
});

describe("get()", () => {
  const s = new Seq("ACGTACGT");
  it("indexes with a number like at()", () => {
    expect(s.get(0)).toBe("A");
    expect(s.get(-1)).toBe("T");
    expect(() => s.get(99)).toThrow(/index out of range/);
  });
  it("slices with a slice object like slice()", () => {
    expect(s.get({ start: 1, stop: 5 }).toString()).toBe("CGTA");
    expect(s.get({ step: -2 }).toString()).toBe(s.slice(null, null, -2).toString());
    expect(new MutableSeq("ACGT").get({ start: 2 })).toBeInstanceOf(MutableSeq);
  });
});

/** A lazily loaded provider: counts how many times content is actually requested. */
class Lazy extends SequenceDataAbstractBaseClass {
  slices = 0;
  private readonly inner: BytesData;
  constructor(text: string) {
    super();
    this.inner = new BytesData(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  }
  get length(): number { return this.inner.length; }
  getItem(i: number): number { return this.inner.getItem(i); }
  getSlice(s: PySlice) { this.slices++; return this.inner.getSlice(s); }
}

/** Returns a provider (not raw bytes) from getSlice, exercising the default toBytes() fallback. */
class Wrapping extends Lazy {
  getSlice(s: PySlice) { this.slices++; return new BytesData(Uint8Array.from(String(Array.from(super.getSlice(s) as Uint8Array, (c) => String.fromCharCode(c)).join("")), (c) => c.charCodeAt(0))); }
}

describe("custom SequenceDataAbstractBaseClass subclasses", () => {
  const text = "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG";
  for (const [name, make] of [["Lazy", () => new Lazy(text)], ["Wrapping", () => new Wrapping(text)]] as const) {
    describe(name, () => {
      it("behaves like an ordinary Seq for every operation", () => {
        const provider = make();
        const lazy = new Seq(provider);
        const plain = new Seq(text);
        const ops: [string, (s: Seq) => unknown][] = [
          ["toString", (s) => s.toString()], ["length", (s) => s.length], ["at", (s) => s.at(-3)],
          ["slice", (s) => s.slice(2, 20, 3).toString()], ["reverseComplement", (s) => s.reverseComplement().toString()],
          ["translate", (s) => s.translate().toString()], ["count", (s) => s.count("GG")], ["find", (s) => s.find("TAA")],
          ["upper", (s) => s.lower().upper().toString()], ["split", (s) => s.split("A").map(String)], ["strip", (s) => s.strip("AT").toString()],
          ["replace", (s) => s.replace("GG", "CC").toString()], ["equals", (s) => s.equals(text)], ["lt", (s) => s.lt("B")],
          ["startswith", (s) => s.startswith("ATG")], ["contains", (s) => s.contains("CCG")], ["add", (s) => s.add("AA").toString()],
          ["radd", (s) => s.radd("TT").toString()], ["mul", (s) => s.mul(2).toString()], ["defined", (s) => s.defined],
          ["ranges", (s) => s.definedRanges], ["repr", (s) => s.repr()], ["hash", (s) => typeof s.hashCode()], ["join", (s) => new Seq("-").join(s).toString()],
        ];
        for (const [label, f] of ops) expect(f(lazy), label).toEqual(f(plain));
      });

      it("is not read until content is needed", () => {
        const provider = make();
        const s = new Seq(provider);
        expect(s.length).toBe(text.length);
        expect(s.defined).toBe(true);
        expect(provider.slices).toBe(0);
        s.toString();
        expect(provider.slices).toBeGreaterThan(0);
      });

      it("combines with undefined sequences through the operator protocol", () => {
        const s = new Seq(make());
        const u = new Seq(null, 3);
        expect(s.add(u)._data).toBeInstanceOf(PartiallyDefinedSequenceData);
        expect(s.add(u).definedRanges).toEqual([[0, text.length]]);
        expect(u.add(s).definedRanges).toEqual([[3, 3 + text.length]]);
        expect(s.add(new Seq(make())).toString()).toBe(text + text);
      });
    });
  }
});

describe("Seq built from segments", () => {
  it("accepts arrays of byte values like Python bytes([..])", () => {
    expect(new Seq(new Map([[0, [65, 67]], [3, "GT"]]), 5).repr()).toBe("Seq({0: 'AC', 3: 'GT'}, length=5)");
    expect(() => new Seq(new Map([[0, [300]]]), 5)).toThrow(/Expected bytes-like objects or strings/);
  });
  it("accepts a plain object keyed by position", () => {
    expect(new Seq({ 0: "AC", 4: "GT" }, 6).definedRanges).toEqual([[0, 2], [4, 6]]);
  });
});
