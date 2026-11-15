/**
 * `TwoBitWindow`, the twoBit reader that takes a file a window at a time.
 *
 * Biopython has no such reader, so there is nothing to record from it. What there is instead is
 * `TwoBitIterator`, which *is* verified against Biopython: every answer the windowed reader gives is
 * compared with that reader's answer on the same bytes — over every twoBit file in the golden cases
 * that parses, and over a larger file built here with N blocks, masked blocks and both byte orders.
 * The other half of the claim, that it reads only what it needs, is measured by counting bytes.
 */
import { readFileSync } from "node:fs";
import { IndexError, KeyError, PyRandom, ValueError } from "@biolibs/core";
import { TwoBitIterator, TwoBitWindow, blobSource, bytesSource, countingSource, urlSource } from "@biolibs/seqio";
import { describe, expect, it } from "vitest";

const golden = JSON.parse(readFileSync(new URL("./golden/seqio-twobit.json", import.meta.url), "utf8")) as { cases: { bytes?: string }[] };
const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

interface Entry { name: string; dna: string; nBlocks: [number, number][]; maskBlocks: [number, number][] }

/**
 * Write a twoBit file. Not part of the package, which only reads the format: a test fixture, checked
 * by reading what it writes with the verified reader.
 *
 * @param entries - The sequences, with their N and masked blocks as `[start, size]`.
 * @param little - Byte order. @returns The file's bytes.
 */
function writeTwoBit(entries: Entry[], little = true): Uint8Array {
  const codes: Record<string, number> = { T: 0, C: 1, A: 2, G: 3 };
  const records = entries.map((e) => {
    const packed = new Uint8Array(Math.ceil(e.dna.length / 4));
    for (let i = 0; i < e.dna.length; i++) packed[i >> 2]! |= codes[e.dna[i]!]! << (6 - 2 * (i % 4));
    const words = [e.dna.length, e.nBlocks.length, ...e.nBlocks.map((b) => b[0]), ...e.nBlocks.map((b) => b[1]),
      e.maskBlocks.length, ...e.maskBlocks.map((b) => b[0]), ...e.maskBlocks.map((b) => b[1]), 0];
    return { words, packed, size: 4 * words.length + packed.length };
  });
  const indexSize = entries.reduce((sum, e) => sum + 1 + e.name.length + 4, 0);
  const out = new Uint8Array(16 + indexSize + records.reduce((sum, r) => sum + r.size, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  const word = (value: number) => { view.setUint32(at, value, little); at += 4; };
  [0x1a412743, 0, entries.length, 0].forEach(word);
  let offset = 16 + indexSize;
  entries.forEach((e, i) => {
    out[at++] = e.name.length;
    out.set(latin1(e.name), at);
    at += e.name.length;
    word(offset);
    offset += records[i]!.size;
  });
  for (const r of records) {
    r.words.forEach(word);
    out.set(r.packed, at);
    at += r.packed.length;
  }
  return out;
}

/** A made-up genome: three sequences of very different lengths, with unknown and masked runs. @param rnd - A seeded generator. @returns Its entries. */
function genome(rnd: PyRandom): Entry[] {
  const dna = (n: number) => Array.from({ length: n }, () => "TCAG"[rnd.randrange(4)]).join("");
  const blocks = (length: number, count: number): [number, number][] => {
    // Distinct starts, and each block stopping short of the next, as in a real file: blocks never overlap.
    const starts = [...new Set(Array.from({ length: count }, () => rnd.randrange(length)))].sort((a, b) => a - b);
    return starts.map((start, i) => [start, Math.min(rnd.randrange(1, 400), (starts[i + 1] ?? length) - start - 1)] as [number, number])
      .filter(([start, size]) => size >= 1 && start + size <= length);
  };
  return [["chrA", 250_001], ["chrB", 37], ["chrC", 60_000]].map(([name, length]) => ({
    name: name as string, dna: dna(length as number), nBlocks: blocks(length as number, 12), maskBlocks: blocks(length as number, 300),
  }));
}

/** Compare the windowed reader with the verified one over a file. @param bytes - A twoBit file. @param rnd - Chooses the windows. */
async function agree(bytes: Uint8Array, rnd: PyRandom): Promise<number> {
  const reference = new TwoBitIterator(bytes);
  const windowed = await TwoBitWindow.open(bytesSource(bytes));
  expect(windowed.names).toEqual([...reference.keys()]);
  let compared = 0;
  for (const name of windowed.names) {
    const whole = reference.get(name).seq!;
    const length = whole.length;
    expect(await windowed.lengthOf(name)).toBe(length);
    const windows: [number, number][] = [[0, length], [0, 0], [length, length], [0, Math.min(1, length)], [Math.max(0, length - 1), length]];
    for (let i = 0; i < 25; i++) {
      const start = rnd.randrange(length + 1);
      windows.push([start, start + rnd.randrange(Math.min(600, length - start) + 1)]);
    }
    for (const [start, end] of windows) {
      expect(await windowed.fetch(name, start, end), `${name}[${start}:${end}]`).toBe(whole.slice(start, end).toString());
      compared++;
    }
  }
  return compared;
}

describe("TwoBitWindow agrees with TwoBitIterator", () => {
  it("on every golden twoBit file that parses", async () => {
    const rnd = new PyRandom(3);
    let files = 0;
    let refused = 0;
    for (const c of golden.cases) {
      if (c.bytes === undefined) continue;
      const bytes = latin1(c.bytes);
      let reference: TwoBitIterator;
      try {
        reference = new TwoBitIterator(bytes);
        for (const name of reference.keys()) reference.get(name).seq!.toString();   // skip files whose bases cannot be read
      } catch {
        continue;
      }
      try {
        await agree(bytes, rnd);
        files++;
      } catch (error) {
        // Some golden files are cut short in ways Biopython happens to tolerate, reading a missing
        // number as zero. The windowed reader refuses those, and says where the file ended.
        if (!(error instanceof ValueError) || !/past the end of the file|ends inside the record/.test(error.message)) throw error;
        refused++;
      }
    }
    expect(files).toBeGreaterThan(20);
    expect(refused).toBeLessThan(files);
  });

  it.each([true, false])("on a 310,000-base file with N and masked blocks (little-endian: %s)", async (little) => {
    const rnd = new PyRandom(11);
    expect(await agree(writeTwoBit(genome(rnd), little), rnd)).toBe(90);
  });
});

describe("TwoBitWindow reads only what it needs", () => {
  it("takes the index on opening, one sequence's tables on first use, then a byte for every four bases", async () => {
    const bytes = writeTwoBit(genome(new PyRandom(11)));
    const source = countingSource(bytesSource(bytes));
    const file = await TwoBitWindow.open(source);
    expect(source.requests).toBe(1);                 // header and the list of sequences, in one read
    const afterOpen = source.bytesRead;

    await file.fetch("chrA", 100_000, 100_060);
    const first = source.bytesRead - afterOpen;
    expect(source.requests).toBe(1 + 3 + 1);          // the sequence's three tables, then the bases
    await file.fetch("chrA", 200_000, 200_060);
    expect(source.requests).toBe(1 + 3 + 1 + 1);      // tables are remembered: bases only
    expect(source.bytesRead - afterOpen - first).toBe(15);   // 60 bases are 15 bytes

    // Everything after opening — a 250,001-base sequence's tables and two windows — came to a few kilobytes.
    expect(source.bytesRead - afterOpen).toBeLessThan(4000);
    expect(afterOpen).toBe(4096);                    // the first read; the list of sequences fits inside it
    expect(bytes.length).toBeGreaterThan(70_000);
  });

  it("works through a Blob and through HTTP range requests", async () => {
    const rnd = new PyRandom(11);
    const bytes = writeTwoBit(genome(rnd));
    const expected = new TwoBitIterator(bytes).get("chrC").seq!.slice(1234, 1300).toString();

    const fromBlob = await TwoBitWindow.open(blobSource(new Blob([bytes])));
    expect(await fromBlob.fetch("chrC", 1234, 1300)).toBe(expected);

    const ranges: string[] = [];
    const server = (async (_url: string, init?: RequestInit) => {
      const header = (init!.headers as Record<string, string>).Range;
      ranges.push(header);
      const [from, to] = /bytes=(\d+)-(\d+)/.exec(header)!.slice(1).map(Number) as [number, number];
      const body = bytes.slice(from, to + 1);
      return new Response(body, { status: 206, headers: { "Content-Range": `bytes ${from}-${from + body.length - 1}/${bytes.length}` } });
    }) as unknown as typeof fetch;
    const source = await urlSource("https://example.org/genome.2bit", server);
    expect(source.size).toBe(bytes.length);
    const fromUrl = await TwoBitWindow.open(source);
    expect(await fromUrl.fetch("chrC", 1234, 1300)).toBe(expected);
    expect(ranges[0]).toBe("bytes=0-0");             // the request that finds the size
  });

  it("copes with a server that ignores Range and sends the whole file", async () => {
    const bytes = writeTwoBit(genome(new PyRandom(11)));
    const server = (async () => new Response(bytes, { status: 200, headers: { "Content-Length": String(bytes.length) } })) as unknown as typeof fetch;
    const file = await TwoBitWindow.open(await urlSource("https://example.org/genome.2bit", server));
    expect(await file.fetch("chrB", 0, 37)).toBe(new TwoBitIterator(bytes).get("chrB").seq!.toString());
  });
});

describe("TwoBitWindow refuses", () => {
  const file = writeTwoBit([{ name: "s", dna: "ACGTACGT", nBlocks: [], maskBlocks: [] }]);

  it("what TwoBitIterator refuses, in the same words", async () => {
    for (const bad of [new Uint8Array(0), latin1("not a twobit file"), file.map((b, i) => (i === 4 ? 1 : b)), file.map((b, i) => (i === 4 ? 2 : b)),
      file.map((b, i) => (i === 12 ? 1 : b))]) {
      let expected = "";
      try {
        new TwoBitIterator(bad);
      } catch (error) {
        expected = (error as Error).message;
      }
      expect(expected).not.toBe("");
      await expect(TwoBitWindow.open(bytesSource(bad))).rejects.toThrow(new ValueError(expected));
    }
  });

  it("a name that is not there, and a window that is not inside the sequence", async () => {
    const opened = await TwoBitWindow.open(bytesSource(file));
    await expect(opened.lengthOf("missing")).rejects.toBeInstanceOf(KeyError);
    for (const [start, end] of [[-1, 4], [0, 9], [5, 4], [0.5, 2]] as const) {
      await expect(opened.fetch("s", start, end)).rejects.toBeInstanceOf(IndexError);
    }
    expect(await opened.fetch("s", 0, 8)).toBe("ACGTACGT");
    expect(await opened.blocksOf("s")).toEqual({ nBlocks: [], maskBlocks: [] });
  });

  it("a file that ends early", async () => {
    await expect(TwoBitWindow.open(bytesSource(file.slice(0, 18)))).rejects.toThrow("The list of sequences runs past the end of the file.");
    const opened = await TwoBitWindow.open(bytesSource(file.slice(0, 26)));
    await expect(opened.lengthOf("s")).rejects.toThrow("The file ends inside the record for s.");
    await expect(urlSource("https://example.org/x", (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow("HTTP 404");
  });
});
