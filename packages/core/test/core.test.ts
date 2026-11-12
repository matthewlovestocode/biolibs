import { describe, expect, it, vi } from "vitest";
import { BioError, IndexError, KeyError, ValueError, assert, captureWarnings, setWarningHandler, warn } from "@biolibs/core";

describe("errors", () => {
  it("form a hierarchy under BioError and keep their names", () => {
    for (const [E, name] of [[ValueError, "ValueError"], [IndexError, "IndexError"], [KeyError, "KeyError"], [BioError, "BioError"]] as const) {
      const e = new E("boom");
      expect(e).toBeInstanceOf(BioError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(name);
      expect(e.message).toBe("boom");
    }
  });
});

describe("assert", () => {
  it("passes silently for truthy conditions", () => expect(() => assert(1 + 1 === 2, "math")).not.toThrow());
  it("throws BioError with the message otherwise", () => {
    expect(() => assert(false, "nope")).toThrow(BioError);
    expect(() => assert(0, "nope")).toThrow("nope");
  });
});

describe("warnings", () => {
  it("print through console.warn by default", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("careful");
    warn("again", "CustomWarning");
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["BiopythonWarning: careful", "CustomWarning: again"]);
    spy.mockRestore();
  });

  it("setWarningHandler swaps the handler and returns the previous one", () => {
    const seen: string[] = [];
    const prev = setWarningHandler((w) => seen.push(w.message));
    warn("one");
    const mine = setWarningHandler(prev);
    warn("two", "X"); // goes to the restored default handler, not `seen`
    expect(seen).toEqual(["one"]);
    expect(typeof mine).toBe("function");
  });

  it("captureWarnings collects warnings and the result", () => {
    const r = captureWarnings(() => { warn("a"); warn("b", "Cat"); return 42; });
    expect(r.result).toBe(42);
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([{ category: "BiopythonWarning", message: "a" }, { category: "Cat", message: "b" }]);
  });

  it("captureWarnings reports a thrown error and still restores the handler", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = captureWarnings(() => { warn("before"); throw new ValueError("bad"); });
    expect(r.error).toBeInstanceOf(ValueError);
    expect(r.warnings.map((w) => w.message)).toEqual(["before"]);
    warn("after"); // handler restored => reaches console.warn
    expect(spy).toHaveBeenCalledWith("BiopythonWarning: after");
    spy.mockRestore();
  });
});
