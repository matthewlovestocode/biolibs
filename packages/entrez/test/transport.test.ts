/**
 * `fetchTransport`, the default way of sending a request, against a stand-in for `fetch`.
 *
 * This is the one part of the package that is not measured against Biopython, because what it does is
 * talk to the network. These tests pin what it asks `fetch` for and how it reports what comes back.
 */
import { EntrezRequest, HTTPError, URLError, fetchTransport } from "@biolibs/entrez";
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

describe("fetchTransport", () => {
  it("sends a GET with no body and returns the reply", async () => {
    const calls = stubFetch(() => new Response("LOCUS x\n", { status: 200, headers: { "Content-Type": "text/plain" } }));
    const reply = await fetchTransport(new EntrezRequest("https://example.org/efetch.fcgi?db=x"));
    expect(calls).toEqual([["https://example.org/efetch.fcgi?db=x", { method: "GET" }]]);
    expect(reply.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(reply.body)).toBe("LOCUS x\n");
    // A Response built by hand has no address of its own, so the request's is used.
    expect(reply.url).toBe("https://example.org/efetch.fcgi?db=x");
  });

  it("sends a POST as a URL-encoded form, as urllib does", async () => {
    const calls = stubFetch(() => new Response("<x/>", { status: 200, headers: { "Content-Type": "text/xml" } }));
    const body = new TextEncoder().encode("db=pubmed&id=1");
    await fetchTransport(new EntrezRequest("https://example.org/epost.fcgi", "POST", body));
    expect(calls[0]![0]).toBe("https://example.org/epost.fcgi");
    expect(calls[0]![1]).toEqual({ method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  });

  it("reports a missing Content-Type as null", async () => {
    stubFetch(() => {
      const response = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      response.headers.delete("content-type");
      return response;
    });
    const reply = await fetchTransport(new EntrezRequest("https://example.org/x"));
    expect(reply.contentType).toBeNull();
    expect([...reply.body]).toEqual([1, 2, 3]);
  });

  it("throws HTTPError for a status that is not success", async () => {
    stubFetch(() => new Response("slow down", { status: 429, statusText: "Too Many Requests" }));
    const error = await fetchTransport(new EntrezRequest("https://example.org/x")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toBeInstanceOf(URLError);          // as in Python, an HTTPError is a URLError
    expect((error as HTTPError).code).toBe(429);
    expect((error as HTTPError).url).toBe("https://example.org/x");
    expect((error as HTTPError).message).toBe("HTTP Error 429: Too Many Requests");
  });

  it("throws URLError when fetch itself fails", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const error = await fetchTransport(new EntrezRequest("https://example.org/x")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(URLError);
    expect(error).not.toBeInstanceOf(HTTPError);
    expect((error as URLError).reason).toBe("fetch failed");
    expect((error as URLError).message).toBe("<urlopen error fetch failed>");
  });
});
