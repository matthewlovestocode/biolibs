/**
 * The alphabets a SEGUID checksum can be taken over, and the checks that go with them.
 *
 * An alphabet is written as a comma-separated list of pairs — `"GC,AT"` for plain DNA — which says both
 * which symbols may appear and which of them pair with which. A one-letter entry is a symbol that pairs
 * with nothing, which is what makes an alphabet single-stranded.
 */

import { AssertionError, ValueError } from "@biolibs/core";

/** The named alphabets, under the names the `seguid` package gives them. */
export const ALPHABETS: Readonly<Record<string, string>> = {
  "{DNA}": "GC,AT",
  "{RNA}": "GC,AU",
  "{DNA-extended}": "GC,AT,BV,DH,KM,SS,RY,WW,NN",
  "{RNA-extended}": "GC,AU,BV,DH,KM,SS,RY,WW,NN",
  "{protein}": "A,C,D,E,F,G,H,I,K,L,M,N,P,Q,R,S,T,V,W,Y,O,U",
  "{protein-extended}": "A,C,D,E,F,G,H,I,K,L,M,N,P,Q,R,S,T,V,W,Y,O,U,B,J,X,Z",
};

/**
 * The pairing table an alphabet specification describes.
 *
 * @param specification - The alphabet, with any of the names in {@link ALPHABETS} spelled out.
 * @returns Each symbol mapped to the symbols it pairs with, which is empty for a single-stranded one.
 * @throws ValueError for a specification whose entries are not all the same length, or longer than two.
 */
export function tableFactory(specification: string): Map<string, string> {
  let text = specification;
  for (const [name, value] of Object.entries(ALPHABETS)) text = text.split(name).join(value);
  let expected = -1;
  const table = new Map<string, string>();
  for (const spec of text.split(",")) {
    if (expected < 0) expected = spec.length;
    else if (spec.length !== expected) throw new AssertionError();
    if (spec.length === 1) {
      table.set(spec, "");
    } else if (spec.length === 2) {
      // Both ways round: each of the two symbols gains the other.
      table.set(spec[0]!, (table.get(spec[0]!) ?? "") + spec[1]!);
      table.set(spec[1]!, (table.get(spec[1]!) ?? "") + spec[0]!);
    } else {
      throw new ValueError(`Unknown alphabet specification: ${spec}`);
    }
  }
  return table;
}

/**
 * Check that every symbol of a sequence is one the alphabet knows.
 *
 * @param seq - The sequence. @param alphabet - The symbols allowed.
 * @throws ValueError naming the symbols that are not, as the `seguid` package words it.
 */
export function assertInAlphabet(seq: string, alphabet: Iterable<string>): void {
  const allowed = new Set(alphabet);
  if (allowed.size === 0) throw new AssertionError("Argument 'alphabet' must not be empty");
  if (seq.length === 0) return;
  // Python reports these in the order a set iterates them, which is their hash order and so changes with
  // the interpreter's hash seed from one run to the next. There is no order here to reproduce, so they are
  // sorted; every golden case that records this message sorts them the same way.
  const unknown = [...new Set([...seq].filter((c) => !allowed.has(c)))].sort();
  if (unknown.length > 0) {
    throw new ValueError(`Detected symbols ${JSON.stringify(unknown.join(" ")).replace(/"/g, "'")} not in the 'alphabet'`);
  }
}

/**
 * Check that two strands are each other's complement, position by position.
 *
 * @param watson - One strand. @param crick - The other, read in the opposite direction.
 * @param alphabet - The alphabet specification they are written in.
 * @throws ValueError for a pair that cannot exist, naming its position, and AssertionError for strands of
 *   different lengths or a single-stranded alphabet, which is how the `seguid` package refuses them.
 */
export function assertComplementary(watson: string, crick: string, alphabet: string): void {
  const table = tableFactory(alphabet);
  if (table.size <= 1) throw new AssertionError("Was a single-stranded alphabet used by mistake?");
  const first = [...table.values()][0]!;
  if (first.length !== 1) throw new AssertionError("Was a single-stranded alphabet used by mistake?");
  // A gap pairs with a gap, and is added to the table when the alphabet does not mention it.
  if (!table.has("-")) table.set("-", "-");
  if (watson.length !== crick.length) throw new AssertionError();
  assertInAlphabet(watson, table.keys());
  assertInAlphabet(crick, table.keys());
  const reversed = [...crick].reverse().join("");
  for (let i = 0; i < watson.length; i++) {
    if (watson[i] === "-" || reversed[i] === "-") continue;
    if (!table.get(watson[i]!)!.includes(reversed[i]!)) {
      throw new ValueError(`Non-complementary basepair (${watson[i]},${reversed[i]}) detected at position ${i + 1}`);
    }
  }
}
