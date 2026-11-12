/** `MMCIFIO`: writes a structure or an mmCIF dictionary as an mmCIF file (Biopython's `Bio.PDB.mmcifio.MMCIFIO`). */

import { IndexError, ValueError, pyFloatRepr, pyTypeName } from "@biolibs/core";
import { Select, StructureIO, defaultSelect } from "./structure-io.js";
import { UnboundLocalError, fixed, padRight, strLen } from "./pyformat.js";

/** A dictionary of mmCIF data: `category.item` keys to one string or a list of strings (plus `data_`). */
export type MmcifDict = Map<string, string | string[]>;

/** Columns whose order is fixed when a category is written; other columns follow, alphabetically. */
export const MMCIF_ORDER: Readonly<Record<string, readonly string[]>> = {
  _atom_site: [
    "group_PDB", "id", "type_symbol", "label_atom_id", "label_alt_id", "label_comp_id", "label_asym_id", "label_entity_id", "label_seq_id",
    "pdbx_PDB_ins_code", "Cartn_x", "Cartn_y", "Cartn_z", "occupancy", "B_iso_or_equiv", "pdbx_formal_charge", "auth_seq_id", "auth_comp_id",
    "auth_asym_id", "auth_atom_id", "pdbx_PDB_model_num",
  ],
};

/** Python `len(x)` for the values a dictionary can hold. */
function pyLen(x: unknown): number {
  if (typeof x === "string") return strLen(x);
  if (Array.isArray(x)) return x.length;
  throw new TypeError(`object of type '${pyTypeName(x)}' has no len()`);
}

/** Python `str(float)` of an occupancy or B-factor. */
const floatStr = (x: number | null): string => (x === null ? "None" : pyFloatRepr(x));

/** Writer of mmCIF files. */
export class MMCIFIO extends StructureIO {
  /** The dictionary to write, set by {@link MMCIFIO.setDict} or built from a structure by {@link MMCIFIO.save}. */
  dic?: MmcifDict;

  /**
   * Set the dictionary to write; a structure set earlier is forgotten.
   *
   * @param dic - Keys `category.item` mapped to a string or a list of strings, plus `data_`.
   */
  setDict(dic: MmcifDict): void {
    this.dic = dic;
    delete this.structure;
  }

  /**
   * Write the structure (if one was set) or the dictionary as mmCIF text.
   *
   * @param select - Which models, chains, residues and atoms to write (structures only).
   * @param preserveAtomNumbering - Use each atom's own serial number instead of counting from 1 per model.
   * @returns The file contents.
   * @throws ValueError when neither a structure nor a dictionary was set, or the dictionary is malformed.
   */
  save(select: Select = defaultSelect, preserveAtomNumbering = false): string {
    const out: string[] = [];
    if (this.structure !== undefined) this.saveStructure(out, select, preserveAtomNumbering);
    else if (this.dic !== undefined) this.saveDict(out);
    else throw new ValueError("Use set_structure or set_dict to set a structure or dictionary to write out");
    return out.join("");
  }

  private saveDict(out: string[]): void {
    const dic = this.dic!;
    const keyLists = new Map<string, string[]>();
    let dataVal: string | undefined;
    for (const [key, value] of dic) {
      if (key === "data_") dataVal = value as string;
      else {
        const s = key.split(".");
        if (s.length === 2) {
          const list = keyLists.get(s[0]!);
          if (list) list.push(s[1]!); else keyLists.set(s[0]!, [s[1]!]);
        } else throw new ValueError("Invalid key in mmCIF dictionary: " + key);
      }
    }
    // Known categories get their fixed order (unknown items last, alphabetically): sorted() on (index, name) pairs.
    for (const [key, keyList] of keyLists) {
      const order = Object.hasOwn(MMCIF_ORDER, key) ? MMCIF_ORDER[key]! : undefined;
      if (!order) continue;
      const pairs = keyList.map((k): [number, string] => [order.includes(k) ? order.indexOf(k) : order.length, k]);
      pairs.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : codePointCompare(a[1], b[1])));
      keyLists.set(key, pairs.map((p) => p[1]));
    }
    if (dataVal === undefined) throw new UnboundLocalError("cannot access local variable 'data_val' where it is not associated with a value");
    out.push("data_" + (dataVal ? dataVal : "") + "\n#\n");

    for (const [key, keyList] of keyLists) {
      const sample = dic.get(key + "." + keyList[0]!)!;
      const nVals = pyLen(sample);
      for (const i of keyList) {
        const val = dic.get(key + "." + i)!;
        if ((Array.isArray(sample) && (typeof val === "string" || pyLen(val) !== nVals)) || (typeof sample === "string" && Array.isArray(val))) {
          throw new ValueError("Inconsistent list sizes in mmCIF dictionary: " + key + "." + i);
        }
      }
      if (typeof sample === "string" || (Array.isArray(sample) && sample.length === 1)) {
        // A single value per item: write key-value pairs aligned in one column.
        const m = Math.max(0, ...keyList.map(strLen));
        for (const i of keyList) {
          const v = dic.get(key + "." + i)!;
          const valueNoList = typeof sample === "string" ? (v as string) : (v as string[])[0]!;
          out.push(padRight(key + "." + i, strLen(key) + m + 4) + this.formatCol(valueNoList, strLen(valueNoList)) + "\n");
        }
      } else if (Array.isArray(sample)) {
        // Several values: a loop_ with one row per index.
        out.push("loop_\n");
        const widths = new Map<string, number>();
        for (const i of keyList) {
          out.push(key + "." + i + "\n");
          let w = 0;
          for (const val of dic.get(key + "." + i) as string[]) {
            let len = strLen(val);
            if (this.requiresQuote(val) && !this.requiresNewline(val)) len += 2;
            if (len > w) w = len;
          }
          widths.set(i, w);
        }
        for (let r = 0; r < nVals; r++) {
          for (const col of keyList) out.push(this.formatCol((dic.get(key + "." + col) as string[])[r]!, widths.get(col)! + 1));
          out.push("\n");
        }
      } else throw new ValueError("Invalid type in mmCIF dictionary: " + pyTypeName(sample));
      out.push("#\n");
    }
  }

  /** Quote a value, or wrap it in a semicolon text field, when the CIF syntax needs it; pad to `width`. */
  private formatCol(val: string, width: number): string {
    if (this.requiresNewline(val)) return "\n;" + val + "\n;\n";
    if (this.requiresQuote(val)) return padRight(val.includes("' ") ? '"' + val + '"' : "'" + val + "'", width);
    return padRight(val, width);
  }

  private requiresNewline(val: string): boolean {
    return val.includes("\n") || (val.includes("' ") && val.includes('" '));
  }

  private requiresQuote(val: string): boolean {
    if (val.includes(" ") || val.includes("'") || val.includes('"')) return true;
    // Python indexes val[0] here, so an empty value is an IndexError.
    if (val === "") throw new IndexError("string index out of range");
    return "_#$[];".includes(val[0]!) || val.startsWith("data_") || val.startsWith("save_") || ["loop_", "stop_", "global_"].includes(val);
  }

  /** Label for the n-th molecule: A..Z, then AA..ZA, AB..ZB, as in existing mmCIF files. */
  private labelAsymId(entityId: number): string {
    let div = entityId, out = "";
    while (div > 0) {
      const mod = (div - 1) % 26;
      out += String.fromCharCode(65 + mod);
      div = Math.trunc((div - mod) / 26);
    }
    return out;
  }

  private saveStructure(out: string[], select: Select, preserveAtomNumbering: boolean): void {
    const atomDict: MmcifDict = new Map();
    const push = (key: string, value: string): void => {
      const list = atomDict.get(key) as string[] | undefined;
      if (list) list.push(value); else atomDict.set(key, [value]);
    };
    let atomNumber: number | string | null = 1;
    for (const model of this.structure!.getList()) {
      if (!select.acceptModel(model)) continue;
      const modelN = model.serialNum === 0 ? "1" : String(model.serialNum);
      // label_entity_id/label_asym_id increment with each new molecule; label_seq_id counts ATOM residues only.
      let entityId = 0;
      if (!preserveAtomNumbering) atomNumber = 1;
      for (const chain of model.getList()) {
        if (!select.acceptChain(chain)) continue;
        let chainId = chain.getId() as string;
        if (chainId === " ") chainId = ".";
        let residueNumber = 1, prevResidueType = "", prevResname = "";
        for (const residue of chain.getUnpackedList()) {
          if (!select.acceptResidue(residue)) continue;
          const [hetfield, resseqNum, icode0] = residue.getId() as [string, number, string];
          let residueType: string, labelSeqId: string;
          if (hetfield === " ") { residueType = "ATOM"; labelSeqId = String(residueNumber); residueNumber++; }
          else { residueType = "HETATM"; labelSeqId = "."; }
          const resseq = String(resseqNum);
          const icode = icode0 === " " ? "?" : icode0;
          const resname = residue.getResname();
          if (residueType !== prevResidueType || (residueType === "HETATM" && resname !== prevResname)) entityId++;
          prevResidueType = residueType;
          prevResname = resname;
          const labelAsymId = this.labelAsymId(entityId);
          for (const atom of residue.getUnpackedList()) {
            if (!select.acceptAtom(atom)) continue;
            push("_atom_site.group_PDB", residueType);
            if (preserveAtomNumbering) atomNumber = atom.getSerialNumber();
            push("_atom_site.id", String(atomNumber));
            if (!preserveAtomNumbering) atomNumber = (atomNumber as number) + 1;
            let element = atom.element.trim();
            if (element === "") element = "?";
            push("_atom_site.type_symbol", element);
            push("_atom_site.label_atom_id", atom.getName().trim());
            push("_atom_site.label_alt_id", atom.getAltloc() === " " ? "." : atom.getAltloc());
            push("_atom_site.label_comp_id", resname.trim());
            push("_atom_site.label_asym_id", labelAsymId);
            push("_atom_site.label_entity_id", "?");
            push("_atom_site.label_seq_id", labelSeqId);
            push("_atom_site.pdbx_PDB_ins_code", icode);
            const [x, y, z] = atom.getCoord() as unknown as [number, number, number];
            push("_atom_site.Cartn_x", fixed(x, 3));
            push("_atom_site.Cartn_y", fixed(y, 3));
            push("_atom_site.Cartn_z", fixed(z, 3));
            push("_atom_site.occupancy", floatStr(atom.getOccupancy()));
            push("_atom_site.B_iso_or_equiv", floatStr(atom.getBfactor()));
            push("_atom_site.auth_seq_id", resseq);
            push("_atom_site.auth_asym_id", chainId);
            push("_atom_site.pdbx_PDB_model_num", modelN);
          }
        }
      }
    }
    // The data block name is the structure id without characters CIF treats specially.
    let structureId = this.structure!.id as string;
    for (const c of ["#", "$", "'", '"', "[", "]", " ", "\t", "\n"]) structureId = structureId.replaceAll(c, "");
    atomDict.set("data_", structureId);
    this.dic = atomDict;
    this.saveDict(out);
  }
}

/** Python string ordering (by code point). */
function codePointCompare(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}
