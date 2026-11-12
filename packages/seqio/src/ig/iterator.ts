/** Reader for IntelliGenetics (`ig`) files, as used by MASE alignments. */

import { ValueError, pyRepr, pyRstrip, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";

/**
 * Reads IntelliGenetics files: `;` comment lines, a title line, then sequence lines ending with a `1` terminator.
 * The title is both `id` and `name`; the comment lines go to `annotations["comment"]`.
 *
 * @throws {@link ValueError} if a record does not start with `;`, or a `1` appears inside a sequence.
 */
export class IgIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null = null;

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    super(source, alphabet, "IntelliGenetics");
    // Skip the file header: lines starting with ";;".
    for (const line of this.stream!) {
      if (!line.startsWith(";;")) { this.line = line; break; }
    }
  }

  protected nextRecord(): SeqRecord | null {
    let line = this.line;
    if (line === null) return null;
    if (line[0] !== ";") throw new ValueError(`Records should start with ';' and not:\n${pyRepr(line)}`);
    const stream = this.stream!;
    const commentLines: string[] = [];
    while (line.startsWith(";")) {
      commentLines.push(pyStrip(line.slice(1)));
      // Running out of lines inside the comment block ends the iteration (Python's StopIteration).
      const next = stream.readline();
      if (next === "") return null;
      line = next;
    }
    const title = pyRstrip(line);
    const seqLines: string[] = [];
    let following: string | null = null;
    for (const next of stream) {
      if (next[0] === ";") { following = next; break; }
      seqLines.push(pyRstrip(next).replaceAll(" ", ""));
    }
    let seq = seqLines.join("");
    if (seq.endsWith("1")) seq = seq.slice(0, -1);
    if (seq.includes("1")) throw new ValueError("Potential terminator digit one found within sequence.");
    this.line = following;
    return new SeqRecord(new Seq(seq), title, title, undefined, null, null, new Map([["comment", commentLines.join("\n")]]));
  }
}
