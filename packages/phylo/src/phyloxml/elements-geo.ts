/** The phyloXML element classes for geography and protein domains. */

import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { type Num, PhyloElement } from "./element-base.js";

/** Geographic coordinates of a point. */
export class Point extends PhyloElement {
  alt: Num | null; altUnit: string | null;
  /** @param geodeticDatum - The datum. @param lat - Latitude. @param long - Longitude. @param alt - Altitude. @param altUnit - Its unit. */
  constructor(public geodeticDatum: string, public lat: Num, public long: Num, alt: Num | null = null, altUnit: string | null = null) { super(); this.alt = alt; this.altUnit = altUnit; }
  override pyDict(): [string, unknown][] { return [["geodetic_datum", this.geodeticDatum], ["lat", this.lat], ["long", this.long], ["alt", this.alt], ["alt_unit", this.altUnit]]; }
}

/** A polygon of points. */
export class Polygon extends PhyloElement {
  points: Point[];
  /** @param points - The vertices. */
  constructor(points: Point[] | null = null) { super(); this.points = points && points.length > 0 ? points : []; }
  override pyDict(): [string, unknown][] { return [["points", this.points]]; }
  override toString(): string { return `${this.constructor.name}([${this.points.map(String).join(",\n")}])`; }
}

/** The geographic distribution of a clade's items. */
export class Distribution extends PhyloElement {
  points: Point[]; polygons: Polygon[];
  /** @param desc - Description. @param points - Points. @param polygons - Polygons. */
  constructor(public desc: string | null = null, points: Point[] | null = null, polygons: Polygon[] | null = null) { super(); this.points = points && points.length > 0 ? points : []; this.polygons = polygons && polygons.length > 0 ? polygons : []; }
  override pyDict(): [string, unknown][] { return [["desc", this.desc], ["points", this.points], ["polygons", this.polygons]]; }
}

/** A domain of a protein; `start` and `end` are 0-based. */
export class ProteinDomain extends PhyloElement {
  /** @param value - Name. @param start - Start (0-based). @param end - End. @param confidence - E-value or similar. @param id - Identifier. */
  constructor(public value: string, public start: number, public end: number, public confidence: Num | null = null, public id: string | null = null) { super(); }

  /** A domain from a `SeqFeature` (its location's bounds, which stay `Position` objects as in Biopython). */
  static fromSeqfeature(feat: SeqFeature): ProteinDomain {
    const loc = feat.location!;
    return new ProteinDomain(feat.id, loc.start as unknown as number, loc.end as unknown as number, (feat.qualifiers.get("confidence") ?? null) as Num | null);
  }

  /** A `SeqFeature` with this domain's span, `id` set to the name, and the confidence as a qualifier. */
  toSeqfeature(): SeqFeature {
    const feat = new SeqFeature(new SimpleLocation(this.start, this.end), "", this.value);
    feat.qualifiers.set("confidence", this.confidence);
    return feat;
  }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["start", this.start], ["end", this.end], ["confidence", this.confidence], ["id", this.id]]; }
}

/** The domain architecture of a protein. */
export class DomainArchitecture extends PhyloElement {
  /** @param length - Protein length. @param domains - Its domains. */
  constructor(public length: number | null = null, public domains: ProteinDomain[] | null = null) { super(); }
  override pyDict(): [string, unknown][] { return [["length", this.length], ["domains", this.domains]]; }
}
