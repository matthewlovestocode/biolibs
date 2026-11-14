/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here. Writing the equivalent file for
 * `@biolibs/align` by hand produced four wrong examples out of twelve, which is the reason this exists.
 */
import {
  adler32, assert, base64, BioError, captureWarnings, deflate, inflate, KeyError, PyFloat, pyBytesRepr,
  pyChr, pyClassRepr, pyContains, pyDecodeUtf8, pyEquals, pyFirstWord, pyFloat, pyFloatRepr,
  pyFormatFixed, pyFormatG, pyInt, pyIsPrintable, pyIter, pyPercent, PyRandom, pyRandom, pyRepr, pyRound,
  pyRoundTo, pySplit, pyStr, pyStrip, pySum, pyTextwrapFill, pyTruthy, PyTuple, pyTypeName, sha1, warn,
} from "@biolibs/core";
import { describe, expect, it } from "vitest";

describe("README: errors", () => {
  it("reports Python's name, Python's message, and one base class", () => {
    try {
      throw new KeyError("TGA");
    } catch (e) {
      expect((e as Error).name).toBe("KeyError");
      expect((e as Error).message).toBe("TGA");
      expect(e instanceof BioError).toBe(true);
    }
  });
});

describe("README: warnings", () => {
  it("collects a warning alongside the result", () => {
    const { result, warnings } = captureWarnings(() => {
      warn("Partial codon", "BiopythonWarning");
      return 42;
    });
    expect(result).toBe(42);
    expect(warnings).toEqual([{ category: "BiopythonWarning", message: "Partial codon" }]);
  });
});

describe("README: assert", () => {
  it("throws a BioError carrying the message", () => {
    try {
      assert(false, "must be positive");
    } catch (e) {
      expect((e as Error).name).toBe("BioError");
      expect((e as Error).message).toBe("must be positive");
    }
  });
});

describe("README: numbers", () => {
  it("parses as int() and float() do", () => {
    expect(pyInt(" 1_000 ")).toBe(1000);
    expect(pyInt("٣")).toBe(3);
    expect(() => pyInt("1.5"))
      .toThrowError("invalid literal for int() with base 10: '1.5'");
    expect(pyFloatRepr(pyFloat("1e3"))).toBe("1000.0");
    expect(pyFloatRepr(pyFloat("inf"))).toBe("inf");
  });

  it("rounds to even, from the exact decimal", () => {
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRoundTo(0.0625, 3)).toBe(0.062);
    expect(pyRoundTo(0.4165, 3)).toBe(0.416);
  });
});

describe("README: formatting", () => {
  it("formats with %g, %f and repr", () => {
    expect(pyFormatG(1234.5)).toBe("1234.5");
    expect(pyFormatG(1234.5, 3)).toBe("1.23e+03");
    expect(pyFormatG(1.0, 6, true)).toBe("1.00000");
    expect(pyFormatFixed(2.675, 2)).toBe("2.67");
    expect(pyFormatFixed(1.5, 0)).toBe("2");
    expect(pyFloatRepr(0.1)).toBe("0.1");
    expect(pyFloatRepr(1e16)).toBe("1e+16");
    expect(pyFloatRepr(1e17)).toBe("1e+17");
    expect(pySum([0.1, 0.2])).toBe(0.30000000000000004);
    expect(pyChr(65)).toBe("A");
  });
});

describe("README: pyPercent", () => {
  it("applies the format, and complains as Python does in both forms", () => {
    expect(pyPercent("%5.2f|", 1.5)).toBe(" 1.50|");
    expect(pyPercent("%-6s|%s", "ab", "cd")).toBe("ab    |cd");
    expect(pyPercent("%#g", new PyFloat(1))).toBe("1.00000");
    expect(() => pyPercent("%d", "x"))
      .toThrowError("format argument: %d requires a real number, not str");
    expect(() => pyPercent("%d", PyTuple.from(["x"])))
      .toThrowError("format argument 1: %d requires a real number, not str");
  });
});

describe("README: strings", () => {
  it("strips, splits and wraps as Python does", () => {
    expect(pyStrip("\t a \n")).toBe("a");
    expect(pySplit(" a  b ")).toEqual(["a", "b"]);
    expect(pyFirstWord("LOCUS  xyz")).toBe("LOCUS");
    expect(pyIsPrintable("a\x00b")).toBe(false);
    expect(pyTextwrapFill("the quick brown fox jumps over the lazy dog", { width: 20 }))
      .toBe("the quick brown fox\njumps over the lazy\ndog");
  });
});

describe("README: values", () => {
  it("prints, names and compares them Python's way", () => {
    expect(pyRepr(null)).toBe("None");
    expect(pyRepr([1, "a"])).toBe("[1, 'a']");
    expect(pyRepr(new Map([["k", 1]]))).toBe("{'k': 1}");
    expect(pyRepr(PyTuple.from([1]))).toBe("(1,)");
    expect(pyStr(null)).toBe("None");
    expect(pyStr(new PyFloat(1))).toBe("1.0");
    expect(pyTypeName(1)).toBe("int");
    expect(pyTypeName(1.5)).toBe("float");
    expect(pyClassRepr("a")).toBe("<class 'str'>");
    expect(pyEquals(1, true)).toBe(true);
    expect(pyEquals([], PyTuple.from([]))).toBe(false);
    expect(pyTruthy(new PyFloat(0))).toBe(false);
    expect(pyContains(3, [1, 2])).toBe(false);
    expect([...pyIter("ab")]).toEqual(["a", "b"]);
    expect([...pyIter(new Map([["a", 1]]))]).toEqual(["a"]);
  });
});

describe("README: PyRandom", () => {
  it("gives Python's stream for the same seed", () => {
    const r = new PyRandom(42);
    expect(r.random()).toBe(0.6394267984578837);
    expect(r.randint(1, 6)).toBe(1);
    expect(r.getrandbits(8)).toBe(189);
    pyRandom.seed(7);
    expect(pyRandom.random()).toBe(0.32383276483316237);
  });
});

describe("README: zlib", () => {
  it("compresses, decompresses and checksums", () => {
    const data = new TextEncoder().encode("GATTACA".repeat(20));
    const z = deflate(data);
    expect(data.length).toBe(140);
    expect(z.length).toBe(18);
    expect(inflate(z).length).toBe(140);
    expect(adler32(data)).toBe(3407882021);
  });
});

describe("README: hashes", () => {
  it("hashes and encodes", () => {
    expect(base64(sha1(new TextEncoder().encode("GATTACA")))).toBe("tp2jzeCM2e3W4yxtrrx09CMKa/8=");
    expect(base64(Uint8Array.of(77, 97, 110))).toBe("TWFu");
    // The README shows this escaped once more, because it is inside a Markdown code block.
    expect(pyBytesRepr(Uint8Array.of(65, 0, 255))).toBe("b'A\\x00\\xff'");
  });
});

describe("README: decoding", () => {
  it("raises Python's own message", () => {
    expect(() => pyDecodeUtf8(Uint8Array.of(0x41, 0xff)))
      .toThrowError("'utf-8' codec can't decode byte 0xff in position 1: invalid start byte");
  });
});
