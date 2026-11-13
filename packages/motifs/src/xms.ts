/** XMS motif files (Biopython's `Bio.motifs.xms`): XML with a `<motif>` per motif and a `<column>` of four `<weight>`s per position. */

import { pyFloat } from "@biolibs/core";
import { Motif } from "./motif.js";
import { parseXml, ParseError, type Element } from "./xml.js";

/** The motifs of an XMS file. */
export class XmsRecord extends Array<Motif> {
  /** @returns The motifs' texts joined by newlines. */
  override toString(): string { return Array.from(this, (m) => m.toString()).join("\n"); }
}

/** The text content of an element, all text nodes in order, with each run of white space collapsed to one space. */
function textOf(e: Element): string {
  const out: string[] = [];
  const walk = (el: Element): void => {
    if (el.text) out.push(el.text);
    for (const c of el.children) { walk(c); if (c.tail) out.push(c.tail); }
  };
  walk(e);
  return out.join("").replace(/\s+/g, " ");
}

const descendants = (e: Element, tag: string): Element[] => [...e.iter(tag)].filter((x) => x !== e);

/**
 * Read an XMS file.
 *
 * @param text - The file contents.
 * @throws An error named `ExpatError` for text that is not well-formed XML; ValueError for weights that are not numbers.
 */
export function read(text: string): XmsRecord {
  let doc: Element;
  try { doc = parseXml(text); } catch (e) {
    if (e instanceof ParseError) throw Object.assign(new Error(`${e.message.replace(/^<unknown>:\d+:\d+:\s*/, "")}: line ${e.position[0]}, column ${e.position[1]}`), { name: "ExpatError" });
    throw e;
  }
  const record = new XmsRecord();
  // minidom's getElementsByTagName on the document includes the root element itself.
  for (const node of [...doc.iter("motif")]) {
    const names = descendants(node, "name");
    // Biopython joins the text of every <name> element under the motif.
    const motifName = names.map(textOf).join("").replace(/\s+/g, " ");
    const counts = new Map<string, number[]>([["A", []], ["C", []], ["G", []], ["T", []]]);
    const symbols: Record<string, string> = { adenine: "A", cytosine: "C", guanine: "G", thymine: "T" };
    for (const column of descendants(node, "column")) {
      const w: Record<string, number> = { A: 0, C: 0, G: 0, T: 0 };
      for (const weight of descendants(column, "weight")) {
        const letter = symbols[weight.attrib.get("symbol") ?? ""];
        if (letter !== undefined) w[letter] = pyFloat(textOf(weight));
      }
      for (const l of "ACGT") counts.get(l)!.push(w[l]!);
    }
    const motif = new Motif("GATC", null, counts);
    motif.name = motifName;
    record.push(motif);
  }
  return record;
}
