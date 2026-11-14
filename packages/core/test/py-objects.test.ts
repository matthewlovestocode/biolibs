/**
 * The parts of `py/` that have no direct Python counterpart to record: the types the ports pass around.
 *
 * `PyTuple` and `PyFloat` exist because JavaScript cannot tell a tuple from a list, or `1.0` from `1`,
 * and the ports need both distinctions to reproduce Python's output. `pyIter` and `registerPythonClasses`
 * are helpers the ports call rather than things Python does, so they are asserted here rather than
 * measured in `pycompat.test.ts`.
 */
import {
  PyFloat, pyClassRepr, pyIter, pyRepr, pyStr, PyTuple, pyTypeName, registerPythonClasses,
} from "@biolibs/core";
import { describe, expect, it } from "vitest";

describe("PyTuple", () => {
  it("prints as Python prints a tuple, trailing comma included", () => {
    expect(pyRepr(PyTuple.from([]))).toBe("()");
    // Python writes a one-element tuple as `(1,)` so it cannot be read as a parenthesised number.
    expect(pyRepr(PyTuple.from([1]))).toBe("(1,)");
    expect(pyRepr(PyTuple.from([1, 2]))).toBe("(1, 2)");
    expect(pyRepr(PyTuple.from(["a", null]))).toBe("('a', None)");
  });

  it("nests inside lists and dicts", () => {
    expect(pyRepr([PyTuple.from([1, 2])])).toBe("[(1, 2)]");
    expect(pyRepr(new Map([["k", PyTuple.from([1])]]))).toBe("{'k': (1,)}");
  });

  it("is still an array, which is why the type checks have to come first", () => {
    const t = PyTuple.from([1, 2]);
    expect(Array.isArray(t)).toBe(true);
    expect(pyTypeName(t)).toBe("tuple");
    expect(pyClassRepr(t)).toBe("<class 'tuple'>");
  });
});

describe("PyFloat", () => {
  it("prints a whole number the way Python prints a float", () => {
    expect(pyRepr(new PyFloat(1))).toBe("1.0");
    expect(pyStr(new PyFloat(1))).toBe("1.0");
    expect(pyRepr(new PyFloat(1.5))).toBe("1.5");
    expect(pyRepr(new PyFloat(-0))).toBe("-0.0");
  });

  it("carries its value for arithmetic", () => {
    expect(new PyFloat(2.5).value).toBe(2.5);
  });
});

describe("pyIter", () => {
  it("iterates the things Python iterates", () => {
    expect([...pyIter("ab")]).toEqual(["a", "b"]);
    expect([...pyIter([1, 2])]).toEqual([1, 2]);
    expect([...pyIter(Uint8Array.of(1, 2))]).toEqual([1, 2]);
    // A dict iterates its keys, as Python's does.
    expect([...pyIter(new Map([["a", 1], ["b", 2]]))]).toEqual(["a", "b"]);
    expect([...pyIter(new Set([1, 2]))]).toEqual([1, 2]);
  });

  it("refuses what Python refuses, with Python's wording", () => {
    expect(() => [...pyIter(5)]).toThrowError("'int' object is not iterable");
    expect(() => [...pyIter(null)]).toThrowError("'NoneType' object is not iterable");
    expect(() => [...pyIter(1.5)]).toThrowError("'float' object is not iterable");
  });
});

describe("registerPythonClasses", () => {
  it("teaches pyClassRepr which module a class belongs to", () => {
    class Seq { }
    // Before registering, there is no module to name.
    expect(pyClassRepr(new Seq())).toBe("<class 'Seq'>");
    registerPythonClasses("Bio.Seq", ["Seq"]);
    expect(pyClassRepr(new Seq())).toBe("<class 'Bio.Seq.Seq'>");
  });
});

describe("pyStr and pyTypeName on objects", () => {
  it("prefers an object's own toString for str()", () => {
    const thing = { toString: () => "I am a thing", repr: () => "Thing()" };
    expect(pyStr(thing)).toBe("I am a thing");
    // repr() takes the repr() method instead.
    expect(pyRepr(thing)).toBe("Thing()");
  });

  it("names a plain object by its constructor", () => {
    class Clade { }
    expect(pyTypeName(new Clade())).toBe("Clade");
  });

  it("treats a plain object as a dict when it has no repr", () => {
    expect(pyRepr({ a: 1 })).toBe("{'a': 1}");
    expect(pyTypeName(new Map())).toBe("dict");
  });
});
