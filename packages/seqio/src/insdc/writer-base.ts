/** Shared machinery of the GenBank, EMBL and IMGT writers: feature tables, qualifier wrapping, annotation helpers. */

import { AssertionError, ValueError, pyRepr, pyStr, warn } from "@biolibs/core";
import { SequenceWriter } from "../interfaces.js";
import type { SeqFeature } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { insdcLocationString } from "@biolibs/seqfeature";

/** Characters allowed in feature keys and qualifier names. */
const ALLOWED = new Set([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'*"]);
const allAllowed = (s: string) => [...s].every((c) => ALLOWED.has(c));

/**
 * Base class of the INSDC writers. Subclasses set the column constants and implement `writeRecord`.
 */
export abstract class InsdcWriter extends SequenceWriter {
  get modes(): string { return "t"; }
  /** Maximum line width. */
  protected readonly MAX_WIDTH: number = 80;
  /** Column where feature locations and qualifiers start. */
  protected readonly QUALIFIER_INDENT: number = 21;
  /** Prefix of qualifier continuation lines. */
  protected readonly QUALIFIER_INDENT_STR: string = " ".repeat(21);
  /** Template for the feature-key column; `%s` is replaced by the key. */
  protected readonly QUALIFIER_INDENT_TMP: string = "     %s                ";
  /** Qualifiers whose values are written without quotes. */
  protected readonly FTQUAL_NO_QUOTE = [
    "anticodon", "citation", "codon_start", "compare", "direction", "estimated_length", "mod_base", "number", "rpt_type", "rpt_unit_range",
    "tag_peptide", "transl_except", "transl_table",
  ];
  /** Width of the keyword column. */
  protected readonly HEADER_WIDTH: number = 12;

  /** Write one qualifier (`/key="value"`), wrapping lines at {@link InsdcWriter.MAX_WIDTH}. `value` null writes a flag such as `/pseudo`. */
  protected writeFeatureQualifier(key: string, value: unknown = null, quote: boolean | null = null): void {
    if (!allAllowed(key)) warn(`Feature qualifier key '${key}' contains characters not allowed by standard.`);
    if (key.length > 20) warn(`Feature qualifier key '${key}' is longer than maximum length specified by standard (20 characters).`);
    if (value === null || value === undefined) {
      this.handle.write(`${this.QUALIFIER_INDENT_STR}/${key}\n`);
      return;
    }
    if (typeof value === "string") value = value.replaceAll('"', '""');
    if (quote === null) quote = !(typeof value === "number" && Number.isInteger(value) || this.FTQUAL_NO_QUOTE.includes(key));
    let line = quote ? `${this.QUALIFIER_INDENT_STR}/${key}="${pyStr(value)}"` : `${this.QUALIFIER_INDENT_STR}/${key}=${pyStr(value)}`;
    if (line.length <= this.MAX_WIDTH) {
      this.handle.write(line + "\n");
      return;
    }
    while (line.trimStart()) {
      if (line.length <= this.MAX_WIDTH) {
        this.handle.write(line + "\n");
        return;
      }
      // Break at the last space that fits, else hard-wrap at the maximum width.
      let index = this.MAX_WIDTH;
      for (let i = Math.min(line.length - 1, this.MAX_WIDTH); i > this.QUALIFIER_INDENT + 1; i--) {
        if (line[i] === " ") {
          index = i;
          break;
        }
      }
      this.handle.write(line.slice(0, index) + "\n");
      line = this.QUALIFIER_INDENT_STR + line.slice(index).trimStart();
    }
  }

  /** Break a location at commas so no line exceeds the maximum width. */
  protected wrapLocation(location: string): string {
    const length = this.MAX_WIDTH - this.QUALIFIER_INDENT;
    if (location.length <= length) return location;
    const index = location.slice(0, length).lastIndexOf(",");
    if (index === -1) {
      warn(`Couldn't split location:\n${location}`);
      return location;
    }
    return location.slice(0, index + 1) + "\n" + this.QUALIFIER_INDENT_STR + this.wrapLocation(location.slice(index + 1));
  }

  /** Write one feature: key and location, then qualifiers. */
  protected writeFeature(feature: SeqFeature, recordLength: number): void {
    if (!feature.type) throw new AssertionError(feature.toString());
    const fType = feature.type.replaceAll(" ", "_");
    if (!allAllowed(fType)) warn(`Feature key '${fType}' contains characters not allowed by standard.`);
    if (fType.length > 15) warn(`Feature key '${fType}' is longer than maximum length specified by standard (15 characters).`);
    const location = insdcLocationString(feature.location!, recordLength);
    const line = this.QUALIFIER_INDENT_TMP.replace("%s", fType).slice(0, this.QUALIFIER_INDENT) + this.wrapLocation(location) + "\n";
    this.handle.write(line);
    for (const [key, values] of feature.qualifiers) {
      if (Array.isArray(values)) for (const value of values) this.writeFeatureQualifier(key, value);
      else this.writeFeatureQualifier(key, values);
    }
  }

  /** An annotation as text; a one-item list gives its item, `default` if the key is missing. */
  protected static getAnnotationStr(record: SeqRecord, key: string, defaultValue: string | null = ".", justFirst = false): string | null {
    if (!record.annotations.has(key)) return defaultValue;
    const answer = record.annotations.get(key);
    if (Array.isArray(answer)) {
      if (!justFirst && answer.length !== 1) throw new AssertionError();
      return pyStr(answer[0]);
    }
    return pyStr(answer);
  }

  /** Greedily break text into lines of at most `maxLen` characters on word boundaries. */
  protected static splitMultiLine(text: string, maxLen: number): string[] {
    text = text.trim();
    if (text.length <= maxLen) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    text = "";
    while (words.length && text.length + 1 + words[0]!.length <= maxLen) text = (text + " " + words.shift()).trim();
    const answer = [text];
    while (words.length) {
      text = words.shift()!;
      while (words.length && text.length + 1 + words[0]!.length <= maxLen) text = (text + " " + words.shift()).trim();
      answer.push(text);
    }
    return answer;
  }

  /** Break a `contig` annotation at commas into lines of at most `maxLen` characters. */
  protected splitContig(record: SeqRecord, maxLen: number): string[] {
    let contig: unknown = record.annotations.has("contig") ? record.annotations.get("contig") : "";
    if (Array.isArray(contig)) contig = contig.join("");
    let rest = this.clean(contig as string);
    const answer: string[] = [];
    while (rest) {
      let text: string;
      if (rest.length > maxLen) {
        const pos = rest.slice(0, maxLen - 1).lastIndexOf(",");
        if (pos === -1) throw new ValueError("Could not break up CONTIG");
        text = rest.slice(0, pos + 1);
        rest = rest.slice(pos + 1);
      } else {
        text = rest;
        rest = "";
      }
      answer.push(text);
    }
    return answer;
  }

  /** Python `repr` helper re-exported for subclasses' warnings. */
  protected static repr(x: unknown): string {
    return pyRepr(x);
  }
}
