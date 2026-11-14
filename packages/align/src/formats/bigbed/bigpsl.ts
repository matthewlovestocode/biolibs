/** Reading bigPsl files: a PSL alignment stored as a bigBed file with extra columns (`Bio.Align.bigpsl`). */

import { ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { Location, SeqFeature, type SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import type { AutoSQLTable } from "./autosql.js";
import { BigBedIterator, type BigBedRow } from "./iterator.js";

/** The columns a bigPsl file must declare, in order; the names are the only thing checked. */
const PSL_NAMES = ["chrom", "chromStart", "chromEnd", "name", "score", "strand", "thickStart", "thickEnd",
  "reserved", "blockCount", "blockSizes", "chromStarts", "oChromStart", "oChromEnd", "oStrand", "oChromSize",
  "oChromStarts", "oSequence", "oCDS", "chromSize", "match", "misMatch", "repMatch", "nCount", "seqType"];

/**
 * Reads the pairwise alignments of a bigPsl file.
 *
 * The file is a bigBed file whose extra columns carry what PSL holds and bigBed does not: the query's own start,
 * end, size and strand, its block starts, its sequence and CDS, and the match counts. The indexes, the blocks
 * and the search are bigBed's, so only the columns are read differently.
 */
export class BigPslIterator extends BigBedIterator {
  static override fmt: string | null = "bigPsl";

  /**
   * Check that the file declares the bigPsl columns.
   *
   * Unlike bigBed, every column is named here, so there is nothing to convert by type and no annotations.
   *
   * @param fields - The declaration. @param _fieldCount - Unused. @param _definedFieldCount - Unused.
   * @throws ValueError for a column with the wrong name.
   */
  protected override analyzeFields(fields: AutoSQLTable, _fieldCount: number, _definedFieldCount: number): void {
    PSL_NAMES.forEach((name, i) => {
      const found = fields.fields[i];
      if (found === undefined || name !== found.name) {
        throw new ValueError(`Expected field name '${name}'; found '${found === undefined ? "" : found.name}'`);
      }
    });
  }

  /**
   * Build one alignment from a bigPsl row.
   *
   * @param row - The item, whose 22 columns are the PSL fields.
   * @returns The alignment, with the match counts and the query's features and molecule type.
   * @throws ValueError for the wrong number of columns, a size that disagrees with the chromosome or the query
   *   sequence, an unknown sequence type, or ends that do not match the blocks.
   */
  protected override createAlignment(row: BigBedRow): Alignment {
    const { chromId, rest, dataStart, dataEnd } = row;
    let tStart = row.chromStart, tEnd = row.chromEnd;
    if (rest[dataEnd - 1] !== 0) throw new ValueError("expected a NUL-terminated row");
    const words = new TextDecoder().decode(rest.subarray(dataStart, dataEnd - 1)).split("\t");
    if (words.length !== 22) throw new ValueError(`Unexpected number of fields (${words.length}, expected 22)`);
    const targetRecord = this.targets[chromId]!;
    const tSize = pyInt(words[16]!);
    if (targetRecord.seq!.length !== tSize) {
      throw new ValueError(`Unexpected chromosome size ${tSize} (expected ${targetRecord.seq!.length})`);
    }
    const strand = words[2]!;
    const qName = words[0]!;
    const qSize = pyInt(words[12]!);
    const blockCount = pyInt(words[6]!);
    const blockSizes = words[7]!.replace(/,+$/, "").split(",").map(pyInt);
    let tStarts = words[8]!.replace(/,+$/, "").split(",").map(pyInt);
    let qStarts = words[13]!.replace(/,+$/, "").split(",").map(pyInt);
    if (blockSizes.length !== blockCount) throw new ValueError(`Inconsistent number of blocks (${blockSizes.length} found, expected ${blockCount})`);
    if (qStarts.length !== blockCount) throw new ValueError(`Inconsistent number of query start positions (${qStarts.length} found, expected ${blockCount})`);
    if (tStarts.length !== blockCount) throw new ValueError(`Inconsistent number of target start positions (${qStarts.length} found, expected ${blockCount})`);
    let tBlockSizes = [...blockSizes];

    const text = words[14]!;
    let querySequence: Seq;
    if (text === "") querySequence = new Seq(null, qSize);
    else {
      querySequence = new Seq(text);
      if (querySequence.length !== qSize) throw new ValueError(`Inconsistent query sequence length (${querySequence.length}, expected ${qSize})`);
    }
    const queryRecord = new SeqRecord(querySequence, qName);
    const cds = words[15]!;
    if (cds !== "" && cds !== "n/a") {
      queryRecord.features.push(new SeqFeature(Location.fromstring(cds) as SimpleLocation, "CDS"));
    }
    const seqType = words[21]!;
    let qBlockSizes: number[];
    if (seqType === "0") qBlockSizes = tBlockSizes;
    else if (seqType === "1") { queryRecord.annotations.set("molecule_type", "DNA"); qBlockSizes = tBlockSizes; }
    else if (seqType === "2") { queryRecord.annotations.set("molecule_type", "protein"); qBlockSizes = tBlockSizes.map((b) => Math.floor(b / 3)); }
    else throw new ValueError(`Unexpected sequence type '${seqType}'`);

    tStarts = tStarts.map((s) => s + tStart);
    const qStrand = words[11]!;
    if (qStrand === "-" && strand === "-") {
      // Both strands reversed: the blocks are counted from the other end of both sequences, in reverse order.
      [tStart, tEnd] = [tEnd, tStart];
      qStarts = qStarts.map((s, i) => qSize - s - qBlockSizes[i]!).reverse();
      tStarts = tStarts.map((s, i) => tSize - s - tBlockSizes[i]!).reverse();
      qBlockSizes = [...qBlockSizes].reverse();
      tBlockSizes = [...tBlockSizes].reverse();
    }
    let qPosition = qStarts[0]!, tPosition = tStarts[0]!;
    const pairs: [number, number][] = [[tPosition, qPosition]];
    tBlockSizes.forEach((tB, i) => {
      const qB = qBlockSizes[i]!, tS = tStarts[i]!, qS = qStarts[i]!;
      if (tS !== tPosition) { pairs.push([tS, qPosition]); tPosition = tS; }
      if (qS !== qPosition) { pairs.push([tPosition, qS]); qPosition = qS; }
      tPosition += tB; qPosition += qB;
      pairs.push([tPosition, qPosition]);
    });
    const coordinates = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
    let qStart = pyInt(words[9]!), qEnd = pyInt(words[10]!);
    if (strand === "-") {
      if (qStrand === "-") coordinates[0] = coordinates[0]!.map((c) => tSize - c);
      else {
        [qStart, qEnd] = [qEnd, qStart];
        coordinates[1] = coordinates[1]!.map((c) => qSize - c);
      }
    }
    const lastT = coordinates[0]!.length - 1, lastQ = coordinates[1]!.length - 1;
    if (tStart !== coordinates[0]![0]) throw new ValueError(`Inconsistent tStart found (${tStart}, expected ${coordinates[0]![0]})`);
    if (tEnd !== coordinates[0]![lastT]) throw new ValueError(`Inconsistent tEnd found (${tEnd}, expected ${coordinates[0]![lastT]})`);
    if (qStart !== coordinates[1]![0]) throw new ValueError(`Inconsistent qStart found (${qStart}, expected ${coordinates[1]![0]})`);
    if (qEnd !== coordinates[1]![lastQ]) throw new ValueError(`Inconsistent qEnd found (${qEnd}, expected ${coordinates[1]![lastQ]})`);

    const alignment = new Alignment([targetRecord, queryRecord], coordinates);
    alignment.annotations = new Map();
    let score: number | string = words[1]!;
    try { score = pyFloat(score); } catch (e) { if (!(e instanceof ValueError)) throw e; }
    alignment.score = score;
    alignment.thickStart = pyInt(words[3]!);
    alignment.thickEnd = pyInt(words[4]!);
    alignment.itemRgb = words[5]!;
    alignment.matches = pyInt(words[17]!);
    alignment.misMatches = pyInt(words[18]!);
    alignment.repMatches = pyInt(words[19]!);
    alignment.nCount = pyInt(words[20]!);
    return alignment;
  }
}
