/**
 * Every case in `golden/blast.json` was recorded from Biopython 1.88 by running the real `qblast`
 * with `urlopen`, the clock and `sleep` replaced, so what is compared here is the bytes it would
 * have sent, the ticket it read, the gaps it left and the words it warned with.
 *
 * Nothing here touches the network either: the transport is a stand-in that answers from a script.
 */
import { readFileSync } from "node:fs";
import { ValueError } from "@biolibs/core";
import { getOf, putOf, qblast, readRefPage, settings } from "@biolibs/blast";
import { beforeEach, describe, expect, it } from "vitest";

interface Sent { url: string; method: string; body: string; headers: Record<string, string> }
interface Case {
  searches: { search: Record<string, unknown>; sent?: Sent[]; slept?: number[]; warnings?: string[];
              error?: { type: string; message: string } }[];
  refpages: { page: string; rid?: string | null; rtoe?: number | null; error?: { type: string; message: string } }[];
  programs: { program: string; ok?: boolean; error?: { type: string; message: string } }[];
}
const cases: Case = JSON.parse(readFileSync(new URL("./golden/blast.json", import.meta.url), "utf8"));

/** Biopython's parameter names, as this package spells them. */
const SPELT: Record<string, string> = {
  url_base: "urlBase", entrez_query: "entrezQuery", hitlist_size: "hitlistSize", matrix_name: "matrixName",
  short_query: "shortQuery", word_size: "wordSize", format_type: "formatType", i_thresh: "iThresh",
};
const asSearch = (python: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(python).map(([key, value]) => [SPELT[key] ?? key, value])) as never;

/** A transport that answers from a script and records what it was given. */
function scripted(pages: string[]): { sent: Sent[]; slept: number[] } {
  const sent: Sent[] = [], slept: number[] = [];
  let clock = 1000;
  settings.previous = 0;
  settings.now = () => clock;
  settings.sleep = async (seconds) => { slept.push(Number(seconds.toFixed(6))); clock += seconds; };
  settings.transport = async (request: never) => {
    const one = request as unknown as { fullUrl: string; method: string; data: Uint8Array };
    sent.push({ url: one.fullUrl, method: one.method, body: new TextDecoder().decode(one.data), headers: {} });
    return { url: one.fullUrl, contentType: "text/html", body: new TextEncoder().encode(pages.shift()!) };
  };
  return { sent, slept };
}

beforeEach(() => { settings.email = null; settings.tool = "biopython"; settings.previous = 0; });

describe("a search, against Biopython's own requests", () => {
  for (const [at, one] of cases.searches.entries()) {
    const name = `${String(one.search["program"])} ${String(one.search["database"])}`;
    it(`${at + 1}. builds what Biopython builds for ${name}`, async () => {
      // Each format's results begin differently, and qblast checks it, so each case is answered
      // with a page that format would really begin with — the same pages the recording used.
      const begins: Record<string, string> = {
        XML: '<?xml version="1.0"?>\n<BlastOutput></BlastOutput>\n', HTML: "<!DOCTYPE html >\n<html></html>\n",
        Text: "<p><!--\nQBlastInfoBegin\n-->\n", Tabular: "<p><!--\nQBlastInfoBegin\n-->\n",
        XML2: "PK\u0003\u0004zipped", JSON2: "PK\u0003\u0004zipped",
      };
      const pages = (one.sent ?? []).map((_, i) => (i === 0
        ? "<html><!--\n    QBlastInfoBegin\n    RID = ABC123XYZ\n    RTOE = 27\n    QBlastInfoEnd\n--></html>\n"
        : begins[String(one.search["format_type"] ?? "XML")]!));
      const { sent, slept } = scripted(pages);
      if (one.error !== undefined) {
        await expect(qblast(asSearch(one.search))).rejects.toThrow(one.error.message);
        return;
      }
      const found = await qblast(asSearch(one.search));
      expect(sent.map((x) => x.body)).toEqual(one.sent!.map((x) => x.body));
      expect(sent.map((x) => x.url)).toEqual(one.sent!.map((x) => x.url));
      expect(slept).toEqual(one.slept);
      expect(found.rid).toBe("ABC123XYZ");
      expect(found.rtoe).toBe(27);
    });
  }

  it("warns the way Biopython warns about NCBI's short-query parameter", () => {
    const short = cases.searches.find((one) => (one.warnings ?? []).length > 0)!;
    const put = putOf(asSearch(short.search));
    expect(put.warnings.map((w) => w.message)).toEqual(short.warnings);
    // And the workaround it applies: an expect of 1000, written as an int the way Python writes one.
    expect(put.body).toContain("EXPECT=1000&");
  });

  it("drops NCBI's short-query parameter for blastn however long the sequence is", () => {
    const long = cases.searches.find((one) => one.search["short_query"] !== undefined
      && String(one.search["sequence"]).length >= 31)!;
    // Biopython clears it for blastn whatever the length, because NCBI's own handling of it is
    // broken; what the length decides is only whether the parameters it stood for are set by hand.
    expect(putOf(asSearch(long.search)).warnings).toEqual([]);
    expect(putOf(asSearch(long.search)).body).not.toContain("SHORT_QUERY_ADJUST");
    expect(putOf(asSearch(long.search)).body).toContain("EXPECT=10.0");
  });

  it("reads the estimate as a whole number of seconds, and refuses one that is not", () => {
    expect(readRefPage("RID = A\nRTOE = 27\n")).toEqual({ rid: "A", rtoe: 27 });
    expect(() => readRefPage("RID = A\nRTOE = soon\n"))
      .toThrow("A non-integer RTOE found in the 'please wait' page, 'soon'");
  });
});

describe("the program it is given", () => {
  for (const one of cases.programs) {
    it(one.ok === true ? `takes ${one.program}` : `refuses ${JSON.stringify(one.program)} as Biopython does`, () => {
      const search = asSearch({ program: one.program, database: "nt", sequence: "ACGT" });
      if (one.ok === true) expect(() => putOf(search)).not.toThrow();
      else expect(() => putOf(search)).toThrow(new ValueError(one.error!.message));
    });
  }
});

describe("the please-wait page", () => {
  for (const [at, one] of cases.refpages.entries()) {
    it(`${at + 1}. reads it the way Biopython reads it`, () => {
      if (one.error !== undefined) expect(() => readRefPage(one.page)).toThrow(one.error.message);
      else expect(readRefPage(one.page)).toEqual({ rid: one.rid, rtoe: one.rtoe });
    });
  }
});

describe("the two requests on their own", () => {
  it("builds a Put without sending anything", () => {
    expect(putOf({ program: "blastn", database: "nt", sequence: "ACGT" }).body)
      .toBe("DATABASE=nt&ENTREZ_QUERY=%28none%29&EXPECT=10.0&HITLIST_SIZE=50&PROGRAM=blastn&QUERY=ACGT&CMD=Put&tool=biopython");
  });

  it("builds a Get without sending anything", () => {
    expect(getOf({ program: "blastn", database: "nt", sequence: "ACGT" }, "ABC123").body)
      .toBe("ALIGNMENTS=500&DESCRIPTIONS=500&FORMAT_TYPE=XML&RID=ABC123&CMD=Get");
  });

  it("sends who is asking only to NCBI, since a BLAST of your own has no use for it", () => {
    settings.email = "a.n.other@example.com";
    expect(putOf({ program: "blastn", database: "nt", sequence: "ACGT" }).body)
      .toContain("&email=a.n.other%40example.com&tool=biopython");
    expect(putOf({ program: "blastn", database: "nt", sequence: "ACGT", urlBase: "https://blast.example/Blast.cgi" }).body)
      .not.toContain("email=");
  });
});
