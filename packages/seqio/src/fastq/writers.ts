/** FASTQ writers: `fastq`/`fastq-sanger`, `fastq-solexa`, `fastq-illumina`. */

import { ValueError, pyFirstWord } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { SequenceWriter, clean, getSeqString } from "../interfaces.js";
import { getIlluminaQualityStr, getSangerQualityStr, getSolexaQualityStr } from "./scores.js";

/** The default header: the description if it starts with the id, else `"id description"`, else the id. */
function title(record: SeqRecord): string {
  const id = record.id ? clean(record.id) : "";
  const description = clean(record.description);
  if (description && pyFirstWord(description) === id) return description;
  if (description) return `${id} ${description}`;
  return id;
}

/** Build one four-line FASTQ record from a function that produces the quality characters. */
function fastqText(record: SeqRecord, qualityString: (record: SeqRecord) => string): string {
  const seqStr = getSeqString(record);
  const qualitiesStr = qualityString(record);
  if (qualitiesStr.length !== seqStr.length) {
    throw new ValueError(`Record ${record.id} has sequence length ${seqStr.length} but ${qualitiesStr.length} quality scores`);
  }
  return `@${title(record)}\n${seqStr}\n+\n${qualitiesStr}\n`;
}

/** Writes Sanger FASTQ (PHRED+33). Solexa scores are converted; scores above 93 are capped with a warning. */
export class FastqPhredWriter extends SequenceWriter {
  get modes(): string { return "t"; }

  /** One record as FASTQ text. @throws {@link ValueError} if there are no usable qualities or their count differs from the sequence length. */
  static asString(record: SeqRecord): string {
    return fastqText(record, getSangerQualityStr);
  }

  writeRecord(record: SeqRecord): void {
    this.handle.write(FastqPhredWriter.asString(record));
  }
}

/** Writes Solexa FASTQ (Solexa+64). */
export class FastqSolexaWriter extends SequenceWriter {
  get modes(): string { return "t"; }

  /** One record as Solexa FASTQ text. */
  static asString(record: SeqRecord): string {
    return fastqText(record, getSolexaQualityStr);
  }

  writeRecord(record: SeqRecord): void {
    this.handle.write(FastqSolexaWriter.asString(record));
  }
}

/** Writes Illumina 1.3+ FASTQ (PHRED+64). */
export class FastqIlluminaWriter extends SequenceWriter {
  get modes(): string { return "t"; }

  /** One record as Illumina FASTQ text. */
  static asString(record: SeqRecord): string {
    return fastqText(record, getIlluminaQualityStr);
  }

  writeRecord(record: SeqRecord): void {
    this.handle.write(FastqIlluminaWriter.asString(record));
  }
}
