/**
 * The Python-style error classes.
 *
 * All thirteen exist so a port can raise what Biopython raises, and nine of them had no direct test —
 * they were covered only by whichever port happened to raise one. Two things matter about each and
 * neither is implied by the other: the `name`, because that is what a parity case compares against
 * Python's exception type, and descending from `BioError`, because that is what lets a caller catch any
 * biolibs input problem with one check.
 */
import {
  AssertionError, AttributeError, BioError, IndexError, KeyError, MemoryError, NotImplementedError,
  OverflowError, PySystemError, RuntimeError, UnboundLocalError, ValueError, ZeroDivisionError,
} from "@biolibs/core";
import { describe, expect, it } from "vitest";

/** Each class with the Python name it has to report. */
const CLASSES: Array<[new (m: string) => BioError, string]> = [
  [BioError, "BioError"],
  [ValueError, "ValueError"],
  [IndexError, "IndexError"],
  [KeyError, "KeyError"],
  [AttributeError, "AttributeError"],
  [OverflowError, "OverflowError"],
  [RuntimeError, "RuntimeError"],
  [AssertionError, "AssertionError"],
  [NotImplementedError, "NotImplementedError"],
  [ZeroDivisionError, "ZeroDivisionError"],
  [PySystemError, "SystemError"],
  [UnboundLocalError, "UnboundLocalError"],
  [MemoryError, "MemoryError"],
];

describe("Python-style errors", () => {
  for (const [Cls, name] of CLASSES) {
    it(`${name} reports its Python name and is a BioError`, () => {
      const e = new Cls("something went wrong");
      expect(e.name, "name is what a parity case compares").toBe(name);
      expect(e.message).toBe("something went wrong");
      expect(e, "one instanceof check should catch any of them").toBeInstanceOf(BioError);
      expect(e, "and they are still real Errors").toBeInstanceOf(Error);
    });
  }

  it("keeps an empty message empty", () => {
    // A bare `assert` in Python carries no message, and the ports reproduce that, so an empty string
    // must survive rather than being replaced by a class name.
    expect(new AssertionError("").message).toBe("");
    expect(new AssertionError("").name).toBe("AssertionError");
  });

  it("PySystemError is named SystemError", () => {
    // The class is prefixed because `SystemError` is not a JavaScript builtin to collide with, but the
    // *name* has to be Python's or every parity case comparing it fails.
    expect(new PySystemError("x").name).toBe("SystemError");
  });

  it("can be caught by subclass or by base", () => {
    const thrower = (): never => { throw new KeyError("TGA"); };
    expect(thrower).toThrowError(KeyError);
    expect(thrower).toThrowError(BioError);
    // A KeyError's message is the key itself, which is how Biopython's reads.
    try { thrower(); } catch (e) { expect((e as Error).message).toBe("TGA"); }
  });

  it("each class is distinct from the others", () => {
    expect(new ValueError("x")).not.toBeInstanceOf(IndexError);
    expect(new IndexError("x")).not.toBeInstanceOf(ValueError);
    expect(new NotImplementedError("x")).not.toBeInstanceOf(RuntimeError);
  });
});
