/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments. Nothing here touches the network: where the README fetches, a stand-in replies.
 */
import { EUTILS, EntrezRequest, HTTPError, type Transport, buildRequest, efetch, esearch, formatIds, quotePlus, settings, throttle,
  urlencode } from "@biolibs/entrez";
import { read } from "@biolibs/seqio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const GENBANK = `LOCUS       EU490707                  12 bp    DNA     linear   PLN 26-JUL-2016
DEFINITION  A made-up record standing in for the real one.
ACCESSION   EU490707
VERSION     EU490707.1
ORIGIN
        1 tcatttgggg at
//
`;

const defaults = { ...settings };
let sentRequests: EntrezRequest[] = [];

/** A transport that records the request and answers with fixed text. @param body - The reply. @param contentType - Its type. @returns The transport. */
const replying = (body: string, contentType = "text/plain"): Transport => async (request) => {
  sentRequests.push(request);
  return { url: request.fullUrl, contentType, body: new TextEncoder().encode(body) };
};

beforeEach(() => {
  sentRequests = [];
  settings.email = "a.n.other@example.com";
  settings.now = () => 1000;
  settings.sleep = async () => {};
});
afterEach(() => {
  Object.assign(settings, defaults);
  throttle.previous = 0;
});

describe("README: say who you are", () => {
  it("has Biopython's defaults", () => {
    Object.assign(settings, defaults);
    expect(settings.email).toBeNull();
    expect(settings.tool).toBe("biopython");
    expect(settings.apiKey).toBeNull();
  });
});

describe("README: fetching a record", () => {
  it("returns text that seqio reads", async () => {
    settings.transport = replying(GENBANK);
    const handle = await efetch("nucleotide", { id: "EU490707", rettype: "gb", retmode: "text" });
    expect(handle.url).toBe(sentRequests[0]!.fullUrl);
    expect(handle.text).toBe(true);
    expect(read(handle.readText(), "genbank").id).toBe("EU490707.1");
    expect(handle.read()).toBe(GENBANK);
    expect(handle.bytes).toBeInstanceOf(Uint8Array);
  });
});

describe("README: searching", () => {
  it("sends the query and returns XML as bytes", async () => {
    settings.transport = replying("<eSearchResult/>", "text/xml");
    const handle = await esearch("nucleotide", "Opuntia[orgn] AND rpl16", { retmax: 5, idtype: "acc" });
    expect(handle.readText()).toBe("<eSearchResult/>");
    expect(handle.read()).toBeInstanceOf(Uint8Array);
    expect(sentRequests[0]!.fullUrl).toBe(
      `${EUTILS}esearch.fcgi?db=nucleotide&term=Opuntia%5Borgn%5D+AND+rpl16&retmax=5&idtype=acc&tool=biopython&email=a.n.other%40example.com`,
    );
  });
});

describe("README: the request, without sending it", () => {
  it("builds a GET", () => {
    const request = buildRequest(`${EUTILS}esearch.fcgi`, { db: "pubmed", term: "biopython[title]", retmax: 20 });
    expect(request.method).toBe("GET");
    expect(request.fullUrl).toBe(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=biopython%5Btitle%5D&retmax=20&tool=biopython&email=a.n.other%40example.com",
    );
  });

  it("switches to POST for a long list of identifiers", () => {
    const ids = Array.from({ length: 200 }, (_, i) => 1000 + i);
    const big = buildRequest(`${EUTILS}efetch.fcgi`, { db: "nucleotide", id: ids });
    expect(big.method).toBe("POST");
    expect(big.fullUrl).toBe(`${EUTILS}efetch.fcgi`);
    expect(new TextDecoder().decode(big.data!).slice(0, 30)).toBe("db=nucleotide&id=1000%2C1001%2");
    expect(buildRequest(`${EUTILS}efetch.fcgi`, { db: "nucleotide", id: ids.slice(0, 50) }).method).toBe("GET");
  });
});

describe("README: identifiers", () => {
  it("joins and tidies them", () => {
    expect(formatIds(19304878)).toBe("19304878");
    expect(formatIds(" 1 , 2 ,3 ")).toBe("1,2,3");
    expect(formatIds(["EU490707", 19304878])).toBe("EU490707,19304878");
  });

  it("repeats id for elink", () => {
    const url = buildRequest(`${EUTILS}elink.fcgi`, { dbfrom: "protein", db: "gene", id: ["15718680", "157427902"] }, null, false, false).fullUrl;
    expect(url).toBe(`${EUTILS}elink.fcgi?dbfrom=protein&db=gene&id=15718680&id=157427902&tool=biopython&email=a.n.other%40example.com`);
  });
});

describe("README: URL encoding", () => {
  it("matches Python's urlencode", () => {
    expect(quotePlus("Opuntia[orgn] AND rpl16")).toBe("Opuntia%5Borgn%5D+AND+rpl16");
    expect(quotePlus("it's (here)!*~")).toBe("it%27s+%28here%29%21%2A~");
    expect(quotePlus("日本")).toBe("%E6%97%A5%E6%9C%AC");
    expect(urlencode(new Map<string, unknown>([["id", [1, 2]], ["usehistory", true], ["retmax", null]]))).toBe(
      "id=1&id=2&usehistory=True&retmax=None",
    );
  });
});

describe("README: pacing and retries", () => {
  it("has Biopython's retry policy, and reports a failure as HTTPError", async () => {
    expect(settings.maxTries).toBe(3);
    expect(settings.sleepBetweenTries).toBe(15);
    let attempts = 0;
    settings.transport = async (request) => {
      attempts++;
      throw new HTTPError(request.fullUrl, 429, "Too Many Requests");
    };
    const error = await efetch("nucleotide", { id: "EU490707", rettype: "gb", retmode: "text" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).code).toBe(429);
    expect((error as HTTPError).message).toBe("HTTP Error 429: Too Many Requests");
    expect(attempts).toBe(3);
  });
});

describe("README: replacing the network", () => {
  it("uses the transport it is given", async () => {
    const canned: Transport = async (request) => ({
      url: request.fullUrl,
      contentType: "text/plain",
      body: new TextEncoder().encode(">made-up record\nACGT\n"),
    });
    settings.transport = canned;
    const handle = await efetch("nucleotide", { id: "anything", rettype: "fasta", retmode: "text" });
    expect(handle.readText()).toBe(">made-up record\nACGT\n");
  });
});
