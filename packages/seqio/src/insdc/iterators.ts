/** Readers for GenBank (`genbank`, `gb`) and the CDS-only variant (`genbank-cds`). */

import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { EmblScanner, ImgtScanner } from "./embl-scanner.js";
import { GenBankScanner } from "./genbank-scanner.js";

/** Reads GenBank flat files, one `SeqRecord` per `LOCUS`. */
export class GenBankIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - The file contents. */
  constructor(source: unknown) {
    super(source, null, "GenBank");
    this.records = new GenBankScanner(0).parseRecords(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.records.next();
    return r.done ? null : r.value;
  }
}

/** Reads each CDS feature of a GenBank file as a protein record with no features (id from `protein_id`, name from `locus_tag`, description from `product`). */
export class GenBankCdsFeatureIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - The file contents. */
  constructor(source: unknown) {
    super(source, null, "GenBank");
    this.records = new GenBankScanner(0).parseCdsFeatures(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.records.next();
    return r.done ? null : r.value;
  }
}

/** Reads EMBL flat files, one `SeqRecord` per `ID`. */
export class EmblIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - The file contents. */
  constructor(source: unknown) {
    super(source, null, "EMBL");
    this.records = new EmblScanner(0).parseRecords(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.records.next();
    return r.done ? null : r.value;
  }
}

/** Reads IMGT/HLA files. */
export class ImgtIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - The file contents. */
  constructor(source: unknown) {
    super(source, null, "IMGT");
    this.records = new ImgtScanner(0).parseRecords(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.records.next();
    return r.done ? null : r.value;
  }
}

/** Reads each CDS feature of an EMBL file as a protein record. */
export class EmblCdsFeatureIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - The file contents. */
  constructor(source: unknown) {
    super(source, null, "EMBL");
    this.records = new EmblScanner(0).parseCdsFeatures(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.records.next();
    return r.done ? null : r.value;
  }
}
