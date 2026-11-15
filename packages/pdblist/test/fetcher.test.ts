/**
 * `fetchBytes`, the default way of sending a request, against a stand-in for `fetch`; and `gunzip`
 * against Node's own zlib, for the parts of a gzip file the golden cases do not reach.
 *
 * `fetchBytes` is the one part of the package that is not measured against Biopython, because what it
 * does is talk to the network. These tests pin what it asks `fetch` for and how it reports the answer.
 */
import { gzipSync } from "node:zlib";
import { ASSEMBLY_SEARCH_URL, BadGzipFile, EOFError, HTTPError, PDBE_ARCHIVE, PDBList, URLError, assemblyNumber, crc32, fetchBytes, gunzip, viaMirror } from "@biolibs/pdblist";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

/** Replace `fetch`, recording how it was called. @param respond - What it should do. @returns The calls made. */
function stubFetch(respond: () => Response | Promise<Response>): [string, RequestInit | undefined][] {
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return respond();
  });
  return calls;
}

describe("fetchBytes", () => {
  it("sends a GET with no body or headers and returns the bytes", async () => {
    const calls = stubFetch(() => new Response(Uint8Array.of(1, 2, 255), { status: 200 }));
    const body = await fetchBytes({ url: "https://example.org/x.gz", method: "GET", data: null, headers: {} });
    expect(calls).toEqual([["https://example.org/x.gz", { method: "GET" }]]);
    expect([...body]).toEqual([1, 2, 255]);
  });

  it("sends a POST with its body, leaving Content-Length to fetch", async () => {
    const calls = stubFetch(() => new Response("{}", { status: 200 }));
    const data = new TextEncoder().encode("{}");
    await fetchBytes({ url: "https://example.org/q", method: "POST", data, headers: { "Content-Type": "application/json", "Content-Length": "2" } });
    expect(calls).toEqual([["https://example.org/q", { method: "POST", body: data, headers: { "Content-Type": "application/json" } }]]);
  });

  it("raises HTTPError for a status that is not success", async () => {
    stubFetch(() => new Response("gone", { status: 404, statusText: "Not Found" }));
    const error = await fetchBytes({ url: "https://example.org/x", method: "GET", data: null, headers: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).message).toBe("HTTP Error 404: Not Found");
    expect((error as HTTPError).code).toBe(404);
  });

  it("raises URLError when fetch itself fails", async () => {
    stubFetch(() => { throw new TypeError("fetch failed"); });
    const error = await fetchBytes({ url: "https://example.org/x", method: "GET", data: null, headers: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(URLError);
    expect((error as URLError).message).toBe("<urlopen error fetch failed>");
  });

  it("is what a PDBList uses unless given another, end to end", async () => {
    const calls = stubFetch(() => new Response(gzipSync("data_4HHB\n"), { status: 200 }));
    const file = await new PDBList({ verbose: false }).retrievePdbFile("4HHB", { fileFormat: "mmCif" });
    expect(calls[0]![0]).toBe("https://files.wwpdb.org/pub/pdb/data/structures/divided/mmCIF/hh/4hhb.cif.gz");
    expect(file?.name).toBe("4hhb.cif");
    expect(new TextDecoder().decode(file?.data)).toBe("data_4HHB\n");
  });

  it("lets a missing structure through as null, with the line Biopython prints", async () => {
    stubFetch(() => new Response("", { status: 404, statusText: "Not Found" }));
    const lines: string[] = [];
    const file = await new PDBList({ verbose: false, stdout: (l) => lines.push(l) }).retrievePdbFile("9zzz", { fileFormat: "pdb" });
    expect(file).toBeNull();
    expect(lines).toEqual(["Desired structure not found or download failed. '9zzz': HTTP Error 404: Not Found"]);
  });
});

describe("viaMirror", () => {
  it("asks the mirror for archive files and leaves everything else alone", async () => {
    const calls = stubFetch(() => new Response(gzipSync("x"), { status: 200 }));
    const pdbl = new PDBList({ fetcher: viaMirror(), verbose: false });
    await pdbl.retrievePdbFile("4HHB", { fileFormat: "pdb" });
    await pdbl.retrieveAssemblyFile("4HHB", 1, { fileFormat: "mmCif" });
    await pdbl.getAllObsolete();
    await pdbl.getAllAssemblies().catch(() => null);
    expect(calls.map(([url]) => url)).toEqual([
      `${PDBE_ARCHIVE}/data/structures/divided/pdb/hh/pdb4hhb.ent.gz`,
      `${PDBE_ARCHIVE}/data/assemblies/mmCIF/all/4hhb-assembly1.cif.gz`,
      `${PDBE_ARCHIVE}/data/status/obsolete.dat`,
      ASSEMBLY_SEARCH_URL,
    ]);
  });

  it("takes another mirror, another fetcher and another archive", async () => {
    const asked: string[] = [];
    const fetcher = viaMirror("https://mirror.example/pdb", async (request) => { asked.push(request.url); return new Uint8Array(0); }, "https://my.example/pub/pdb");
    await new PDBList({ server: "https://my.example", fetcher, verbose: false }).getAllEntries();
    expect(asked).toEqual(["https://mirror.example/pdb/derived_data/index/entries.idx"]);
  });
});

describe("gunzip", () => {
  const text = "ATOM      1  N   VAL A   1       6.204  16.869   4.854  1.00 49.05           N\n".repeat(500);

  it("reads what zlib writes, at every level", () => {
    for (const level of [0, 1, 6, 9]) {
      expect(new TextDecoder().decode(gunzip(gzipSync(text, { level })))).toBe(text);
    }
    expect(gunzip(new Uint8Array(0)).length).toBe(0);
  });

  it("steps over a header with a file name, a comment, an extra field and a header checksum", () => {
    const plain = gzipSync("hello");
    const body = plain.subarray(10);
    const header = Uint8Array.of(0x1f, 0x8b, 8, 4 | 8 | 16 | 2, 0, 0, 0, 0, 0, 3, /* extra */ 3, 0, 9, 9, 9, /* name */ 97, 46, 98, 0, /* comment */ 99, 0, /* hcrc */ 0, 0);
    const file = new Uint8Array(header.length + body.length);
    file.set(header);
    file.set(body, header.length);
    expect(new TextDecoder().decode(gunzip(file))).toBe("hello");
    expect(() => gunzip(header.subarray(0, 17))).toThrow(EOFError);
  });

  it("joins members and ignores zero padding", () => {
    const a = gzipSync("one,"), b = gzipSync("two");
    const file = new Uint8Array(a.length + 3 + b.length);
    file.set(a);
    file.set(b, a.length + 3);
    expect(new TextDecoder().decode(gunzip(file))).toBe("one,two");
  });

  it("refuses a wrong method, a wrong length and damaged data", () => {
    const good = gzipSync("hello");
    const method = Uint8Array.from(good); method[2] = 7;
    expect(() => gunzip(method)).toThrow(new BadGzipFile("Unknown compression method"));
    const length = Uint8Array.from(good); length[length.length - 4] = 9;
    expect(() => gunzip(length)).toThrow(new BadGzipFile("Incorrect length of data produced"));
    const damaged = Uint8Array.from(good); damaged[10] = 0xff;
    expect(() => gunzip(damaged)).toThrow(/Error -3 while decompressing data/);
  });

  it("computes the checksum zlib computes", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(907060870);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("assemblyNumber", () => {
  it("is Python's int() for the values JavaScript can hand it", () => {
    expect(assemblyNumber(" 02 ")).toBe(2);
    expect(assemblyNumber(1.7)).toBe(1);
    expect(assemblyNumber(-1.7)).toBe(-1);
    expect(assemblyNumber(true)).toBe(1);
    expect(assemblyNumber(false)).toBe(0);
    expect(assemblyNumber(3n)).toBe(3);
    expect(() => assemblyNumber(Number.NaN)).toThrow("cannot convert float NaN to integer");
    expect(() => assemblyNumber(Number.POSITIVE_INFINITY)).toThrow("cannot convert float infinity to integer");
  });
});
