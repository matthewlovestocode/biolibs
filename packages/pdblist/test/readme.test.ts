/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * Each `it` mirrors one section; the assertions are the outputs the README prints as comments. Nothing
 * here touches the network: where the README fetches, a stand-in replies and notes what was asked.
 */
import { gzipSync } from "node:zlib";
import { MMCIFParser } from "@biolibs/pdb";
import { BadGzipFile, type Fetcher, HTTPError, PDBList, gunzip, structureTarget, viaMirror } from "@biolibs/pdblist";
import { describe, expect, it } from "vitest";

const CIF = `data_4HHB
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.pdbx_PDB_model_num
ATOM 1 N N . VAL A 1 1 ? 6.204 16.869 4.854 1.00 49.05 1 A 1
ATOM 2 C CA . VAL A 1 1 ? 6.913 17.759 4.607 1.00 43.14 1 A 1
#
`;

/** A fetcher that notes each address and answers from a table of bodies by the address's ending. */
function serving(table: Record<string, Uint8Array | string>, asked: string[] = []): Fetcher {
  return async (request) => {
    asked.push(request.url);
    for (const [ending, body] of Object.entries(table)) {
      if (request.url.endsWith(ending)) return typeof body === "string" ? new TextEncoder().encode(body) : body;
    }
    throw new HTTPError(request.url, 404, "Not Found");
  };
}

describe("README: fetching a structure", () => {
  it("returns a file the mmCIF parser reads", async () => {
    const asked: string[] = [];
    const pdbl = new PDBList({ verbose: false, fetcher: serving({ ".cif.gz": gzipSync(CIF) }, asked) });
    const file = await pdbl.retrievePdbFile("4HHB", { fileFormat: "mmCif" });
    expect(file).not.toBeNull();
    expect(file!.name).toBe("4hhb.cif");
    const text = new TextDecoder().decode(file!.data);
    expect(text).toBe(CIF);
    const structure = new MMCIFParser({ quiet: true }).getStructure("4hhb", text);
    expect(structure.id).toBe("4hhb");
    expect(asked).toEqual(["https://files.wwpdb.org/pub/pdb/data/structures/divided/mmCIF/hh/4hhb.cif.gz"]);
  });

  it("names each format's file and address as the table says", async () => {
    const rows: [string, string, string][] = [
      ["mmCif", "4hhb.cif", "/pub/pdb/data/structures/divided/mmCIF/hh/4hhb.cif.gz"],
      ["pdb", "pdb4hhb.ent", "/pub/pdb/data/structures/divided/pdb/hh/pdb4hhb.ent.gz"],
      ["xml", "4hhb.xml", "/pub/pdb/data/structures/divided/XML/hh/4hhb.xml.gz"],
      ["bundle", "4hhb-pdb-bundle.tar", "/pub/pdb/compatible/pdb_bundle/hh/4hhb/4hhb-pdb-bundle.tar.gz"],
    ];
    for (const [format, name, path] of rows) {
      expect(structureTarget("https://files.wwpdb.org", "4HHB", false, format)).toEqual({ url: `https://files.wwpdb.org${path}`, name });
    }
    expect(structureTarget("https://files.wwpdb.org", "4HHB", false, "mmtf")).toEqual({ url: "http://mmtf.rcsb.org/v1.0/full/4hhb", name: "4hhb.mmtf" });
    expect(structureTarget("https://files.wwpdb.org", "4HHB", true, "pdb").url).toContain("/structures/obsolete/");
    // with no format, mmCIF
    const asked: string[] = [];
    const pdbl = new PDBList({ verbose: false, stderr: () => {}, fetcher: serving({ ".gz": gzipSync("x") }, asked) });
    expect((await pdbl.retrievePdbFile("4HHB"))?.name).toBe("4hhb.cif");
  });
});

describe("README: fetching an assembly", () => {
  it("returns the name, and the contents or null", async () => {
    const asked: string[] = [];
    const pdbl = new PDBList({ verbose: false, fetcher: serving({ "4hhb.pdb1.gz": gzipSync("HEADER\n") }, asked) });
    const assembly = await pdbl.retrieveAssemblyFile("4HHB", 1, { fileFormat: "pdb" });
    expect(assembly.name).toBe("4hhb.pdb1");
    expect(new TextDecoder().decode(assembly.data!)).toBe("HEADER\n");
    expect((await pdbl.retrieveAssemblyFile("4HHB", "1", { fileFormat: "pdb" })).name).toBe("4hhb.pdb1");
    expect((await pdbl.retrieveAssemblyFile("4HHB", " 01 ", { fileFormat: "pdb" })).name).toBe("4hhb.pdb1");
    await expect(pdbl.retrieveAssemblyFile("4HHB", "one", { fileFormat: "pdb" })).rejects.toThrow("invalid literal for int() with base 10: 'one'");
    const lines: string[] = [];
    const quiet = new PDBList({ verbose: false, stdout: (l) => lines.push(l), fetcher: serving({}) });
    expect(await quiet.retrieveAssemblyFile("4HHB", 2, { fileFormat: "pdb" })).toEqual({ name: "4hhb.pdb2", data: null });
    expect(lines).toEqual(["Download failed! Maybe the desired assembly does not exist: HTTP Error 404: Not Found"]);
  });
});

describe("README: what it prints", () => {
  it("sends each line to the functions given", async () => {
    const lines: string[] = [];
    const pdbl = new PDBList({ stdout: (line) => lines.push(line), stderr: (line) => lines.push(line), fetcher: serving({ ".gz": gzipSync("x") }) });
    await pdbl.retrievePdbFile("4HHB");
    expect(lines).toEqual([
      "WARNING: The default download format has changed from PDB to PDBx/mmCif",
      "Downloading PDB structure '4hhb'...",
    ]);
  });
});

describe("README: the lists", () => {
  it("parses each of the archive's lists", async () => {
    const asked: string[] = [];
    const pdbl = new PDBList({
      verbose: false,
      fetcher: serving({
        "added.pdb": "1abc\n2xyz\n", "modified.pdb": "3def\n", "obsolete.pdb": "",
        "entries.idx": "IDCODE, HEADER\n------- -------\n100D\tDNA-RNA HYBRID\n101D\tDNA\n",
        "obsolete.dat": " LIST OF OBSOLETE COORDINATE ENTRIES AND SUCCESSORS\nOBSLTE    31-JUL-94 116L     216L\nOBSLTE    17-OCT-95 125D     \n",
        "/query": '{"result_set": [{"identifier": "100D-1"}, {"identifier": "101D-1"}]}',
        "pdb_seqres.txt": ">101m_A mol:protein length:154  MYOGLOBIN\nMVLSEGEWQLV\n",
      }, asked),
    });
    const [added, modified, obsolete] = await pdbl.getRecentChanges();
    expect([added, modified, obsolete]).toEqual([["1abc", "2xyz"], ["3def"], []]);
    expect(await pdbl.getAllEntries()).toEqual(["100D", "101D"]);
    expect(await pdbl.getAllObsolete()).toEqual(["116L", "125D"]);
    const assemblies = await pdbl.getAllAssemblies();
    expect(assemblies).toEqual([["100d", "1"], ["101d", "1"]]);
    const before = asked.length;
    expect(await pdbl.getAllAssemblies()).toBe(assemblies);
    expect(asked.length).toBe(before);
    const seqres = await pdbl.getSeqresFile();
    expect(seqres.name).toBe("pdb_seqres.txt");
    expect(new TextDecoder().decode(seqres.data)).toContain("MYOGLOBIN");
  });
});

describe("README: in a browser", () => {
  it("asks PDBe instead", async () => {
    const asked: string[] = [];
    const pdbl = new PDBList({ fetcher: viaMirror(undefined, serving({ ".gz": gzipSync("x") }, asked)), verbose: false });
    await pdbl.retrievePdbFile("4HHB", { fileFormat: "pdb" });
    expect(asked).toEqual(["https://ftp.ebi.ac.uk/pub/databases/pdb/data/structures/divided/pdb/hh/pdb4hhb.ent.gz"]);
  });
});

describe("README: replacing the network", () => {
  it("reports a missing structure and returns null", async () => {
    const missing: Fetcher = async (request) => {
      throw new HTTPError(request.url, 404, "Not Found");
    };
    const lines: string[] = [];
    const pdbl = new PDBList({ fetcher: missing, verbose: false, stdout: (line) => lines.push(line) });
    expect(await pdbl.retrievePdbFile("9ZZZ", { fileFormat: "pdb" })).toBeNull();
    expect(lines).toEqual(["Desired structure not found or download failed. '9zzz': HTTP Error 404: Not Found"]);
  });
});

describe("README: reading gzip", () => {
  it("unpacks a gzip file and refuses what is not one", () => {
    const gz = Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0x13, 0x4b, 0x04, 0x00, 0x43, 0xbe, 0xb7, 0xe8, 1, 0, 0, 0);
    expect(new TextDecoder().decode(gunzip(gz))).toBe("a");
    let caught: unknown;
    try {
      gunzip(new TextEncoder().encode("<!DOCTYPE html>"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadGzipFile);
    expect((caught as Error).message).toBe("Not a gzipped file (b'<!')");
  });
});
