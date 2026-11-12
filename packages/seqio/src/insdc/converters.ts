/** Direct GenBank/EMBL to FASTA conversion, which skips the (slow) feature table (Biopython's `_genbank_convert_fasta`, `_embl_convert_fasta`). */

import type { WriteHandle } from "../handles.js";
import { LineStream } from "../handles.js";
import { EmblScanner } from "./embl-scanner.js";
import { GenBankScanner } from "./genbank-scanner.js";
import type { InsdcScanner } from "./scanner.js";
import { write } from "../api.js";

/** Parse records without features and write them as FASTA. @returns the record count. */
function convertToFasta(scanner: InsdcScanner, source: unknown, target: WriteHandle): number {
  const stream = source instanceof LineStream ? source : new LineStream(source as string);
  return write(scanner.parseRecords(stream, false), target, "fasta");
}

/** GenBank to FASTA without parsing features. */
export function genbankConvertFasta(source: unknown, target: WriteHandle): number {
  return convertToFasta(new GenBankScanner(), source, target);
}

/** EMBL to FASTA without parsing features. */
export function emblConvertFasta(source: unknown, target: WriteHandle): number {
  return convertToFasta(new EmblScanner(), source, target);
}

