/** The phyloXML `Clade` and `Phylogeny`: the base tree classes plus the phyloXML-specific annotations. */

import { AssertionError, PyFloat, ValueError } from "@biolibs/core";
import { Clade as BaseClade, type CladeOptions } from "../base-tree/clade.js";
import { Tree as BaseTree, type TreeOptions } from "../base-tree/tree.js";
import {
  BranchColor, BinaryCharacters, CladeRelation, Confidence, Date as PhyloDate, Distribution, Events, Id, Other, Phyloxml, Property, Reference, SequenceRelation, Taxonomy,
} from "./elements.js";
import { Alignment, MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import type { SeqRecord } from "@biolibs/seqrecord";
import { Sequence } from "./sequence.js";

/** The `__dict__.update(kwargs)` of Biopython: set attributes by (camelCase) name. */
export function assignAttrs(target: object, kwargs: Record<string, unknown>): void {
  Object.assign(target, kwargs);
}

/** A confidence from a number or `Confidence` (Biopython re-wraps even a `Confidence`, losing its `type`). */
function toConfidence(value: unknown): Confidence {
  if (typeof value === "number") return new Confidence(value);
  if (value instanceof PyFloat) return new Confidence(value.value);
  if (value instanceof Confidence) return new Confidence(value.value);
  throw new ValueError("value must be a number or Confidence instance");
}

/** Shared implementation of the `confidence` shortcut over a `confidences` list. */
export function getConfidence(list: Confidence[], what: string): Confidence | null {
  if (list.length === 0) return null;
  if (list.length > 1) throw new TypeError(`more than 1 confidence value available; use ${what}.confidences`);
  return list[0]!;
}

/** Shared setter for the `confidence` shortcut; returns the new list. */
export function setConfidence(list: Confidence[], value: unknown): Confidence[] {
  if (value === null || value === undefined) return [];
  const conf = toConfidence(value);
  if (list.length === 0) list.push(conf);
  else if (list.length === 1) list[0] = conf;
  else throw new ValueError("multiple confidence values already exist; use Phylogeny.confidences instead");
  return list;
}

/** The constructor arguments of a phyloXML {@link Clade}. */
export interface PhyloCladeOptions extends Omit<CladeOptions, "confidence" | "color" | "clades" | "branchLength"> {
  /** Length of the branch to this clade (a `PyFloat` for a float with a whole value). */
  branchLength?: number | PyFloat | null;
  /** Link other elements to this clade at the XML level. */
  idSource?: string | null;
  /** Display colour of the clade. */
  color?: BranchColor | null;
  /** Unique identifier of the root node of this clade. */
  nodeId?: Id | null;
  /** Events at the root of the clade. */
  events?: Events | null;
  /** Binary characters. */
  binaryCharacters?: BinaryCharacters | null;
  /** A date. */
  date?: PhyloDate | null;
  /** Support values. */
  confidences?: Confidence[] | null;
  /** Taxonomies. */
  taxonomies?: Taxonomy[] | null;
  /** Sequences. */
  sequences?: Sequence[] | null;
  /** Distributions. */
  distributions?: Distribution[] | null;
  /** Literature references. */
  references?: Reference[] | null;
  /** Properties. */
  properties?: Property[] | null;
  /** Sub-clades. */
  clades?: Clade[] | null;
  /** Elements from other namespaces. */
  other?: Other[] | null;
}

/** A branch of a phyloXML tree. */
export class Clade extends BaseClade {
  idSource: string | null; nodeId: Id | null; events: Events | null; binaryCharacters: BinaryCharacters | null; date: PhyloDate | null;
  confidences: Confidence[]; taxonomies: Taxonomy[]; sequences: Sequence[]; distributions: Distribution[]; references: Reference[]; properties: Property[]; other: Other[];

  /** @param o - The attributes (all optional). */
  constructor(o: PhyloCladeOptions = {}) {
    super({ name: o.name ?? null, width: o.width ?? null, clades: o.clades ?? null, color: o.color ?? null });
    if (o.branchLength !== null && o.branchLength !== undefined) this.setBranchLengthNum(o.branchLength);
    this.idSource = o.idSource ?? null; this.nodeId = o.nodeId ?? null; this.events = o.events ?? null; this.binaryCharacters = o.binaryCharacters ?? null; this.date = o.date ?? null;
    this.confidences = o.confidences && o.confidences.length > 0 ? o.confidences : [];
    this.taxonomies = o.taxonomies && o.taxonomies.length > 0 ? o.taxonomies : [];
    this.sequences = o.sequences && o.sequences.length > 0 ? o.sequences : [];
    this.distributions = o.distributions && o.distributions.length > 0 ? o.distributions : [];
    this.references = o.references && o.references.length > 0 ? o.references : [];
    this.properties = o.properties && o.properties.length > 0 ? o.properties : [];
    this.other = o.other && o.other.length > 0 ? o.other : [];
  }

  /** The attributes in the order Biopython's `Clade.__init__` sets them (no `confidence`: it is a property). */
  override pyDict(): [string, unknown][] {
    return [
      ["branch_length", this.branchLengthPy()], ["id_source", this.idSource], ["name", this.name], ["width", this.width], ["_color", this.color],
      ["node_id", this.nodeId], ["events", this.events], ["binary_characters", this.binaryCharacters], ["date", this.date],
      ["confidences", this.confidences], ["taxonomies", this.taxonomies], ["sequences", this.sequences], ["distributions", this.distributions],
      ["references", this.references], ["properties", this.properties], ["clades", this.clades], ["other", this.other],
    ];
  }

  /** The only confidence, or null. @throws TypeError (Python's `AttributeError`) when there are several. */
  override get confidence(): Confidence | null { return getConfidence(this.confidences, "Clade"); }
  override set confidence(value: unknown) { this.confidences = setConfidence(this.confidences, value); }
  /** Remove all confidences. */
  deleteConfidence(): void { this.confidences = []; }

  /** The only taxonomy, or null. @throws TypeError when there are several. */
  get taxonomy(): Taxonomy | null {
    if (this.taxonomies.length === 0) return null;
    if (this.taxonomies.length > 1) throw new TypeError("more than 1 taxonomy value available; use Clade.taxonomies");
    return this.taxonomies[0]!;
  }
  set taxonomy(value: Taxonomy) {
    if (!(value instanceof Taxonomy)) throw new ValueError("assigned value must be a Taxonomy instance");
    if (this.taxonomies.length === 0) this.taxonomies.push(value);
    else if (this.taxonomies.length === 1) this.taxonomies[0] = value;
    else throw new ValueError("multiple taxonomy values already exist; use Phylogeny.taxonomies instead");
  }

  /** A phyloXML clade from a Newick or base clade, recursively. @param clade - The source. @param kwargs - Attributes to override. */
  static fromClade(clade: BaseClade, kwargs: Record<string, unknown> = {}): Clade {
    const c = new Clade({ name: clade.name });
    // `branch_length` keeps its Python type: an int stays an int.
    const bl = clade.pyDict()[0]![1];
    if (bl instanceof PyFloat) c.branchLength = bl.value;
    else if (typeof bl === "number") c.setIntBranchLength(bl);
    c.clades = clade.clades.map((x) => Clade.fromClade(x));
    c.confidence = clade.confidence;
    c.width = clade.width;
    c.color = clade.color ? new BranchColor(clade.color.red, clade.color.green, clade.color.blue) : null;
    assignAttrs(c, kwargs);
    return c;
  }

  /** A phylogeny holding just this clade. @param kwargs - Attributes to set on it. */
  toPhylogeny(kwargs: Record<string, unknown> = {}): Phylogeny {
    const phy = new Phylogeny({ root: this, date: this.date });
    assignAttrs(phy, kwargs);
    return phy;
  }
}

/** The constructor arguments of a {@link Phylogeny}. */
export interface PhylogenyOptions extends Omit<TreeOptions, "root" | "id"> {
  /** The root clade (null stays null). */
  root?: Clade | null;
  /** Whether the tree can be rerooted. */
  rerootable?: boolean | null;
  /** The unit of the branch lengths. */
  branchLengthUnit?: string | null;
  /** The type of the tree. */
  type?: string | null;
  /** Unique identifier. */
  id?: Id | null;
  /** Plain-text description. */
  description?: string | null;
  /** Date of the root. */
  date?: PhyloDate | null;
  /** Support values. */
  confidences?: Confidence[] | null;
  /** Clade relations. */
  cladeRelations?: CladeRelation[] | null;
  /** Sequence relations. */
  sequenceRelations?: SequenceRelation[] | null;
  /** Properties. */
  properties?: Property[] | null;
  /** Elements from other namespaces. */
  other?: Other[] | null;
}

/** A phyloXML tree. */
export class Phylogeny extends BaseTree {
  rerootable: boolean | null; branchLengthUnit: string | null; type: string | null; description: string | null; date: PhyloDate | null;
  confidences: Confidence[]; cladeRelations: CladeRelation[]; sequenceRelations: SequenceRelation[]; properties: Property[]; other: Other[];

  /** @param o - The attributes (all optional). @throws AssertionError if `rooted` is not a boolean. */
  constructor(o: PhylogenyOptions = {}) {
    if (o.rooted !== undefined && typeof o.rooted !== "boolean") throw new AssertionError("");
    super({ rooted: o.rooted ?? true, name: o.name ?? null });
    this.rootClade = (o.root ?? null) as Clade;
    this.rerootable = o.rerootable ?? null; this.branchLengthUnit = o.branchLengthUnit ?? null; this.type = o.type ?? null;
    this.id = o.id ?? null; this.description = o.description ?? null; this.date = o.date ?? null;
    this.confidences = o.confidences && o.confidences.length > 0 ? o.confidences : [];
    this.cladeRelations = o.cladeRelations && o.cladeRelations.length > 0 ? o.cladeRelations : [];
    this.sequenceRelations = o.sequenceRelations && o.sequenceRelations.length > 0 ? o.sequenceRelations : [];
    this.properties = o.properties && o.properties.length > 0 ? o.properties : [];
    this.other = o.other && o.other.length > 0 ? o.other : [];
  }
  protected override newClade(): BaseClade { return new Clade(); }

  override pyDict(): [string, unknown][] {
    return [
      ["root", this.rootClade], ["rooted", this.rooted], ["rerootable", this.rerootable], ["branch_length_unit", this.branchLengthUnit], ["type", this.type],
      ["name", this.name], ["id", this.id], ["description", this.description], ["date", this.date], ["confidences", this.confidences],
      ["clade_relations", this.cladeRelations], ["sequence_relations", this.sequenceRelations], ["properties", this.properties], ["other", this.other],
    ];
  }

  /** The only confidence, or null. @throws TypeError when there are several. */
  get confidence(): Confidence | null { return getConfidence(this.confidences, "Phylogeny"); }
  set confidence(value: unknown) { this.confidences = setConfidence(this.confidences, value); }
  /** Remove all confidences. */
  deleteConfidence(): void { this.confidences = []; }

  /** The aligned sequences of the tree (`is_aligned` true), in preorder. @throws TypeError (Python's `AttributeError`) for a sequence without `mol_seq`. */
  private alignedSequences(): Iterable<Sequence> {
    // Lazy, as in Biopython: a sequence is filtered only when the consumer asks for it.
    return this.filterSearch((e: unknown) => e instanceof Sequence && Boolean((e.molSeq as { isAligned: boolean | null }).isAligned), "preorder", true) as Iterable<Sequence>;
  }

  /** A `MultipleSeqAlignment` of the aligned sequences in this tree. */
  toAlignment(): MultipleSeqAlignment {
    const seqs = this.alignedSequences();
    return new MultipleSeqAlignment((function* () { for (const s of seqs) yield s.toSeqrecord(); })());
  }

  /** An `Alignment` of the aligned sequences in this tree (gaps become coordinates). */
  get alignment(): Alignment {
    const records: SeqRecord[] = [];
    const lines: Uint8Array[] = [];
    for (const seq of this.alignedSequences()) {
      const record = seq.toSeqrecord();
      lines.push(record.seq!.toBytes());
      records.push(record);
    }
    let coordinates: number[][] | null = null;
    if (lines.length > 0) {
      const parsed = Alignment.parsePrintedAlignment(lines);
      parsed.sequences.forEach((sequence, i) => { records[i]!.seq = new Seq(sequence); });
      coordinates = parsed.coordinates as unknown as number[][];
    }
    return new Alignment(records, coordinates);
  }

  /** A phylogeny from a base tree (Newick, Nexus). @param tree - The source. @param kwargs - Attributes to override. */
  static fromTree(tree: BaseTree, kwargs: Record<string, unknown> = {}): Phylogeny {
    const phy = new Phylogeny({ root: Clade.fromClade(tree.root), rooted: tree.rooted, name: tree.name, id: tree.id !== null ? new Id(String(tree.id)) : null });
    assignAttrs(phy, kwargs);
    return phy;
  }

  /** A phylogeny holding a base clade (overrides `Tree.fromClade`). @param clade - The clade. @param kwargs - Attributes to set. */
  static override fromClade<T extends BaseTree>(this: new (o?: TreeOptions) => T, clade: BaseClade, kwargs: Omit<TreeOptions, "root"> = {}): T {
    return Clade.fromClade(clade).toPhylogeny(kwargs as Record<string, unknown>) as unknown as T;
  }

  /** This tree (it is already a phylogeny). */
  override asPhyloxml(): Phylogeny { return this; }

  /** A `Phyloxml` holding just this tree. @param kwargs - Root attributes. */
  toPhyloxmlContainer(kwargs: Record<string, string> = {}): Phyloxml { return new Phyloxml(kwargs, [this]); }
}
