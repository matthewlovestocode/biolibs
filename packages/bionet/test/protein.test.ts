/**
 * A lab that keeps protein as well as DNA.
 *
 * The one thing that must not happen is the two being confused, because they cannot be told apart
 * by looking: `ACGT` is a perfectly good peptide as well as a perfectly good piece of DNA. So what
 * is checked hardest is that the same letters kept as each give two different parts, and that a
 * device that has never heard of protein turns the entry away whole rather than reading those
 * letters as DNA and counting a checksum nobody else would agree with.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, foundLab, mergeLog, newItemId, nextEntry, partChecksum, type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

/** Letters that read as DNA and as protein both: alanine, cysteine, glycine, threonine. */
const BOTH = "ACGTACGTACGT";
const CASEIN = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIEK";

let ada: SigningKey;
beforeAll(async () => { ada = await generateSigningKey(); });

class Device {
  held: SignedEntry[] = [];
  constructor(readonly key: SigningKey, from: readonly SignedEntry[] = []) { this.held = [...from]; }
  async write(op: Operation): Promise<SignedEntry> {
    const entry = await nextEntry(await mergeLog(this.held), this.key, op);
    this.held.push(entry);
    return entry;
  }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

const lastOf = async (device: Device): Promise<{ status: string; reason: string | null }> => {
  const lab = await device.lab();
  const entry = lab.entries.find((one) => one.signed === device.held.at(-1))!;
  return { status: entry.status, reason: entry.reason };
};

const wren = async (): Promise<Device> => new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);

describe("a part that is protein", () => {
  it("is kept, counted by its own checksum, and says what it is made of", async () => {
    const a = await wren();
    await a.write(addPart({ name: "beta-casein", sequence: CASEIN, kind: "protein" }));
    const lab = await a.lab();
    expect(await lastOf(a)).toEqual({ status: "applied", reason: null });
    expect(lab.parts).toHaveLength(1);
    expect(lab.parts[0]).toMatchObject({ kind: "protein", name: "beta-casein", length: CASEIN.length, circular: false });
    // A protein has no strands, so no ends.
    expect(lab.parts[0]!.ends).toEqual({ left: 0, right: 0 });
    expect(lab.parts[0]!.checksum).toMatch(/^seguid=/);
  });

  it("is a different part from the same letters kept as DNA", async () => {
    const a = await wren();
    await a.write(addPart({ name: "as DNA", sequence: BOTH }));
    await a.write(addPart({ name: "as protein", sequence: BOTH, kind: "protein" }));
    const lab = await a.lab();
    expect(lab.parts).toHaveLength(2);
    const [dna, protein] = lab.parts as [typeof lab.parts[number], typeof lab.parts[number]];
    expect(dna.checksum).not.toBe(protein.checksum);
    expect(dna.kind).toBe("dna");
    expect(protein.kind).toBe("protein");
    // Their lengths agree, which is exactly why the checksums must not.
    expect(dna.length).toBe(protein.length);
  });

  it("is DNA unless it says otherwise, so everything written before this still reads the same", async () => {
    const a = await wren();
    await a.write(addPart({ name: "a gene", sequence: BOTH }));
    expect((await a.lab()).parts[0]!.kind).toBe("dna");
    // An entry written without the field at all, as an older version writes one.
    await a.write({ type: "part.add", sequence: "GGATCACAGTCTACACTG", circular: false, name: "another gene" });
    expect((await a.lab()).parts[1]!.kind).toBe("dna");
  });

  it("holds tubes of protein like anything else", async () => {
    const a = await wren();
    await a.write(addPart({ name: "beta-casein", sequence: CASEIN, kind: "protein" }));
    const checksum = (await a.lab()).parts[0]!.checksum;
    const tube = newItemId();
    await a.write(addItem({ item: tube, part: checksum, amount: 2, unit: "mg" }));
    expect((await a.lab()).items[0]).toMatchObject({ item: tube, part: checksum, amount: 2, unit: "mg" });
  });

  it.each([
    ["bases that are not amino acids", { name: "no", sequence: "MKVL!!", kind: "protein" as const }],
    ["a circle, which a protein is not", { name: "no", sequence: CASEIN, circular: true, kind: "protein" as const }],
    ["ends, which a protein has not", { name: "no", sequence: CASEIN, kind: "protein" as const, ends: { left: 4, right: 0 } }],
  ])("is refused for %s", async (_what, part) => {
    const a = await wren();
    await a.write(addPart(part));
    const { status, reason } = await lastOf(a);
    expect(status).toBe("refused");
    expect(reason).toMatch(/not a protein: a protein is written in amino acids, is not a circle and has no ends/);
    expect((await a.lab()).parts).toHaveLength(0);
  });

  it("is refused for a kind that is neither", async () => {
    const a = await wren();
    await a.write({ type: "part.add", sequence: CASEIN, circular: false, name: "no", kind: "rna" });
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "A part is made of dna or of protein." });
  });

  it("carries nothing new on an entry that is DNA, so an older device reads those as it always did", async () => {
    const a = await wren();
    await a.write(addPart({ name: "a gene", sequence: BOTH }));
    const op = a.held.at(-1)!.entry.op as Record<string, unknown>;
    expect(Object.keys(op).sort()).toEqual(["circular", "name", "sequence", "type"]);
    expect(op["kind"]).toBeUndefined();
    // And a protein says so by carrying the field, which is what an older device turns away on.
    await a.write(addPart({ name: "a protein", sequence: CASEIN, kind: "protein" }));
    expect((a.held.at(-1)!.entry.op as Record<string, unknown>)["kind"]).toBe("protein");
  });
});

describe("the checksum a part would have", () => {
  it("is the one the lab gives it, for DNA and for protein alike", async () => {
    const a = await wren();
    await a.write(addPart({ name: "both as DNA", sequence: BOTH }));
    await a.write(addPart({ name: "both as protein", sequence: BOTH, kind: "protein" }));
    const dna = (await a.lab()).parts.find((one) => one.name === "both as DNA")!;
    const peptide = (await a.lab()).parts.find((one) => one.name === "both as protein")!;
    expect(partChecksum({ sequence: BOTH })).toBe(dna.checksum);
    expect(partChecksum({ sequence: BOTH, kind: "protein" })).toBe(peptide.checksum);
    // Which is the whole point: the same letters, two parts.
    expect(dna.checksum).not.toBe(peptide.checksum);
  });

  it("reads a sequence the way an entry does: whitespace out, ends part of it", async () => {
    const a = await wren();
    await a.write(addPart({ name: "cut", sequence: "AATTCGGGGGGGGGG", ends: { left: 4, right: 0 } }));
    const cut = (await a.lab()).parts[0]!;
    expect(partChecksum({ sequence: "AATTC GGGGG\nGGGGG", ends: { left: 4, right: 0 } })).toBe(cut.checksum);
    // Blunt ends are the checksum the bases alone always gave.
    expect(partChecksum({ sequence: "AATTCGGGGGGGGGG", ends: { left: 0, right: 0 } })).toBe(partChecksum({ sequence: "AATTCGGGGGGGGGG" }));
    expect(partChecksum({ sequence: "AATTCGGGGGGGGGG" })).not.toBe(cut.checksum);
  });

  it("refuses what the lab refuses, rather than counting a checksum nobody would agree with", () => {
    // A stop is not an amino acid: there is no tube of a chain with one in the middle.
    expect(() => partChecksum({ sequence: "MKV*LIL", kind: "protein" })).toThrow();
    expect(() => partChecksum({ sequence: CASEIN, kind: "protein", circular: true })).toThrow();
    expect(() => partChecksum({ sequence: "ZZZZ" })).toThrow();
  });

  it("is refused as an entry on the same terms", async () => {
    const a = await wren();
    await a.write(addPart({ name: "has a stop", sequence: "MKV*LIL", kind: "protein" }));
    expect((await lastOf(a)).status).toBe("refused");
    expect((await a.lab()).parts).toHaveLength(0);
  });
});
