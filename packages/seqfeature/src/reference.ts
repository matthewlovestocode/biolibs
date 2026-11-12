/** `Reference`: a literature reference attached to a record. */

import type { Location } from "./location/index.js";
import { pyRepr } from "@biolibs/core";

/** Bibliographic reference from a GenBank record (Biopython's `Reference`). */
export class Reference {
  /** Parts of the sequence the reference applies to. */
  location: Location[] = [];
  /** Author list. */
  authors = "";
  /** Consortium name. */
  consrtm = "";
  /** Paper title. */
  title = "";
  /** Journal citation. */
  journal = "";
  /** MEDLINE id. */
  medlineId = "";
  /** PubMed id. */
  pubmedId = "";
  /** Free-text comment. */
  comment = "";

  /** Multi-line description in GenBank order. */
  toString(): string {
    let out = "";
    for (const single of this.location) out += `location: ${single}\n`;
    out += `authors: ${this.authors}\n`;
    if (this.consrtm) out += `consrtm: ${this.consrtm}\n`;
    out += `title: ${this.title}\n`;
    out += `journal: ${this.journal}\n`;
    out += `medline id: ${this.medlineId}\n`;
    out += `pubmed id: ${this.pubmedId}\n`;
    out += `comment: ${this.comment}\n`;
    return out;
  }

  /** `Reference(title='...', ...)`. */
  repr(): string {
    return `${this.constructor.name}(title=${pyRepr(this.title)}, ...)`;
  }

  /** Field-by-field equality, including locations. */
  equals(other: Reference): boolean {
    return (
      this.authors === other.authors && this.consrtm === other.consrtm && this.title === other.title && this.journal === other.journal &&
      this.medlineId === other.medlineId && this.pubmedId === other.pubmedId && this.comment === other.comment &&
      this.location.length === other.location.length && this.location.every((l, i) => l.equals(other.location[i]))
    );
  }
}
