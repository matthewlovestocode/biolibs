/** Parsing the header of a PDB file into a dictionary (Biopython's `Bio.PDB.parse_pdb_header`). */

import { IndexError, KeyError, UnboundLocalError, ValueError, pyFloat, pyInt, pyStrip } from "@biolibs/core";

/** A header value: strings, numbers, nested dictionaries and lists. */
export type HeaderValue = string | number | boolean | null | HeaderValue[] | { [key: string]: HeaderValue };
/** The parsed header. */
export type PdbHeader = { [key: string]: HeaderValue };

/** `s[a:b]` (Python slicing for non-negative bounds). */
const sl = (s: string, a: number, b?: number): string => s.slice(a, b);
/** `str.split()` on whitespace. */
const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

/** `dict[key]`: the entry, or a KeyError (message: the key). */
function entry<T>(dict: { [k: string]: T }, key: string): T {
  if (!Object.hasOwn(dict, key)) throw new KeyError(key);
  return dict[key]!;
}

/** The biological-unit transformations of REMARK 350 lines. */
function getBiomoltrans(lines: string[]): { [key: string]: HeaderValue[] } {
  const biomolecule = new Map<string, HeaderValue[]>();
  let current: string | undefined;
  let applyToChains: string[] | undefined;
  for (const line of lines) {
    if (!line.startsWith("REMARK 350")) continue;
    if (sl(line, 11, 23) === "BIOMOLECULE:") {
      current = words(line).at(-1)!;
      applyToChains = [];
    } else if (sl(line, 11, 41) === "APPLY THE FOLLOWING TO CHAINS:" || sl(line, 30, 41) === "AND CHAINS:") {
      if (applyToChains === undefined) throw new UnboundLocalError("cannot access local variable 'applyToChains' where it is not associated with a value");
      applyToChains.push(...sl(line, 41).replaceAll(" ", "").trim().replace(/^,+|,+$/g, "").split(","));
    } else if (sl(line, 13, 18) === "BIOMT") {
      if (current === undefined) throw new UnboundLocalError("cannot access local variable 'currentBiomolecule' where it is not associated with a value");
      if (!biomolecule.has(current)) biomolecule.set(current, []);
      const biomt = biomolecule.get(current)!;
      if (sl(line, 13, 19) === "BIOMT1") {
        if (applyToChains === undefined) throw new UnboundLocalError("cannot access local variable 'applyToChains' where it is not associated with a value");
        if (applyToChains.length === 0) {
          if (biomt.length === 0) throw new IndexError("list index out of range");
          applyToChains = biomt[0] as string[];
        }
        biomt.push(applyToChains);
      } else if (sl(line, 13, 19)) applyToChains = [];
      biomt.push(sl(line, 23));
    }
  }
  return Object.fromEntries(biomolecule);
}

/** The journal reference text from JRNL lines. */
function getJournal(lines: string[]): string {
  let journal = "";
  for (const line of lines) if (/^JRNL/.test(line)) journal += sl(line, 19, 72).toLowerCase();
  return journal.replace(/\s\s+/g, " ");
}

/** The structure references from REMARK 1 lines. */
function getReferences(lines: string[]): string[] {
  const references: string[] = [];
  let act = "";
  const flush = (): void => {
    if (act !== "") {
      act = act.replace(/\s\s+/g, " ");
      if (act !== " ") references.push(act);
    }
  };
  for (const line of lines) {
    if (/^REMARK {3}1/.test(line)) {
      if (/^REMARK {3}1 REFERENCE/.test(line)) {
        flush();
        act = "";
      } else act += sl(line, 19, 72).toLowerCase();
    }
  }
  flush();
  return references;
}

const MONTHS = ["xxx", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Convert `DD-Mon-YY` to `YYYY-MM-DD`. @throws {@link ValueError} for a bad year or month. */
function formatDate(pdbDate: string): string {
  const year = pyInt(sl(pdbDate, 7));
  const century = year < 50 ? 2000 : 1900;
  const abbr = sl(pdbDate, 3, 6);
  const m = MONTHS.indexOf(abbr);
  if (m < 0) throw new ValueError("list.index(x): x not in list");
  return `${century + year}-${String(m).padStart(2, "0")}-${sl(pdbDate, 0, 2)}`;
}

/** Remove trailing `   CODE   NNN` end codes. */
const chopEndCodes = (line: string): string => line.replace(/\s\s\s\s+\w{4}.\s+\d*$/, "");
/** Remove a trailing date and PDB id. */
const chopEndMisc = (line: string): string => line.replace(/\s+\d\d-\w\w\w-\d\d\s+[1-9][0-9A-Z]{3}\s*$/, "");

/** Capitalise the first letter after each separator (`_nice_case`). */
function niceCase(line: string): string {
  const lower = line.toLowerCase();
  let s = "";
  let nextCap = true;
  for (const c of lower) {
    let ch = c;
    if (c >= "a" && c <= "z" && nextCap) { ch = c.toUpperCase(); nextCap = false; }
    else if (" .,;:\t-_".includes(c)) nextCap = true;
    s += ch;
  }
  return s;
}

/** A missing residue from a REMARK 465 line. */
export interface MissingResidue {
  model: number | null;
  res_name: string;
  chain: string;
  ssseq: number;
  insertion: string | null;
}

/** Parse the text of a REMARK 465 line (already stripped). @returns null when it does not look like a missing residue. */
export function parseRemark465(line: string): MissingResidue | null {
  if (line && (line[0] === " " || "\n ".includes(line[line.length - 1]!))) throw Object.assign(new Error("line has to be stripped"), { name: "AssertionError" });
  const m = /^(\d+\s[\sA-Z][\sA-Z][A-Z]|[A-Z]{1,3})\s([A-Za-z0-9])\s+(-?\d+[A-Za-z]?)$/.exec(line);
  if (m === null) return null;
  let model: number | null;
  let res_name: string;
  if (m[1]!.includes(" ")) {
    const parts = words(m[1]!);
    if (parts.length !== 2) throw new ValueError(`${parts.length < 2 ? "not enough" : "too many"} values to unpack (expected 2, got ${parts.length})`);
    model = pyInt(parts[0]!);
    res_name = parts[1]!;
  } else {
    model = null;
    res_name = m[1]!;
  }
  let ssseq: number;
  let insertion: string | null;
  try {
    ssseq = pyInt(m[3]!);
    insertion = null;
  } catch {
    insertion = m[3]![m[3]!.length - 1]!;
    ssseq = pyInt(m[3]!.slice(0, -1));
  }
  return { model, res_name, chain: m[2]!, ssseq, insertion };
}

/**
 * Parse header lines (those before the first ATOM, HETATM or MODEL record) into a dictionary.
 *
 * @param header - Lines with their line endings.
 */
export function parsePdbHeaderList(header: string[]): PdbHeader {
  const compound: { [id: string]: { [k: string]: string } } = { "1": { misc: "" } };
  const source: { [id: string]: { [k: string]: string } } = { "1": { misc: "" } };
  const d: { [key: string]: any } = {
    name: "", head: "", idcode: "", deposition_date: "1909-01-08", release_date: "1909-01-08", structure_method: "unknown", resolution: null,
    structure_reference: "unknown", journal_reference: "unknown", author: "", compound, source, has_missing_residues: false, missing_residues: [], biomoltrans: [],
  };
  d["structure_reference"] = getReferences(header);
  d["journal_reference"] = getJournal(header);
  d["biomoltrans"] = getBiomoltrans(header);
  let compMolid = "1";
  let lastCompKey = "misc";
  let lastSrcKey = "misc";
  for (const hh of header) {
    const h = hh.replace(/[\s\n\r]*$/, "");
    const key = pyStrip(sl(h, 0, 6));
    const tail = pyStrip(sl(h, 10));
    if (key === "TITLE") {
      const name = chopEndCodes(tail).toLowerCase();
      d["name"] = pyStrip([d["name"], name].join(" "));
    } else if (key === "HEADER") {
      const rr = /\d\d-\w\w\w-\d\d/.exec(tail);
      if (rr !== null) d["deposition_date"] = formatDate(niceCase(rr[0]));
      const id = /\s+([1-9][0-9A-Z]{3})\s*$/.exec(tail);
      if (id !== null) d["idcode"] = id[1]!;
      d["head"] = chopEndMisc(tail).toLowerCase();
    } else if (key === "COMPND") {
      let tt = chopEndCodes(tail).toLowerCase().replace(/;\s*$/, "");
      const rec = /\d+\.\d+\.\d+\.\d+/.exec(tt);
      if (rec) {
        entry(compound, compMolid)["ec_number"] = rec[0];
        tt = tt.replace(/\((e\.c\.)*\d+\.\d+\.\d+\.\d+\)/g, "");
      }
      const tok = tt.split(":");
      if (tok.length >= 2) {
        const ckey = tok[0]!;
        const cval = tok[1]!.replace(/^\s*/, "");
        if (ckey === "mol_id") { compound[cval] = { misc: "" }; compMolid = cval; lastCompKey = "misc"; }
        else { entry(compound, compMolid)[ckey] = cval; lastCompKey = ckey; }
      } else entry(compound, compMolid)[lastCompKey] += tok[0]! + " ";
    } else if (key === "SOURCE") {
      const tt = chopEndCodes(tail).toLowerCase().replace(/;\s*$/, "");
      const tok = tt.split(":");
      if (tok.length >= 2) {
        const ckey = tok[0]!;
        const cval = tok[1]!.replace(/^\s*/, "");
        if (ckey === "mol_id") { source[cval] = { misc: "" }; compMolid = cval; lastSrcKey = "misc"; }
        else { entry(source, compMolid)[ckey] = cval; lastSrcKey = ckey; }
      } else entry(source, compMolid)[lastSrcKey] += tok[0]! + " ";
    } else if (key === "KEYWDS") {
      const kwd = chopEndCodes(tail).toLowerCase();
      d["keywords"] = "keywords" in d ? `${d["keywords"]} ${kwd}` : kwd;
    } else if (key === "EXPDTA") {
      let expd = chopEndCodes(tail);
      expd = expd.replace(/\s\s\s\s\s\s\s.*$/, "");
      d["structure_method"] = expd.toLowerCase();
    } else if (key === "REVDAT") {
      const rr = /\d\d-\w\w\w-\d\d/.exec(tail);
      if (rr !== null) d["release_date"] = formatDate(niceCase(rr[0]));
    } else if (key === "JRNL") {
      d["journal"] = "journal" in d ? d["journal"] + tail : tail;
    } else if (key === "AUTHOR") {
      const auth = niceCase(chopEndCodes(tail));
      d["author"] = "author" in d ? d["author"] + auth : auth;
    } else if (key === "REMARK") {
      if (/REMARK {3}2 RESOLUTION./.test(hh)) {
        let r = chopEndCodes(hh.replace(/REMARK {3}2 RESOLUTION./, ""));
        r = r.replace(/\s+ANGSTROM.*/, "");
        try { d["resolution"] = pyFloat(r); } catch { d["resolution"] = null; }
      } else if (hh.startsWith("REMARK 465")) {
        if (tail) {
          d["has_missing_residues"] = true;
          const info = parseRemark465(tail);
          if (info) d["missing_residues"].push(info);
        }
      } else if (hh.startsWith("REMARK  99 ASTRAL")) {
        if (tail) {
          const kv = tail.replaceAll("ASTRAL ", "").split(": ");
          if (kv.length === 2) {
            if (!("astral" in d)) d["astral"] = { [kv[0]!]: kv[1]! };
            else d["astral"][kv[0]!] = kv[1]!;
          }
        }
      }
    }
  }
  if (d["structure_method"] === "unknown") {
    const res = d["resolution"];
    if (res !== null && res > 0.0) d["structure_method"] = "x-ray diffraction";
  }
  return d as PdbHeader;
}

/**
 * Parse the header of a PDB file's text.
 *
 * @param text - The file contents.
 */
export function parsePdbHeader(text: string): PdbHeader {
  const header: string[] = [];
  for (const line of text.match(/[^\n]*\n|[^\n]+/g) ?? []) {
    const record = line.slice(0, 6);
    if (record === "ATOM  " || record === "HETATM" || record === "MODEL ") break;
    header.push(line);
  }
  return parsePdbHeaderList(header);
}
