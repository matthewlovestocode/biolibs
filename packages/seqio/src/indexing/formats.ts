/** Indexers for GenBank, EMBL/IMGT, Swiss-Prot and UniProt XML, whose record keys are not simply the first word. */

import { SeqRecord } from "@biolibs/seqrecord";
import { FORMAT_TO_ITERATOR } from "../registry.js";
import { AssertionError, brstrip, bsplit, bstrip, decodeUtf8, firstToken, reprBytes, toBytes } from "./bytes.js";
import { SequentialSeqFileRandomAccess, type Entry } from "./proxies.js";

/** Python's `ValueError`, as the indexers raise it. */
const valueError = (msg: string): Error => Object.assign(new Error(msg), { name: "ValueError" });
const count = (s: string, c: string): number => s.split(c).length - 1;

/** GenBank: the key is the LOCUS name, replaced by the ACCESSION and then by a `VERSION` of the form `ACC.n`. */
export class GenBankRandomAccess extends SequentialSeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    let [start, line] = this.skipToFirst();
    while (this.isMarker(line)) {
      let key: string | null = firstToken(line.slice(5));
      let length = line.length;
      for (;;) {
        const end = h.tell();
        line = h.readline();
        if (this.isMarker(line) || !line) {
          if (!key) throw valueError("Did not find usable ACCESSION/VERSION/LOCUS lines");
          yield [decodeUtf8(key), start, length];
          start = end;
          break;
        } else if (line.startsWith("ACCESSION ")) {
          const t = bsplit(brstrip(line));
          if (t.length > 1) key = t[1]!;
        } else if (line.startsWith("VERSION ")) {
          const t = bsplit(brstrip(line));
          if (t.length > 1) {
            const parts = t[1]!.split(".");
            if (parts.length === 2 && parts[1]!.length > 0 && /^[0-9]+$/.test(parts[1]!)) key = t[1]!;
          }
        }
        length += line.length;
      }
    }
  }
}

/** EMBL and IMGT: the key is the ID, replaced by the accession (AC) or by `ID.version` from the SV field. */
export class EmblRandomAccess extends SequentialSeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    let [start, line] = this.skipToFirst();
    while (this.isMarker(line)) {
      let setBySv = false;
      let length = line.length;
      let key: string;
      const semis = count(line.slice(2), ";");
      if (semis === 5 || semis === 6) {
        const parts = brstrip(line.slice(3)).split(";");
        if (bstrip(parts[1]!).startsWith("SV ")) { key = bstrip(parts[0]!) + "." + bsplit(bstrip(parts[1]!))[1]!; setBySv = true; }
        else key = bstrip(parts[0]!);
      } else if (semis === 2 || semis === 3) {
        key = firstToken(bstrip(line.slice(3)));
        if (key.endsWith(";")) key = key.slice(0, -1);
      } else throw valueError(`Did not recognise the ID line layout:\n${reprBytes(line)}`);
      for (;;) {
        line = h.readline();
        if (this.isMarker(line) || !line) {
          const end = h.tell() - line.length;
          yield [decodeUtf8(key), start, length];
          start = end;
          break;
        } else if (line.startsWith("AC ") && !setBySv) {
          const t = bsplit(brstrip(line));
          if (t.length < 2) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
          key = t[1]!;
          if (key.endsWith(";")) key = key.slice(0, -1);
        } else if (line.startsWith("SV ")) {
          const t = bsplit(brstrip(line));
          if (t.length < 2) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
          key = t[1]!;
          setBySv = true;
        }
        length += line.length;
      }
    }
  }
}

/** Swiss-Prot: the key is the first accession on the `AC` line that must follow the `ID` line. */
export class SwissRandomAccess extends SequentialSeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    let [start, line] = this.skipToFirst();
    while (this.isMarker(line)) {
      let length = line.length;
      line = h.readline();
      length += line.length;
      if (!line.startsWith("AC ")) throw new AssertionError("");
      const key = bstrip(bstrip(line.slice(3)).split(";")[0]!);
      for (;;) {
        const end = h.tell();
        line = h.readline();
        if (this.isMarker(line) || !line) { yield [decodeUtf8(key), start, length]; start = end; break; }
        length += line.length;
      }
    }
  }
}

/** UniProt XML: records are `<entry>` elements; the key is the first `<accession>`. */
export class UniprotRandomAccess extends SequentialSeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    let [start, line] = this.skipToFirst();
    while (this.isMarker(line)) {
      let length = line.length;
      let key: string | null = null;
      for (;;) {
        line = h.readline();
        if (key === null && line.includes("<accession>")) {
          if (!line.includes("</accession>")) throw new AssertionError(reprBytes(line));
          key = line.slice(line.indexOf("<accession>") + 11).split("<", 1)[0]!;
          length += line.length;
        } else if (line.includes("</entry>")) {
          length += line.indexOf("</entry>") + 8;
          const end = h.tell() - line.length + line.indexOf("</entry>") + 8;
          if (start + length !== end) throw new AssertionError("");
          break;
        } else if (this.isMarker(line) || !line) throw valueError("Didn't find end of record");
        else length += line.length;
      }
      if (!key) throw valueError(`Did not find <accession> line in bytes ${start} to ${start + length}`);
      yield [decodeUtf8(key), start, length];
      while (!this.isMarker(line) && line) { start = h.tell(); line = h.readline(); }
    }
  }

  getRaw(offset: number): string {
    const h = this.handle;
    h.seek(offset);
    const data = [h.readline()];
    for (;;) {
      const line = h.readline();
      const i = line.indexOf("</entry>");
      if (i !== -1) { data.push(line.slice(0, i + 8)); break; }
      if (this.isMarker(line) || !line) throw valueError("Didn't find end of record");
      data.push(line);
    }
    return data.join("");
  }

  override get(offset: number): SeqRecord {
    const wrapped = `<?xml version='1.0' encoding='UTF-8'?>
        <uniprot xmlns="http://uniprot.org/uniprot"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://uniprot.org/uniprot
        http://www.uniprot.org/support/docs/uniprot.xsd">
        `;
    const Cls = FORMAT_TO_ITERATOR.get("uniprot-xml")!;
    // The UniProt reader is a binary one -- it takes the bytes, because an XML prolog may declare an
    // encoding -- so the re-wrapped entry has to be handed over as bytes, not as decoded text.
    const it = new Cls(toBytes(wrapped + this.getRaw(offset) + "</uniprot>"));
    const first = it.next();
    if (first.done) throw Object.assign(new Error(""), { name: "StopIteration" });
    return first.value;
  }
}
