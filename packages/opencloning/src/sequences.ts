/**
 * Molecules in and out of a plan.
 *
 * A plan writes each molecule as a GenBank file, which carries the name, the topology and the features
 * but has no way of saying that a strand hangs over at one end. So the two overhangs are written beside
 * the file, and put back when it is read.
 */

import { Dseq } from "@biolibs/dseq";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { read } from "@biolibs/seqio";
import type { PrimerModel, SequenceModel } from "./model.js";
import { Primer } from "@biolibs/assembly2";

/**
 * Write a molecule into a plan.
 *
 * @param record - The molecule.
 * @param id - The identifier it will carry in the plan.
 * @returns It as the plan holds it.
 * @example
 * ```ts
 * sequenceModelOf(new Dseqrecord("ACGT"), 1).sequence_file_format;   // "genbank"
 * ```
 */
export function sequenceModelOf(record: Dseqrecord, id: number): SequenceModel {
  return {
    id,
    type: "TextFileSequence",
    sequence_file_format: "genbank",
    overhang_crick_3prime: record.dseq.ovhg ?? 0,
    overhang_watson_3prime: record.dseq.watsonOvhg ?? 0,
    file_content: record.format("genbank"),
  };
}

/**
 * Read a molecule out of a plan.
 *
 * @param model - The molecule as the plan holds it.
 * @returns It, with its overhangs restored and the plan's identifier as its own.
 */
export function recordFromSequenceModel(model: SequenceModel): Dseqrecord {
  const parsed = read(model.file_content, "genbank") as { annotations: Map<string, unknown> };
  // A GenBank file says in its first line whether the molecule is a circle; a record built from one does
  // not take that on its own, so it is read off here.
  const circular = parsed.annotations.get("topology") === "circular";
  const record = new Dseqrecord(parsed as never, circular);
  if (model.overhang_watson_3prime !== 0 || model.overhang_crick_3prime !== 0) {
    const sequence = Dseq.fromFullSequenceAndOverhangs(record.dseq.toString(), model.overhang_crick_3prime,
                                                       model.overhang_watson_3prime);
    const rebuilt = new Dseqrecord(sequence, null, record.n, String(model.id), record.name, record.description);
    rebuilt.features = [...record.features];
    rebuilt.annotations = new Map(record.annotations);
    return rebuilt;
  }
  record.id = String(model.id);
  return record;
}

/**
 * Write a primer into a plan.
 *
 * @param primer - The primer. @param id - The identifier it will carry.
 * @returns It as the plan holds it.
 */
export function primerModelOf(primer: Primer, id: number): PrimerModel {
  return { id, type: "Primer", name: primer.name, database_id: null, sequence: primer.seq?.toString() ?? "" };
}

/**
 * Read a primer out of a plan.
 *
 * @param model - The primer as the plan holds it.
 * @returns It, with the plan's identifier as its own.
 */
export function primerFromModel(model: PrimerModel): Primer {
  const primer = new Primer(model.sequence, String(model.id), model.name);
  return primer;
}
