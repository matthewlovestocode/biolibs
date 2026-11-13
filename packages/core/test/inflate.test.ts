/** Replays the DEFLATE golden cases (reference/golden/gen_zlib_cases.py): Python compresses, the port inflates. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adler32, inflate, inflateRaw } from "../src/index.js";

interface Case { level: number | null; raw: string | null; zlib: string; deflate: string | null; error?: string }

/** Bytes from the hex the generator writes. */
const bytes = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));

/** Hex for a mismatch report. */
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("zlib inflate", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./golden/zlib.json", import.meta.url), "utf8")) as { cases: Case[] };

  it(`decompresses what Python's zlib produced (${cases.filter((c) => c.raw !== null).length} cases)`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      if (c.raw === null) continue;
      const want = bytes(c.raw);
      const got = inflate(bytes(c.zlib));
      if (hex(got) !== hex(want)) bad.push(`level ${c.level}, ${want.length} bytes: got ${got.length}`);
      const rawGot = inflateRaw(bytes(c.deflate!));
      if (hex(rawGot) !== hex(want)) bad.push(`level ${c.level}, ${want.length} bytes, raw deflate: got ${rawGot.length}`);
      if (adler32(want) === 0 && want.length > 0) bad.push("adler32 of non-empty data is zero");
    }
    expect(bad.length, bad.join("\n")).toBe(0);
  });

  it("raises for data that is not a zlib stream", () => {
    for (const c of cases) {
      if (c.error === undefined) continue;
      let message = "";
      try { inflate(bytes(c.zlib)); } catch (e) { message = (e as Error).message; }
      expect(message, `expected ${c.error}`).toContain(c.error);
    }
  });

  it("checks the Adler-32 at the end of the stream", () => {
    const stream = [...bytes(cases.find((c) => c.raw !== null && c.raw.length > 20)!.zlib)];
    stream[stream.length - 1] = stream[stream.length - 1]! ^ 0xff;
    expect(() => inflate(Uint8Array.from(stream))).toThrow(/incorrect data check/);
  });
});
