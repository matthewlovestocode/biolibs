/**
 * Looking something up outside the lab.
 *
 * Nothing here touches the network: `@biolibs/entrez` sends through one replaceable function, so
 * these put a stand-in there and check both halves — what is sent, and what is made of what comes
 * back. What is sent matters as much as what is read, because these are the only tools an adviser
 * has that talk to anybody, and the lab's own business must not go out with them.
 */
import { agentTools, lookupTools, DATABASES, LONGEST_TERM, MOST_FETCHED, MOST_FOUND } from "@biolibs/bionet-agent";
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
import { setWarningHandler } from "@biolibs/core";
import { settings, HTTPError, URLError, type EntrezRequest, type Reply, type Transport } from "@biolibs/entrez";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** A GenBank record of the shape NCBI returns, short enough to read. */
const GENBANK = `LOCUS       TEST001                  60 bp    DNA     linear   MAM 01-JAN-2020
DEFINITION  Bos taurus test casein (CSN2), mRNA.
ACCESSION   TEST001
VERSION     TEST001.1
SOURCE      Bos taurus (cattle)
  ORGANISM  Bos taurus
FEATURES             Location/Qualifiers
     source          1..60
                     /organism="Bos taurus"
     CDS             4..30
                     /gene="CSN2"
                     /product="beta-casein"
     misc_feature    complement(40..54)
                     /note="a thing on the other strand"
ORIGIN
        1 atgggatcac agtctacact gctcactcca accccggccc ctgagtccga ggagagggtg
//
`;

const searched = (ids: string[], count = ids.length): string => JSON.stringify({ esearchresult: { count: String(count), idlist: ids } });

let sent: EntrezRequest[] = [];
let answers: (string | Error)[] = [];
/** NCBI asks every client for an address, and is given none unless a person passes one; the warning is expected. */
let quiet: ReturnType<typeof setWarningHandler>;
const before = { transport: settings.transport, tool: settings.tool, email: settings.email, apiKey: settings.apiKey, sleep: settings.sleep, now: settings.now };

/** A stand-in for the network: it records what was asked and gives the next prepared answer. */
const standIn: Transport = async (request) => {
  sent.push(request);
  const next = answers.shift();
  if (next === undefined) throw new Error(`nothing prepared for ${request.fullUrl}`);
  if (next instanceof Error) throw next;
  return { url: request.fullUrl, contentType: "text/plain", body: new TextEncoder().encode(next) } satisfies Reply;
};

beforeEach(() => {
  quiet = setWarningHandler(() => undefined);
  sent = [];
  answers = [];
  settings.transport = standIn;
  settings.email = null;
  settings.apiKey = null;
  // No waiting between requests, and no clock to wait on: these never reach anybody to be polite to.
  settings.sleep = async () => undefined;
  settings.now = () => 1e9;
});
afterEach(() => { Object.assign(settings, before); setWarningHandler(quiet); });

const use = (name: string, args: Record<string, unknown> = {}, options = {}): Promise<any> => {
  const tool = lookupTools(options).find((one) => one.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return tool.run(args);
};

describe("the tools that reach outside", () => {
  it("are two, say so in their descriptions, and only read", () => {
    const tools = lookupTools();
    expect(tools.map((one) => one.name)).toEqual(["search_ncbi", "fetch_from_ncbi"]);
    for (const tool of tools) {
      expect(tool.readOnly, tool.name).toBe(true);
      expect(tool.description, tool.name).toMatch(/reaches the internet/);
      expect(tool.input.additionalProperties).toBe(false);
    }
  });

  it("are left out when a host asks for none, and are there by default", () => {
    expect(lookupTools({ outside: false })).toEqual([]);
    expect(lookupTools({}).length).toBe(2);
  });

  it("tell NCBI the software's name and nothing about anybody, unless a person passes an address", () => {
    lookupTools({ tool: "bionet-adviser" });
    expect(settings.tool).toBe("bionet-adviser");
    expect(settings.email).toBeNull();
    // It is only ever what somebody passed in on purpose.
    lookupTools({ email: "lab@example.org", apiKey: "k" });
    expect([settings.email, settings.apiKey]).toEqual(["lab@example.org", "k"]);
  });
});

describe("searching", () => {
  it("asks for what it was told to and reads back what matched", async () => {
    answers = [searched(["111", "222"], 7), JSON.stringify({ result: {
      uids: ["111", "222"],
      111: { accessionversion: "NM_181008.2", title: "Bos taurus casein beta (CSN2), mRNA", organism: "Bos taurus", slen: 1061, updatedate: "2020/01/01" },
      222: { caption: "X12345", title: "Another one", organism: "Bos taurus", slen: 900 },
    } })];
    const found = await use("search_ncbi", { database: "nucleotide", term: "CSN2 AND Bos taurus[orgn]", limit: 2 });
    expect(found).toMatchObject({ database: "nucleotide", found: 7, showing: 2 });
    expect(found.results[0]).toEqual({ accession: "NM_181008.2", title: "Bos taurus casein beta (CSN2), mRNA", organism: "Bos taurus", length: 1061,
                                       updated: "2020/01/01", look_at: "https://www.ncbi.nlm.nih.gov/nucleotide/NM_181008.2" });
    expect(found.results[1].accession).toBe("X12345");
    expect(found.note).toMatch(/7 matched in all/);
    // Two requests: the search, then the summaries of exactly what it found.
    expect(sent).toHaveLength(2);
    expect(sent[0]!.fullUrl).toContain("esearch.fcgi");
    // Form encoding, so spaces are `+`: the term went out as it was written and nothing else did.
    expect(sent[0]!.fullUrl).toContain("term=CSN2+AND+Bos+taurus%5Borgn%5D");
    expect(sent[0]!.fullUrl).toContain("tool=bionet-adviser");
    expect(sent[0]!.fullUrl).not.toMatch(/email|Wren|@/);
    expect(sent[1]!.fullUrl).toMatch(/esummary\.fcgi.*id=111%2C222|esummary\.fcgi.*id=111,222/);
  });

  it("says a gene and a paper in their own terms", async () => {
    answers = [searched(["281728"]), JSON.stringify({ result: { uids: ["281728"], 281728: {
      name: "CSN2", description: "casein beta", organism: { scientificname: "Bos taurus" }, summary: "Makes a milk protein.", chromosome: "6" } } })];
    expect((await use("search_ncbi", { database: "gene", term: "CSN2" })).results[0]).toEqual({
      id: "281728", symbol: "CSN2", description: "casein beta", organism: "Bos taurus", summary: "Makes a milk protein.", chromosome: "6",
      look_at: "https://www.ncbi.nlm.nih.gov/gene/281728" });

    answers = [searched(["12345"]), JSON.stringify({ result: { uids: ["12345"], 12345: {
      title: "A paper about casein", source: "J Dairy Sci", pubdate: "2019 Mar", elocationid: "doi: 10.0/x",
      authors: [{ name: "Lee A" }, { name: "Patel B" }] } } })];
    expect((await use("search_ncbi", { database: "pubmed", term: "casein" })).results[0]).toMatchObject({
      id: "12345", title: "A paper about casein", journal: "J Dairy Sci", published: "2019 Mar", authors: ["Lee A", "Patel B"],
      look_at: "https://pubmed.ncbi.nlm.nih.gov/12345/" });
  });

  it("says plainly when nothing matched, and asks for no summaries", async () => {
    answers = [searched([])];
    const found = await use("search_ncbi", { database: "nucleotide", term: "qqqq" });
    expect(found).toMatchObject({ found: 0, results: [] });
    expect(found.note).toMatch(/Entrez syntax is strict/);
    expect(sent).toHaveLength(1);
  });

  it("will not carry a sequence out in a search term", async () => {
    const sequence = "ATGGGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC".repeat(4);
    expect(sequence.length).toBeGreaterThan(LONGEST_TERM);
    await expect(use("search_ncbi", { database: "nucleotide", term: sequence })).rejects.toThrow(/at most 200 characters/);
    expect(sent).toHaveLength(0);
  });

  it("asks nowhere but the databases it names, and for no more than it will show", async () => {
    await expect(use("search_ncbi", { database: "taxonomy", term: "x" })).rejects.toThrow(/There is no database called "taxonomy" here/);
    expect(sent).toHaveLength(0);
    answers = [searched([]), ""];
    await use("search_ncbi", { database: "nucleotide", term: "x", limit: 10_000 });
    expect(sent[0]!.fullUrl).toContain(`retmax=${MOST_FOUND}`);
  });
});

describe("fetching a sequence", () => {
  it("reads the record, with what it says is marked on it, counted as people count", async () => {
    answers = [GENBANK];
    const read = await use("fetch_from_ncbi", { database: "nucleotide", accession: "TEST001.1" });
    expect(read).toMatchObject({ accession: "TEST001.1", database: "nucleotide", length: 60, circular: false });
    expect(read.description).toContain("casein");
    expect(read.sequence.startsWith("ATGGGATCACAGTCTACACTG")).toBe(true);
    // The CDS at 4..30 in the file is 4 to 30 here, and the one on the other strand says so.
    expect(read.marked).toEqual([
      { label: "CSN2", type: "CDS", strand: "forward", lies: [{ from: 4, to: 30 }] },
      { label: "a thing on the other strand", type: "misc_feature", strand: "reverse", lies: [{ from: 40, to: 54 }] },
    ]);
    expect(read.from_outside).toMatch(/Nothing has been added to the lab/);
    expect(sent[0]!.fullUrl).toContain("efetch.fcgi");
    expect(sent[0]!.fullUrl).toContain("rettype=gb");
    expect(decodeURIComponent(sent[0]!.fullUrl)).toContain("id=TEST001.1");
  });

  it("asks for a stretch when it is given one, and says which it asked for", async () => {
    answers = [GENBANK];
    const read = await use("fetch_from_ncbi", { database: "nucleotide", accession: "TEST001", from: 4, to: 30 });
    expect(read.stretch).toEqual({ from: 4, to: 30 });
    expect(sent[0]!.fullUrl).toContain("seq_start=4");
    expect(sent[0]!.fullUrl).toContain("seq_stop=30");
  });

  it("fetches a protein as a protein record", async () => {
    answers = [GENBANK];
    await use("fetch_from_ncbi", { database: "protein", accession: "P02666" });
    expect(sent[0]!.fullUrl).toContain("db=protein");
    expect(sent[0]!.fullUrl).toContain("rettype=gp");
  });

  it("refuses what is not an accession, and a database with no sequences in it", async () => {
    for (const bad of ["", "NM 181008", "../../etc", "x".repeat(50), "<script>"]) {
      await expect(use("fetch_from_ncbi", { database: "nucleotide", accession: bad })).rejects.toThrow();
    }
    await expect(use("fetch_from_ncbi", { database: "pubmed", accession: "12345" })).rejects.toThrow(/nucleotide or protein/);
    expect(sent).toHaveLength(0);
  });

  it("will not read a whole chromosome in one go", async () => {
    const huge = GENBANK.replace("ORIGIN", `ORIGIN\n        1 ${"a".repeat(MOST_FETCHED + 10)}`);
    answers = [huge];
    await expect(use("fetch_from_ncbi", { database: "nucleotide", accession: "BIG1" })).rejects.toThrow(/more than one fetch brings back.*from and to/s);
  });

  it("says nothing was found when NCBI answers with nothing", async () => {
    answers = ["   "];
    await expect(use("fetch_from_ncbi", { database: "nucleotide", accession: "NOPE1" })).rejects.toThrow(/has nothing under NOPE1/);
  });
});

describe("when NCBI will not answer", () => {
  it("says what to do about it, in each case", async () => {
    settings.maxTries = 1;
    answers = [new HTTPError("u", 429, "Too Many Requests")];
    await expect(use("search_ncbi", { database: "gene", term: "x" })).rejects.toThrow(/asked too often just now. Wait a little/);
    answers = [new HTTPError("u", 400, "Bad Request")];
    await expect(use("search_ncbi", { database: "gene", term: "x" })).rejects.toThrow(/answered 400/);
    answers = [new URLError("offline")];
    await expect(use("fetch_from_ncbi", { database: "nucleotide", accession: "TEST001" })).rejects.toThrow(/could not be reached. This device may be offline/);
    settings.maxTries = 3;
  });
});

describe("an adviser given them", () => {
  const hosting = async (outside?: { outside: boolean }): Promise<ReturnType<typeof agentTools>> => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    const { key } = await lab.hostAdviser();
    await lab.addMember({ key, person: "Claude", role: "adviser" });
    return agentTools(lab, outside === undefined ? {} : { outside });
  };

  it("has them among its own, and still writes nothing with them", async () => {
    const tools = await hosting();
    expect(tools.map((one) => one.name)).toContain("search_ncbi");
    expect(tools.filter((one) => !one.readOnly).map((one) => one.name).sort()).toEqual(["add_part", "propose_digest", "propose_ligation", "propose_pcr", "withdraw_proposal"]);
    expect(DATABASES).toContain("nucleotide");
  });

  it("does not have them when the host left them out", async () => {
    expect((await hosting({ outside: false })).map((one) => one.name)).not.toContain("search_ncbi");
  });

  it("reports looking something up as having no place in the lab", async () => {
    const calls: { tool: string; shows: unknown }[] = [];
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    answers = [searched([])];
    const tools = agentTools(lab, { watch: (call) => calls.push({ tool: call.tool, shows: call.shows }) });
    await tools.find((one) => one.name === "search_ncbi")!.run({ database: "gene", term: "CSN2" });
    expect(calls).toEqual([{ tool: "search_ncbi", shows: null }]);
  });
});
