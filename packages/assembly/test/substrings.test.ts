/**
 * Replays the common-substring golden cases (reference/golden/gen_substring_cases.py).
 *
 * The answers come from `pydivsufsort`, the compiled suffix-array library pydna calls, while this port finds
 * the same stretches through a prefix index. Agreeing on every one of these cases is what says the two read
 * "maximal" the same way, since nothing but the results is shared between them.
 */
import { readFileSync } from "node:fs";
import { commonSubStrings, type Match, terminalOverlap } from "@biolibs/assembly";
import { describe, expect, it } from "vitest";

type Guarded<T> = { value: T } | { exc: { type: string; msg: string } };
interface Case {
  x: string;
  y: string;
  limit: number;
  css: Guarded<Match[]>;
  terminal: Guarded<Match[]>;
}

const golden = JSON.parse(readFileSync(new URL("./golden/substrings.json", import.meta.url), "utf8")) as
  { pydna: string; cases: Case[] };

/**
 * Compare one recorded answer with the port's, whichever of the two is an error.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same(want: Guarded<Match[]>, run: () => Match[], where: string): void {
  let got: Match[] | undefined;
  let err: Error | undefined;
  try { got = run(); } catch (e) { err = e as Error; }
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}`).toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
    // The triples are compared in order: which stretch comes first is part of what pydna promises, and the
    // assembly graph is built by walking them longest first.
    expect(got?.map((m) => [...m]), where).toEqual(want.value.map((m) => [...m]));
  }
}

describe(`pydna.common_sub_strings: parity with pydna ${golden.pydna}`, () => {
  golden.cases.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.x)} / ${JSON.stringify(c.y)} limit ${c.limit}`, () => {
      same(c.css, () => commonSubStrings(c.x, c.y, c.limit), "commonSubStrings");
      // `terminal_overlap` takes the same limit here rather than its own default of 15, so that the filter is
      // what is being compared and not a second limit.
      same(c.terminal, () => terminalOverlap(c.x, c.y, c.limit), "terminalOverlap");
    });
  });

  it("defaults to pydna's own limits", () => {
    const x = "acgatgctatactgCCCCCtgtgctgtgctcta";
    const y = "tgtgctgtgctctaTTTTTtattctggctgtatc";
    // 25 for commonSubStrings: the 14-character seam is below it, so nothing is reported.
    expect(commonSubStrings(x, y)).toEqual([]);
    expect(commonSubStrings(x, y, 14)).toEqual([[19, 0, 14]]);
    // 15 for terminalOverlap, which is also above that seam.
    expect(terminalOverlap(x, y)).toEqual([]);
    expect(terminalOverlap(x, y, 14)).toEqual([[19, 0, 14]]);
  });
});
