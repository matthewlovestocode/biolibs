/** Checks that the compressor's output is byte for byte what Python's `zlib.compress` produced. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deflate, deflateRaw, inflate } from "../src/index.js";

interface Case { level: number | null; raw: string | null; zlib: string; deflate: string | null }

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("zlib deflate", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./golden/zlib.json", import.meta.url), "utf8")) as { cases: Case[] };
  for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const list = cases.filter((c) => c.level === level && c.raw !== null);
    it(`matches zlib at level ${level} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const data = bytes(c.raw!);
        const got = deflate(data, level);
        // Level 0 splits its stored blocks to fit whatever output buffer the caller gave zlib, so where the
        // split falls in a stream over 64 KiB is a property of Python's buffering, not of the algorithm. Such a
        // stream is only checked for being valid.
        if (level === 0 && data.length > 0xffff) {
          if (hex(inflate(got)) !== c.raw) bad.push(`${data.length} bytes: does not decompress to itself`);
          continue;
        }
        if (hex(got) !== c.zlib) {
          let at = 0;
          const want = bytes(c.zlib);
          while (at < Math.min(got.length, want.length) && got[at] === want[at]) at++;
          bad.push(`${data.length} bytes: ${got.length} vs ${want.length}, first difference at ${at}`);
        }
        if (hex(deflateRaw(data, level)) !== c.deflate) bad.push(`${data.length} bytes: raw deflate differs`);
        if (hex(inflate(got)) !== c.raw) bad.push(`${data.length} bytes: does not decompress to itself`);
      }
      expect(bad.length, `${bad.length} of ${list.length}:\n${bad.slice(0, 40).join("\n")}`).toBe(0);
    });
  }
});
