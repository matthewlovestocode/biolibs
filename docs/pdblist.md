# @biolibs/pdblist

A TypeScript port of Biopython's `Bio.PDB.PDBList`: downloads from the Protein Data Bank. **All 9 applicable items** are at parity, verified against Biopython 1.88 with **395 recorded cases** — 179 of `retrieve_pdb_file`, 148 of `retrieve_assembly_file`, 13 of `get_status_list`, 4 of `get_recent_changes`, 12 of `get_all_entries`, 10 of `get_all_obsolete`, 23 of `get_all_assemblies` and 6 of `get_seqres_file` — of which 394 are replayed; the other can only come out as it does on a disk. See [the checklist](parity/Bio.PDB.PDBList.md), and [the package README](../packages/pdblist/README.md) for the API with worked examples.

Like `entrez`, this package touches the network, through one function that can be replaced, and no test uses the real one.

```ts
import { PDBList, viaMirror } from "@biolibs/pdblist";
import { MMCIFParser } from "@biolibs/pdb";

const pdbl = new PDBList({ verbose: false });                        // Python: PDBList(verbose=False)
const file = await pdbl.retrievePdbFile("4HHB", { fileFormat: "mmCif" });
if (file !== null) {
  const text = new TextDecoder().decode(file.data);                  // { name: "4hhb.cif", data }
  new MMCIFParser({ quiet: true }).getStructure("4hhb", text);
}

await pdbl.retrieveAssemblyFile("4HHB", 1, { fileFormat: "pdb" });   // { name: "4hhb.pdb1", data }
await pdbl.getRecentChanges();                                       // [added, modified, obsolete]

new PDBList({ fetcher: viaMirror() });                               // in a browser: ask PDBe
```

## From Python

- **Files, not paths.** Biopython writes to a directory and returns the path. Here `retrievePdbFile` returns `{ name, data }` or `null`, `retrieveAssemblyFile` returns `{ name, data }` with `data` `null` if the download failed, and `getSeqresFile` returns `{ name, data }` where Biopython returns nothing. The name is the one Biopython gives the file.
- **Not applicable:** `update_pdb`, `download_pdb_files`, `download_all_assemblies`, `download_entire_pdb` and `download_obsolete_entries`, which maintain a copy of the archive on disk, and the `pdir`, `overwrite`, `pdb` and `obsolete_pdb` arguments.
- **Printing.** What Biopython prints goes, a line at a time, to the `stdout` and `stderr` functions a `PDBList` is given; by default `console.log` and `console.error`.
- **gzip.** `gunzip` is Python's `gzip.decompress`: several members are joined, zero padding is ignored, and a file that is not gzip, is cut short or fails its checksum raises `BadGzipFile` or `EOFError` with Python's message. It is built on `inflateRawPrefix` in `core`.
- **Errors.** `HTTPError`, `URLError` and `UnicodeDecodeError` are the `entrez` package's, re-exported. `BadGzipFile`, `EOFError` and `JSONDecodeError` are defined here; the last carries the JavaScript engine's message. Biopython's bare `Exception` for an unknown assembly format is a `BioError` named `Exception`.
- **Browsers.** `files.wwpdb.org` does not allow a page on another site to read it. `viaMirror()` — not Biopython's — sends archive requests to PDBe, which does. `fetchBytes` and `viaMirror` are not measured against Biopython; they have their own tests against a stand-in for `fetch`.

## Source layout

```
packages/pdblist/src/
  pdblist.ts   PDBList; DEFAULT_SERVER, ASSEMBLY_SEARCH_URL, ASSEMBLY_SEARCH_BODY
  formats.ts   structureTarget, assemblyTarget, assemblyNumber, DEFAULT_FORMAT_WARNING
  gzip.ts      gunzip, crc32
  fetcher.ts   Fetcher, PdbRequest, fetchBytes, viaMirror, PDBE_ARCHIVE, WWPDB_ARCHIVE
  pybytes.ts   byteLines, byteStrip, byteSplit, decode, startsWith
  errors.ts    BadGzipFile, EOFError, JSONDecodeError
```

Golden cases: `packages/pdblist/test/golden/pdblist.json`, built by `reference/golden/gen_pdblist_cases.py`.
