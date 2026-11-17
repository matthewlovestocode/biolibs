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
    expect(tools.filter((one) => !one.readOnly).map((one) => one.name).sort()).toEqual(["add_part", "keep_from_ncbi", "propose_digest", "propose_ligation", "propose_pcr", "propose_transformation", "withdraw_proposal"]);
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
