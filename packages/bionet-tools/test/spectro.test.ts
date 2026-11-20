/**
 * What the spectrophotometer says, checked against the arithmetic it claims to be doing.
 *
 * Every figure this instrument gives is a reading times a convention, so each case here is either
 * the arithmetic done by hand, or a case where the convention should refuse to answer rather than
 * answer wrongly: a reading outside the range the instrument is linear over, a host nobody has a
 * factor for, a protein with nothing in it that absorbs at 280.
 */
import { CELLS_AT_OD1, LINEAR, PER_A260, density, moment, nucleicAcid, proteinAmount, purity, scientific, spectroRun, trust } from "@biolibs/bionet-tools";
import { proteinFacts } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const at = (shown: number, nm = 260, dilution = 1, path = 1) => ({ nm, shown, dilution, path });

describe("whether a reading can be believed", () => {
  it("takes one inside the linear range", () => {
    expect(trust(at(0.42)).ok).toBe(true);
    expect(trust(at(0.42)).says).toContain("linear");
  });

  it("refuses one above the range, and says how much to dilute", () => {
    const high = trust(at(1.84));
    expect(high.ok).toBe(false);
    expect(high.dilute).toBe(4);
    // The thing worth saying: the number still looks like a number.
    expect(high.says).toContain("lower than the truth");
    // And diluting by what it said brings it inside.
    expect(trust(at(1.84 / high.dilute!)).ok).toBe(true);
  });

  it("holds a culture to a tighter range than a clear sample, because scattering is not absorbance", () => {
    expect(trust(at(0.9, 260)).ok).toBe(true);
    expect(trust(at(0.9, 600)).ok).toBe(false);
    expect(LINEAR.scattering).toBeLessThan(LINEAR.high);
  });

  it("refuses one so low that it is mostly the instrument", () => {
    const low = trust(at(0.04));
    expect(low.ok).toBe(false);
    expect(low.dilute).toBeUndefined();
  });
});

describe("how much nucleic acid is in a tube", () => {
  it("is the reading, the dilution and the convention, and nothing else", () => {
    // 0.42 read on a ten-fold dilution is 4.2 neat; 4.2 × 50 µg/mL = 210 ng/µL.
    expect(nucleicAcid(at(0.42, 260, 10), "dsDNA").ngPerUl).toBe(210);
    expect(nucleicAcid(at(0.42, 260, 10), "dsDNA").factor).toBe(PER_A260.dsDNA);
  });

  it("counts single strands and RNA by their own conventions", () => {
    expect(nucleicAcid(at(1, 260), "ssDNA").ngPerUl).toBe(33);
    expect(nucleicAcid(at(1, 260), "RNA").ngPerUl).toBe(40);
    expect(nucleicAcid(at(1, 260), "dsDNA").ngPerUl).toBe(50);
  });

  it("corrects for a path that is not a centimetre, since a drop on a pedestal is not a cuvette", () => {
    // A tenth of the path, so a tenth of the reading for the same sample.
    expect(nucleicAcid(at(0.1, 260, 1, 0.1), "dsDNA").ngPerUl).toBe(nucleicAcid(at(1, 260, 1, 1), "dsDNA").ngPerUl);
  });
});

describe("what the ratios say is in there with it", () => {
  it("calls a clean sample clean, and says why that is weak evidence", () => {
    const clean = purity({ a260: 1.8, a280: 1.0, a230: 0.85 }, "dsDNA");
    expect(clean.byProtein).toBe(1.8);
    expect(clean.says.join(" ")).toContain("weak test");
  });

  it("catches protein or phenol at 280, and salt at 230, and puts the bad news first", () => {
    const dirty = purity({ a260: 1.0, a280: 0.8, a230: 1.2 }, "dsDNA");
    expect(dirty.byProtein).toBe(1.25);
    expect(dirty.bySalt).toBeCloseTo(0.83, 2);
    expect(dirty.says[0]).toContain("260/280");
    expect(dirty.says.join(" ")).toContain("guanidine");
  });

  it("holds RNA to 2.0 rather than 1.8", () => {
    expect(purity({ a260: 1.8, a280: 1.0 }, "RNA").says.join(" ")).toContain("under the 2");
    expect(purity({ a260: 2.0, a280: 1.0 }, "RNA").says.join(" ")).toContain("weak test");
  });

  it("answers with nothing for a wavelength nobody read", () => {
    expect(purity({ a260: 1.0 }, "dsDNA")).toMatchObject({ byProtein: null, bySalt: null, says: [] });
  });
});

describe("how dense a culture is", () => {
  it("is the reading times a factor for the host", () => {
    const grown = density(at(0.6, 600), "Escherichia coli")!;
    expect(grown.od).toBe(0.6);
    expect(grown.perMl).toBe(0.6 * 8e8);
    expect(grown.host).toBe("Escherichia coli");
  });

  it("knows the hosts this lab grows, by whatever a strain calls them", () => {
    for (const host of ["E. coli", "Escherichia coli BL21(DE3)", "Pichia pastoris GS115", "Komagataella phaffii", "Saccharomyces cerevisiae W303"]) {
      expect(density(at(1, 600), host), host).not.toBeNull();
    }
    // Yeast is far less dense than E. coli at the same reading, which is the thing a factor is for.
    expect(density(at(1, 600), "Pichia pastoris")!.perMl).toBeLessThan(density(at(1, 600), "E. coli")!.perMl);
  });

  it("says nothing rather than something wrong for a host it has no factor for", () => {
    expect(density(at(0.6, 600), "Chinese hamster ovary")).toBeNull();
  });

  it("carries the dilution through, which is how a dense culture is read at all", () => {
    expect(density(at(0.4, 600, 10), "E. coli")!.od).toBe(4);
  });
});

describe("whether it is time to induce", () => {
  it("knows the window each host is induced in", () => {
    expect(moment(0.6, "E. coli")!.ready).toBe(true);
    expect(moment(0.2, "E. coli")!.ready).toBe(false);
    expect(moment(1.5, "E. coli")!.says).toContain("past");
    // Pichia is grown far further on glycerol before the switch to methanol.
    expect(moment(0.6, "Pichia pastoris")!.ready).toBe(false);
    expect(moment(4, "Pichia pastoris")!.ready).toBe(true);
    expect(moment(4, "Pichia pastoris")!.says).toContain("methanol");
  });

  it("says nothing for a host it has no rule for", () => {
    expect(moment(0.6, "Bacillus subtilis")).toBeNull();
  });
});

describe("how much protein is in a tube", () => {
  it("is the reading, the extinction coefficient and the weight, from the sequence", () => {
    const chain = "MKWTYVLACLVALALAWEQFDDRSKC";
    const facts = proteinFacts(chain)!;
    // The coefficient is not taken on trust from the port: it is the published per-residue figures
    // — 5,500 for a tryptophan and 1,490 for a tyrosine — times the residues in this chain.
    const times = (residue: string): number => [...chain].filter((one) => one === residue).length;
    expect(facts.extinction.reduced).toBe(times("W") * 5_500 + times("Y") * 1_490);
    // And the concentration is the reading over that, times the weight, in grams per litre. Read
    // back the other way it gives the reading again, to within the three places it is kept to.
    const read = proteinAmount(at(0.5, 280), { extinction: facts.extinction.reduced, weight: facts.weight })!;
    expect(read.mgPerMl * facts.extinction.reduced / facts.weight).toBeCloseTo(0.5, 2);
  });

  it("refuses a protein with nothing in it that absorbs at 280", () => {
    // No tryptophan, no tyrosine, no cysteine: nothing absorbs there, so no reading can say how much.
    const facts = proteinFacts("MKALLAGVALAVGAMKALLAGVALAVGA")!;
    expect(facts.extinction.reduced).toBe(0);
    expect(proteinAmount(at(0.5, 280), { extinction: facts.extinction.reduced, weight: facts.weight })).toBeNull();
  });
});

describe("a number written the way a lab writes it", () => {
  it("is a lead and a power of ten", () => {
    expect(scientific(4.8e8)).toBe("4.8 × 10⁸");
    expect(scientific(5e7)).toBe("5 × 10⁷");
    expect(scientific(0.0004, 0)).toBe("4 × 10⁻⁴");
    expect(scientific(0)).toBe("0");
  });
});

describe("the factors themselves", () => {
  it("are all positive, and each host is matched by its own pattern and no other's", () => {
    for (const one of CELLS_AT_OD1) {
      expect(one.cells).toBeGreaterThan(0);
      const matches = CELLS_AT_OD1.filter((each) => each.host.test(one.name));
      expect(matches.map((each) => each.name), one.name).toEqual([one.name]);
    }
  });
});

describe("a reading that cannot be believed", () => {
  it("is recorded as what it was, and as not having worked", () => {
    // The point: the number still goes down. What does not happen is it going down as a good one.
    const lab = {
      parts: [{ checksum: "p", name: "pWren1", sequence: "ACGT".repeat(100), circular: true, length: 400, features: [], kind: "dna" }],
      items: [{ item: "t", part: "p", strain: null, amount: 20, unit: "µL", retired: false, where: null }],
      places: [], strains: [],
    } as unknown as Parameters<typeof spectroRun>[0];
    const high = spectroRun(lab, { tube: "t", sample: "dsDNA", shown: 1.84 });
    expect(high.trust.ok).toBe(false);
    expect(high.record).not.toBeNull();
    expect(high.record!["outcome"]).toBe("failed");
    expect((high.record!["settings"] as Record<string, string>)["shown"]).toBe("1.84");
    const good = spectroRun(lab, { tube: "t", sample: "dsDNA", shown: 0.42 });
    expect(good.record!["outcome"]).toBe("worked");
  });

  it("records a reading of a tube the lab has not got as nothing at all", () => {
    const lab = { parts: [], items: [], places: [], strains: [] } as unknown as Parameters<typeof spectroRun>[0];
    expect(spectroRun(lab, { tube: "no-such-tube", sample: "dsDNA", shown: 0.42 }).record).toBeNull();
  });

  it("writes every number as text, since an entry carries only whole ones", () => {
    const lab = {
      parts: [{ checksum: "p", name: "p", sequence: "ACGT", circular: false, length: 4, features: [], kind: "dna" }],
      items: [{ item: "t", part: "p", strain: null, amount: 20, unit: "µL", retired: false, where: null }],
      places: [], strains: [],
    } as unknown as Parameters<typeof spectroRun>[0];
    const settings = spectroRun(lab, { tube: "t", sample: "dsDNA", shown: 0.42, dilution: 10, path: 0.1, a280: 0.21 }).record!["settings"] as Record<string, string>;
    for (const [key, value] of Object.entries(settings)) expect(typeof value, key).toBe("string");
    expect(settings["path"]).toBe("0.1");
    expect(settings["a280"]).toBe("0.21");
  });
});
