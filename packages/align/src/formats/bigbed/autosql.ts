/** AutoSQL tables: the declaration of a bigBed file's columns (`Bio.Align.bigbed.AutoSQLTable`). */

import { AssertionError, ValueError } from "@biolibs/core";

/** The field types an autoSql declaration may use. */
const TYPES = ["int", "uint", "short", "ushort", "byte", "ubyte", "float", "char", "string", "lstring"];

/** One column of the table: its type, its name and the comment describing it. */
export class Field {
  /**
   * @param asType - The autoSql type, possibly with `[n]` for an array.
   * @param name - The column name.
   * @param comment - The description, which the file carries in quotes.
   */
  constructor(readonly asType: string, readonly name: string, readonly comment: string) {}
}

/**
 * The columns of a (possibly extended) BED format.
 *
 * A list in Biopython, which this models as a class holding one: the fields are what a caller indexes, and the
 * name and comment belong to the table as a whole.
 */
export class AutoSQLTable {
  /**
   * @param name - The table name.
   * @param comment - Its description.
   * @param fields - Its columns.
   */
  constructor(public name: string, public comment: string, public fields: Field[]) {}

  /** @returns How many columns the table has. */
  get length(): number { return this.fields.length; }

  /**
   * Read a declaration from the bytes a bigBed file stores it as.
   *
   * @param data - The declaration, NUL-terminated as the file holds it.
   * @returns The table.
   * @throws AssertionError for text that is not an autoSql table, as Biopython's own asserts do.
   */
  static fromBytes(data: Uint8Array): AutoSQLTable {
    if (data.length === 0 || data[data.length - 1] !== 0) throw new AssertionError("");
    return AutoSQLTable.fromText(new TextDecoder().decode(data.subarray(0, data.length - 1)));
  }

  /**
   * Read a declaration from text.
   *
   * @param data - The declaration, without the NUL a file ends it with.
   * @returns The table.
   * @throws AssertionError for text that is not an autoSql table.
   */
  static fromString(data: string): AutoSQLTable { return AutoSQLTable.fromText(data); }

  /** The shared parser of {@link AutoSQLTable.fromBytes} and {@link AutoSQLTable.fromString}. */
  private static fromText(whole: string): AutoSQLTable {
    // `text.split(None, 1)`: split once on any run of whitespace.
    const splitOnce = (s: string): [string, string] => {
      const m = /^\s*(\S+)\s+([\s\S]*)$/.exec(s);
      if (m === null) throw new ValueError("not enough values to unpack (expected 2, got 1)");
      return [m[1]!, m[2]!];
    };
    const [word, afterWord] = splitOnce(whole);
    if (word !== "table") throw new AssertionError("");
    const [name, afterName] = splitOnce(afterWord);
    if (!afterName.startsWith('"')) throw new AssertionError("");
    const close = afterName.indexOf('"', 1);
    const comment = afterName.slice(1, close);
    let text = afterName.slice(close + 1).trim();
    if (!text.startsWith("(") || !text.endsWith(")")) throw new AssertionError("");
    text = text.slice(1, -1).trim();
    const fields: Field[] = [];
    while (text.length > 0) {
      const i = text.indexOf('"');
      const j = text.indexOf('"', i + 1);
      if (i === -1 || j === -1) throw new ValueError("substring not found");
      const fieldComment = text.slice(i + 1, j);
      const definition = text.slice(0, i).trim();
      if (!definition.endsWith(";")) throw new AssertionError("");
      // `rsplit(None, 1)`: the name is the last word, the type everything before it.
      const m = /^([\s\S]*\S)\s+(\S+)$/.exec(definition.slice(0, -1));
      if (m === null) throw new ValueError("not enough values to unpack (expected 2, got 1)");
      const fieldType = m[1]!, fieldName = m[2]!;
      const dataType = fieldType.endsWith("]") ? fieldType.slice(0, fieldType.indexOf("[")) : fieldType;
      if (!TYPES.includes(dataType)) throw new AssertionError("");
      fields.push(new Field(fieldType, fieldName, fieldComment));
      text = text.slice(j + 1).trim();
    }
    return new AutoSQLTable(name, comment, fields);
  }

  /** @returns The declaration as a file holds it, which is also Python's `str(table)`. */
  toString(): string {
    const typeWidth = Math.max(...this.fields.map((f) => f.asType.length));
    const nameWidth = Math.max(...this.fields.map((f) => f.name.length)) + 1;
    const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
    const lines = [`table ${this.name}\n`, `"${this.comment}"\n`, "(\n"];
    for (const field of this.fields) {
      lines.push(`   ${pad(field.asType, typeWidth)} ${pad(`${field.name};`, nameWidth)}    "${field.comment}"\n`);
    }
    lines.push(")\n");
    return lines.join("");
  }
}
