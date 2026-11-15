/**
 * Replays the PDBList golden cases (reference/golden/gen_pdblist_cases.py) recorded from Biopython.
 *
 * Each case is one method call with the network replaced by scripted replies. What is compared is the
 * requests made, in order; the lines printed to stdout and stderr; and what came back or was raised.
 * Where Biopython returns the path of a file it wrote, the case holds that file's name and contents.
 */
import { readFileSync } from "node:fs";
import { type Fetcher, HTTPError, PDBList, type PdbRequest, URLError } from "@biolibs/pdblist";
import { describe, expect, it } from "vitest";

type Reply = string | [kind: "http", code: number, msg: string] | [kind: "url", reason: string];
interface Case {
  kind: string; args: unknown[]; replies: Reply[]; verbose: boolean; server: string | null;
  value?: unknown; exc?: { type: string; msg: string };
  requests: { url: string; data?: string | null; headers?: [string, string][] }[]; stdout: string; stderr: string;
}

const { cases } = JSON.parse(readFileSync(new URL("./golden/pdblist.json", import.meta.url), "utf8")) as { cases: Case[] };

/** Bytes from the latin-1 text the generator writes them as. */
const bytes = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
/** And back. */
const latin1 = (data: Uint8Array): string => Array.from(data, (b) => String.fromCharCode(b)).join("");
/** A fetched file as the generator records one. */
const shown = (file: { name: string; data: Uint8Array | null } | null): unknown =>
  file === null ? null : { name: file.name, data: file.data === null ? null : latin1(file.data) };

/** Run one case against the port. @returns What the generator recorded for Biopython, in the same shape. */
async function replay(c: Case): Promise<Partial<Case>> {
  const replies = [...c.replies];
  const requests: Case["requests"] = [];
  const out: string[] = [], err: string[] = [];
  const fetcher: Fetcher = async (request: PdbRequest) => {
    // urllib hands a plain download over as a bare address, and a POST as a request with its headers,
    // which it re-capitalises; the generator records what it was handed.
    requests.push(request.data === null ? { url: request.url } : {
      url: request.url, data: latin1(request.data),
      headers: Object.entries(request.headers).map(([k, v]): [string, string] => [k[0]!.toUpperCase() + k.slice(1).toLowerCase(), v]).sort(),
    });
    const reply = replies.length > 0 ? replies.shift()! : "";
    if (typeof reply !== "string") throw reply[0] === "http" ? new HTTPError(request.url, reply[1], reply[2]) : new URLError(reply[1]);
    return bytes(reply);
  };
  const pl = new PDBList({ ...(c.server === null ? {} : { server: c.server }), verbose: c.verbose, fetcher, stdout: (l) => out.push(`${l}\n`), stderr: (l) => err.push(`${l}\n`) });
  const got: Partial<Case> = {};
  try {
    const [a, b, , d] = c.args as [string, never, null, string | null];
    if (c.kind === "retrieve_pdb_file") got.value = shown(await pl.retrievePdbFile(a, { obsolete: b, fileFormat: d }));
    else if (c.kind === "retrieve_assembly_file") got.value = shown(await pl.retrieveAssemblyFile(a, b, { fileFormat: d }));
    else if (c.kind === "get_status_list") got.value = await PDBList.getStatusList(a, fetcher);
    else if (c.kind === "get_recent_changes") got.value = await pl.getRecentChanges();
    else if (c.kind === "get_all_entries") got.value = await pl.getAllEntries();
    else if (c.kind === "get_all_obsolete") got.value = await pl.getAllObsolete();
    else if (c.kind === "get_all_assemblies") got.value = await pl.getAllAssemblies();
    else if (c.kind === "get_all_assemblies_twice") got.value = [await pl.getAllAssemblies(), await pl.getAllAssemblies()];
    else if (c.kind === "get_seqres_file") got.value = shown(await (c.args.length > 0 ? pl.getSeqresFile(a) : pl.getSeqresFile()));
    else throw new Error(`unknown kind ${c.kind}`);
  } catch (error) {
    const e = error as Error;
    // The parser's wording for bad JSON is the engine's own, so only the type is held to Python's.
    const msg = e.name === "KeyError" ? `'${e.message}'` : e.name === "JSONDecodeError" ? c.exc?.msg ?? e.message : e.message;
    got.exc = { type: e.name, msg };
  }
  return { ...got, requests, stdout: out.join(""), stderr: err.join("") };
}

/** A case Biopython can only answer the way it does because it writes to a directory. */
const needsDisk = (c: Case): boolean => c.stdout.includes("<dir>");

describe("PDBList against Biopython", () => {
  const kinds = [...new Set(cases.map((c) => c.kind))];
  for (const kind of kinds) {
    const mine = cases.filter((c) => c.kind === kind && !needsDisk(c));
    it(`${kind} (${mine.length} cases)`, async () => {
      for (const c of mine) {
        const want: Partial<Case> = { ...("exc" in c ? { exc: c.exc } : { value: c.value }), requests: c.requests, stdout: c.stdout, stderr: c.stderr };
        expect(await replay(c), `${kind} ${JSON.stringify(c.args)} server=${c.server} verbose=${c.verbose}`).toEqual(want);
      }
    });
  }

  it("covers every recorded case but the one that depends on a directory", () => {
    expect(cases.length).toBe(395);
    const skipped = cases.filter(needsDisk);
    // An empty code with the mmtf format names the directory itself as the download, which fails on disk.
    expect(skipped.map((c) => [c.kind, c.args[0], c.args[3]])).toEqual([["retrieve_pdb_file", "", "mmtf"]]);
  });
});
