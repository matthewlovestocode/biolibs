/** The registries of readers and writers by format name, filled in by each format module. */

import { ValueError } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { StreamModeError } from "./errors.js";
import type { SequenceIterator, WriterClass } from "./interfaces.js";

/** A reader class: constructed with the source text. */
export type IteratorClass = new (source: unknown) => SequenceIterator;

/** Readers by format name (Biopython's `_FormatToIterator`). */
export const FORMAT_TO_ITERATOR = new Map<string, IteratorClass>();

/** Writers by format name (Biopython's `_FormatToWriter`). */
export const FORMAT_TO_WRITER = new Map<string, WriterClass>();

/** A direct converter: takes the input contents and the output target, returns the record count. */
export type DirectConverter = (source: unknown, target: { write(text: string): unknown }) => number;

/** Format-specific fast conversions, keyed by input and output format (Biopython's `_converter`). */
const CONVERTERS = new Map<string, DirectConverter>();

/** Register a direct conversion used by `convert()` instead of the generic parse-then-write path. */
export function registerConverter(inFormat: string, outFormat: string, converter: DirectConverter): void {
  CONVERTERS.set(`${inFormat}\u0000${outFormat}`, converter);
}

/** The direct converter for a pair of formats, if any. */
export function getConverter(inFormat: string, outFormat: string): DirectConverter | undefined {
  return CONVERTERS.get(`${inFormat}\u0000${outFormat}`);
}

/** Register a reader for a format name. */
export function registerIterator(format: string, cls: IteratorClass): void {
  FORMAT_TO_ITERATOR.set(format, cls);
}

/**
 * Register a writer for a format name. This also makes `SeqRecord.format(format)` work.
 */
export function registerWriter(format: string, cls: WriterClass): void {
  FORMAT_TO_WRITER.set(format, cls);
  SeqRecord.writers.set(format, (record) => {
    try {
      return cls.asString(record);
    } catch (e) {
      if (e instanceof StreamModeError) throw new ValueError(`Binary format ${format} cannot be used with SeqRecord format method`);
      throw e;
    }
  });
}
