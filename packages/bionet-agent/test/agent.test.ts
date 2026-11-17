/**
 * An adviser at work in a lab, and the door it comes in by.
 *
 * The lab here is a real one, held in memory: the demo's plasmid, its backbone and a thermocycler.
 * The adviser is taken through what it is for — read the lab, design primers, work out the PCR,
 * propose it — and then through everything it should not be able to do, by its own tools and by
 * the door. The door is checked as something a stranger on the same machine will try.
 */
import { agentTools, answerAgent, newAgentToken, serveAgent, AGENT_INSTRUCTIONS, MOST_BASES, PROTOCOL_VERSIONS, type AgentCall, type AgentTool } from "@biolibs/bionet-agent";
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
import { demoMolecules } from "@biolibs/bionet-demo";
import { describe, expect, it } from "vitest";

interface Wren { lab: Lab; tools: AgentTool[]; calls: AgentCall[]; tubes: { pGene: string; backbone: string }; cycler: string; use: (name: string, args?: Record<string, unknown>) => Promise<any> }

/** A lab with the demo's plasmid and backbone in tubes and a thermocycler, hosting an adviser. */
async function wren(letIn: "adviser" | "member" | null = "adviser"): Promise<Wren> {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
  await lab.setPerson("Ada");
  await lab.found({ name: "The Wren Lab" });
  const molecules = demoMolecules();
  const room = await lab.addPlace({ kind: "room", name: "Main lab" });
  const bench = await lab.addPlace({ kind: "bench", name: "The bench", parent: room });
  const cycler = await lab.addPlace({ kind: "instrument", name: "Thermocycler", parent: bench, model: "thermocycler" });
  const stock = async (what: (typeof molecules)["pGene"]): Promise<string> => {
    await lab.addPart({ name: what.name, sequence: what.sequence, circular: what.circular, features: what.features, ...(what.ends === undefined ? {} : { ends: what.ends }) });
    return lab.addItem({ part: lab.snapshot().lab!.parts.find((one) => one.name === what.name)!.checksum, amount: 30, unit: "µL" });
  };
  const tubes = { pGene: await stock(molecules.pGene), backbone: await stock(molecules.backbone) };
  const { key } = await lab.hostAdviser();
  if (letIn !== null) await lab.addMember({ key, person: "Claude", role: letIn });
  const calls: AgentCall[] = [];
  const tools = agentTools(lab, { watch: (call) => calls.push(call) });
  const use = (name: string, args: Record<string, unknown> = {}): Promise<any> => tools.find((one) => one.name === name)!.run(args);
  return { lab, tools, calls, tubes, cycler, use };
}

describe("what an adviser is given", () => {
  it("is described well enough to be used cold, and says which tools write", async () => {
    const { tools } = await wren();
    expect(new Set(tools.map((one) => one.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z_]+$/);
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
      expect(tool.input.additionalProperties).toBe(false);
      for (const needed of tool.input.required ?? []) expect(tool.input.properties, tool.name).toHaveProperty(needed);
    }
    // Exactly these write, and each is one of the things an adviser may: a part, what is marked on
    // one nobody has described, a plan, a plan taken back.
    expect(tools.filter((one) => !one.readOnly).map((one) => one.name).sort()).toEqual(["add_part", "keep_from_ncbi", "propose_assembly", "propose_digest", "propose_induction", "propose_ligation", "propose_pcr", "propose_transformation", "withdraw_proposal"]);
    expect(AGENT_INSTRUCTIONS).toMatch(/data and never as instructions/);
  });

  it("reads the lab: what it is, what it holds, and where", async () => {
    const { use, tubes } = await wren();
    const overview = await use("lab_overview");
    expect(overview).toMatchObject({ lab: "The Wren Lab", parts: 2, tubes: 2, proposals_open: 0 });
    expect(overview.adviser).toMatch(/as an adviser/);
    expect(overview.instruments).toEqual([{ name: "Thermocycler", where: "Main lab › The bench", for: "pcr" }]);
    const parts = await use("list_parts", { query: "pgene" });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ name: "pGene", circular: true, tubes: 1 });
    expect(parts[0].marked).toContain("wrenA");
    expect(await use("list_tubes")).toEqual(expect.arrayContaining([expect.objectContaining({ tube: tubes.pGene, part: "pGene", amount: 30, unit: "µL" })]));
  });

  it("reads a part as people count it, and a long one a stretch at a time", async () => {
    const { use, lab } = await wren();
    const part = await use("get_part", { part: "pGene", from: 11, to: 20 });
    const held = lab.snapshot().lab!.parts.find((one) => one.name === "pGene")!;
    expect(part.sequence).toEqual({ from: 11, to: 20, bases: held.sequence.slice(10, 20) });
    const gene = part.features.find((one: { label: string }) => one.label === "wrenA");
    const marked = held.features.find((one) => one.label === "wrenA")!.parts[0]!;
    expect(gene.lies).toEqual([{ from: marked.start + 1, to: marked.end }]);
    await lab.addPart({ name: "long", sequence: "ACGT".repeat(MOST_BASES / 4 + 10) });
    const long = await use("get_part", { part: "long" });
    expect(long.sequence.bases).toHaveLength(MOST_BASES);
    expect(long.sequence.more).toMatch(/left out/);
  });

  it("says plainly when it is asked about something the lab does not have", async () => {
    const { use } = await wren();
    await expect(use("get_part", { part: "pNothing" })).rejects.toThrow(/has no part with the checksum or name "pNothing"/);
    await expect(use("work_out_ligation", { tubes: ["nosuch"] })).rejects.toThrow(/has no tube with the ID "nosuch"/);
    await expect(use("work_out_digest", { of: "pGene", enzymes: ["NotAnEnzyme"] })).rejects.toThrow(/No enzyme is known by the name NotAnEnzyme/);
  });
});

describe("an adviser working something out and proposing it", () => {
  it("designs primers for a gene, keeps them, works out the PCR and proposes it, without anything being used", async () => {
    const { use, lab, tubes, cycler, calls } = await wren();
    const design = await use("design_primers", { part: "pGene", feature: "wrenA" });
    expect(design.forward.sequence).toMatch(/^[ACGT]{18,30}$/);
    expect(design.reverse.lengths_considered.length).toBeGreaterThan(3);
    expect(design.forward.why.length).toBeGreaterThan(10);

    // Kept as parts: known sequences, with nothing in the freezer.
    const forward = await use("add_part", { name: "wrenA-F", sequence: design.forward.sequence });
    const reverse = await use("add_part", { name: "wrenA-R", sequence: design.reverse.sequence });
    expect(forward.tubes).toMatch(/^None/);

    const worked = await use("work_out_pcr", { template: tubes.pGene, forward: forward.checksum, reverse: reverse.checksum });
    expect(worked.problem).toBeNull();
    expect(worked.products).toHaveLength(1);
    expect(worked.products[0].length).toBe(design.product_length);

    const answer = await use("propose_pcr", { template: tubes.pGene, forward: "wrenA-F", reverse: "wrenA-R", note: "To check the gene is where the map says before cutting it out." });
    expect(answer.proposed).toMatchObject({ kind: "pcr", proposed_by: "Claude", state: "open", at: "Main lab › The bench › Thermocycler" });
    expect(answer.proposed.uses.map((one: { as: string; no_tube_yet?: boolean }) => [one.as, one.no_tube_yet === true])).toEqual([["template", false], ["forward primer", true], ["reverse primer", true]]);

    expect(answer.proposed.expects[0].length).toBe(design.product_length);

    const seen = lab.snapshot().lab!;
    expect(seen.plans).toHaveLength(1);
    expect(seen.plans[0]).toMatchObject({ by: lab.snapshot().hosting!.key, instrument: cycler, settled: null });
    expect(seen.runs).toHaveLength(0);
    expect(seen.items.map((one) => one.amount)).toEqual([30, 30]);
    // Every entry it wrote is its own, and is one of the kinds an adviser may write.
    const theirs = seen.entries.filter((one) => one.author === lab.snapshot().hosting!.key);
    expect(theirs.map((one) => one.op.type)).toEqual(["part.add", "part.add", "plan.add"]);
    expect(theirs.every((one) => one.status === "applied" && one.signer === "Claude")).toBe(true);

    // A window was told of each use, and where in the lab it would be seen.
    expect(calls.map((one) => [one.tool, one.ok])).toEqual([["design_primers", true], ["add_part", true], ["add_part", true], ["work_out_pcr", true], ["propose_pcr", true]]);
    expect(calls[0]!.shows).toMatchObject({ at: "primers" });
    expect(calls.at(-1)!.shows).toEqual({ at: "pcr", start: { view: "result", template: tubes.pGene } });

    expect((await use("list_proposals", { open_only: true }))).toHaveLength(1);
    await use("withdraw_proposal", { proposal: answer.proposed.plan });
    expect(await use("list_proposals", { open_only: true })).toHaveLength(0);
    expect((await use("list_proposals"))[0].state).toBe("set aside");
  });

  it("cuts the gene out, proposes keeping it, and proposes the ligation a person's run makes possible", async () => {
    const { use, lab, tubes } = await wren();
    const cut = await use("work_out_digest", { of: tubes.pGene, enzymes: ["EcoRI", "BamHI"] });
    expect(cut.pieces.map((one: { length: number }) => one.length).sort()).toEqual([786, 926]);
    const gene = cut.pieces.find((one: { length: number }) => one.length === 786);
    expect([gene.left_end.made_by, gene.right_end.made_by].sort()).toEqual(["BamHI", "EcoRI"]);

    await expect(use("propose_digest", { tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"], keep: [gene.starts_at + 1], note: "x" })).rejects.toThrow(/does not start where any piece/);
    const proposed = await use("propose_digest", { tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"], keep: [gene.starts_at], note: "To get the gene out for the backbone." });
    // The piece as a molecule: its 786 paired bases and the four that overhang.
    expect(proposed.proposed.expects).toEqual([expect.objectContaining({ name: "pGene EcoRI+BamHI 786 bp", length: 790, circular: false })]);
    expect(proposed.proposed.settings).toMatchObject({ enzymes: "EcoRI+BamHI" });

    // A person does it. The adviser cannot; it can see that it was done, and go on from there.
    const { digestRun, withPlan } = await import("@biolibs/bionet-tools");
    const seen = lab.snapshot().lab!;
    const run = digestRun(seen, { tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"], keep: [{ from: gene.starts_at }] });
    const done = await lab.recordRun(withPlan(seen, run.matched!) as Parameters<Lab["recordRun"]>[0]);
    expect((await use("list_proposals"))[0]).toMatchObject({ state: "carried out", run: done.run });

    const made = await use("work_out_ligation", { tubes: [tubes.backbone, done.items[0]] });
    expect(made.products[0]).toMatchObject({ circular: true, length: 3492 });
    const joined = await use("propose_ligation", { tubes: [tubes.backbone, done.items[0]], product_name: "pWren1", note: "The gene into the backbone." });
    expect(joined.proposed.expects[0]).toMatchObject({ name: "pWren1", length: 3492, circular: true });
  });

  it("says a piece has no tube only when the lab really has none of it", async () => {
    const { use, tubes } = await wren();
    const design = await use("design_primers", { part: "pGene", feature: "wrenA" });
    await use("add_part", { name: "wrenA-F", sequence: design.forward.sequence });
    await use("add_part", { name: "wrenA-R", sequence: design.reverse.sequence });
    // The template is named by its part, not its tube, and the lab has a tube of it all the same.
    const answer = await use("propose_pcr", { template: "pGene", forward: "wrenA-F", reverse: "wrenA-R", note: "naming the template by its part" });
    expect(answer.proposed.uses[0]).toMatchObject({ name: "pGene", as: "template" });
    expect(answer.proposed.uses[0]).not.toHaveProperty("no_tube_yet");
    // The primers were only designed, so there is nothing in the freezer to use.
    expect(answer.proposed.uses[1]).toHaveProperty("no_tube_yet", true);
    expect(tubes.pGene).toBeDefined();
  });

  it("will not propose a PCR that does not make exactly one thing", async () => {
    const { use, tubes, lab } = await wren();
    await lab.addPart({ name: "stray", sequence: "ACGTACGTACGTACGTACGT" });
    await expect(use("propose_pcr", { template: tubes.pGene, forward: "stray", reverse: "stray", note: "x" })).rejects.toThrow(/would not make exactly one product/);
    expect(lab.snapshot().lab!.plans).toHaveLength(0);
  });
});

describe("an adviser and what the lab keeps alive", () => {
  it("reads the strains, their cultures and what each carries", async () => {
    const { use, lab, tubes } = await wren();
    const construct = lab.snapshot().lab!.parts.find((one) => one.name === "pGene")!.checksum;
    const host = await lab.addStrain({ name: "W303", host: "Saccharomyces cerevisiae W303" });
    const made = await lab.addStrain({ name: "W303 pGene-1", host: "Saccharomyces cerevisiae W303", carries: [construct], parent: host });
    const culture = await lab.addItem({ strain: made, amount: 50, unit: "mL" });

    const strains = await use("list_strains");
    expect(strains).toHaveLength(2);
    expect(strains[1]).toMatchObject({ name: "W303 pGene-1", host: "Saccharomyces cerevisiae W303", made_from: "W303", made_by_run: null });
    expect(strains[1].carries).toEqual([{ name: "pGene", checksum: construct }]);
    expect(strains[1].cultures[0]).toMatchObject({ tube: culture, part: "W303 pGene-1", a_culture_of: made, amount: 50, unit: "mL" });
    // A culture is in the list of tubes too, said as what it is.
    expect((await use("list_tubes")).find((one: { tube: string }) => one.tube === culture)).toMatchObject({ part: "W303 pGene-1" });
    // And it is not a molecule to work on.
    await expect(use("work_out_digest", { of: culture, enzymes: ["EcoRI"] })).rejects.toThrow(/is a culture of a strain, not a tube of a molecule/);
    expect(tubes.pGene).toBeDefined();
  });

  it("proposes putting a construct into a host, and uses nothing doing it", async () => {
    const { use, lab, tubes } = await wren();
    const host = await lab.addStrain({ name: "W303", host: "Saccharomyces cerevisiae W303" });
    const culture = await lab.addItem({ strain: host, amount: 50, unit: "mL" });

    const answer = await use("propose_transformation", { construct: tubes.pGene, host: culture, note: "Into W303, select on uracil. The gene is checked first by PCR." });
    expect(answer.proposed).toMatchObject({ kind: "transformation", proposed_by: "Claude", state: "open", expects: [] });
    expect(answer.proposed.uses.map((one: { as: string }) => one.as)).toEqual(["construct", "host"]);
    const seen = lab.snapshot().lab!;
    expect(seen.items.map((one) => one.amount)).toEqual([30, 30, 50]);
    expect(seen.runs).toHaveLength(0);
    expect(seen.strains).toHaveLength(1);
  });

  it("will not call a tube of DNA a host", async () => {
    const { use, tubes } = await wren();
    await expect(use("propose_transformation", { construct: tubes.pGene, host: tubes.backbone, note: "x" })).rejects.toThrow(/not a culture. list_strains gives the cultures/);
  });
});

describe("an adviser rewriting a gene for a host", () => {
  /** A host whose genes are written in whichever codon the demo's plasmid does not use much. */
  const withHost = async (): Promise<{ w: Wren; host: string[]; gene: string }> => {
    const w = await wren();
    const { CodonTable } = await import("@biolibs/seq");
    const forward = new Map<string, string>(CodonTable.unambiguousDnaById.get(1)!.forwardTable as unknown as Iterable<[string, string]>);
    const family = (aminoAcid: string): string[] => [...forward].filter(([, one]) => one === aminoAcid).map(([codon]) => codon);
    const protein = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIEK";
    const geneOf = (pick: (one: string[]) => string): string => [...protein].map((one) => pick(family(one))).join("");
    await w.lab.addPart({ name: "CSN2 cds", sequence: geneOf((one) => one[0]!) });
    const host: string[] = [];
    for (let at = 0; at < 6; at++) {
      await w.lab.addPart({ name: `host gene ${at + 1}`, sequence: `${geneOf((one) => one.at(-1)!)}${"ACG".repeat(at + 1)}` });
      host.push(`host gene ${at + 1}`);
    }
    return { w, host, gene: "CSN2 cds" };
  };

  it("counts a host's preferences from the lab's own genes, and says so", async () => {
    const { w, host } = await withHost();
    const counted = await w.use("count_codon_usage", { genes: host });
    expect(counted.genes).toBe(6);
    expect(counted.codons).toBeGreaterThan(200);
    expect(counted.counted_from).toEqual(host);
    expect(counted.note).toMatch(/not a published table/);
    // Every amino acid's codons are listed with a share, commonest first.
    const leucine = counted.favourite_per_amino_acid["L"];
    expect(leucine[0].share).toBeGreaterThanOrEqual(leucine.at(-1).share);
    await expect(w.use("count_codon_usage", { genes: [] })).rejects.toThrow(/There is no table built in/);
  });

  it("rewrites the gene without changing the protein, and shows what it counted", async () => {
    const { w, host, gene } = await withHost();
    const done = await w.use("optimise_codons", { gene, host_genes: host, avoid: [{ name: "EcoRI", site: "GAATTC" }] });
    const { translate } = await import("@biolibs/seq");
    const before = w.lab.snapshot().lab!.parts.find((one) => one.name === gene)!.sequence;
    expect(done.sequence).toHaveLength(before.length);
    expect(String(translate(done.sequence))).toBe(String(translate(before)));
    expect(done.protein).toBe(String(translate(before)));
    expect(done.changed + done.unchanged).toBe(done.codons);
    expect(done.changed).toBeGreaterThan(10);
    expect(done.sequence).not.toContain("GAATTC");
    expect(done.kept_out).toEqual(["EcoRI"]);
    expect(done.counted_from).toEqual(host);
    // The working says where the preferences came from and does not claim more.
    const table = done.working.find((one: { of: string }) => one.of === "the host's preferences");
    expect(table.kind).toBe("estimate");
    expect(table.rests).toMatch(/Nothing here is a published table/);
    expect(table.steps.some((one: string) => one.includes("host gene 1"))).toBe(true);
    // It writes nothing: keeping the result is add_part, deliberately.
    expect(w.lab.snapshot().lab!.parts.some((one) => one.sequence === done.sequence)).toBe(false);
  });

  it("refuses a gene that is not whole codons rather than guessing", async () => {
    const { w, host } = await withHost();
    await w.lab.addPart({ name: "ragged", sequence: "ATGAAAG" });
    await expect(w.use("optimise_codons", { gene: "ragged", host_genes: host })).rejects.toThrow(/not a whole number of codons/);
  });
});

describe("an adviser and protein", () => {
  const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";
  const MATURE = "AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTA";
  const withGene = async (): Promise<Wren> => {
    const w = await wren();
    await w.lab.addPart({ name: "CSN2 gene", sequence: `${SIGNAL}${MATURE}TAA`, features: [
      { type: "CDS", label: "casein", strand: 1, parts: [{ start: 0, end: SIGNAL.length + MATURE.length + 3 }] },
      { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: 0, end: SIGNAL.length }] },
    ] });
    return w;
  };

  it("reads a gene as its protein, and says what the sequence tells you about it", async () => {
    const w = await withGene();
    const made = await w.use("translate_gene", { gene: "CSN2 gene", cds: "casein" });
    const { translate } = await import("@biolibs/seq");
    expect(made.protein).toBe(String(translate(`${SIGNAL}${MATURE}`)));
    expect(made.amino_acids).toBe(26);
    expect(made.ends_in_a_stop).toBe(true);
    expect(made.read_from).toEqual({ bases: `1-${SIGNAL.length + MATURE.length + 3}`, strand: "top" });
    expect(made.known.weight_daltons).toBeGreaterThan(2_000);
    expect(made.known.isoelectric_point).toBeGreaterThan(0);
    expect(made.working.find((one: { of: string }) => one.of === "what is known of it").rests).toMatch(/not what anybody has measured/);
    // Reading it changes nothing: keeping it is a separate, deliberate act.
    expect(w.lab.snapshot().lab!.parts.some((one) => one.kind === "protein")).toBe(false);
  });

  it("takes off the signal peptide when asked, which is what the cell lets out", async () => {
    const w = await withGene();
    const whole = await w.use("translate_gene", { gene: "CSN2 gene", cds: "casein" });
    const mature = await w.use("translate_gene", { gene: "CSN2 gene", cds: "casein", cut_signal: true });
    expect(mature.signal_peptide_cut).toMatchObject({ label: "signal", amino_acids: 13 });
    expect(mature.protein).toBe(whole.protein.slice(13));
    expect(mature.amino_acids).toBe(13);
  });

  it("keeps a protein as a part of its own, told apart from the same letters as DNA", async () => {
    const w = await withGene();
    const made = await w.use("translate_gene", { gene: "CSN2 gene", cds: "casein", cut_signal: true });
    const kept = await w.use("add_part", { name: "mature casein", sequence: made.protein, kind: "protein" });
    expect(kept.checksum).toMatch(/^seguid=/);
    const seen = w.lab.snapshot().lab!;
    const protein = seen.parts.find((one) => one.name === "mature casein")!;
    expect(protein.kind).toBe("protein");
    // The same letters as DNA would be a different part, which is the point of saying which it is.
    const both = await w.use("add_part", { name: "as DNA", sequence: "ACGTACGTACGT" });
    const asProtein = await w.use("add_part", { name: "as protein", sequence: "ACGTACGTACGT", kind: "protein" });
    expect(both.checksum).not.toBe(asProtein.checksum);
    // And a protein is not something the DNA tools will offer to cut or copy.
    await expect(w.use("work_out_digest", { of: protein.checksum, enzymes: ["EcoRI"] })).rejects.toThrow();
    await expect(w.use("translate_gene", { gene: "mature casein" })).rejects.toThrow(/is already a protein/);
  });

  it("says what is wrong with a gene rather than handing back a protein that looks fine", async () => {
    const w = await wren();
    await w.lab.addPart({ name: "broken", sequence: `${SIGNAL}TAA${MATURE}` });
    const made = await w.use("translate_gene", { gene: "broken" });
    expect(made.warnings.some((one: string) => /stop at amino acid 14, before the end/.test(one))).toBe(true);
    expect(made.ends_in_a_stop).toBe(false);
  });

  it("lists what each part is made of", async () => {
    const w = await withGene();
    const made = await w.use("translate_gene", { gene: "CSN2 gene", cds: "casein" });
    await w.use("add_part", { name: "casein", sequence: made.protein, kind: "protein" });
    const parts = await w.use("list_parts");
    expect(parts.find((one: { name: string }) => one.name === "casein").kind).toBe("protein");
    expect(parts.find((one: { name: string }) => one.name === "CSN2 gene").kind).toBe("dna");
  });
});

describe("what an adviser cannot do", () => {
  it("has no tool that uses, moves, retires or records anything", async () => {
    const { tools } = await wren();
    expect(tools.map((one) => one.name).filter((name) => /record|adjust|retire|move|put|use_|recount|roster|member|offer|publish|add_strain|add_culture/.test(name))).toEqual([]);
  });

  it("can read and work things out, but propose nothing, until a keeper lets it in", async () => {
    const { use, lab, tubes, calls } = await wren(null);
    expect((await use("lab_overview")).adviser).toMatch(/Not in the lab yet/);
    expect((await use("work_out_digest", { of: tubes.pGene, enzymes: ["EcoRI"] })).pieces).toHaveLength(1);
    await expect(use("add_part", { name: "p", sequence: "ACGTACGTACGTACGTACGT" })).rejects.toThrow(/A keeper has to let it in first/);
    await expect(use("propose_digest", { tube: tubes.pGene, enzymes: ["EcoRI"], note: "x" })).rejects.toThrow(/A keeper has to let it in first/);
    expect(lab.snapshot().lab!.entries.some((one) => one.author === lab.snapshot().hosting!.key)).toBe(false);
    expect(calls.at(-1)).toMatchObject({ tool: "propose_digest", ok: false });
  });

  it("writes nothing with its key if a keeper has made that key more than an adviser", async () => {
    const { use, lab, tubes } = await wren("member");
    expect((await use("lab_overview")).adviser).toMatch(/not an adviser/);
    await expect(use("propose_digest", { tube: tubes.pGene, enzymes: ["EcoRI"], note: "x" })).rejects.toThrow(/not as an adviser/);
    expect(lab.snapshot().lab!.plans).toHaveLength(0);
  });
});

describe("the door", () => {
  const rpc = (id: number, method: string, params?: unknown): Record<string, unknown> => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
  const open = async (): Promise<{ w: Wren; token: string; url: string; port: number; close: () => Promise<void>; post: (body: unknown, headers?: Record<string, string>) => Promise<Response> }> => {
    const w = await wren();
    const token = newAgentToken();
    const server = await serveAgent({ tools: w.tools, token });
    const post = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
      fetch(server.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    return { w, token, post, ...server };
  };

  it("speaks the protocol: says who it is, lists the tools, and calls one", async () => {
    const { post, close, w } = await open();
    try {
      const hello = await (await post(rpc(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } }))).json();
      expect(hello.result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "bionet-adviser" } });
      expect(hello.result.instructions).toBe(AGENT_INSTRUCTIONS);
      // A version it has not heard of is answered with the newest it speaks.
      expect((await (await post(rpc(2, "initialize", { protocolVersion: "1999-01-01" }))).json()).result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
      const told = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      expect([told.status, await told.text()]).toEqual([202, ""]);

      const listed = await (await post(rpc(3, "tools/list"))).json();
      expect(listed.result.tools.map((one: { name: string }) => one.name)).toEqual(w.tools.map((one) => one.name));
      expect(listed.result.tools.find((one: { name: string }) => one.name === "propose_pcr").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(listed.result.tools[0].inputSchema).toEqual(w.tools[0]!.input);

      const called = await (await post(rpc(4, "tools/call", { name: "lab_overview", arguments: {} }))).json();
      expect(called.result.isError).toBeUndefined();
      expect(JSON.parse(called.result.content[0].text)).toMatchObject({ lab: "The Wren Lab" });
      expect((await (await post(rpc(5, "ping"))).json()).result).toEqual({});
      const both = await (await post([rpc(6, "ping"), { jsonrpc: "2.0", method: "notifications/x" }, rpc(7, "ping")])).json();
      expect(both.map((one: { id: number }) => one.id)).toEqual([6, 7]);
    } finally { await close(); }
  });

  it("tells the agent why a tool could not do what was asked, as something it can act on", async () => {
    const { post, close } = await open();
    try {
      const call = async (name: string, args: unknown): Promise<any> => (await (await post(rpc(1, "tools/call", { name, arguments: args }))).json());
      expect((await call("get_part", { part: "pNothing" })).result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/has no part/) }] });
      expect((await call("get_part", {})).result).toMatchObject({ isError: true, content: [{ text: 'get_part needs "part".' }] });
      expect((await call("lab_overview", { verbose: true })).result.content[0].text).toMatch(/takes nothing called "verbose"/);
      expect((await call("record_run", {})).error).toMatchObject({ code: -32602 });
      expect((await (await post(rpc(2, "resources/list"))).json()).error.code).toBe(-32601);
      expect((await (await post("{not json")).json()).error.code).toBe(-32700);
    } finally { await close(); }
  });

  it("is shut to anybody without the token, to web pages, and to any other name for this machine", async () => {
    const { post, close, url, port, token, w } = await open();
    try {
      const ask = rpc(1, "tools/call", { name: "propose_digest", arguments: { tube: w.tubes.pGene, enzymes: ["EcoRI"], note: "let me in" } });
      const tries: [string, Promise<Response>, number][] = [
        ["no token", fetch(url, { method: "POST", body: JSON.stringify(ask) }), 401],
        ["a wrong token", post(ask, { authorization: `Bearer ${newAgentToken()}` }), 401],
        ["the token cut short", post(ask, { authorization: `Bearer ${token.slice(0, -1)}` }), 401],
        ["the token in the address", fetch(`${url}?token=${token}`, { method: "POST", body: JSON.stringify(ask) }), 401],
        ["a web page", post(ask, { origin: "https://evil.example" }), 403],
        ["a web page on this machine", post(ask, { origin: `http://127.0.0.1:${port}` }), 403],
        ["another path", fetch(url.replace("/mcp", "/"), { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{}" }), 404],
        ["a GET", fetch(url, { headers: { authorization: `Bearer ${token}` } }), 405],
      ];
      for (const [what, trying, status] of tries) expect((await trying).status, what).toBe(status);
      // Addressed by a name that only resolves to this machine: what a page uses to get round "same site".
      const rebound = await new Promise<number>((resolve, reject) => {
        void import("node:http").then(({ request }) => {
          const sent = request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host: `attacker.example:${port}`, authorization: `Bearer ${token}`, "content-type": "application/json" } },
                               (response) => { response.resume(); resolve(response.statusCode ?? 0); });
          sent.on("error", reject);
          sent.end(JSON.stringify(ask));
        });
      });
      expect(rebound).toBe(403);
      // None of it got through.
      expect(w.lab.snapshot().lab!.plans).toHaveLength(0);
      expect(w.calls).toHaveLength(0);
      expect(new URL(url).hostname).toBe("127.0.0.1");
    } finally { await close(); }
  });

  it("refuses a token too short to keep anybody out, and a request too big to be one", async () => {
    const { tools } = await wren();
    await expect(serveAgent({ tools, token: "short" })).rejects.toThrow(/too short/);
    const { post, close } = await open();
    try { expect((await post(JSON.stringify(rpc(1, "ping", { pad: "x".repeat(2_100_000) })))).status).toBe(413); } finally { await close(); }
  });

  it("answers a message that is not a request without falling over", async () => {
    const { tools } = await wren();
    for (const odd of [null, 7, "hello", {}, { jsonrpc: "1.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1 }]) {
      expect(await answerAgent(odd, tools, { name: "t", version: "0" })).toMatchObject({ error: { code: -32600 } });
    }
  });
});

describe("an adviser growing a culture to make the protein", () => {
  const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";
  const MATURE = ("AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTT"
                + "CCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTA").repeat(3);
  const CDS = `${SIGNAL}${MATURE}TAA`;

  /** A lab that has got as far as a strain carrying the gene, with a flask of it growing. */
  const withStrain = async (): Promise<{ w: Wren; culture: string; gene: string }> => {
    const w = await wren();
    await w.lab.addPlace({ kind: "instrument", name: "Shaking incubator", parent: w.lab.snapshot().lab!.places[1]!.place, model: "shaking-incubator" });
    await w.lab.addPart({ name: "pWren casein", sequence: CDS, features: [
      { type: "CDS", label: "casein", strand: 1, parts: [{ start: 0, end: CDS.length }] },
      { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: 0, end: SIGNAL.length }] },
    ] });
    const gene = w.lab.snapshot().lab!.parts.find((one) => one.name === "pWren casein")!.checksum;
    const strain = await w.lab.addStrain({ name: "W303 pWren-1", host: "Saccharomyces cerevisiae W303", carries: [gene] });
    const culture = await w.lab.addItem({ strain, amount: 8, unit: "mL" });
    return { w, culture, gene };
  };

  it("works out the protein and the mass to look for, and says it predicts no yield", async () => {
    const { w, culture } = await withStrain();
    const said = await w.use("work_out_induction", { culture, gene: "pWren casein", cds: "casein" });
    expect(said.strain).toBe("W303 pWren-1");
    expect(said.amino_acids).toBe(CDS.length / 3 - 1);
    expect(said.kilodaltons).toBeGreaterThan(10);
    expect(said.kilodaltons).toBeLessThan(100);
    expect(said.gel).toMatch(/12% acrylamide/);
    expect(said.band_runs).toMatch(/of the way down/);
    expect(said.marker_bands).toContain(25);
    expect(said.note).toMatch(/No yield is predicted/);
    // It is shown at the gene, and nothing is written.
    expect(w.calls.at(-1)).toMatchObject({ tool: "work_out_induction", ok: true, shows: { at: "sequences" } });
    expect(w.lab.snapshot().lab!.runs).toHaveLength(0);
  });

  it("weighs what the cell lets out when the signal peptide is cut", async () => {
    const { w, culture } = await withStrain();
    const whole = await w.use("work_out_induction", { culture, gene: "pWren casein", cds: "casein" });
    const mature = await w.use("work_out_induction", { culture, gene: "pWren casein", cds: "casein", cut_signal: true });
    expect(mature.signal_peptide_cut).toMatchObject({ label: "signal", amino_acids: SIGNAL.length / 3 });
    expect(mature.kilodaltons).toBeLessThan(whole.kilodaltons);
    expect(mature.checksum_it_would_have).not.toBe(whole.checksum_it_would_have);
  });

  it("says when the gel chosen could not answer the question", async () => {
    const { w, culture } = await withStrain();
    const said = await w.use("work_out_induction", { culture, gene: "pWren casein", cds: "casein", gel: "7.5" });
    expect(said.checks.some((one: { weight: string; says: string }) => one.weight === "stop" && /smaller than 7.5%/.test(one.says))).toBe(true);
  });

  it("proposes it, expecting no molecule, and naming the protein by the checksum it would have", async () => {
    const { w, culture } = await withStrain();
    const worked = await w.use("work_out_induction", { culture, gene: "pWren casein", cds: "casein" });
    const answer = await w.use("propose_induction", {
      culture, gene: "pWren casein", cds: "casein", inducer: "galactose", concentration: "2%", celsius: 25, hours: 16,
      note: "Run an uninduced lane of the same flask beside it: the protein is the band in one and not the other.",
    });
    expect(answer.proposed).toMatchObject({ kind: "induction", proposed_by: "Claude", state: "open", expects: [] });
    expect(answer.proposed.at).toMatch(/Shaking incubator/);
    expect(answer.proposed.uses.map((one: { as: string }) => one.as)).toEqual(["culture"]);
    expect(answer.proposed.settings).toMatchObject({ made: worked.checksum_it_would_have, inducer: "galactose", at: "2%", celsius: 25, hours: 16 });
    expect(answer.proposed.settings.expected_kda).toBe(worked.kilodaltons.toFixed(1));
    // Nothing was used and nothing was made: a proposal is only a proposal.
    const seen = w.lab.snapshot().lab!;
    expect(seen.items.find((one) => one.item === culture)!.amount).toBe(8);
    expect(seen.runs).toHaveLength(0);
    expect(seen.parts.some((one) => one.kind === "protein")).toBe(false);
    expect(w.calls.at(-1)).toMatchObject({ tool: "propose_induction", ok: true, shows: { at: "induction" } });
  });

  it("will not induce a tube of DNA, or a gene the strain does not carry", async () => {
    const { w, culture } = await withStrain();
    await expect(w.use("work_out_induction", { culture: w.tubes.pGene, gene: "pWren casein" }))
      .rejects.toThrow(/not a culture. Expression is something cells do/);
    await expect(w.use("work_out_induction", { culture, gene: "pGene" })).rejects.toThrow(/does not carry that part/);
  });

  it("is among the tools, and is one of the ones that write", async () => {
    const { tools } = await wren();
    expect(tools.find((one) => one.name === "work_out_induction")!.readOnly).toBe(true);
    expect(tools.find((one) => one.name === "propose_induction")!.readOnly).toBe(false);
  });
});
