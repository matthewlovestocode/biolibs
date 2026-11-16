/**
 * A digest looked at closely.
 *
 * The cut positions come from the restriction engine, and the pieces' lengths from the gel engine.
 * What is checked here is that the close-up agrees with both: every cut has the enzyme's own bases
 * behind it, and the pieces worked out from the cuts are the pieces the gel is drawn from.
 */
import { COMMON_ENZYMES, cutSites, cutsOf, digestChecks, digestPieces, digestRun, migrationWorking, piecesWorking, planDigest, siteWorking } from "@biolibs/bionet-tools";
import { gelById } from "@biolibs/gel";
import { describe, expect, it } from "vitest";

const A = (many: number): string => "A".repeat(many);
const sites = (sequence: string, circular: boolean, name: string) => cutSites({ sequence, circular }, cutsOf({ sequence, circular }, name)!);

describe("a cut, in its bases", () => {
  it("finds a 5′ overhang: EcoRI, G^AATTC", () => {
    const [site] = sites(`${A(10)}GAATTC${A(10)}`, false, "EcoRI");
    expect(site).toMatchObject({ at: 11, bottom: 15, site: { start: 10, end: 16 }, backwards: false, overhang: "5′", bases: "AATT" });
    expect(site!.around.top.slice(...site!.around.site)).toBe("GAATTC");
    expect(site!.around.bottom.slice(...site!.around.site)).toBe("CTTAAG");
    expect([site!.around.cutTop, site!.around.cutBottom]).toEqual([site!.around.site[0] + 1, site!.around.site[0] + 5]);
  });

  it("finds a 3′ overhang: KpnI, GGTAC^C", () => {
    expect(sites(`${A(10)}GGTACC${A(10)}`, false, "KpnI")[0]).toMatchObject({ at: 15, bottom: 11, overhang: "3′", bases: "GTAC" });
  });

  it("finds a blunt cut: EcoRV, GAT^ATC", () => {
    expect(sites(`${A(10)}GATATC${A(10)}`, false, "EcoRV")[0]).toMatchObject({ at: 13, bottom: 13, overhang: "blunt", bases: "" });
  });

  it("finds an enzyme that cuts outside its site, whichever strand the site reads along", () => {
    const forwards = sites(`${A(10)}GGTCTC${"CATGACTGAC"}${A(10)}`, false, "BsaI")[0]!;
    expect(forwards).toMatchObject({ at: 17, bottom: 21, backwards: false, overhang: "5′", bases: "ATGA", site: { start: 10, end: 16 } });
    const backwards = sites(`${A(10)}${"CATGACTGAC"}GAGACC${A(10)}`, false, "BsaI")[0]!;
    expect(backwards).toMatchObject({ at: 15, bottom: 19, backwards: true, overhang: "5′", bases: "CTGA", site: { start: 20, end: 26 } });
  });

  it("finds a site that lies across a circle's origin", () => {
    const [site] = sites(`TTC${A(20)}GAA`, true, "EcoRI");
    expect(site).toMatchObject({ at: 24, site: { start: 23, end: 29 } });
    expect(site!.around.top.slice(...site!.around.site)).toBe("GAATTC");
  });

  it("explains every cut the engine finds, and the pieces agree with the gel's", () => {
    let seed = 5;
    const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let cuts = 0;
    for (let trial = 0; trial < 6; trial++) {
      const sequence = Array.from({ length: 3000 }, () => "ACGT"[Math.floor(next() * 4)]).join("");
      for (const circular of [true, false]) for (const name of COMMON_ENZYMES) {
        const cutter = cutsOf({ sequence, circular }, name)!;
        const found = cutSites({ sequence, circular }, cutter);
        expect(found.map((one) => one.at)).toEqual(cutter.positions);
        cuts += found.length;
        const plan = planDigest({ sequence, circular }, [name]);
        if (plan.problem === null) expect(digestPieces({ sequence, circular }, found).map((piece) => piece.length)).toEqual(plan.fragments);
      }
    }
    expect(cuts).toBeGreaterThan(200);
  });

  it("is said in steps", () => {
    const working = siteWorking(sites(`${A(10)}GAATTC${A(10)}`, false, "EcoRI")[0]!);
    expect(working).toMatchObject({ of: "EcoRI at base 11", comes: "a 4-base 5′ overhang, AATT", kind: "exact" });
    expect(working.steps[0]).toBe("EcoRI recognises GAATTC. Those bases are at 11 to 16.");
    expect(working.steps[1]).toBe("It cuts the top strand after base 11 and the bottom strand after base 15.");
  });
});

describe("the pieces", () => {
  const sequence = `${A(10)}GAATTC${A(20)}GGATCC${A(10)}`;
  const features = [{ type: "CDS", label: "gene", strand: 1 as const, parts: [{ start: 20, end: 30 }] }, { type: "misc_feature", label: "over", strand: 0 as const, parts: [{ start: 5, end: 14 }] }];
  const all = (circular: boolean) => [...sites(sequence, circular, "EcoRI"), ...sites(sequence, circular, "BamHI")];

  it("of a line: what made each end, and the molecule's own ends", () => {
    const pieces = digestPieces({ sequence, circular: false, features }, all(false));
    expect(pieces.map((piece) => [piece.from, piece.to, piece.length])).toEqual([[11, 37, 26], [37, 52, 15], [0, 11, 11]]);
    expect(pieces[0]!.left).toEqual({ enzyme: "EcoRI", overhang: "5′", bases: "AATT" });
    expect(pieces[0]!.right).toEqual({ enzyme: "BamHI", overhang: "5′", bases: "GATC" });
    expect(pieces[2]!.left).toEqual({ enzyme: null, overhang: "end", bases: "" });
  });

  it("carry what is marked on them, and say when something was cut through", () => {
    const pieces = digestPieces({ sequence, circular: false, features }, all(false));
    expect(pieces[0]!.features.map((one) => [one.label, one.parts[0]])).toEqual([["gene", { start: 9, end: 19 }], ["over (part)", { start: 0, end: 3 }]]);
    expect(pieces[2]!.features.map((one) => one.label)).toEqual(["over (part)"]);
  });

  it("of a circle: one runs through the origin", () => {
    const pieces = digestPieces({ sequence, circular: true, features }, all(true));
    expect(pieces.map((piece) => [piece.from, piece.to, piece.length])).toEqual([[11, 37, 26], [37, 11, 26]]);
    // What lies before the origin, then what lies after it.
    expect(pieces[1]!.features.map((one) => [one.label, one.parts[0]])).toEqual([["over (part)", { start: 20, end: 26 }]]);
  });

  it("of a circle cut once: one piece, the whole length", () => {
    const pieces = digestPieces({ sequence, circular: true }, sites(sequence, true, "EcoRI"));
    expect(pieces.map((piece) => piece.length)).toEqual([52]);
    expect(pieces[0]!.left.enzyme).toBe("EcoRI");
  });

  it("are worked out as differences that add up, and compared with the gel's", () => {
    const working = piecesWorking({ length: 52, circular: true }, all(true), planDigest({ sequence, circular: true }, ["EcoRI", "BamHI"]));
    expect(working.comes).toBe("26, 26 bp");
    expect(working.steps).toEqual([
      "The cuts, in order along the molecule: after base 11, 37.",
      "From 11 to 37: 37 − 11 = 26.",
      "From 37 through the origin to 11: 52 − 37 + 11 = 26.",
      "They add up to the whole molecule: 26 + 26 = 52.",
      "The gel engine, working the pieces out its own way, gives the same lengths.",
    ]);
    expect(piecesWorking({ length: 52, circular: false }, all(false)).steps[1]).toBe("From the start to 11: 11 − 0 = 11.");
    expect(piecesWorking({ length: 52, circular: true }, all(true), { fragments: [40, 12] }).steps.at(-1)).toMatch(/does not agree/);
  });
});

describe("a piece as a molecule of its own", () => {
  const sequence = `${A(10)}GAATTC${A(8)}GGTACC${A(8)}GATATC${A(10)}`;
  const all = [...sites(sequence, false, "EcoRI"), ...sites(sequence, false, "KpnI"), ...sites(sequence, false, "EcoRV")];
  const pieces = digestPieces({ sequence, circular: false }, all).sort((a, b) => a.from - b.from);

  it("has every base either strand has, and says how many at each end are unpaired", () => {
    // Start to EcoRI: the bottom strand runs on four bases past the top strand's cut.
    expect(pieces[0]).toMatchObject({ sequence: `${A(10)}GAATT`, ends: { left: 0, right: 4 }, length: 11 });
    // EcoRI to KpnI: a 5′ overhang at one end and a 3′ overhang at the other.
    expect(pieces[1]).toMatchObject({ sequence: `AATTC${A(8)}GGTAC`, ends: { left: 4, right: -4 }, length: 18 });
    // KpnI to EcoRV: the bottom strand starts four bases before the top strand's cut; the other end is blunt.
    expect(pieces[2]).toMatchObject({ sequence: `GTACC${A(8)}GAT`, ends: { left: -4, right: 0 }, length: 12 });
    expect(pieces[3]).toMatchObject({ sequence: `ATC${A(10)}`, ends: { left: 0, right: 0 } });
  });

  it("places what it carries on its own sequence", () => {
    const marked = digestPieces({ sequence, circular: false, features: [{ type: "CDS", label: "g", strand: 1, parts: [{ start: 30, end: 36 }] }] }, all).find((piece) => piece.from === 29)!;
    // The piece's sequence starts four bases before the top strand's cut, so the feature moves along by four.
    expect(marked.features[0]!.parts).toEqual([{ start: 5, end: 11 }]);
    expect(marked.sequence.slice(5, 11)).toBe(sequence.slice(30, 36));
  });

  it("opens a circle cut once into its whole length with both of the cut's ends", () => {
    const ring = `${A(10)}GAATTC${A(10)}`;
    const [only] = digestPieces({ sequence: ring, circular: true }, sites(ring, true, "EcoRI"));
    expect(only).toMatchObject({ length: 26, ends: { left: 4, right: 4 }, sequence: `AATTC${A(20)}GAATT` });
  });

  it("is what a digest asks the lab to keep, by where it starts", () => {
    const lab = { parts: [{ checksum: "p", name: "p", sequence, length: sequence.length, circular: false, features: [], ends: { left: 0, right: 0 } }],
                  items: [{ item: "1", part: "p", amount: 10, unit: "µL", retired: false }], places: [] };
    const run = digestRun(lab as never, { tube: "1", enzymes: ["EcoRI", "KpnI"], keep: [{ from: 11, amount: 15 }, { from: 999 }] });
    const matched = run.matched as { outputs: Record<string, unknown>[]; settings: Record<string, unknown>; outcome: string };
    expect(matched.outputs).toEqual([{ sequence: `AATTC${A(8)}GGTAC`, circular: false, ends: { left: 4, right: -4 }, features: [], amount: 15, unit: "µL", name: "p EcoRI+KpnI 18 bp" }]);
    expect(matched.settings).toMatchObject({ kept: 1 });
    // A gel that did not match gives nothing to keep.
    expect((run.differed as { outputs: unknown[] }).outputs).toEqual([]);
    expect((digestRun(lab as never, { tube: "1", enzymes: ["EcoRI"] }).matched as { outputs: unknown[] }).outputs).toEqual([]);
  });
});

describe("how far a piece runs", () => {
  it("is the rule the gel is drawn by, and says it is an estimate", () => {
    const working = migrationWorking(1581, gelById("1.0"));
    expect(working.kind).toBe("estimate");
    expect(working.comes).toBe("50% of the way down");
    expect(working.steps[2]).toMatch(/\(4 − 3\.2\) ÷ \(4 − 2\.4\) = 0\.5 of the way/);
    expect(working.rests).toMatch(/ladder/);
  });

  it("says when a piece is outside what the gel separates", () => {
    expect(migrationWorking(100, gelById("1.0")).steps[2]).toMatch(/shorter than this gel separates/);
    expect(migrationWorking(20000, gelById("1.0")).steps[2]).toMatch(/longer than this gel separates/);
  });
});

describe("what a careful operator would ask of a digest", () => {
  const gel = gelById("1.0");
  const bandsFor = (sizes: number[]) => {
    // The same bands the tool would draw: made by cutting a line into exactly these pieces.
    const sequence = sizes.slice(0, -1).map((size) => `${A(size - 6)}GAATTC`).join("") + A(sizes.at(-1)! + 5);
    return planDigest({ sequence, circular: false }, ["EcoRI"]).bands;
  };
  const check = (fragments: number[], cutters = [{ name: "EcoRI", site: "GAATTC", positions: [1] }], circular = true) =>
    digestChecks({ length: 5000, circular }, { cutters, fragments, bands: bandsFor(fragments) }, gel);

  it("has nothing to say of a digest that will read well", () => {
    expect(check([3000, 2000], [{ name: "EcoRI", site: "GAATTC", positions: [1, 2] }])).toEqual([]);
  });

  it("stops at pieces too close to tell apart, with how close", () => {
    const said = check([2001, 2000, 999]);
    expect(said[0]!.weight).toBe("stop");
    expect(said[0]!.says).toMatch(/too close in size to tell apart/);
  });

  it("stops at a piece the gel will not hold, and looks at one it will not spread", () => {
    expect(check([4800, 200]).find((one) => one.weight === "stop")!.because).toBe("200 < 250 bp");
    expect(digestChecks({ length: 30000, circular: false }, { cutters: [], fragments: [20000, 10000], bands: [] }, gel)[0]!.because).toBe("20,000 > 10,000 bp");
  });

  it("looks at one cut of a circle, an enzyme that does nothing, and DpnI", () => {
    expect(check([5000]).map((one) => one.because)).toContain("1 cut, 1 piece");
    expect(check([3000, 2000], [{ name: "EcoRI", site: "GAATTC", positions: [1, 2] }, { name: "NotI", site: "GCGGCCGC", positions: [] }])[0]!.says).toMatch(/NotI does not cut this/);
    expect(check([3000, 2000], [{ name: "DpnI", site: "GATC", positions: [1, 2] }])[0]!.says).toMatch(/methylated/);
  });
});

describe("what the power supply was set to", () => {
  it("is kept with the run", () => {
    const sequence = `${A(300)}GAATTC${A(400)}GAATTC${A(300)}`;
    const lab = { parts: [{ checksum: "p", name: "p", sequence, length: sequence.length, circular: true, features: [] }], items: [{ item: "1", part: "p", amount: 10, unit: "µL", retired: false }], places: [] };
    const run = digestRun(lab as never, { tube: "1", enzymes: ["EcoRI"], volts: 110, minutes: 40 });
    expect((run.matched as { settings: Record<string, unknown> }).settings).toMatchObject({ enzymes: "EcoRI", volts: 110, minutes: 40 });
    expect((digestRun(lab as never, { tube: "1", enzymes: ["EcoRI"] }).matched as { settings: Record<string, unknown> }).settings).not.toHaveProperty("volts");
  });
});
