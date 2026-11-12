/** Indexers for IntelliGenetics and FASTQ, whose records need more than a marker line to delimit. */

import { AssertionError, decodeUtf8, reprBytes, firstToken, brstrip } from "./bytes.js";
import { SeqFileRandomAccess, type Entry } from "./proxies.js";

const valueError = (msg: string): Error => Object.assign(new Error(msg), { name: "ValueError" });

/** IntelliGenetics: `;` comment lines, then a name line, then the sequence. */
export class IntelliGeneticsRandomAccess extends SeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    h.seek(0);
    let offset = 0;
    let line = "";
    for (;;) {
      offset += line.length;
      line = h.readline();
      if (!line) break;
      if (!line.startsWith(";;")) break;
    }
    while (line) {
      let length = 0;
      if (offset + line.length !== h.tell()) throw new AssertionError("");
      if (!line.startsWith(";")) throw valueError(`Records should start with ';' and not:\n${reprBytes(line)}`);
      while (line.startsWith(";")) { length += line.length; line = h.readline(); }
      const key = brstrip(line);
      while (line && !line.startsWith(";")) { length += line.length; line = h.readline(); }
      yield [decodeUtf8(key), offset, length];
      offset += length;
      if (offset + line.length !== h.tell()) throw new AssertionError("");
    }
  }

  getRaw(offset: number): string {
    const h = this.handle;
    h.seek(offset);
    const lines: string[] = [];
    let line = h.readline();
    while (line.startsWith(";")) { lines.push(line); line = h.readline(); }
    while (line && !line.startsWith(";")) { lines.push(line); line = h.readline(); }
    return lines.join("");
  }
}

/** FASTQ in any of its three variants, including line-wrapped records whose quality lines can start with `@`. */
export class FastqRandomAccess extends SeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    h.seek(0);
    let start = h.tell();
    let line = h.readline();
    if (!line) return;
    if (line[0] !== "@") throw valueError(`Problem with FASTQ @ line:\n${reprBytes(line)}`);
    while (line) {
      const id = firstToken(brstrip(line.slice(1)));
      let seqLen = 0;
      let length = line.length;
      while (line) {
        line = h.readline();
        length += line.length;
        if (line.startsWith("+")) break;
        seqLen += brstripBoth(line).length;
      }
      if (!line) throw valueError("Premature end of file in seq section");
      let qualLen = 0;
      let end = 0;
      while (line) {
        if (seqLen === qualLen) {
          if (seqLen === 0) {
            line = h.readline();
            if (brstripBoth(line)) throw valueError(`Expected blank quality line, not ${reprBytes(line)}`);
            length += line.length;
          }
          end = h.tell();
          line = h.readline();
          if (line && line[0] !== "@") throw valueError(`Problem with line ${reprBytes(line)}`);
          break;
        } else {
          line = h.readline();
          qualLen += brstripBoth(line).length;
          length += line.length;
        }
      }
      if (seqLen !== qualLen) throw valueError("Problem with quality section");
      yield [decodeUtf8(id), start, length];
      start = end;
    }
  }

  getRaw(offset: number): string {
    const h = this.handle;
    h.seek(offset);
    let line = h.readline();
    let data = line;
    if (line[0] !== "@") throw valueError(`Problem with FASTQ @ line:\n${reprBytes(line)}`);
    let seqLen = 0;
    while (line) {
      line = h.readline();
      data += line;
      if (line.startsWith("+")) break;
      seqLen += brstripBoth(line).length;
    }
    if (!line) throw valueError("Premature end of file in seq section");
    let qualLen = 0;
    while (line) {
      if (seqLen === qualLen) {
        if (seqLen === 0) {
          line = h.readline();
          if (brstripBoth(line)) throw valueError(`Expected blank quality line, not ${reprBytes(line)}`);
          data += line;
        }
        line = h.readline();
        if (line && line[0] !== "@") throw valueError(`Problem with line ${reprBytes(line)}`);
        break;
      } else {
        line = h.readline();
        data += line;
        qualLen += brstripBoth(line).length;
      }
    }
    if (seqLen !== qualLen) throw valueError("Problem with quality section");
    return data;
  }
}

/** Python `bytes.strip()`. */
function brstripBoth(s: string): string {
  return brstrip(s).replace(/^[ \t\n\r\x0b\x0c]+/, "");
}
