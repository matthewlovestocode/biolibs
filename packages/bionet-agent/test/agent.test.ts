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
import * as europepmc from "@biolibs/europepmc";
import * as uniprot from "@biolibs/uniprot";
import { afterEach, describe, expect, it } from "vitest";

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
    expect(tools.filter((one) => !one.readOnly).map((one) => one.name).sort()).toEqual(["add_part", "file_the_work", "keep_from_ncbi", "propose_assembly", "propose_digest", "propose_induction", "propose_ligation", "propose_pcr", "propose_transformation", "withdraw_proposal"]);
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

describe("an adviser reading the literature", () => {
  /** A paper, with the shapes that make a real one awkward to read. */
  const JATS = `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front><journal-meta><journal-title-group><journal-title>Biomolecules</journal-title></journal-title-group></journal-meta>
  <article-meta>
    <title-group><article-title>Casein in <italic>Pichia pastoris</italic></article-title></title-group>
    <contrib-group><contrib contrib-type="author"><name><surname>Hopper</surname><given-names>Grace</given-names></name></contrib></contrib-group>
    <pub-date><year>2024</year></pub-date>
    <permissions><license><license-p>Under <ext-link xlink:href="https://creativecommons.org/licenses/by/4.0/">CC BY</ext-link>.</license-p></license></permissions>
    <abstract><p>We expressed CSN2 and got a band.</p></abstract>
    <kwd-group><kwd>casein</kwd></kwd-group>
  </article-meta></front>
  <body>
    <sec><title>1. Introduction</title><p>Cheese is old [<xref ref-type="bibr" rid="b1">1</xref>].</p></sec>
    <sec><title>2. Materials and Methods</title>
      <sec><title>2.1. Induction</title><p>Induced with 1% methanol at 28 °C for 48 h.</p></sec>
    </sec>
    <sec><title>3. Results</title><p>We saw 24 kDa.</p>
      <table-wrap id="t1"><label>Table 1</label><caption><p>Yields.</p></caption>
        <table><thead><tr><th>Strain</th><th>Yield</th></tr></thead><tbody><tr><td>GS115</td><td>0.6 mg/L</td></tr></tbody></table>
      </table-wrap>
      <fig id="f1"><label>Figure 1</label><caption><p>A gel.</p></caption></fig>
    </sec>
  </body>
</article>`;

  const answered = (reply: (url: string) => string): { asked: string[] } => {
    const asked: string[] = [];
    europepmc.settings.transport = async (url: string) => { asked.push(url); return { contentType: "application/json", body: reply(url) }; };
    return { asked };
  };
  const searchReply = (results: Record<string, unknown>[]): string =>
    JSON.stringify({ hitCount: results.length, resultList: { result: results } });
  const paper = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "40723902", source: "MED", pmid: "40723902", pmcid: "PMC12292773", doi: "10.3390/x",
    title: "Casein in yeast.", authorString: "Hopper G.", journalTitle: "Biomolecules", pubYear: "2024",
    citedByCount: 4, isOpenAccess: "Y", inEPMC: "Y", hasSuppl: "Y", hasReferences: "Y", ...over,
  });

  afterEach(() => { europepmc.settings.transport = europepmc.fetchTransport; europepmc.settings.email = null; });

  it("is among the tools, and none of the three writes", async () => {
    const { tools } = await wren();
    const literature = tools.filter((one) => ["search_papers", "read_paper", "papers_around"].includes(one.name));
    expect(literature.map((one) => one.name)).toEqual(["search_papers", "read_paper", "papers_around"]);
    expect(literature.every((one) => one.readOnly)).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/Europe PMC/);
  });

  it("searches, and sends nothing but what it was asked to search for", async () => {
    const w = await wren();
    const { asked } = answered(() => searchReply([paper({ abstractText: "We expressed CSN2." })]));
    const said = await w.use("search_papers", { query: '"kappa-casein" AND "Pichia pastoris"', corpus: "open-access", abstracts: true });
    expect(said.results[0]).toMatchObject({
      id: "40723902", source: "MED", pmcid: "PMC12292773", title: "Casein in yeast",
      journal: "Biomolecules", year: 2024, cited_by: 4, can_read_in_full: true,
      has_supplementary_data: true, abstract: "We expressed CSN2.",
      look_at: "https://europepmc.org/article/MED/40723902",
    });
    expect(said.from_outside).toMatch(/has been checked by this lab/);
    // Only the query went, and it went narrowed to open access as it was asked to be.
    expect(new URL(asked[0]!).searchParams.get("query")).toBe('("kappa-casein" AND "Pichia pastoris") AND OPEN_ACCESS:Y');
    expect(new URL(asked[0]!).searchParams.get("email")).toBeNull();
    // Nothing of the lab's is anywhere in what was sent.
    const lab = w.lab.snapshot().lab!;
    for (const part of lab.parts) expect(asked[0]!).not.toContain(part.sequence.slice(0, 20));
    expect(w.lab.snapshot().lab!.runs).toHaveLength(0);
  });

  it("will not let a sequence be pasted into a query", async () => {
    const w = await wren();
    answered(() => searchReply([]));
    await expect(w.use("search_papers", { query: "A".repeat(401) })).rejects.toThrow(/at most 400 characters/);
  });

  it("says when nothing matched, and what to try instead", async () => {
    const w = await wren();
    answered(() => searchReply([]));
    const said = await w.use("search_papers", { query: '"a phrase nobody wrote"' });
    expect(said).toMatchObject({ matched: 0, results: [] });
    expect(said.note).toMatch(/a phrase has to appear exactly as written/i);
  });

  it("reads a paper's methods, which is where the recipe is", async () => {
    const w = await wren();
    const { asked } = answered(() => JATS);
    const said = await w.use("read_paper", { pmcid: "PMC12292773", section: "methods" });
    expect(said).toMatchObject({ pmcid: "PMC12292773", title: "Casein in Pichia pastoris", journal: "Biomolecules", year: 2024,
                                 licence: "https://creativecommons.org/licenses/by/4.0/", section: "methods" });
    expect(said.parts.map((one: { heading: string }) => one.heading)).toEqual(["2. Materials and Methods", "2.1. Induction"]);
    expect(said.parts[1].text).toBe("Induced with 1% methanol at 28 °C for 48 h.");
    expect(said.from_outside).toMatch(/not something this lab has seen/);
    expect(asked[0]).toBe("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12292773/fullTextXML");
  });

  it("gives the abstract and the headings when no section is asked for", async () => {
    const w = await wren();
    answered(() => JATS);
    const said = await w.use("read_paper", { pmcid: "PMC12292773" });
    expect(said.abstract).toBe("We expressed CSN2 and got a band.");
    expect(said.keywords).toEqual(["casein"]);
    // The headings come back as a list, not run together into a sentence: a review has forty.
    expect(said.what_else.sections).toEqual([
      { heading: "1. Introduction", under: 0, characters: 14 },
      { heading: "2. Materials and Methods", under: 0, characters: 0 },
      { heading: "2.1. Induction", under: 1, characters: 43 },
      { heading: "3. Results", under: 0, characters: 14 },
    ]);
    expect(said.what_else.tables).toBe(1);
    expect(said.what_else.ask_for).toContain("methods");
  });

  it("gives the tables as rows, since a yield is as often in one as in a sentence", async () => {
    const w = await wren();
    answered(() => JATS);
    const said = await w.use("read_paper", { pmcid: "PMC12292773", section: "tables" });
    expect(said.tables).toEqual([{ label: "Table 1", caption: "Yields.", headings: ["Strain", "Yield"], rows: [["GS115", "0.6 mg/L"]] }]);
  });

  it("says what a paper has rather than nothing, when the section asked for is not in it", async () => {
    const w = await wren();
    answered(() => JATS);
    const said = await w.use("read_paper", { pmcid: "PMC12292773", section: "supplementary note" });
    expect(said.found_nothing).toMatch(/no section matching/);
    expect(said.what_else.sections.map((one: { heading: string }) => one.heading)).toContain("3. Results");
  });

  it("says when a heading only contained the word, rather than passing a guess off as the section", async () => {
    const w = await wren();
    // This paper has no methods section; one heading merely has the word in it.
    answered(() => JATS.replace("<title>2. Materials and Methods</title>", "<title>2. Notes on our methods of counting</title>"));
    const said = await w.use("read_paper", { pmcid: "PMC12292773", section: "methods" });
    expect(said.parts[0].heading).toBe("2. Notes on our methods of counting");
    expect(said.not_an_exact_match).toMatch(/merely contain the word/);
    // And where it is the section, nothing casts doubt on it.
    answered(() => JATS);
    expect((await w.use("read_paper", { pmcid: "PMC12292773", section: "methods" })).not_an_exact_match).toBeUndefined();
  });

  it("says plainly that a paper which is not open cannot be read here", async () => {
    const w = await wren();
    europepmc.settings.transport = async (url: string) => { throw new europepmc.EuropePmcError("Europe PMC answered 404.", url, 404); };
    await expect(w.use("read_paper", { pmcid: "PMC1" })).rejects.toThrow(/Only open-access papers can be read in full/);
    await expect(w.use("read_paper", { pmcid: "40723902" })).rejects.toThrow(/not a PubMed Central ID/);
  });

  it("walks back to the paper that has the method, and forward to who repeated it", async () => {
    const w = await wren();
    const { asked } = answered((url) => url.includes("/references")
      ? JSON.stringify({ hitCount: 52, referenceList: { reference: [{ id: "3286696", source: "MED", title: "Cloning bovine kappa-casein.", authorString: "Kang Y.", pubYear: 1988 }] } })
      : JSON.stringify({ hitCount: 1, citationList: { citation: [{ id: "9", source: "MED", title: "We repeated it." }] } }));
    const back = await w.use("papers_around", { id: "40723902", source: "MED", direction: "back", limit: 1 });
    expect(back).toMatchObject({ of: "MED/40723902", direction: "what it cited", count: 52, more: true });
    expect(back.papers[0]).toMatchObject({ id: "3286696", title: "Cloning bovine kappa-casein", year: 1988 });
    const forward = await w.use("papers_around", { id: "40723902", source: "MED", direction: "forward" });
    expect(forward).toMatchObject({ direction: "what has cited it", count: 1, more: false });
    expect(asked[0]).toContain("/MED/40723902/references?");
    expect(asked[1]).toContain("/MED/40723902/citations?");
  });

  it("says when Europe PMC cannot be reached, rather than failing as itself", async () => {
    const w = await wren();
    europepmc.settings.transport = async (url: string) => { throw new europepmc.EuropePmcError("down", url, null, true); };
    await expect(w.use("search_papers", { query: "casein" })).rejects.toThrow(/could not be reached. This device may be offline/);
    europepmc.settings.transport = async (url: string) => { throw new europepmc.EuropePmcError("slow down", url, 429); };
    await expect(w.use("search_papers", { query: "casein" })).rejects.toThrow(/being asked too often/);
  });

  it("can be left out by a host that does not want the lab reaching outside", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    const names = agentTools(lab, { outside: { papers: false, outside: false } }).map((one) => one.name);
    expect(names.some((one) => one.endsWith("_papers") || one === "papers_around" || one.includes("ncbi"))).toBe(false);
  });
});

describe("an adviser asking what is known about a protein", () => {
  const SEQ = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIE";
  const ENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<uniprot xmlns="http://uniprot.org/uniprot">
<entry dataset="Swiss-Prot" created="1986-07-21" modified="2024-01-24" version="1">
  <accession>P02666</accession>
  <name>CASB_BOVIN</name>
  <protein><recommendedName><fullName>Beta-casein</fullName></recommendedName></protein>
  <gene><name type="primary">CSN2</name></gene>
  <organism><name type="scientific">Bos taurus</name><name type="common">Bovine</name>
    <lineage><taxon>Eukaryota</taxon></lineage></organism>
  <keyword id="KW-0597">Phosphoprotein</keyword>
  <feature type="signal peptide"><location><begin position="1"/><end position="15"/></location></feature>
  <feature type="chain" description="Beta-casein"><location><begin position="16"/><end position="46"/></location></feature>
  <feature type="modified residue" description="Phosphoserine" evidence="2"><location><position position="30"/></location></feature>
  <feature type="modified residue" description="Phosphoserine" evidence="2"><location><position position="32"/></location></feature>
  <feature type="modified residue" description="Phosphoserine" evidence="2"><location><position position="33"/></location></feature>
  <feature type="modified residue" description="Phosphoserine" evidence="2"><location><position position="34"/></location></feature>
  <feature type="sequence variant" description="In variant D." original="S" variation="K"><location><position position="33"/></location></feature>
  <sequence length="46" mass="5107" checksum="X" modified="1986-07-21" version="1">${SEQ}</sequence>
</entry></uniprot>`;

  const answeringUniProt = (body: string): { asked: string[] } => {
    const asked: string[] = [];
    uniprot.settings.transport = async (url: string) => { asked.push(url); return { contentType: "application/xml", body: new TextEncoder().encode(body) }; };
    return { asked };
  };
  afterEach(() => { uniprot.settings.transport = uniprot.fetchTransport; uniprot.settings.email = null; });

  it("is among the tools, and none of the three writes", async () => {
    const { tools } = await wren();
    const known = tools.filter((one) => ["search_proteins", "look_up_protein", "work_out_phosphorylation"].includes(one.name));
    expect(known.map((one) => one.name)).toEqual(["search_proteins", "look_up_protein", "work_out_phosphorylation"]);
    expect(known.every((one) => one.readOnly)).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/right mass that does not work/);
  });

  it("gives the mature chain apart from the precursor, since they are different masses", async () => {
    const w = await wren();
    const { asked } = answeringUniProt(ENTRY);
    const said = await w.use("look_up_protein", { accession: "P02666" });
    expect(said).toMatchObject({ accession: "P02666", name: "Beta-casein", gene: "CSN2", reviewed_by_a_curator: true, precursor_length: 46 });
    expect(said.mature_chain).toMatchObject({ lies: "16-46", residues: 31 });
    expect(said.mature_sequence).toBe(SEQ.slice(15));
    expect(said.mature_sequence).not.toBe(said.sequence);
    expect(asked[0]).toBe("https://rest.uniprot.org/uniprotkb/P02666.xml");
  });

  it("gives every modified residue counted both ways, because the two are confused", async () => {
    const w = await wren();
    answeringUniProt(ENTRY);
    const said = await w.use("look_up_protein", { accession: "P02666" });
    expect(said.modified_residues).toEqual([
      { on_the_entry: 30, on_the_mature_chain: 15, residue: "S", what: "Phosphoserine", evidence_cited: true },
      { on_the_entry: 32, on_the_mature_chain: 17, residue: "S", what: "Phosphoserine", evidence_cited: true },
      { on_the_entry: 33, on_the_mature_chain: 18, residue: "S", what: "Phosphoserine", evidence_cited: true },
      { on_the_entry: 34, on_the_mature_chain: 19, residue: "S", what: "Phosphoserine", evidence_cited: true },
    ]);
    // The variants are long, so they are counted and not listed until asked for.
    expect(said.variants).toBeUndefined();
    expect(said.variants_not_shown).toMatch(/difference between one milk and another/);
    const more = await w.use("look_up_protein", { accession: "P02666", include: "variants" });
    expect(more.variants[0]).toMatchObject({ on_the_entry: 33, was: "S", now: "K", note: "In variant D." });
  });

  it("says when an entry was made by machine rather than read by anybody", async () => {
    const w = await wren();
    answeringUniProt(ENTRY.replace('dataset="Swiss-Prot"', 'dataset="TrEMBL"'));
    const said = await w.use("look_up_protein", { accession: "P02666" });
    expect(said.reviewed_by_a_curator).toBe(false);
    expect(said.unreviewed_note).toMatch(/made by machine from similarity/);
  });

  it("will not ask for something that is not an accession", async () => {
    const w = await wren();
    const { asked } = answeringUniProt(ENTRY);
    await expect(w.use("look_up_protein", { accession: "beta-casein" })).rejects.toThrow(/not a UniProt accession/);
    expect(asked).toHaveLength(0);
  });

  it("works the sites out and checks them against what the curator recorded", async () => {
    const w = await wren();
    answeringUniProt(ENTRY);
    const said = await w.use("work_out_phosphorylation", { uniprot: "P02666", host: "Pichia pastoris GS115" });
    expect(said).toMatchObject({ protein: "Beta-casein", accession: "P02666", counted_on: "the whole entry, precursor included" });
    // The rule reproduces every site the curator recorded, which is the reason to trust it elsewhere.
    expect(said.against_what_is_recorded).toMatchObject({ recorded: [30, 32, 33, 34], the_rule_missed: [], caught: "100% of the recorded sites" });
    expect(said.against_what_is_recorded.note).toMatch(/reason to believe it on a sequence nobody has studied/);
    expect(said.sites.some((one: { round: number }) => one.round > 1)).toBe(true);
  });

  it("counts on the mature chain when asked, and moves the recorded sites with it", async () => {
    const w = await wren();
    answeringUniProt(ENTRY);
    const said = await w.use("work_out_phosphorylation", { uniprot: "P02666", on_the_mature_chain: true });
    expect(said.counted_on).toBe("the mature chain");
    expect(said.residues).toBe(31);
    // The same four residues, counted from the start of what the lab holds.
    expect(said.against_what_is_recorded.recorded).toEqual([15, 17, 18, 19]);
    expect(said.against_what_is_recorded.the_rule_missed).toEqual([]);
  });

  it("says whether the host has the enzyme, and that it did not work that out", async () => {
    const w = await wren();
    answeringUniProt(ENTRY);
    const said = await w.use("work_out_phosphorylation", { uniprot: "P02666", host: "Komagataella phaffii" });
    expect(said.host).toMatchObject({ host: "Komagataella phaffii", has_the_secretory_kinase: "not known", has_casein_kinase_2: true, how_firmly: "reported" });
    expect(said.host.check_it).toMatch(/not worked out from anything/);
    // A bacterium is the clear case, and is said clearly.
    const coli = await w.use("work_out_phosphorylation", { sequence: SEQ, host: "E. coli BL21" });
    expect(coli.host).toMatchObject({ has_the_secretory_kinase: "no", how_firmly: "well established" });
    // A host nothing is known about is not a host that does nothing.
    const other = await w.use("work_out_phosphorylation", { sequence: SEQ, host: "Dictyostelium discoideum" });
    expect(other.host_not_known).toMatch(/not the same as its doing nothing/);
  });

  it("works on a sequence alone, with no record to check against", async () => {
    const w = await wren();
    const said = await w.use("work_out_phosphorylation", { sequence: SEQ });
    expect(said.counted_on).toBe("the sequence given");
    expect(said.against_what_is_recorded).toBeUndefined();
    expect(said.sites.length).toBeGreaterThan(0);
    expect(said.working[0].rests).toMatch(/not that it is/);
    await expect(w.use("work_out_phosphorylation", {})).rejects.toThrow(/Give a sequence, or a UniProt accession/);
  });

  it("can be left out by a host that does not want the lab reaching outside", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    const names = agentTools(lab, { outside: { known: false, papers: false, outside: false } }).map((one) => one.name);
    expect(names.some((one) => one.includes("protein") || one.includes("phosphorylation"))).toBe(false);
  });
});

/** A lab where the adviser has proposed a whole build: two PCRs, the assembly, the transformation. */
const planned = async (): Promise<Wren> => {
  const w = await wren();
  const seen = () => w.lab.snapshot().lab!;
  const gene = seen().parts.find((one) => one.name === "pGene")!;
  const backbone = seen().parts.find((one) => one.name === "pWren backbone")!;
  // Two pieces are to be amplified, from tubes the lab has.
  await w.lab.advise.planRun({ kind: "pcr", instrument: null, inputs: [{ item: w.tubes.pGene, amount: 1, role: "template" }],
                               expects: [{ sequence: "ACGTACGTAA", name: "the insert" }], settings: {}, note: "the insert" });
  await w.lab.advise.planRun({ kind: "pcr", instrument: null, inputs: [{ item: w.tubes.backbone, amount: 1, role: "template" }],
                               expects: [{ sequence: "TTGGCCAATT", name: "the vector" }], settings: {}, note: "the vector" });
  // A later plan can only name a part the lab knows of, so what the PCRs would make is added
  // first, with no tube. That is the step that makes a chain of proposals possible at all.
  await w.lab.advise.addPart({ name: "the insert", sequence: "ACGTACGTAA" });
  await w.lab.advise.addPart({ name: "the vector", sequence: "TTGGCCAATT" });
  const made = seen().plans.flatMap((one) => one.expects);
  const insert = made.find((one) => one.name === "the insert")!.checksum;
  const vector = made.find((one) => one.name === "the vector")!.checksum;
  // Then joined, using what those two would make, neither of which the lab has a tube of.
  await w.lab.advise.planRun({ kind: "assembly", instrument: null,
                               inputs: [{ part: insert, amount: 1, role: "piece" }, { part: vector, amount: 1, role: "piece" }],
                               expects: [{ sequence: "ACGTACGTAATTGGCCAATT", circular: true, name: "pWren-CSN2" }], settings: {}, note: "the construct" });
  await w.lab.advise.addPart({ name: "pWren-CSN2", sequence: "ACGTACGTAATTGGCCAATT", circular: true });
  const construct = seen().plans.flatMap((one) => one.expects).find((one) => one.name === "pWren-CSN2")!.checksum;
  const culture = await w.lab.addItem({ strain: await w.lab.addStrain({ name: "W303", host: "Saccharomyces cerevisiae" }), amount: 50, unit: "mL" });
  await w.lab.advise.planRun({ kind: "transformation", instrument: null,
                               inputs: [{ part: construct, amount: 1, role: "construct" }, { item: culture, amount: 1, role: "host" }],
                               expects: [], settings: {}, note: "into W303" });
  expect(gene.checksum).not.toBe(backbone.checksum);
  return w;
};

describe("an adviser reading its own plan back", () => {
  it("is among the tools, and only reads", async () => {
    const { tools } = await wren();
    expect(tools.find((one) => one.name === "the_work")!.readOnly).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/read it back with the_work/);
  });

  it("puts its own proposals in the order they have to be done, having declared none", async () => {
    const w = await planned();
    const work = await w.use("the_work");
    expect(work.order.map((one: { step: number; kind: string }) => [one.step, one.kind]))
      .toEqual([[1, "pcr"], [2, "pcr"], [3, "assembly"], [4, "transformation"]]);
    // The assembly waits on both PCRs; the transformation on the assembly.
    expect(work.order[2].after_steps.sort()).toEqual([1, 2]);
    expect(work.order[3].after_steps).toEqual([3]);
    expect(work.order.map((one: { can_be_done_now: boolean }) => one.can_be_done_now)).toEqual([true, true, false, false]);
    expect(work.order[2].waiting_on).toEqual({ steps: [1, 2] });
  });

  it("reads them as one piece of work, named by what it ends with", async () => {
    const w = await planned();
    const work = await w.use("the_work");
    expect(work.pieces_of_work).toHaveLength(1);
    expect(work.pieces_of_work[0]).toMatchObject({ name: "pWren-CSN2", steps: [1, 2, 3, 4], nothing_in_its_way: true });
    expect(work.says.join(" ")).toContain("4 steps are proposed, in 1 piece of work.");
    expect(work.says.join(" ")).toContain("2 steps could be carried out now.");
  });

  it("files its own proposals under a project, and keeps them apart from another's", async () => {
    const w = await planned();
    const open = w.lab.snapshot().lab!.plans.filter((one) => one.settled === null);
    for (const one of open.slice(0, 3)) await w.use("file_the_work", { plan: one.plan, project: "Real Vegan Cheese" });
    await w.use("file_the_work", { plan: open[3]!.plan, project: "Bioprinting" });
    const work = await w.use("the_work");
    expect(work.projects.map((one: { project: string; could_be_done_now: number }) => [one.project, one.could_be_done_now]))
      .toEqual([["Bioprinting", 0], ["Real Vegan Cheese", 2]]);
    expect(work.says.join(" ")).toContain("across 2 projects: Bioprinting, Real Vegan Cheese");
    expect(work.order.every((one: { project: string }) => one.project !== "Not filed")).toBe(true);
  });

  it("says plainly what nobody filed, rather than lumping it in with somebody else's", async () => {
    const w = await planned();
    const open = w.lab.snapshot().lab!.plans.filter((one) => one.settled === null);
    await w.use("file_the_work", { plan: open[0]!.plan, project: "Real Vegan Cheese" });
    const work = await w.use("the_work");
    expect(work.projects.map((one: { project: string; filed_by_somebody: boolean }) => [one.project, one.filed_by_somebody]))
      .toEqual([["Real Vegan Cheese", true], ["Not filed", false]]);
    expect(work.says.join(" ")).toContain("3 steps are filed under no project.");
  });

  it("can take a proposal back out of a project, and will not file somebody else's", async () => {
    const w = await planned();
    const mine = w.lab.snapshot().lab!.plans.find((one) => one.settled === null)!;
    await w.use("file_the_work", { plan: mine.plan, project: "Real Vegan Cheese" });
    expect((await w.use("file_the_work", { plan: mine.plan })).project).toBe("Not filed");
    // A plan a person proposed is not the adviser's to file.
    const theirs = await w.lab.planRun({ kind: "pcr", instrument: null, inputs: [{ item: w.tubes.pGene, amount: 1, role: "template" }],
                                         expects: [], settings: {}, note: "Ada's own" });
    // The lab itself refuses it, and its words are what comes back.
    await expect(w.use("file_the_work", { plan: theirs.plan, project: "Real Vegan Cheese" }))
      .rejects.toThrow(/An adviser may only set a field on a plan of its own/);
    await expect(w.use("file_the_work", { plan: "nope", project: "x" })).rejects.toThrow(/no proposal with the ID/);
  });

  it("has nothing to get, when every step is fed by one before it", async () => {
    const w = await planned();
    expect((await w.use("the_work")).to_get).toEqual([]);
  });

  it("names what has to be ordered before anything can start", async () => {
    const w = await wren();
    // A piece nothing makes and no tube holds: the thing a plan has to say out loud.
    // A part the lab knows of but has no tube of, and that nothing proposed makes: the thing a
    // plan has to say out loud, or somebody starts work they cannot finish.
    await w.lab.advise.addPart({ name: "a synthetic piece", sequence: "ACGTACGTAACCGGTT" });
    const synthetic = w.lab.snapshot().lab!.parts.find((one) => one.name === "a synthetic piece")!.checksum;
    await w.lab.advise.planRun({ kind: "assembly", instrument: null,
                                 inputs: [{ part: synthetic, amount: 1, role: "piece" }],
                                 expects: [{ sequence: "ACGTACGTAA", name: "a ring" }], settings: {}, note: "needs a synthetic piece" });
    const work = await w.use("the_work");
    expect(work.to_get).toHaveLength(1);
    expect(work.to_get[0]).toMatchObject({ part: "a synthetic piece", checksum: synthetic, for_steps: [1] });
    expect(work.order[0].waiting_on).toEqual({ to_get: ["a synthetic piece"] });
    expect(work.says.join(" ")).toMatch(/has to be ordered or made first/);
  });

  it("says nothing is proposed, when nothing is", async () => {
    const w = await wren();
    const work = await w.use("the_work");
    expect(work).toMatchObject({ says: [], order: [], pieces_of_work: [], to_get: [] });
  });
});

describe("an adviser writing the method out", () => {
  it("is among the tools, and writes nothing", async () => {
    const { tools } = await wren();
    expect(tools.find((one) => one.name === "write_out_the_method")!.readOnly).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/another lab could carry it out/);
  });

  it("names every molecule by its checksum, and no tube of this lab's", async () => {
    const w = await planned();
    const open = w.lab.snapshot().lab!.plans.filter((one) => one.settled === null);
    for (const one of open) await w.use("file_the_work", { plan: one.plan, project: "Real Vegan Cheese" });
    const method = await w.use("write_out_the_method", { project: "Real Vegan Cheese" });
    expect(method.name).toBe("Real Vegan Cheese");
    expect(method.steps.map((one: { step: number; kind: string }) => [one.step, one.kind]))
      .toEqual([[1, "pcr"], [2, "pcr"], [3, "assembly"], [4, "transformation"]]);
    // Not one item ID in it: that is what lets it travel.
    const asText = JSON.stringify(method);
    for (const item of w.lab.snapshot().lab!.items) expect(asText).not.toContain(item.item);
    expect(method.from_outside).toMatch(/Nothing was published by this/);
    expect(w.lab.snapshot().lab!.entries.every((one) => one.status !== "refused")).toBe(true);
  });

  it("says what has to be had first, and what cannot be sent at all", async () => {
    const w = await planned();
    const method = await w.use("write_out_the_method", {});
    expect(method.needs.length).toBeGreaterThan(0);
    for (const need of method.needs) expect(need.part === null || /seguid=/.test(need.part)).toBe(true);
    // The host of the transformation is alive, so it travels as what it would have to be, not as an ID.
    const host = method.steps.at(-1).uses.find((one: { role: string }) => one.role === "host");
    expect(host.part).toBeNull();
    expect(host.alive).toBeDefined();
  });

  it("will not write out what is not there", async () => {
    const w = await wren();
    await expect(w.use("write_out_the_method", {})).rejects.toThrow(/no open plans to publish/);
    await expect(w.use("write_out_the_protocol", {})).rejects.toThrow(/no open work to write out/);
  });

  it("writes a sheet for a person, with what the plan does not say left for the lab", async () => {
    const w = await planned();
    const said = await w.use("write_out_the_protocol", {});
    expect(said.sheets.length).toBeGreaterThan(0);
    const sheet = said.sheets[0];
    expect(sheet.steps[0].title).toBe("Copy it by PCR");
    expect(sheet.steps[0].notSaid).toContain("which polymerase and which buffer");
    expect(sheet.as_text).toContain("**This plan does not say**");
    // And it does not invent any of them.
    for (const invented of ["master mix", "Taq", "nuclease-free", "50 µL reaction"]) expect(sheet.as_text).not.toContain(invented);
    expect(said.note).toMatch(/leave those for the lab to fill in/);
    expect(AGENT_INSTRUCTIONS).toMatch(/a sheet to carry to a bench/);
  });
});

describe("an adviser putting a construct together", () => {
  const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";
  const MATURE = "AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTA";
  const withPieces = async (): Promise<Wren> => {
    const w = await wren();
    await w.lab.addPart({ name: "pAOX1", sequence: "TTGACAGCTAGCTTGACAGCTAGCTTGACAGC" });
    await w.lab.addPart({ name: "alpha signal", sequence: SIGNAL });
    await w.lab.addPart({ name: "casein", sequence: `${MATURE}TAA` });
    return w;
  };

  it("is among the tools, and writes nothing", async () => {
    const { tools } = await wren();
    expect(tools.find((one) => one.name === "design_the_construct")!.readOnly).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/builds perfectly, sequences exactly as designed, and makes the wrong protein/);
  });

  it("puts the pieces together and reads the protein, with the frame whole", async () => {
    const w = await withPieces();
    const said = await w.use("design_the_construct", { name: "pWren-CSN2", pieces: [
      { part: "pAOX1", as: "promoter" }, { part: "alpha signal", as: "signal" }, { part: "casein", as: "coding" },
    ] });
    expect(said.name).toBe("pWren-CSN2");
    expect(said.junctions).toEqual([{ between: "alpha signal → casein", at: "TTGACAGCTAGCTTGACAGCTAGCTTGACAGC".length + SIGNAL.length + 1, in_frame: true,
                                      says: expect.stringMatching(/ends on a whole codon/) }]);
    expect(said.checks.filter((one: { weight: string }) => one.weight === "stop")).toEqual([]);
    expect(said.what_is_let_out).toBeDefined();
    expect(said.its_amino_acids).toBe(said.amino_acids - SIGNAL.length / 3);
    expect(w.lab.snapshot().lab!.parts.some((one) => one.name === "pWren-CSN2")).toBe(false);
  });

  it("catches a piece that is not a whole number of codons, which nothing else here would", async () => {
    const w = await withPieces();
    const said = await w.use("design_the_construct", { pieces: [
      { part: "alpha signal", as: "signal" }, { sequence: "CACCACCACCACCACCA", name: "His6, one short", as: "tag" },
      { part: "casein", as: "coding" },
    ] });
    const stop = said.checks.find((one: { weight: string }) => one.weight === "stop");
    expect(stop.says).toMatch(/not a whole number of codons/);
    expect(said.junctions.some((one: { in_frame: boolean }) => !one.in_frame)).toBe(true);
  });

  it("catches a tag in front of a signal peptide", async () => {
    const w = await withPieces();
    const said = await w.use("design_the_construct", { pieces: [
      { sequence: "CACCACCACCACCACCAC", name: "His6", as: "tag" }, { part: "alpha signal", as: "signal" }, { part: "casein", as: "coding" },
    ] });
    expect(said.checks.some((one: { says: string }) => /stay inside the cell/.test(one.says))).toBe(true);
    expect(said.what_is_let_out).toBeUndefined();
  });

  it("says why it will not design one at all, rather than giving something wrong", async () => {
    const w = await withPieces();
    await expect(w.use("design_the_construct", { pieces: [] })).rejects.toThrow(/made of pieces/);
    await expect(w.use("design_the_construct", { pieces: [{ part: "pAOX1", as: "promoter" }] }))
      .rejects.toThrow(/none of these pieces is translated/i);
    await expect(w.use("design_the_construct", { pieces: [{ sequence: "ATGNNNAAA", name: "x", as: "coding" }] }))
      .rejects.toThrow(/cannot be counted through an uncertain base/);
  });
});

describe("an adviser saying what to do about a host that will not do it", () => {
  const CHAIN = "RELEELNVPGEIVESLSSSEESITRINKKIEKFQSEEQQQTEDELQDKIHPFAQTQSLVYPFPGPIPNSLPQNIPPLTQTPVV";

  it("is among the tools, and only reads", async () => {
    const { tools } = await wren();
    expect(tools.find((one) => one.name === "work_round_the_host")!.readOnly).toBe(true);
    expect(AGENT_INSTRUCTIONS).toMatch(/never let the computable one — a phosphomimetic — pass as a substitute/);
  });

  it("lays the routes out and recommends none of them", async () => {
    const w = await wren();
    const said = await w.use("work_round_the_host", { host: "Komagataella phaffii" });
    expect(said.routes.map((one: { route: string }) => one.route)).toContain("a phosphomimetic");
    expect(said.routes.map((one: { route: string }) => one.route)).toContain("measure what you actually get");
    expect(said.says.join(" ")).toMatch(/None of these is recommended over another/);
    // Exactly one of them is something it can work out.
    expect(said.routes.filter((one: { worked_out_here: boolean }) => one.worked_out_here)).toHaveLength(1);
    expect(said.note).toMatch(/Give a protein and its sites/);
  });

  it("works the mimetic out, and says what it does and does not reproduce", async () => {
    const w = await wren();
    const said = await w.use("work_round_the_host", { host: "Komagataella phaffii", sequence: CHAIN, sites: [15, 17, 18, 19] });
    expect(said.phosphomimetic.swapped).toEqual(["S15E", "S17E", "S18E", "S19E"]);
    // The charge is what moves; the weight is not, and it says not to look for it on a gel.
    expect(said.phosphomimetic.isoelectric_point.after).toBeLessThan(said.phosphomimetic.isoelectric_point.before);
    expect(said.phosphomimetic.on_a_gel).toMatch(/a gel will not show the difference/);
    expect(said.phosphomimetic.warnings.join(" ")).toMatch(/not a way of making phosphorylated|charge alone is enough/);
    expect(said.phosphomimetic.working[0].rests).toMatch(/not a question a sequence can answer/);
  });

  it("rewrites a gene the lab holds so that it encodes the mimetic", async () => {
    const w = await wren();
    await w.lab.addPart({ name: "a short gene", sequence: "ATGAAATCTGGTTCAAAA" });
    const said = await w.use("work_round_the_host", { sequence: "MKSGSK", sites: [3, 5], gene: "a short gene" });
    expect(said.gene.codons_changed).toEqual([
      { codon: 3, was: "TCT", now: "GAA", aminoAcid: "E" },
      { codon: 5, was: "TCA", now: "GAA", aminoAcid: "E" },
    ]);
    expect(said.gene.note).toMatch(/Check it through design_the_construct/);
    // Nothing was written to the lab.
    expect(w.lab.snapshot().lab!.parts.some((one) => one.sequence === said.gene.sequence && one.name !== "a short gene")).toBe(false);
  });

  it("says when there is nothing to change, rather than changing nothing quietly", async () => {
    const w = await wren();
    await expect(w.use("work_round_the_host", { sequence: CHAIN })).rejects.toThrow(/No sites were given and none is recorded/);
    await expect(w.use("work_round_the_host", { sequence: CHAIN, sites: [1, 2] })).rejects.toThrow(/None of the sites given is a residue that is phosphorylated/);
  });
});
