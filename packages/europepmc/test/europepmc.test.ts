/**
 * Searching Europe PMC, and reading a paper out of JATS.
 *
 * Nothing here reaches the network: the transport is replaced, so every test says exactly what the
 * service answered and what was made of it. The JATS is written out by hand rather than captured
 * from a real paper, because what is being checked is the awkward shape — sections inside sections,
 * citation markers mid-sentence, a table where a paragraph would be — and a captured file would
 * check one publisher's habits instead.
 */
import { EuropePmcError, citationsOf, findSection, fullTextOf, readArticle, referencesOf, searchArticles, sectionsNamed, settings, wordsOf,
         type Reply } from "@biolibs/europepmc";
import { afterEach, describe, expect, it } from "vitest";

/** What was asked for, and what to answer with. */
const asked: { url: string; headers: Record<string, string> }[] = [];
const answering = (reply: string | ((url: string) => string | Reply)): void => {
  settings.transport = async (url, headers) => {
    asked.push({ url, headers: { ...headers } });
    const given = typeof reply === "function" ? reply(url) : reply;
    return typeof given === "string" ? { contentType: "application/json", body: given } : given;
  };
};
const refusing = (status: number): void => {
  settings.transport = async (url) => { throw new EuropePmcError(`Europe PMC answered ${status}.`, url, status); };
};

afterEach(() => { asked.length = 0; settings.email = null; settings.tool = "biolibs-europepmc"; settings.mostCharacters = 4_000_000; });

const result = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "40723902", source: "MED", pmid: "40723902", pmcid: "PMC12292773", doi: "10.3390/biom15071031",
  title: "Heterologous caseins in yeast.", authorString: "Mora Vásquez S, García-Jacobo S.",
  journalTitle: "Biomolecules", pubYear: "2025", citedByCount: 4,
  isOpenAccess: "Y", inEPMC: "Y", hasSuppl: "Y", hasReferences: "Y", ...over,
});
const found = (results: Record<string, unknown>[], over: Record<string, unknown> = {}): string =>
  JSON.stringify({ hitCount: results.length, nextCursorMark: "NEXT", resultList: { result: results }, ...over });

describe("searching", () => {
  it("asks for what it was given, and says only what software is asking", async () => {
    answering(found([result()]));
    await searchArticles('"kappa-casein" AND yeast');
    const [one] = asked as [{ url: string; headers: Record<string, string> }];
    expect(one.url).toContain("/search?");
    expect(new URL(one.url).searchParams.get("query")).toBe('"kappa-casein" AND yeast');
    expect(one.headers["User-Agent"]).toBe("biolibs-europepmc");
    // Nothing about a person goes unless somebody puts it there on purpose.
    expect(new URL(one.url).searchParams.get("email")).toBeNull();
    expect(JSON.stringify(one)).not.toContain("@");
  });

  it("sends an address only when one has been set on purpose", async () => {
    answering(found([]));
    settings.email = "a.n.other@example.com";
    await searchArticles("casein");
    expect(new URL(asked[0]!.url).searchParams.get("email")).toBe("a.n.other@example.com");
  });

  it("reads a result into something steady", async () => {
    answering(found([result({ abstractText: "Heterologous expression of caseins…" })]));
    const search = await searchArticles("casein", { abstracts: true });
    expect(search.results[0]).toMatchObject({
      id: "40723902", source: "MED", pmid: "40723902", pmcid: "PMC12292773", doi: "10.3390/biom15071031",
      // The full stop journals put on the end of a title is not part of the title.
      title: "Heterologous caseins in yeast",
      authors: ["Mora Vásquez S", "García-Jacobo S"],
      journal: "Biomolecules", year: 2025, citedBy: 4,
      openAccess: true, fullText: true, hasSupplement: true, hasReferences: true,
      abstract: "Heterologous expression of caseins…",
      lookAt: "https://europepmc.org/article/MED/40723902",
    });
    expect(new URL(asked[0]!.url).searchParams.get("resultType")).toBe("core");
  });

  it("takes the markup out of a title, since nothing downstream renders it", async () => {
    answering(found([result({ title: "Recombinant bovine α<sub>S1</sub>-casein in <italic>Bacillus subtilis</italic>." })]));
    expect((await searchArticles("casein")).results[0]!.title).toBe("Recombinant bovine αS1-casein in Bacillus subtilis");
  });

  it("says plainly whether the full text can be read, which is not the same as open access", async () => {
    answering(found([
      result({ id: "1", isOpenAccess: "Y", inEPMC: "N", pmcid: null }),
      result({ id: "2", isOpenAccess: "N", inEPMC: "N", pmcid: null }),
      result({ id: "3", isOpenAccess: "Y", inEPMC: "Y", pmcid: "PMC9" }),
    ]));
    const search = await searchArticles("casein");
    expect(search.results.map((one) => [one.openAccess, one.fullText])).toEqual([[true, false], [false, false], [true, true]]);
  });

  it("narrows to a corpus by adding to the query rather than asking the caller to", async () => {
    answering(found([]));
    await searchArticles("casein", { corpus: "open-access" });
    expect(new URL(asked[0]!.url).searchParams.get("query")).toBe("(casein) AND OPEN_ACCESS:Y");
    await searchArticles("casein", { corpus: "preprints" });
    expect(new URL(asked[1]!.url).searchParams.get("query")).toBe("(casein) AND SRC:PPR");
    await searchArticles("casein", { corpus: "all" });
    expect(new URL(asked[2]!.url).searchParams.get("query")).toBe("casein");
  });

  it("keeps the number asked for inside what the service will give", async () => {
    answering(found([]));
    await searchArticles("casein", { limit: 10_000 });
    expect(new URL(asked[0]!.url).searchParams.get("pageSize")).toBe("100");
    await searchArticles("casein", { limit: 0 });
    expect(new URL(asked[1]!.url).searchParams.get("pageSize")).toBe("1");
  });

  it("offers a next page only when there is one", async () => {
    // A full page, so there may be more.
    answering(found(Array.from({ length: 10 }, (_, at) => result({ id: String(at) })), { hitCount: 90 }));
    expect((await searchArticles("casein")).next).toBe("NEXT");
    // A short page is the end, whatever cursor the service sends back.
    answering(found([result()], { hitCount: 1 }));
    expect((await searchArticles("casein")).next).toBeNull();
  });

  it("will not search for nothing, and says when the answer is not an answer", async () => {
    answering(found([]));
    await expect(searchArticles("   ")).rejects.toThrow(/nothing to search for/);
    answering("<html>down for maintenance</html>");
    await expect(searchArticles("casein")).rejects.toThrow(/not the answer to a search/);
  });
});

/** A paper with the shapes that make JATS awkward: nested sections, markers mid-sentence, a table. */
const JATS = `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front>
    <journal-meta><journal-title-group><journal-title>Biomolecules</journal-title></journal-title-group></journal-meta>
    <article-meta>
      <title-group><article-title>Casein in <italic>Pichia pastoris</italic></article-title></title-group>
      <contrib-group>
        <contrib contrib-type="author"><name><surname>Hopper</surname><given-names>Grace</given-names></name></contrib>
        <contrib contrib-type="editor"><name><surname>Noone</surname><given-names>A</given-names></name></contrib>
      </contrib-group>
      <pub-date><year>2024</year></pub-date>
      <permissions><license><license-p>Open access under <ext-link xlink:href="https://creativecommons.org/licenses/by/4.0/">CC BY</ext-link>.</license-p></license></permissions>
      <abstract><p>We expressed <italic>CSN2</italic> and got a band.</p></abstract>
      <kwd-group><kwd>casein</kwd><kwd>yeast</kwd></kwd-group>
    </article-meta>
  </front>
  <body>
    <p>A loose paragraph before anything else.</p>
    <sec><title>1. Introduction</title><p>Cheese is old [<xref ref-type="bibr" rid="b1">1</xref>].</p></sec>
    <sec><title>2. Materials and Methods</title>
      <sec><title>2.1. Strains</title><p>We used <italic>P. pastoris</italic> GS115, as in Table <xref ref-type="table" rid="t1">1</xref>.</p></sec>
      <sec><title>2.2. Induction</title><p>Induced with 1% methanol at 28 °C for 48 h [<xref ref-type="bibr" rid="b2">2</xref>, <xref ref-type="bibr" rid="b3">3</xref>].</p></sec>
    </sec>
    <sec><title>3. Results</title><p>We saw 24 kDa.</p>
      <table-wrap id="t1"><label>Table 1</label><caption><p>Strains used.</p></caption>
        <table><thead><tr><th>Strain</th><th>Yield</th></tr></thead>
        <tbody><tr><td>GS115</td><td>0.6 mg/L</td></tr><tr><td>KM71</td><td>1 g/L</td></tr></tbody></table>
      </table-wrap>
      <fig id="f1"><label>Figure 1</label><caption><p>A gel.</p></caption><graphic xlink:href="f1.jpg"/></fig>
    </sec>
    <sec><title>References</title><ref-list><ref id="b1"><element-citation><article-title>Cheese</article-title></element-citation></ref></ref-list></sec>
  </body>
</article>`;

describe("reading a paper", () => {
  const paper = readArticle(JATS);

  it("takes the front matter, markup and all", () => {
    expect(paper.title).toBe("Casein in Pichia pastoris");
    expect(paper.journal).toBe("Biomolecules");
    expect(paper.year).toBe(2024);
    // Authors only: an editor is a contributor and is not an author.
    expect(paper.authors).toEqual(["Hopper Grace"]);
    expect(paper.abstract).toBe("We expressed CSN2 and got a band.");
    expect(paper.keywords).toEqual(["casein", "yeast"]);
    expect(paper.licence).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("keeps each section's own words, and not those of the sections inside it", () => {
    expect(paper.sections.map((one) => [one.depth, one.heading])).toEqual([
      [0, ""], [0, "1. Introduction"], [0, "2. Materials and Methods"],
      [1, "2.1. Strains"], [1, "2.2. Induction"], [0, "3. Results"], [0, "References"],
    ]);
    // The methods heading has no paragraphs of its own; its subsections do, and only once each.
    expect(paper.sections.find((one) => one.heading === "2. Materials and Methods")!.text).toBe("");
    expect(paper.sections.find((one) => one.heading === "2.1. Strains")!.text).toContain("GS115");
    expect(paper.sections.find((one) => one.heading === "2. Materials and Methods")!.text).not.toContain("GS115");
    expect(paper.sections[0]).toEqual({ depth: 0, heading: "", text: "A loose paragraph before anything else." });
  });

  it("drops a citation marker and the brackets it leaves behind, and keeps one that says something", () => {
    expect(paper.sections.find((one) => one.heading === "1. Introduction")!.text).toBe("Cheese is old.");
    expect(paper.sections.find((one) => one.heading === "2.2. Induction")!.text).toBe("Induced with 1% methanol at 28 °C for 48 h.");
    // "as in Table 1" is part of what the sentence says, so the marker stays.
    expect(paper.sections.find((one) => one.heading === "2.1. Strains")!.text).toBe("We used P. pastoris GS115, as in Table 1.");
  });

  it("lifts a table out of the running text and keeps it as rows", () => {
    expect(paper.sections.find((one) => one.heading === "3. Results")!.text).toBe("We saw 24 kDa.");
    expect(paper.tables).toEqual([{
      label: "Table 1", caption: "Strains used.",
      headings: ["Strain", "Yield"], rows: [["GS115", "0.6 mg/L"], ["KM71", "1 g/L"]],
    }]);
    expect(paper.figures).toEqual([{ label: "Figure 1", caption: "A gel." }]);
  });

  it("does not hand back a reference list as the text of a section", () => {
    const references = paper.sections.find((one) => one.heading === "References")!;
    expect(references.text).toBe("");
  });

  it("says when what it was given is not a paper", () => {
    expect(() => readArticle("{\"error\":\"not found\"}")).toThrow(EuropePmcError);
    expect(() => readArticle("<result><message>no</message></result>")).toThrow(/Expected a JATS article/);
  });
});

describe("finding the section somebody wants", () => {
  const paper = readArticle(JATS);

  it("matches the loose way papers name their headings, numbering and all", () => {
    expect(sectionsNamed(paper, "methods").map((one) => one.heading))
      .toEqual(["2. Materials and Methods", "2.1. Strains", "2.2. Induction"]);
    expect(sectionsNamed(paper, "introduction").map((one) => one.heading)).toEqual(["1. Introduction"]);
    expect(sectionsNamed(paper, "results").map((one) => one.heading)).toEqual(["3. Results"]);
  });

  it("takes everything under a heading, since a yield under 2.2 belongs to the methods", () => {
    expect(sectionsNamed(paper, "methods").map((one) => one.text).join(" ")).toContain("methanol");
  });

  it("matches words that are not one of the kinds it knows", () => {
    expect(sectionsNamed(paper, "strains").map((one) => one.heading)).toEqual(["2.1. Strains"]);
    expect(sectionsNamed(paper, "nothing like that")).toEqual([]);
    expect(sectionsNamed(paper, "   ")).toEqual([]);
  });

  it("prefers a heading that is the name over one that merely contains it", () => {
    const two = readArticle(JATS.replace("<sec><title>3. Results</title>", "<sec><title>Supplementary Methods</title><p>Later.</p></sec><sec><title>3. Results</title>"));
    expect(sectionsNamed(two, "methods")[0]!.heading).toBe("2. Materials and Methods");
  });
});

describe("the words of an element", () => {
  const paper = readArticle(JATS);

  it("is exported, so a caller can read a part of a paper its own way", () => {
    expect(typeof wordsOf).toBe("function");
    expect(paper.sections).not.toHaveLength(0);
  });
});

describe("full text, and the trail back and forward", () => {
  it("asks for a paper by its PubMed Central ID", async () => {
    answering(JATS);
    expect(await fullTextOf("pmc12292773")).toBe(JATS);
    expect(asked[0]!.url).toBe("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12292773/fullTextXML");
  });

  it("will not ask for something that is not one", async () => {
    answering(JATS);
    for (const bad of ["40723902", "PMC", "", "10.3390/biom15071031"]) {
      await expect(fullTextOf(bad)).rejects.toThrow(/not a PubMed Central ID/);
    }
    expect(asked).toHaveLength(0);
  });

  it("says what a 404 really means, which is that the paper is not open", async () => {
    refusing(404);
    await expect(fullTextOf("PMC1")).rejects.toThrow(/Only open-access papers can be read in full/);
    refusing(503);
    await expect(fullTextOf("PMC1")).rejects.toThrow(/answered 503/);
  });

  it("walks a reference list and the papers citing one", async () => {
    answering(JSON.stringify({ hitCount: 52, referenceList: { reference: [
      { id: "3286696", source: "MED", title: "Cloning bovine kappa-casein.", authorString: "Kang Y.", pubYear: 1988, journalAbbreviation: "Gene" },
    ] } }));
    const back = await referencesOf("MED", "40723902", { limit: 1 });
    expect(back).toMatchObject({ count: 52, page: 1, more: true });
    expect(back.papers[0]).toEqual({
      id: "3286696", source: "MED", title: "Cloning bovine kappa-casein", authors: "Kang Y.",
      journal: "Gene", year: 1988, lookAt: "https://europepmc.org/article/MED/3286696",
    });
    expect(asked[0]!.url).toContain("/MED/40723902/references?");

    answering(JSON.stringify({ hitCount: 1, citationList: { citation: [{ id: "9", source: "MED", title: "Later work." }] } }));
    const forward = await citationsOf("MED", "40723902");
    expect(forward).toMatchObject({ count: 1, more: false });
    expect(forward.papers[0]!.title).toBe("Later work");
    expect(asked[1]!.url).toContain("/MED/40723902/citations?");
  });

  it("will not put anything but an index and an ID into the path", async () => {
    answering("{}");
    await expect(referencesOf("../../etc", "40723902")).rejects.toThrow(/is not an index/);
    await expect(referencesOf("MED", "40723902/../../secret")).rejects.toThrow(/is not an article ID/);
    expect(asked).toHaveLength(0);
  });

  it("refuses a reply too large to read", async () => {
    settings.mostCharacters = 10;
    answering(JATS);
    await expect(fullTextOf("PMC1")).rejects.toThrow(/more than one ask reads/);
  });
});

describe("what an error says", () => {
  it("tells being offline from being asked for the wrong thing", async () => {
    // A request that got no answer: the device may really be offline.
    settings.transport = async () => { throw new TypeError("fetch failed"); };
    await expect(fullTextOf("PMC1")).rejects.toMatchObject({ offline: true, status: null });
    // An ID of the wrong shape never leaves the machine, so it says nothing about the network.
    await expect(fullTextOf("40723902")).rejects.toMatchObject({ offline: false, status: null });
    // An answer that was a failure is neither.
    refusing(503);
    await expect(fullTextOf("PMC1")).rejects.toMatchObject({ offline: false, status: 503 });
  });
});

describe("how a section was found", () => {
  const paper = readArticle(JATS);

  it("says whether the heading was the name or merely had the word in it", () => {
    expect(findSection(paper, "methods")).toMatchObject({ exact: true });
    expect(findSection(paper, "introduction")).toMatchObject({ exact: true });
    // No heading is "strains"; "2.1. Strains" is, so that one is exact too.
    expect(findSection(paper, "strains")).toMatchObject({ exact: true });
    expect(findSection(paper, "nothing like that")).toEqual({ sections: [], exact: false });
  });

  it("is loose when only the words are in a heading, which is the doubt worth passing on", () => {
    const vague = readArticle(JATS.replace("<title>2. Materials and Methods</title>", "<title>2. Notes on our methods of counting</title>"));
    const match = findSection(vague, "methods");
    expect(match.exact).toBe(false);
    expect(match.sections[0]!.heading).toBe("2. Notes on our methods of counting");
  });
});
