/**
 * `CloningStrategy`: a whole cloning plan, and the things worth doing to one.
 *
 * Write it from the molecules you made, send it, read it back, and run every step again to see that the
 * molecules really follow from the parts. That last step is what makes a plan something another lab can
 * check rather than take on trust.
 */

import { ValueError } from "@biolibs/core";
import type { Dseqrecord } from "@biolibs/dseqrecord";
import { type AssemblySource, Primer } from "@biolibs/assembly2";
import { history } from "./history.js";
import { type CloningStrategyDocument, type PrimerModel, SCHEMA_VERSION, type SequenceModel,
         SOURCE_TYPES, type SourceModel } from "./model.js";
import { primerFromModel, primerModelOf, recordFromSequenceModel, sequenceModelOf } from "./sequences.js";
import { normalizeSource, sourceFromModel, sourceModelOf, validateSource } from "./sources.js";

/** How a plan is written down from a set of molecules. */
export interface WriteOptions {
  /** What the plan is for. */
  description?: string;
  /**
   * Whether to number molecules that do not already carry a number, in the order they are reached.
   * Off by default, as pydna refuses a record whose identifier is not a number.
   */
  assignIds?: boolean;
}

/**
 * Mirrors `pydna.opencloning_models.CloningStrategy`.
 *
 * @example
 * ```ts
 * const plan = CloningStrategy.fromRecords([plasmid], { description: "my construct" });
 * plan.validate();                   // throws if the plan does not replay
 * JSON.stringify(plan.document);     // the plan, ready to send
 * ```
 */
export class CloningStrategy {
  /** The molecules, the product of each step before the things that went into it. */
  sequences: SequenceModel[] = [];
  /** The steps, one per molecule. */
  sources: SourceModel[] = [];
  /** The primers. */
  primers: PrimerModel[] = [];
  /** What the plan is for. */
  description: string | null;

  /** @param description - What the plan is for. */
  constructor(description: string | null = "") {
    this.description = description;
  }

  /**
   * Write a plan down from the molecules at the end of it.
   *
   * Each molecule's own history is followed back, so the inputs, and their inputs, come along.
   *
   * @param records - The molecules the plan ends with.
   * @param options - What the plan is for, and whether to number what is not numbered.
   * @returns The plan.
   * @throws `ValueError` for a molecule whose identifier is not a number, unless `assignIds` is set.
   */
  static fromRecords(records: readonly Dseqrecord[], options: WriteOptions = {}): CloningStrategy {
    const plan = new CloningStrategy(options.description ?? "");
    const numbering = new Map<Dseqrecord | Primer, number>();
    let next = 1;
    /** @param record - A molecule or primer. @returns The number it carries in the plan. */
    const idOf = (record: Dseqrecord | Primer): number => {
      const own = record.id ?? "";
      if (/^\d+$/.test(own)) return Number(own);
      if (options.assignIds !== true) {
        throw new ValueError(`id must be a string representing an integer, but ${record.name} has an invalid id: ${record.id}`);
      }
      let given = numbering.get(record);
      if (given === undefined) {
        // Keep clear of the numbers the records carry themselves.
        const taken = new Set([...numbering.values()]);
        while (taken.has(next)) next += 1;
        given = next;
        next += 1;
        numbering.set(record, given);
      }
      return given;
    };
    for (const record of records) plan.addRecord(record, idOf);
    return plan;
  }

  /**
   * Add one molecule and everything behind it.
   *
   * @param record - The molecule. @param idOf - Which number each carries.
   */
  private addRecord(record: Dseqrecord, idOf: (one: Dseqrecord | Primer) => number): void {
    const id = idOf(record);
    if (this.sequences.some((sequence) => sequence.id === id)) return;
    this.sequences.push(sequenceModelOf(record, id));
    const source = record.source as AssemblySource | null | undefined;
    if (source === null || source === undefined) {
      this.sources.push({ id, type: SOURCE_TYPES.manuallyTyped, output_name: null, database_id: null, input: [] });
      return;
    }
    this.sources.push(sourceModelOf(source, id, idOf as never));
    for (const input of source.input) {
      if (input.sequence instanceof Primer) this.addPrimer(input.sequence, idOf);
      else this.addRecord(input.sequence as Dseqrecord, idOf);
    }
  }

  /** @param primer - A primer. @param idOf - Which number each carries. */
  private addPrimer(primer: Primer, idOf: (one: Dseqrecord | Primer) => number): void {
    const id = idOf(primer);
    if (this.primers.some((one) => one.id === id)) return;
    this.primers.push(primerModelOf(primer, id));
  }

  /**
   * Read a plan that came from somewhere else.
   *
   * @param document - The plan.
   * @returns It, ready to be read back or replayed.
   */
  static fromDocument(document: CloningStrategyDocument): CloningStrategy {
    const plan = new CloningStrategy(document.description ?? "");
    plan.sequences = [...document.sequences];
    plan.sources = [...document.sources];
    plan.primers = [...(document.primers ?? [])];
    return plan;
  }

  /** The plan as the data model writes it, ready to be sent. */
  get document(): CloningStrategyDocument {
    return {
      sequences: this.sequences,
      sources: this.sources,
      primers: this.primers,
      description: this.description,
      schema_version: SCHEMA_VERSION,
      backend_version: null,
      frontend_version: null,
      files: null,
    };
  }

  /** Number everything from one, in the order the identifiers sort, as pydna renumbers a plan. */
  reassignIds(): void {
    const all = [...new Set([...this.sequences.map((one) => one.id), ...this.sources.map((one) => one.id),
                             ...this.primers.map((one) => one.id)])].sort((a, b) => a - b);
    const mapping = new Map(all.map((id, at) => [id, at + 1]));
    for (const sequence of this.sequences) sequence.id = mapping.get(sequence.id)!;
    for (const primer of this.primers) primer.id = mapping.get(primer.id)!;
    for (const source of this.sources) {
      source.id = mapping.get(source.id)!;
      for (const input of source.input) input.sequence = mapping.get(input.sequence)!;
    }
  }

  /** @returns The identifiers of the molecules nothing else was made from: what the plan ends with. */
  idsOfSequencesThatAreNotInputs(): number[] {
    const used = new Set(this.sources.flatMap((source) => source.input.map((input) => input.sequence)));
    return this.sequences.filter((sequence) => !used.has(sequence.id)).map((sequence) => sequence.id);
  }

  /** @returns The identifiers of the molecules something else was made from. */
  idsOfSequencesThatAreInputs(): number[] {
    const used = new Set(this.sources.flatMap((source) => source.input.map((input) => input.sequence)));
    return this.sequences.filter((sequence) => used.has(sequence.id)).map((sequence) => sequence.id);
  }

  /**
   * The molecules the plan ends with, each carrying the step that made it and the molecules behind it.
   *
   * @returns Those molecules.
   * @throws `ValueError` for a plan with a sequence no step accounts for.
   */
  toRecords(): Dseqrecord[] {
    const primers = new Map<number, Primer>();
    for (const model of this.primers) primers.set(model.id, primerFromModel(model));
    const records = new Map<number, Dseqrecord>();
    for (const model of this.sequences) records.set(model.id, recordFromSequenceModel(model));
    const sources = new Map<number, SourceModel>(this.sources.map((source) => [source.id, source]));
    const done = new Set<number>();

    /** @param id - A molecule's identifier. Give it its step, once everything behind it has its own. */
    const resolve = (id: number): void => {
      if (done.has(id)) return;
      done.add(id);
      const model = sources.get(id);
      if (model === undefined) throw new ValueError(`Missing source for sequence ${id}`);
      for (const input of model.input) {
        if (records.has(input.sequence)) resolve(input.sequence);
      }
      const record = records.get(id)!;
      record.source = model.type === SOURCE_TYPES.manuallyTyped ? null : sourceFromModel(model, records, primers);
    };
    const ends = this.idsOfSequencesThatAreNotInputs();
    for (const id of ends) resolve(id);
    return ends.map((id) => records.get(id)!);
  }

  /**
   * Run every step of the plan again and check that each molecule really follows from its inputs.
   *
   * @throws `ValueError` naming the step where the plan does not hold up.
   */
  validate(): void {
    for (const record of this.toRecords()) validateHistory(record);
  }

  /**
   * The plan with every molecule replaced by the one its own step makes.
   *
   * A molecule that was rotated or read from the other strand before being written down comes back as
   * the step itself would leave it, which is what makes two labs' plans comparable.
   *
   * @returns The normalised plan.
   */
  normalize(): CloningStrategy {
    const records = this.toRecords().map(normalizeHistory);
    return CloningStrategy.fromRecords(records, { description: this.description ?? "" });
  }
}

/**
 * Check a molecule's whole history, step by step.
 *
 * @param record - The molecule.
 * @throws `ValueError` naming the step that does not hold up.
 */
export function validateHistory(record: Dseqrecord): void {
  const source = record.source as AssemblySource | null | undefined;
  if (source === null || source === undefined) return;
  validateSource(source, record);
  for (const input of source.input) {
    if (!(input.sequence instanceof Primer)) validateHistory(input.sequence as Dseqrecord);
  }
}

/**
 * Replace a molecule, and everything behind it, with what its own step makes.
 *
 * @param record - The molecule.
 * @returns The molecule as its step leaves it.
 */
export function normalizeHistory(record: Dseqrecord): Dseqrecord {
  const source = record.source as AssemblySource | null | undefined;
  if (source === null || source === undefined) return record;
  for (const input of source.input) {
    if (!(input.sequence instanceof Primer)) input.sequence = normalizeHistory(input.sequence as Dseqrecord);
  }
  return normalizeSource(source, record);
}

export { history };
