/** XML namespace resolution for element and attribute names. */

import type { XmlName } from "./xml-types.js";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** Prefix-to-URI bindings in scope, innermost last. */
export class NamespaceScope {
  private readonly frames: Map<string, string>[] = [new Map([["xml", XML_NS]])];

  /** Enter an element, binding the given `xmlns` declarations (prefix `""` is the default namespace). */
  push(bindings: Map<string, string>): void {
    this.frames.push(bindings);
  }

  /** Leave an element. */
  pop(): void {
    this.frames.pop();
  }

  /** URI bound to `prefix`, or undefined. An empty default namespace means "none". */
  lookup(prefix: string): string | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const uri = this.frames[i]!.get(prefix);
      if (uri !== undefined) return uri;
    }
    return undefined;
  }

  /**
   * Expand a qualified name. Unprefixed elements take the default namespace; unprefixed attributes never have one.
   *
   * @returns The expanded name, or null if the prefix is not bound.
   */
  expand(qname: string, isAttribute: boolean): XmlName | null {
    const colon = qname.indexOf(":");
    if (colon < 0) {
      if (isAttribute) return [null, qname];
      const uri = this.lookup("");
      return [uri ? uri : null, qname];
    }
    const uri = this.lookup(qname.slice(0, colon));
    if (uri === undefined) return null;
    return [uri, qname.slice(colon + 1)];
  }
}
