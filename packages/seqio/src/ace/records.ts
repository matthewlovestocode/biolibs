/**
 * Record classes of Biopython's `Bio.Sequencing.Ace`. Field order and names (in camelCase) follow the Python
 * attributes; `line` constructors split a whitespace-separated header exactly as Python does, so a short header
 * raises `IndexError` and a non-numeric field `ValueError`.
 */

import { IndexError, pyInt, pySplit, pyStrip } from "@biolibs/core";

/** `header[i]`. @throws {@link IndexError} when the header is too short. */
function at(header: string[], i: number): string {
  const v = header[i];
  if (v === undefined) throw new IndexError("list index out of range");
  return v;
}

/** RD: a read's name, padded length, tag counts and sequence. */
export class Rd {
  name = "";
  paddedBases: number | null = null;
  infoItems: number | null = null;
  readTags: number | null = null;
  sequence = "";
}

/** QA: read quality and clipping coordinates. */
export class Qa {
  qualClippingStart: number | null = null;
  qualClippingEnd: number | null = null;
  alignClippingStart: number | null = null;
  alignClippingEnd: number | null = null;
  /** @param line - A `QA` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.qualClippingStart = pyInt(at(h, 1));
      this.qualClippingEnd = pyInt(at(h, 2));
      this.alignClippingStart = pyInt(at(h, 3));
      this.alignClippingEnd = pyInt(at(h, 4));
    }
  }
}

/** DS: names of the read's chromatogram, phd file, and so on. */
export class Ds {
  chromatFile = "";
  phdFile = "";
  time = "";
  chem = "";
  dye = "";
  template = "";
  direction = "";
  /** @param line - A `DS` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const tags = ["CHROMAT_FILE", "PHD_FILE", "TIME", "CHEM", "DYE", "TEMPLATE", "DIRECTION"] as const;
      // Python builds {position: tag} with the last tag winning a shared position, then drops the "not found" key -1.
      const tagpos = new Map<number, (typeof tags)[number]>();
      for (const t of tags) tagpos.set(line.indexOf(t), t);
      tagpos.delete(-1);
      const ps = [...tagpos.keys()].sort((a, b) => a - b);
      const fields: Record<(typeof tags)[number], "chromatFile" | "phdFile" | "time" | "chem" | "dye" | "template" | "direction"> = {
        CHROMAT_FILE: "chromatFile", PHD_FILE: "phdFile", TIME: "time", CHEM: "chem", DYE: "dye", TEMPLATE: "template", DIRECTION: "direction",
      };
      ps.forEach((p1, i) => {
        const p2 = i + 1 < ps.length ? ps[i + 1]! : line.length + 1;
        const tag = tagpos.get(p1)!;
        this[fields[tag]] = pyStrip(line.slice(p1 + tag.length + 1, p2));
      });
    }
  }
}

/** AF: where a read lies in the contig. */
export class Af {
  name = "";
  coru: string | null = null;
  paddedStart: number | null = null;
  /** @param line - An `AF` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.name = at(h, 1);
      this.coru = at(h, 2);
      this.paddedStart = pyInt(at(h, 3));
    }
  }
}

/** BS: which read was chosen as the consensus over a range. */
export class Bs {
  name = "";
  paddedStart: number | null = null;
  paddedEnd: number | null = null;
  /** @param line - A `BS` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.paddedStart = pyInt(at(h, 1));
      this.paddedEnd = pyInt(at(h, 2));
      this.name = at(h, 3);
    }
  }
}

/** RT: a transient read tag. */
export class Rt {
  name = "";
  tagType = "";
  program = "";
  paddedStart: number | null = null;
  paddedEnd: number | null = null;
  date = "";
  comment: string[] = [];
  /** @param line - An `RT` tag header line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.name = at(h, 0);
      this.tagType = at(h, 1);
      this.program = at(h, 2);
      this.paddedStart = pyInt(at(h, 3));
      this.paddedEnd = pyInt(at(h, 4));
      this.date = at(h, 5);
    }
  }
}

/** CT: a consensus tag. */
export class Ct {
  name = "";
  tagType = "";
  program = "";
  paddedStart: number | null = null;
  paddedEnd: number | null = null;
  date = "";
  notrans = "";
  info: string[] = [];
  comment: string[] = [];
  /** @param line - A `CT` tag header line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.name = at(h, 0);
      this.tagType = at(h, 1);
      this.program = at(h, 2);
      this.paddedStart = pyInt(at(h, 3));
      this.paddedEnd = pyInt(at(h, 4));
      this.date = at(h, 5);
      if (h.length === 7) this.notrans = h[6]!;
    }
  }
}

/** WA: a whole-assembly tag. */
export class Wa {
  tagType = "";
  program = "";
  date = "";
  info: string[] = [];
  /** @param line - A `WA` header line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.tagType = at(h, 0);
      this.program = at(h, 1);
      this.date = at(h, 2);
    }
  }
}

/** WR: a read alignment tag. */
export class Wr {
  name = "";
  aligned = "";
  program = "";
  date: string | string[] = [];
  /** @param line - A `WR` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.name = at(h, 0);
      this.aligned = at(h, 1);
      this.program = at(h, 2);
      this.date = at(h, 3);
    }
  }
}

/** The pieces of one read supporting a contig. */
export class Reads {
  rd: Rd | null = null;
  qa: Qa | null = null;
  ds: Ds | null = null;
  rt: Rt[] | null = null;
  wr: Wr[] | null = null;
  /** @param line - An `RD` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      this.rd = new Rd();
      const h = pySplit(line);
      this.rd.name = at(h, 1);
      this.rd.paddedBases = pyInt(at(h, 2));
      this.rd.infoItems = pyInt(at(h, 3));
      this.rd.readTags = pyInt(at(h, 4));
    }
  }
}

/** A contig: consensus sequence and quality, read placements and tags. */
export class Contig {
  name = "";
  nbases: number | null = null;
  nreads: number | null = null;
  nsegments: number | null = null;
  uorc: string | null = null;
  sequence = "";
  quality: number[] = [];
  af: Af[] = [];
  bs: Bs[] = [];
  reads: Reads[] = [];
  ct: Ct[] | null = null;
  wa: Wa[] | null = null;
  /** @param line - A `CO` line, or omitted for an empty record. */
  constructor(line = "") {
    if (line) {
      const h = pySplit(line);
      this.name = at(h, 1);
      this.nbases = pyInt(at(h, 2));
      this.nreads = pyInt(at(h, 3));
      this.nsegments = pyInt(at(h, 4));
      this.uorc = at(h, 5);
    }
  }
}
