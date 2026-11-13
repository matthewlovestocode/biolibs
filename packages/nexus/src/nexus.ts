/** The `Nexus` class: reading, editing and writing NEXUS data (a port of Biopython's `Bio.Nexus.Nexus.Nexus`). */

import { Seq } from "@biolibs/seq";
import { IndexError, RuntimeError, ValueError } from "@biolibs/core";
import { NexusError, PyAttributeError } from "./errors.js";
import { StepMatrix, compact4nexus, getStartEnd, makeUnique, safename, sortKeysByValues, uniqueLabel } from "./helpers.js";
import { CODONPOSITIONS, NexusParser, type MatrixRow } from "./nexus-parser.js";

/** Anything with a `write(text)` method. */
export interface NexusTarget {
  write(text: string): unknown;
}

/** One partition's output: the name Biopython would have written to, and the text. */
export interface PartitionOutput {
  /** The file name Biopython derives for this partition. */
  filename: string;
  /** The NEXUS data block. */
  text: string;
}

/** Options of {@link Nexus.writeNexusDataPartitions}. */
export interface PartitionOptions extends WriteOptions {
  /**
   * The character partition itself — a `Map` of partition name to its characters, as
   * {@link Nexus.charpartitions} holds them — not the name of one. Without it, a single block is written.
   *
   * Biopython iterates this argument and subscripts it with what it yields, so a *string* there iterates its
   * characters and fails; that failure is reproduced rather than corrected.
   */
  charpartition?: Map<string, number[]> | string | null;
}

/** Options of {@link Nexus.writeNexusData}. */
export interface WriteOptions {
  /** Where to write; falls back to nothing (writing to a file name is not supported). */
  filename?: NexusTarget | null;
  matrix?: Map<string, MatrixRow> | null;
  /** Characters to leave out (0-based). */
  exclude?: number[] | null;
  /** Taxa to leave out. */
  delete?: string[];
  blocksize?: number | null;
  interleave?: boolean;
  /** Name of a character partition to interleave by, or false. */
  interleaveByPartition?: string | false;
  comment?: string | null;
  omitNEXUS?: boolean;
  appendSets?: boolean;
  mrbayes?: boolean;
  codonsBlock?: boolean;
}

const text = (row: MatrixRow): string => row.toString();

/**
 * The target to write to, or the refusal Biopython's file-by-name argument turns into here.
 *
 * @param target - What the caller passed as `filename`.
 * @returns The target.
 * @throws TypeError when it is not an object with a `write(text)` method.
 */
function requireTarget(target: NexusTarget | null | undefined): NexusTarget {
  if (target === undefined || target === null || typeof target.write !== "function") {
    throw new TypeError("Writing to a file by name is not supported; pass an object with a write(text) method as filename");
  }
  return target;
}

/** `row[index]` with Python indexing: negative counts from the end, out of range is an IndexError. */
function charAt(row: MatrixRow, index: number): string {
  const s = text(row);
  const i = index < 0 ? index + s.length : index;
  if (i < 0 || i >= s.length) throw new IndexError("index out of range");
  return s[i]!;
}

/** The extensions {@link exportedName} replaces rather than appends to, as Biopython lists them. */
const NEXUS_EXTENSIONS = ["paup", "nexus", "nex", "dat"];

/**
 * The name Biopython derives for an exported file: a known NEXUS extension is replaced, anything else appended to.
 *
 * `data.nex` becomes `data.fas`, `data.txt` becomes `data.txt.fas`, and a name with no dot at all is appended to.
 * The test is on the last dot-separated piece, lowercased, so `DATA.NEX` counts as well.
 *
 * @param filename - The NEXUS file's name, as `Nexus.filename` holds it.
 * @param extension - The new extension, without the dot.
 * @returns The derived name.
 * @example
 * ```ts
 * exportedName("aln.nex", "fas");   // "aln.fas"
 * exportedName("aln.txt", "fas");   // "aln.txt.fas"
 * ```
 */
export function exportedName(filename: string, extension: string): string {
  const parts = filename.split(".");
  if (parts.length > 1 && NEXUS_EXTENSIONS.includes(parts[parts.length - 1]!.toLowerCase())) {
    return `${parts.slice(0, -1).join(".")}.${extension}`;
  }
  return `${filename}.${extension}`;
}

/**
 * NEXUS data: taxa, character matrix, sets, partitions and trees.
 *
 * @example
 * ```ts
 * const n = new Nexus("#NEXUS\nbegin data; dimensions ntax=2 nchar=4; format datatype=dna; matrix\na ACGT\nb ACGA\n; end;");
 * n.taxlabels;   // ["a", "b"]
 * ```
 * Writing to a file by name is not supported: {@link Nexus.writeNexusData}, {@link Nexus.exportFasta},
 * {@link Nexus.exportPhylip} and {@link Nexus.writeNexusDataPartitions} all take an object with a `write(text)`
 * method instead, and return the name Biopython would have derived. `bootstrap` is not ported: it resamples sites
 * with Python's `random`, so nothing here could reproduce its output to compare against.
 */
export class Nexus extends NexusParser {
  /** The sub-matrix without excluded characters and deleted taxa (rebuilt even for an empty exclusion, as Biopython does for its default). */
  cropMatrix(matrix: Map<string, MatrixRow> | null = null, deleteTaxa: string[] = [], exclude: number[] | null = null): Map<string, MatrixRow> {
    if (!matrix || matrix.size === 0) matrix = this.matrix;
    if (deleteTaxa.some((t) => !this.checkTaxlabels(t))) {
      throw new NexusError(`Unknown taxa: ${[...new Set(deleteTaxa.filter((t) => !this.taxlabels.includes(t)))].join(", ")}`);
    }
    // Python's default `exclude=()` is never equal to `[]`, so only a literal empty list takes the shortcut.
    if (exclude === null || exclude.length > 0) {
      const undelete = this.taxlabels.filter((t) => matrix!.has(t) && !deleteTaxa.includes(t));
      if (undelete.length === 0) return new Map();
      const rows = undelete.map((k) => text(matrix!.get(k)!));
      const n = Math.min(...rows.map((r) => r.length));
      const keep: number[] = [];
      for (let i = 0; i < n; i++) if (!exclude || !exclude.includes(i)) keep.push(i);
      if (keep.length === 0) return new Map(undelete.map((t) => [t, new Seq("")] as [string, MatrixRow]));
      return new Map(undelete.map((t, k) => [t, new Seq(keep.map((i) => rows[k]![i]).join(""))] as [string, MatrixRow]));
    }
    return new Map(this.taxlabels.filter((t) => matrix!.has(t) && !deleteTaxa.includes(t)).map((t) => [t, matrix!.get(t)!] as [string, MatrixRow]));
  }

  /**
   * Write one NEXUS data block per partition in a character partition.
   *
   * Each block leaves out the characters outside its partition (on top of `exclude`) and the deleted taxa, and
   * carries a comment naming the partition. Biopython writes a file per partition and returns their names; since
   * writing by name is not supported here, each partition's text comes back with the name Biopython would have
   * used. Without a `charpartition` it writes one block, named `<filename>.data`.
   *
   * @param options - As {@link WriteOptions}, plus `charpartition`: the partition mapping itself, from
   *   {@link Nexus.charpartitions}.
   * @returns The text and derived name per partition, keyed by partition name; a single entry under `""` when no
   *   character partition was given; `undefined` when there is no matrix to write.
   * @throws TypeError when `charpartition` is a non-empty string, which is what Biopython does with one.
   * @example
   * ```ts
   * const parts = nexus.writeNexusDataPartitions({ charpartition: nexus.charpartitions.get("genes") });
   * parts?.get("gene1")?.text;
   * ```
   */
  writeNexusDataPartitions(options: PartitionOptions = {}): Map<string, PartitionOutput> | undefined {
    let matrix = options.matrix ?? null;
    if (!matrix || matrix.size === 0) matrix = this.matrix;
    if (!matrix || matrix.size === 0) return undefined;
    const exclude = options.exclude ?? [];
    const comment = options.comment ?? "";
    const charpartition = options.charpartition;
    const out = new Map<string, PartitionOutput>();

    const write = (filename: string, partExclude: number[], partComment: string): PartitionOutput => {
      let text = "";
      this.writeNexusData({
        ...options, filename: { write: (chunk: string) => { text += chunk; } },
        matrix, exclude: partExclude, comment: partComment, appendSets: false,
      });
      return { filename, text };
    };

    // Python's `if charpartition:` is truthiness, so an empty mapping (or an empty string) writes the single block.
    if (typeof charpartition === "string") {
      if (charpartition !== "") throw new TypeError("string indices must be integers, not 'str'");
    } else if (charpartition !== undefined && charpartition !== null && charpartition.size > 0) {
      for (const [part, characters] of charpartition) {
        // Everything outside this partition is excluded as well, and Biopython keeps the list unique.
        const outside = [];
        for (let c = 0; c < this.nchar; c++) if (!characters.includes(c)) outside.push(c);
        const dot = this.filename.lastIndexOf(".");
        out.set(part, write(
          dot > 0 ? `${this.filename.slice(0, dot)}_${part}.data` : `${this.filename}_${part}`,
          makeUnique([...exclude, ...outside]),
          `${comment}\nPartition: ${part}\n`,
        ));
      }
      return out;
    }
    out.set("", write(`${this.filename}.data`, exclude, comment));
    return out;
  }

  /**
   * One taxon's row, with Python's own failure for a matrix that was never built.
   *
   * @param taxon - The taxon label.
   * @returns Its row.
   * @throws TypeError when there is no matrix at all (Python subscripts `None`); KeyError for an unknown taxon.
   */
  private rowFor(taxon: string): MatrixRow {
    if (this.matrix === null) throw new TypeError("'NoneType' object is not subscriptable");
    const row = this.matrix.get(taxon);
    if (row === undefined) throw Object.assign(new Error(taxon), { name: "KeyError" });
    return row;
  }

  /**
   * Write the matrix as FASTA.
   *
   * Biopython's `export_fasta` opens a file by name and can do nothing else, so this takes a target with a
   * `write(text)` method, as {@link Nexus.writeNexusData} does, and returns the name Biopython would have derived
   * from {@link Nexus.filename} — which is also what it returns there.
   *
   * @param options - `filename` is the target; `width` is the line width (default 70).
   * @returns The derived file name.
   * @throws TypeError when no target is given; ValueError for a `width` of 0, as Python's `range` step does.
   * @example
   * ```ts
   * const out: string[] = [];
   * nexus.exportFasta({ filename: { write: (t) => out.push(t) } });
   * ```
   */
  exportFasta(options: { filename?: NexusTarget | null; width?: number } = {}): string {
    const target = requireTarget(options.filename);
    const width = options.width ?? 70;
    if (width === 0) throw new ValueError("range() arg 3 must not be zero");
    for (const taxon of this.taxlabels) {
      target.write(`>${safename(taxon)}\n`);
      const row = text(this.rowFor(taxon));
      // Python walks the sequence with `range(0, len, width)`, so a negative width writes no sequence at all.
      for (let i = 0; width > 0 && i < row.length; i += width) target.write(`${row.slice(i, i + width)}\n`);
    }
    return exportedName(this.filename, "fas");
  }

  /**
   * Write the matrix as relaxed PHYLIP: a header of taxon and character counts, then one line per taxon with its
   * name untruncated and unchecked, as Biopython's `export_phylip` writes it.
   *
   * @param options - `filename` is the target, as in {@link Nexus.exportFasta}.
   * @returns The derived file name.
   * @throws TypeError when no target is given.
   */
  exportPhylip(options: { filename?: NexusTarget | null } = {}): string {
    const target = requireTarget(options.filename);
    target.write(`${this.ntax} ${this.nchar}\n`);
    for (const taxon of this.taxlabels) target.write(`${safename(taxon)} ${text(this.rowFor(taxon))}\n`);
    return exportedName(this.filename, "phy");
  }

  /** Character labels adjusted for characters removed (`exclude`) or gaps inserted (`insert`). */
  adjustCharlabels(exclude: number[] | null = null, insert: number[] | null = null): Map<number, string | null> | null {
    if (exclude && exclude.length > 0 && insert && insert.length > 0) throw new NexusError("Can't exclude and insert at the same time");
    if (!this.charlabels || this.charlabels.size === 0) return null;
    const labels = [...this.charlabels.keys()].sort((a, b) => a - b);
    const result = new Map<number, string | null>();
    if (exclude && exclude.length > 0) {
      exclude.sort((a, b) => a - b);
      exclude.push(Number.MAX_SAFE_INTEGER);
      let excount = 0;
      for (const c of labels) {
        if (!exclude.includes(c)) {
          while (c > exclude[excount]!) excount += 1;
          result.set(c - excount, this.charlabels.get(c)!);
        }
      }
    } else if (insert && insert.length > 0) {
      insert.sort((a, b) => a - b);
      insert.push(Number.MAX_SAFE_INTEGER);
      let icount = 0;
      for (const c of labels) {
        while (c >= insert[icount]!) icount += 1;
        result.set(c + icount, this.charlabels.get(c)!);
      }
    } else {
      return this.charlabels;
    }
    return result;
  }

  /**
   * Write the data as NEXUS.
   *
   * @param options - See {@link WriteOptions}; `filename` must be an object with `write(text)`.
   * @returns The target, or undefined if there was nothing to write.
   * @throws {@link NexusError} for unknown taxa or an unknown partition.
   */
  writeNexusData(options: WriteOptions = {}): NexusTarget | undefined {
    let matrix = options.matrix ?? null;
    const exclude = options.exclude ?? null;
    const deleteTaxa = options.delete ?? [];
    const interleave = options.interleave ?? false;
    const interleaveByPartition = options.interleaveByPartition ?? false;
    const mrbayes = options.mrbayes ?? false;
    let blocksize = options.blocksize ?? null;
    if (!matrix || matrix.size === 0) matrix = this.matrix;
    if (!matrix || matrix.size === 0) return undefined;
    const target = options.filename;
    if (target === undefined || target === null || typeof (target as NexusTarget).write !== "function") {
      throw new TypeError("Writing to a file by name is not supported; pass an object with a write(text) method as filename");
    }
    if (deleteTaxa.some((t) => !this.checkTaxlabels(t))) {
      throw new NexusError(`Unknown taxa: ${[...new Set(deleteTaxa.filter((t) => !this.taxlabels.includes(t)))].join(", ")}`);
    }
    let names: string[] = [];
    let newpartition = new Map<string, number[]>();
    if (interleaveByPartition) {
      if (!this.charpartitions.has(interleaveByPartition)) throw new NexusError(`Unknown partition: ${pyReprStr(interleaveByPartition)}`);
      const partition = this.charpartitions.get(interleaveByPartition)!;
      names = sortKeysByValues(partition);
      for (const [p, v] of partition) newpartition.set(p, v.filter((c) => !(exclude ?? []).includes(c)));
    }
    const undelete = this.taxlabels.filter((t) => matrix!.has(t) && !deleteTaxa.includes(t));
    const cropped = new Map([...this.cropMatrix(matrix, deleteTaxa, exclude)].map(([k, v]) => [k, text(v)] as [string, string]));
    const ntaxAdjusted = undelete.length;
    if (undelete.length === 0) throw new IndexError("list index out of range");
    const ncharAdjusted = cropped.get(undelete[0]!)!.length;
    if (!undelete.length || undelete[0] === "") return undefined;
    const fh = target;
    if (!options.omitNEXUS) fh.write("#NEXUS\n");
    if (options.comment) fh.write("[" + options.comment + "]\n");
    fh.write("begin data;\n");
    fh.write(`dimensions ntax=${ntaxAdjusted} nchar=${ncharAdjusted};\n`);
    fh.write("format datatype=" + this.datatype);
    if (this.respectcase) fh.write(" respectcase");
    if (this.missing) fh.write(" missing=" + this.missing);
    if (this.gap) fh.write(" gap=" + this.gap);
    if (this.matchchar) fh.write(" matchchar=" + this.matchchar);
    if (this.labels) fh.write(" labels=" + this.labels);
    if (this.equate) fh.write(" equate=" + this.equate);
    if (interleave || interleaveByPartition) fh.write(" interleave");
    fh.write(";\n");
    if (this.charlabels && this.charlabels.size > 0) {
      const newcharlabels = this.adjustCharlabels(exclude)!;
      const clkeys = [...newcharlabels.keys()].sort((a, b) => a - b);
      fh.write("charlabels " + clkeys.map((k) => `${k + 1} ${safeLabel(newcharlabels.get(k)!)}`).join(", ") + ";\n");
    }
    fh.write("matrix\n");
    if (!blocksize) blocksize = interleave ? 70 : this.nchar;
    const namelength = Math.max(...undelete.map((t) => safename(t, mrbayes).length));
    if (interleaveByPartition) {
      let seek = 0;
      for (const p of names) {
        fh.write(`[${interleaveByPartition}: ${p}]\n`);
        if (newpartition.get(p)!.length > 0) {
          for (const taxon of undelete) {
            fh.write(safename(taxon, mrbayes).padEnd(namelength + 1, " "));
            fh.write(cropped.get(taxon)!.slice(seek, seek + newpartition.get(p)!.length) + "\n");
          }
          fh.write("\n");
        } else {
          fh.write("[empty]\n\n");
        }
        seek += newpartition.get(p)!.length;
      }
    } else if (interleave) {
      if (blocksize === 0) throw new ValueError("range() arg 3 must not be zero");
      for (let seek = 0; seek < ncharAdjusted; seek += blocksize) {
        for (const taxon of undelete) {
          fh.write(safename(taxon, mrbayes).padEnd(namelength + 1, " "));
          fh.write(cropped.get(taxon)!.slice(seek, seek + blocksize) + "\n");
        }
        fh.write("\n");
      }
    } else {
      for (const taxon of undelete) {
        if (blocksize < ncharAdjusted) fh.write(safename(taxon, mrbayes) + "\n");
        else fh.write(safename(taxon, mrbayes).padEnd(namelength + 1, " "));
        const taxonSeq = cropped.get(taxon)!;
        if (blocksize === 0) throw new ValueError("range() arg 3 must not be zero");
        for (let seek = 0; seek < ncharAdjusted; seek += blocksize) fh.write(taxonSeq.slice(seek, seek + blocksize) + "\n");
      }
    }
    fh.write(";\nend;\n");
    if (options.appendSets ?? true) {
      if (options.codonsBlock ?? true) {
        fh.write(this.appendSets(exclude, deleteTaxa, mrbayes, false, false));
        fh.write(this.appendSets(exclude, deleteTaxa, mrbayes, true, true));
      } else {
        fh.write(this.appendSets(exclude, deleteTaxa, mrbayes));
      }
    }
    return target;
  }

  /** The `sets` (or `codons`) block text for the character sets, taxon sets and partitions. */
  appendSets(exclude: number[] | null = null, deleteTaxa: string[] = [], mrbayes = false, includeCodons = true, codonsOnly = false): string {
    if (this.charsets.size === 0 && this.taxsets.size === 0 && this.charpartitions.size === 0) return "";
    const setsb: string[] = [codonsOnly ? "\nbegin codons" : "\nbegin sets"];
    let offset = 0;
    const offlist: number[] = [];
    for (let c = 0; c < this.nchar; c++) {
      if (exclude && exclude.includes(c)) {
        offset += 1;
        offlist.push(-1);
      } else {
        offlist.push(c - offset);
      }
    }
    const excluded = (c: number): boolean => !!exclude && exclude.includes(c);
    if (!codonsOnly) {
      for (const [n, ns] of this.charsets) {
        const cset = ns.filter((c) => !excluded(c)).map((c) => offlist[c]!);
        if (cset.length > 0) setsb.push(`charset ${safename(n)} = ${compact4nexus(cset)}`);
      }
      for (const [n, s] of this.taxsets) {
        const tset = s.filter((t) => !deleteTaxa.includes(t)).map((t) => safename(t, mrbayes));
        if (tset.length > 0) setsb.push(`taxset ${safename(n)} = ${tset.join(" ")}`);
      }
    }
    for (const [n, p] of this.charpartitions) {
      if (!includeCodons && n === CODONPOSITIONS) continue;
      else if (codonsOnly && n !== CODONPOSITIONS) continue;
      const names = sortKeysByValues(p);
      const newpartition = new Map<string, number[]>();
      for (const sn of names) {
        const nsp = p.get(sn)!.filter((c) => !excluded(c)).map((c) => offlist[c]!);
        if (nsp.length > 0) newpartition.set(sn, nsp);
      }
      if (newpartition.size > 0) {
        const command = includeCodons && n === CODONPOSITIONS ? "codonposset" : "charpartition";
        setsb.push(`${command} ${safename(n)} = ${names.filter((sn) => newpartition.has(sn)).map((sn) => `${sn}: ${compact4nexus(newpartition.get(sn)!)}`).join(", ")}`);
      }
    }
    for (const [n, p] of this.taxpartitions) {
      const names = sortKeysByValues(p as unknown as Map<string, number[]>);
      const newpartition = new Map<string, string[]>();
      for (const sn of names) {
        const nsp = p.get(sn)!.filter((t) => !deleteTaxa.includes(t));
        if (nsp.length > 0) newpartition.set(sn, nsp);
      }
      if (newpartition.size > 0) {
        setsb.push(`taxpartition ${safename(n)} = ${names.filter((sn) => newpartition.has(sn)).map((sn) => `${safename(sn)}: ${newpartition.get(sn)!.map((x) => safename(x)).join(" ")}`).join(", ")}`);
      }
    }
    setsb.push("end;\n");
    if (setsb.length === 2) return "";
    return setsb.join(";\n");
  }

  private ambiguous(): Record<string, string> {
    if (this.ambiguousValues === undefined) throw new PyAttributeError("'Nexus' object has no attribute 'ambiguous_values'");
    return this.ambiguousValues;
  }

  /** Positions where all taxa agree (allowing ambiguity codes), as 0-based site numbers; null when no taxon remains. */
  constant(matrix: Map<string, MatrixRow> | null = null, deleteTaxa: string[] = [], exclude: number[] = []): number[] | null {
    if (!matrix || matrix.size === 0) matrix = this.matrix!;
    const undelete = this.taxlabels.filter((t) => matrix!.has(t) && !deleteTaxa.includes(t));
    if (undelete.length === 0) return null;
    if (undelete.length === 1) return [...Array(matrix.get(undelete[0]!)!.length).keys()].filter((x) => !exclude.includes(x));
    const av = this.ambiguous();
    const gapmissing = (): boolean => String(this.options instanceof Map ? this.options.get("gapmode") : "").toLowerCase() === "missing";
    let constant: [number, string][] = [...text(matrix.get(undelete[0]!)!)].map((n, x) => [x, Object.hasOwn(av, n.toUpperCase()) ? av[n.toUpperCase()]! : n.toUpperCase()] as [number, string]).filter(([x]) => !exclude.includes(x));
    for (const taxon of undelete.slice(1)) {
      const newconstant: [number, string][] = [];
      for (const site of constant) {
        const seqsite = charAt(matrix.get(taxon)!, site[0]).toUpperCase();
        if (seqsite === this.missing || (seqsite === this.gap && gapmissing()) || seqsite === site[1]) newconstant.push(site);
        else if (site[1].includes(seqsite) || site[1] === this.missing || (gapmissing() && site[1] === this.gap)) newconstant.push([site[0], Object.hasOwn(av, seqsite) ? av[seqsite]! : seqsite]);
        else if (Object.hasOwn(av, seqsite)) {
          const intersect = [...new Set([...av[seqsite]!].filter((c) => site[1].includes(c)))];
          if (intersect.length > 0) newconstant.push([site[0], intersect.join("")]);
        }
      }
      constant = newconstant;
    }
    return constant.map((s) => s[0]);
  }

  /** The sorted set of states at a site across taxa. */
  cstatus(site: number, deleteTaxa: string[] = [], narrow = true): string[] | null {
    const undelete = this.taxlabels.filter((t) => !deleteTaxa.includes(t));
    if (undelete.length === 0) return null;
    const av = this.ambiguous();
    let cstatus: string[] = [];
    for (const t of undelete) {
      let c = charAt(this.matrix!.get(t)!, site).toUpperCase();
      if (this.options instanceof Map && this.options.get("gapmode") === "missing" && c === this.gap) c = this.missing;
      if (narrow && c === this.missing) {
        if (!cstatus.includes(c)) cstatus.push(c);
      } else {
        if (!Object.hasOwn(av, c)) throw Object.assign(new Error(c), { name: "KeyError" });
        cstatus.push(...[...av[c]!].filter((b) => !cstatus.includes(b)));
      }
    }
    if (cstatus.includes(this.missing) && narrow && cstatus.length > 1) cstatus = cstatus.filter((x) => x !== this.missing);
    cstatus.sort();
    return cstatus;
  }

  /** PAUP step matrix text weighting changes between states by how often they occur. */
  weightedStepmatrix(name = "your_name_here", exclude: number[] = [], deleteTaxa: string[] = []): string {
    if (this.unambiguousLetters === undefined) throw new PyAttributeError("'Nexus' object has no attribute 'unambiguous_letters'");
    const m = new StepMatrix(this.unambiguousLetters, this.gap);
    for (let site = 0; site < this.nchar; site++) {
      if (exclude.includes(site)) continue;
      const cstatus = this.cstatus(site, deleteTaxa)!;
      cstatus.slice(0, -1).forEach((b1, i) => {
        for (const b2 of cstatus.slice(i + 1)) m.add(b1.toUpperCase(), b2.toUpperCase(), 1);
      });
    }
    return m.transformation().weighting().smprint(name);
  }

  /** Add a taxon; shorter sequences are padded with the missing character, longer ones widen the matrix. */
  addSequence(name: string, sequence: string): void {
    if (!name) throw new NexusError("New sequence must have a name");
    const diff = this.nchar - sequence.length;
    if (diff < 0) this.insertGap(this.nchar, -diff);
    else if (diff > 0) sequence += this.missing.repeat(diff);
    const uniqueName = this.taxlabels.includes(name) ? uniqueLabel(this.taxlabels, name) : name;
    if (this.matrix!.has(uniqueName)) throw new ValueError("ERROR. There is a discrepancy between taxlabels and matrix keys. Report this as a bug.");
    this.matrix!.set(uniqueName, new Seq(sequence));
    this.ntax += 1;
    this.taxlabels.push(uniqueName);
    this.unalteredTaxlabels.push(name);
  }

  /** Insert `n` gap columns at `pos`, shifting sets, partitions and character labels. */
  insertGap(pos: number, n = 1, leftgreedy = false): Map<number, string | null> | null | undefined {
    const adjust = (set: number[], x: number, d: number): number[] => {
      set.sort((a, b) => a - b);
      let addpos = 0;
      set.forEach((c, i) => {
        if (c >= x) set[i] = c + d;
        if (c === x) {
          if (leftgreedy || (i > 0 && set[i - 1] === c - 1)) addpos = i;
        }
      });
      if (addpos > 0) set.splice(addpos, 0, ...Array.from({ length: d }, (_, k) => x + k));
      return set;
    };
    if (pos < 0 || pos > this.nchar) throw new NexusError(`Illegal gap position: ${pos}`);
    if (n === 0) return undefined;
    const rows = this.taxlabels.map((t) => text(this.matrix!.get(t)!));
    const width = rows.length === 0 ? 0 : Math.min(...rows.map((r) => r.length));
    const sitesm: string[][] = [];
    for (let i = 0; i < width; i++) sitesm.push(rows.map((r) => r[i]!));
    const gaps = Array.from({ length: n }, () => this.taxlabels.map(() => "-"));
    sitesm.splice(pos, 0, ...gaps);
    const mapped = this.taxlabels.map((_, i) => sitesm.map((col) => col[i]).join(""));
    this.matrix = new Map(this.taxlabels.map((t, i) => [t, new Seq(mapped[i]!)] as [string, MatrixRow]));
    this.nchar += n;
    for (const [i, s] of this.charsets) this.charsets.set(i, adjust(s, pos, n));
    for (const p of this.charpartitions.values()) for (const [sp, s] of p) p.set(sp, adjust(s, pos, n));
    this.charlabels = this.adjustCharlabels(null, Array(n).fill(pos));
    return this.charlabels;
  }

  /** Character positions not in the list. */
  invert(charlist: number[]): number[] {
    return [...Array(this.nchar).keys()].filter((c) => !charlist.includes(c));
  }

  /** Sites where every taxon has a gap (and optionally the missing character). */
  gaponly(includeMissing = false): number[] {
    const gap = new Set([this.gap]);
    if (includeMissing) gap.add(this.missing);
    const rows = this.taxlabels.map((t) => text(this.matrix!.get(t)!));
    const width = rows.length === 0 ? 0 : Math.min(...rows.map((r) => r.length));
    const out: number[] = [];
    for (let i = 0; i < width; i++) if (rows.every((r) => gap.has(r[i]!))) out.push(i);
    return out;
  }

  /** Replace leading and trailing gaps by the missing character. */
  terminalGapToMissing(missing: string | null = null, skipN = true): void {
    if (!missing) missing = this.missing;
    const replace = [this.missing, this.gap];
    if (!skipN) replace.push("n", "N");
    for (const taxon of this.taxlabels) {
      let sequence = text(this.matrix!.get(taxon)!);
      const length = sequence.length;
      const [start, end] = getStartEnd(sequence, replace);
      if (start === -1 && end === -1) {
        sequence = missing.repeat(length);
      } else {
        sequence = sequence.slice(0, end! + 1) + missing.repeat(length - end! - 1);
        sequence = missing.repeat(start!) + sequence.slice(start!);
      }
      if (length !== sequence.length) throw new Error(`Illegal sequence manipulation in Nexus.terminal_gap_to_missing in taxon ${taxon}`);
      this.matrix!.set(taxon, new Seq(sequence));
    }
  }
}

/** A deep copy of a Nexus object (Python's `copy.deepcopy`); sequences are immutable and shared. */
function cloneNexus(n: Nexus): Nexus {
  const c = new Nexus();
  const copy = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(copy);
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, copy(x)]));
    return v;
  };
  for (const key of Object.keys(n)) (c as unknown as Record<string, unknown>)[key] = copy((n as unknown as Record<string, unknown>)[key]);
  return c;
}

/**
 * Combine several matrices, `[[name, nexus], ...]`, into a new `Nexus`: taxa missing from a matrix get missing data,
 * and every input becomes a character set and a partition `combined`.
 *
 * @returns The combined data, or null for no input.
 * @throws {@link RuntimeError} if the first matrix has character or taxon sets: Biopython renames them while iterating
 * over the dictionary and fails with "dictionary keys changed during iteration".
 */
export function combine(matrices: [string, Nexus][]): Nexus | null {
  if (matrices.length === 0) return null;
  const name = matrices[0]![0];
  const combined = cloneNexus(matrices[0]![1]);
  if (new Set(matrices.map((m) => m[1].datatype)).size > 1) combined.datatype = "None";
  combined.charlabels = null;
  combined.statelabels = new Map();
  combined.interleave = false;
  combined.translate = null;
  if (combined.charsets.size > 0 || combined.taxsets.size > 0) throw new RuntimeError("dictionary keys changed during iteration");
  const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);
  const partition = new Map<string, number[]>([[name, range(0, combined.nchar)]]);
  combined.charpartitions = new Map([["combined", partition]]);
  const convert = (m: Nexus, t: string): string => text(m.matrix!.get(t)!).replaceAll(m.gap, combined.gap).replaceAll(m.missing, combined.missing);
  for (const [n, m] of matrices.slice(1)) {
    const both = combined.taxlabels.filter((t) => m.taxlabels.includes(t));
    const combinedOnly = combined.taxlabels.filter((t) => !both.includes(t));
    const mOnly = m.taxlabels.filter((t) => !both.includes(t));
    for (const t of both) combined.matrix!.set(t, new Seq(text(combined.matrix!.get(t)!) + convert(m, t)));
    for (const t of combinedOnly) combined.matrix!.set(t, new Seq(text(combined.matrix!.get(t)!) + combined.missing.repeat(m.nchar)));
    for (const t of mOnly) combined.matrix!.set(t, new Seq(combined.missing.repeat(combined.nchar) + convert(m, t)));
    combined.taxlabels.push(...mOnly);
    for (const [cn, cs] of m.charsets) combined.charsets.set(`${n}.${cn}`, cs.map((x) => x + combined.nchar));
    for (const [tn, ts] of m.taxsets) combined.taxsets.set(`${n}.${tn}`, ts);
    partition.set(n, range(combined.nchar, combined.nchar + m.nchar));
    if (m.charlabels && m.charlabels.size > 0) {
      if (!combined.charlabels || combined.charlabels.size === 0) combined.charlabels = new Map();
      for (const [i, label] of m.charlabels) combined.charlabels.set(combined.nchar + i, label);
    }
    combined.nchar += m.nchar;
    combined.ntax += mOnly.length;
  }
  for (const [c, v] of partition) combined.charsets.set(c, v);
  return combined;
}

/** Python `repr()` of a short string. */
function pyReprStr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replaceAll("'", "\\'")}'`;
}

/** `safename` of a character label, which Biopython applies without checking for a missing label. */
function safeLabel(label: string | null): string {
  if (label === null) throw new TypeError("'NoneType' object has no attribute 'replace'");
  return safename(label);
}

