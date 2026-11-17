/**
 * Reading a UniProt entry, and finding one.
 *
 * Nothing here reaches the network: the transport is replaced, so every test says exactly what the
 * service answered and what was made of it. The entry is written out by hand and kept small, since
 * what is being checked is the awkward part — that a precursor is not a mature chain, and that
 * positions counted from zero and half-open come out counted from one with both ends in.
 */
import { UniProtError, lookUpProtein, looksLikeAccession, onTheChain, readProtein, searchProteins, settings,
         type Reply } from "@biolibs/uniprot";
import { afterEach, describe, expect, it } from "vitest";

const asked: { url: string; headers: Record<string, string> }[] = [];
const answering = (body: string): void => {
  settings.transport = async (url, headers) => {
    asked.push({ url, headers: { ...headers } });
    return { contentType: "application/xml", body: new TextEncoder().encode(body) } satisfies Reply;
  };
};
const refusing = (status: number): void => {
  settings.transport = async (url) => { throw new UniProtError(`UniProt answered ${status}.`, url, status); };
};
afterEach(() => { asked.length = 0; settings.email = null; settings.tool = "biolibs-uniprot"; settings.mostBytes = 8_000_000; });

/** A small entry with a signal peptide, a chain, phosphoserines, a variant and a domain. */
const SEQUENCE = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIE";
const ENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<uniprot xmlns="http://uniprot.org/uniprot">
<entry dataset="Swiss-Prot" created="1986-07-21" modified="2024-01-24" version="1">
  <accession>P02666</accession><accession>A1YQZ8</accession>
  <name>CASB_BOVIN</name>
  <protein><recommendedName><fullName>Beta-casein</fullName></recommendedName></protein>
  <gene><name type="primary">CSN2</name></gene>
  <organism><name type="scientific">Bos taurus</name><name type="common">Bovine</name>
    <dbReference type="NCBI Taxonomy" id="9913"/>
    <lineage><taxon>Eukaryota</taxon><taxon>Metazoa</taxon><taxon>Mammalia</taxon></lineage>
  </organism>
  <keyword id="KW-0597">Phosphoprotein</keyword><keyword id="KW-0494">Milk protein</keyword>
  <feature type="signal peptide"><location><begin position="1"/><end position="15"/></location></feature>
  <feature type="chain" id="PRO_0000004470" description="Beta-casein"><location><begin position="16"/><end position="46"/></location></feature>
  <feature type="modified residue" description="Phosphoserine" evidence="2 3"><location><position position="30"/></location></feature>
  <feature type="modified residue" description="Phosphoserine"><location><position position="32"/></location></feature>
  <feature type="sequence variant" description="In variant D." original="S" variation="K"><location><position position="33"/></location></feature>
  <feature type="domain" description="Casein-like"><location><begin position="20"/><end position="40"/></location></feature>
  <sequence length="46" mass="5107" checksum="X" modified="1986-07-21" version="1">${SEQUENCE}</sequence>
</entry></uniprot>`;

describe("reading an entry", () => {
  const casein = readProtein(ENTRY);

  it("takes what the entry is, and whether anybody has read it", () => {
    expect(casein).toMatchObject({
      accession: "P02666", alsoKnownAs: ["A1YQZ8"], entryName: "CASB_BOVIN", name: "Beta-casein",
      gene: "CSN2", organism: "Bos taurus (Bovine)", reviewed: true, length: 46, mass: 5107,
      lookAt: "https://www.uniprot.org/uniprotkb/P02666",
    });
    expect(casein.lineage).toContain("Mammalia");
    expect(casein.keywords).toContain("Phosphoprotein");
  });

  it("says an entry made by machine is not one a curator has read", () => {
    expect(readProtein(ENTRY.replace('dataset="Swiss-Prot"', 'dataset="TrEMBL"')).reviewed).toBe(false);
  });

  it("counts from 1 with both ends in, not from 0 and half-open", () => {
    expect(casein.signal).toEqual({ from: 1, to: 15 });
    expect(casein.chain).toMatchObject({ from: 16, to: 46, length: 31, name: "Beta-casein" });
    expect(casein.modifications.map((one) => one.at)).toEqual([30, 32]);
    expect(casein.variants[0]).toEqual({ from: 33, to: 33, was: "S", now: "K", note: "In variant D." });
    expect(casein.regions[0]).toEqual({ from: 20, to: 40, kind: "domain", name: "Casein-like" });
  });

  it("gives the mature chain as its own sequence, which is not the precursor", () => {
    // The entry's sequence is what comes off the ribosome; the chain is what the lab ends up with.
    expect(casein.sequence).toBe(SEQUENCE);
    expect(casein.chain!.sequence).toBe(SEQUENCE.slice(15));
    expect(casein.chain!.sequence).not.toBe(casein.sequence);
    expect(casein.chain!.length).toBeLessThan(casein.length);
    // The signal peptide is the difference, exactly.
    expect(casein.chain!.length + casein.signal!.to).toBe(casein.length);
  });

  it("says which residue carries the modification, and whether anybody cited anything for it", () => {
    expect(casein.modifications[0]).toEqual({ at: 30, residue: "S", what: "Phosphoserine", evidenced: true });
    expect(casein.modifications[1]!.evidenced).toBe(false);
    for (const one of casein.modifications) expect(SEQUENCE[one.at - 1]).toBe(one.residue);
  });

  it("counts a modification on the chain as well as on the entry, which differ by the signal", () => {
    // Getting this wrong by the length of the signal peptide is the easiest mistake here to make.
    expect(onTheChain(casein, 30)).toBe(15);
    expect(onTheChain(casein, 32)).toBe(17);
    expect(onTheChain(casein, 16)).toBe(1);
    // A residue inside the signal peptide is on nothing the lab holds.
    expect(onTheChain(casein, 5)).toBeNull();
    expect(onTheChain(casein, 999)).toBeNull();
    expect(onTheChain({ chain: null }, 30)).toBeNull();
  });

  it("says when what it was given is not an entry", () => {
    expect(() => readProtein("{\"messages\":[\"not found\"]}")).toThrow(UniProtError);
    expect(() => readProtein("<uniprot xmlns=\"http://uniprot.org/uniprot\"></uniprot>")).toThrow(/not a UniProt entry/);
  });

  it("copes with an entry that marks nothing", () => {
    const bare = readProtein(ENTRY.replace(/<feature[\s\S]*?<\/feature>/g, ""));
    expect(bare).toMatchObject({ signal: null, chain: null, modifications: [], variants: [], regions: [] });
    expect(bare.sequence).toBe(SEQUENCE);
  });
});

describe("fetching and searching", () => {
  it("asks for an entry by its accession, and names only the software", async () => {
    answering(ENTRY);
    await lookUpProtein("p02666");
    expect(asked[0]!.url).toBe("https://rest.uniprot.org/uniprotkb/P02666.xml");
    expect(asked[0]!.headers["User-Agent"]).toBe("biolibs-uniprot");
    expect(JSON.stringify(asked[0])).not.toContain("@");
  });

  it("sends an address only when one has been set on purpose", async () => {
    answering(ENTRY);
    settings.email = "a.n.other@example.com";
    await lookUpProtein("P02666");
    expect(asked[0]!.headers["User-Agent"]).toBe("biolibs-uniprot (a.n.other@example.com)");
  });

  it("will not ask for something that is not an accession", async () => {
    answering(ENTRY);
    for (const bad of ["CASB_BOVIN", "casein", "", "P0266"]) {
      await expect(lookUpProtein(bad)).rejects.toThrow(/not a UniProt accession/);
    }
    expect(asked).toHaveLength(0);
    expect(looksLikeAccession("P02666")).toBe(true);
    expect(looksLikeAccession("A0A0B4J2F0")).toBe(true);
    expect(looksLikeAccession("hello")).toBe(false);
  });

  it("says what a 404 really means: the entry may have been merged away", async () => {
    refusing(404);
    await expect(lookUpProtein("P02666")).rejects.toThrow(/may have been merged into another/);
    refusing(503);
    await expect(lookUpProtein("P02666")).rejects.toThrow(/answered 503/);
  });

  it("reads a search result, and says whether a curator has been over it", async () => {
    answering(JSON.stringify({ results: [
      { entryType: "UniProtKB reviewed (Swiss-Prot)", primaryAccession: "P02666", uniProtkbId: "CASB_BOVIN",
        organism: { scientificName: "Bos taurus", commonName: "Bovine" },
        proteinDescription: { recommendedName: { fullName: { value: "Beta-casein" } } },
        genes: [{ geneName: { value: "CSN2" } }], sequence: { length: 224 } },
      { entryType: "UniProtKB unreviewed (TrEMBL)", primaryAccession: "A0A0B4J2F0", uniProtkbId: "X_BOVIN",
        proteinDescription: { submissionNames: [{ fullName: { value: "Casein-like" } }] } },
    ] }));
    const found = await searchProteins("casein AND organism_id:9913", { reviewedOnly: true });
    expect(found.results[0]).toEqual({
      accession: "P02666", entryName: "CASB_BOVIN", name: "Beta-casein", gene: "CSN2",
      organism: "Bos taurus (Bovine)", length: 224, reviewed: true,
      lookAt: "https://www.uniprot.org/uniprotkb/P02666",
    });
    // "unreviewed" must not read as "reviewed", which is the one that would mislead.
    expect(found.results[1]).toMatchObject({ reviewed: false, name: "Casein-like", gene: null, organism: null, length: null });
    expect(new URL(asked[0]!.url).searchParams.get("query")).toBe("(casein AND organism_id:9913) AND reviewed:true");
  });

  it("will not search for nothing, and says when the answer is not an answer", async () => {
    answering("{}");
    await expect(searchProteins("  ")).rejects.toThrow(/nothing to search for/);
    answering("<html>down</html>");
    await expect(searchProteins("casein")).rejects.toThrow(/not the answer to a search/);
  });

  it("tells being offline from being asked for the wrong thing", async () => {
    settings.transport = async () => { throw new TypeError("fetch failed"); };
    await expect(lookUpProtein("P02666")).rejects.toMatchObject({ offline: true, status: null });
    await expect(lookUpProtein("nonsense")).rejects.toMatchObject({ offline: false, status: null });
    refusing(500);
    await expect(lookUpProtein("P02666")).rejects.toMatchObject({ offline: false, status: 500 });
  });

  it("refuses a reply too large to read", async () => {
    settings.mostBytes = 10;
    answering(ENTRY);
    await expect(lookUpProtein("P02666")).rejects.toThrow(/more than one ask reads/);
  });
});
