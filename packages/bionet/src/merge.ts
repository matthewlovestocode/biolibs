/**
 * What a lab holds, worked out from every key's log together.
 *
 * Nothing here is stored state. Give `mergeLog` the entries and it returns the lab: who is on the
 * roster, which parts and items there are, how much of each. Give it the same entries in any order,
 * on any machine, and it returns the same lab — that is the whole point, because two people who have
 * been offline for a week have to agree the moment their laptops meet, without either being in charge.
 *
 * The rules it applies were each chosen for what goes wrong without them:
 *
 * - **Order comes from what an entry had seen**, never from a clock. A change counts as later than
 *   another only if its author held the other when they made it.
 * - **Amounts are differences.** Two people each using a tube while offline are two uses, not one
 *   overwriting the other. A recount says what is physically there and replaces only the adjustments
 *   its author had seen. Amounts are whole numbers of the item's unit, so that they have one spelling
 *   to sign and add up exactly; a lab that needs finer than a microlitre counts in something smaller.
 * - **A removal names a cutoff.** The entry that removes a key says the last entry of that key's log
 *   the lab accepts, so somebody removed cannot add to the lab afterwards by claiming not to have
 *   heard. What they wrote past the cutoff is kept, set aside, and shown.
 * - **When two changes truly overlap, the lower entry ID wins**, and the overlap is reported. It is
 *   the same choice on every machine and nobody can arrange it in advance. The one exception is an
 *   adviser: where its change overlaps somebody else's, theirs stands whichever ID is lower, so that
 *   a key that cannot change what a person wrote cannot do it by writing at the same moment either.
 * - **Between keepers, the one who has been a keeper longer is heard first.**
 *
 * It refuses quietly. An entry that is not allowed is still placed, with its status and the reason,
 * because the people in the lab need to see what was turned away and why.
 */
import { Dseq } from "@biolibs/dseq";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { seguid } from "@biolibs/seguid";
import type { SignOptions, SigningKey } from "@biolibs/opencloning";
import { entryId, readEntry, verifyEntry, writeEntry, type Operation, type PartEnds, type PartFeature, type PlanInput, type Role, type RunInput, type StandingMm,
         type PartKind, type SignedEntry } from "./log.js";
export type { PartKind, StrainRecord } from "./log.js";
import { INVENTORY_VERSION, type InventoryDocument, type InventoryPart, type LabModel,
         type PeerModel } from "./model.js";

/** The longest sequence one part may have. */
export const LONGEST_SEQUENCE = 500_000;

/** One key on the roster, now or once. */
export interface RosterKey {
  /** The key, 32 bytes in base64url. */
  key: string;
  /** Whose device it is. A claim made by whoever added it. */
  person: string;
  /** What it may do. */
  role: Role;
  /** Whether this is the key that founded the lab. */
  founder: boolean;
  /** The entry that put it on the roster. */
  added: string;
  /** If it was removed: by which entry, and the last `seq` of its log the lab accepts. */
  removed: { by: string; cutoff: number } | null;
}

/** One part the lab knows of: a piece of DNA, or a protein. */
export interface PartState {
  /** Its checksum, which is its identity. A protein's is counted differently from DNA's. */
  checksum: string;
  /** What it is made of. */
  kind: PartKind;
  /** Its bases. */
  sequence: string;
  /** Whether it is a circle. */
  circular: boolean;
  /** How long it is. */
  length: number;
  /** What the lab calls it. */
  name: string;
  /** Whether it is on offer to other labs. Nothing is until somebody says so. */
  offered: boolean;
  /** What is marked on its sequence: genes, promoters, origins. None until somebody says. */
  features: PartFeature[];
  /** How many bases at each end are on one strand only: positive for a 5′ overhang, negative for a 3′ one, 0 for blunt. */
  ends: PartEnds;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that added it. */
  added: string;
}

/** One strain the lab keeps. */
export interface StrainState {
  /** Its ID. */
  strain: string;
  /** What the lab calls it. */
  name: string;
  /** The organism it is. */
  host: string;
  /** The checksums of the parts it carries. */
  carries: string[];
  /** The strain it was made from, if the lab has that one. */
  parent: string | null;
  /** The run that made it, if one did. */
  from: string | null;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that added it. */
  added: string;
}

/** Something the lab physically has and cannot yet name. */
export interface SpecimenState {
  /** Its ID. */
  specimen: string;
  /** What the lab would write on the tube. Never a claim about what is in it. */
  name: string;
  /** Anything said about where it came from. */
  note: string | null;
  /** The checksum it turned out to be, once an identification said so, or `null` while unknown. */
  is: string | null;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that added it. */
  added: string;
}

/** One physical item: a tube of a molecule, a culture of a strain, or a tube of a specimen. */
export interface ItemState {
  /** Its ID. */
  item: string;
  /**
   * The checksum of the part it is an item of, or `null`. Exactly one of this, `strain` and
   * `specimen` is set when it is added; a specimen that has since been identified reads with both
   * `specimen` and `part`, because the tube is the same tube and is now known.
   */
  part: string | null;
  /** The strain it is a culture of, or `null` if it is not a culture. */
  strain: string | null;
  /** The specimen it is a tube of, or `null`. Set whether or not it has been identified. */
  specimen: string | null;
  /** What one of its amount is, if anybody said: a tube, a microlitre. */
  unit: string | null;
  /** How much there is, by the log. Always a whole number of the unit. */
  amount: number;
  /** Whether it has been retired. */
  retired: boolean;
  /** Whether the log has lost track: the amount went below zero, or two recounts overlapped. */
  needsRecount: boolean;
  /** The run that made it, if one did. */
  from: string | null;
  /** Where it is, if anybody has said: the place, and the position if the place is a box. */
  where: { place: string; slot: { row: number; column: number } | null } | null;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that added it. */
  added: string;
}

/** One place: a room, a freezer, a shelf, a box. */
export interface PlaceState {
  /** Its ID. */
  place: string;
  /** What kind of place it is. Anything a lab calls one; the usual ones are drawn knowingly. */
  kind: string;
  /** What the lab calls it. */
  name: string;
  /** The place it is in, or `null` if it is in nothing. */
  parent: string | null;
  /** Its positions, if it is a box. Fixed when it is added. */
  grid: { rows: number; columns: number } | null;
  /** Where it stands and how big it is, if anybody has said. */
  standing: StandingMm | null;
  /** Whether it has been retired. */
  retired: boolean;
  /**
   * Whether moves made apart left it inside itself. Such a place is shown as being in nothing
   * until somebody moves it.
   */
  adrift: boolean;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that added it. */
  added: string;
}

/** Something done at the bench, as the lab records it. */
export interface RunState {
  /** Its ID. */
  run: string;
  /** What kind of run it was: `pcr`. */
  kind: string;
  /** The place it was done at, or `null`. */
  instrument: string | null;
  /** What went in, and how much of each was used. */
  inputs: RunInput[];
  /** The items it made, and the part each is an item of. */
  outputs: { item: string; part: string }[];
  /** How it was set up. */
  settings: Record<string, string | number>;
  /** Whether it worked. */
  outcome: "worked" | "failed";
  /** Anything said about it. */
  note: string | null;
  /** The entry that recorded it. */
  added: string;
}

/**
 * Something the lab understands the makeup of and has not made.
 *
 * The mirror of a specimen: a specimen is a tube the lab holds and cannot name, this is a thing the
 * lab can name and does not hold. It has no checksum, because there is no sequence to count one
 * over, so like a culture and like a specimen it cannot travel in a method.
 *
 * It exists so that the steps after it can be written down while it is still hypothetical. The chain
 * of work used to stop at a transformation — what that makes is alive and has nothing to point at —
 * and a plan after it could name nothing at all. Now it can name this, and say plainly that it rests
 * on something nobody is holding.
 */
export interface ProspectState {
  /** Its ID. */
  prospect: string;
  /** What it would be called. */
  name: string;
  /** What kind of thing: `strain`, `culture`, `mixture`, `curd`. */
  kind: string;
  /** What it would be made of, said for a person. */
  madeOf: string;
  /** Anything else said about it. */
  note: string | null;
  /** What it turned out to be once somebody made it, or `null` while it is still in prospect. */
  became: { strain: string | null; item: string | null; by: string; entry: string } | null;
  /** The key that named it. */
  by: string;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that named it. */
  added: string;
}

/**
 * What a lab expects to see if a plan worked, and what was seen.
 *
 * A plan says what it would make; this says what somebody would observe. Keeping them apart is the
 * point: a correct molecule can give a reading nobody expected, and a reading that looks right can
 * come from the wrong molecule. One is a claim about a thing, the other about looking at it.
 */
export interface ExpectationState {
  /** Its ID. */
  expect: string;
  /** The plan it is about. */
  plan: string;
  /** How it would be observed: `digest`, `colony pcr`, `protein gel`. */
  kind: string;
  /** What to expect, for somebody at the bench to read. */
  says: string;
  /** The readings expected, as whole numbers. */
  numbers: number[];
  /** How to observe it: which enzymes, which gel. */
  settings: Record<string, string | number>;
  /** Anything else said about it. */
  note: string | null;
  /** The key that wrote it. */
  by: string;
  /** What was seen, or `null` while nobody has looked. */
  met: { met: boolean; saw: number[]; run: string | null; note: string | null; by: string; entry: string } | null;
  /**
   * Taken back, or `null`. An expectation written in error or on the wrong step is withdrawn rather
   * than removed: the entry stays in the log, and this says it is no longer something to look for.
   */
  withdrawn: { note: string | null; by: string; entry: string } | null;
  /** Anything else set on it. */
  fields: Record<string, string | number | null>;
  /** The entry that wrote it. */
  added: string;
}

/** A run somebody has proposed, as the lab holds it. */
export interface PlanState {
  /** Its ID. */
  plan: string;
  /** What kind of run it would be: `pcr`. */
  kind: string;
  /** The place to do it at, or `null`. */
  instrument: string | null;
  /** What it would use: a tube, or a part there is no tube of yet. */
  inputs: PlanInput[];
  /** What it is expected to make, each with the checksum that would be its identity. */
  expects: { name: string; sequence: string; circular: boolean; ends: PartEnds; length: number; checksum: string }[];
  /** The prospects it would bring into existence: what it makes that has no sequence to expect. */
  makes: string[];
  /** How to set it up. */
  settings: Record<string, string | number>;
  /** Why, and anything else said about it. */
  note: string | null;
  /** The key that proposed it. */
  by: string;
  /** What became of it: the run that carried it out, or `null` for that if it was set aside. `null` while it is open. */
  settled: { run: string | null; by: string; entry: string } | null;
  /**
   * For a plan still open: the tubes it counts on that have since been retired or hold less than it
   * would use. The plan is kept and shown; somebody has to look before carrying it out.
   */
  wanting: string[];
  /**
   * For a plan still open: the molecules it would use that only a plan the lab has set aside would
   * have made. Refiling a plan leaves the ones downstream of it naming what the old plan would have
   * made, which no entry is wrong for saying and no reader of one entry can see. A molecule still to
   * be ordered is not listed: nothing was ever going to make it here.
   */
  orphaned: string[];
  /** Anything else set on it, such as which project it is part of. */
  fields: Record<string, string | number | null>;
  /** The entry that proposed it. */
  added: string;
}

/** One position of one box that the log says holds more than one item. */
export interface Crowded {
  /** The box. */
  place: string;
  /** The position. */
  slot: { row: number; column: number };
  /** The items the log has there. */
  items: string[];
}

/** What became of one entry. */
export type EntryStatus = "applied" | "set aside" | "refused" | "not understood";

/** One entry, in the order the merge settled on, with what became of it. */
export interface Placed {
  /** Its ID. */
  id: string;
  /** The entry. */
  signed: SignedEntry;
  /** Whether it counted. */
  status: EntryStatus;
  /** Why not, if not. */
  reason: string | null;
}

/** An entry that could not be placed, or was not looked at further. */
export interface Unplaced {
  /** What arrived. */
  signed: unknown;
  /** Why it is not in the lab. */
  reason: string;
}

/** Two changes made without knowledge of each other, where only one could stand. */
export interface Overlap {
  /** What they were both about. */
  what: string;
  /** The entry that stood. */
  kept: string;
  /** The entry that did not. */
  dropped: string;
}

/** A lab, as its logs describe it. */
export interface LabState {
  /** The lab's ID, or `null` if no founding entry was among the entries. */
  lab: string | null;
  /** What its founder called it. */
  name: string | null;
  /** Every key that is or was on the roster. */
  roster: RosterKey[];
  /** Every part. */
  parts: PartState[];
  /** Every strain. */
  strains: StrainState[];
  /** Everything the lab has and cannot yet name. */
  specimens: SpecimenState[];
  /** What the lab expects to see of its plans, and what was seen. */
  expectations: ExpectationState[];
  /** Things the lab means to have and has not made. */
  prospects: ProspectState[];
  /** Every item. */
  items: ItemState[];
  /** Every place. */
  places: PlaceState[];
  /** Positions the log says hold more than one item. Somebody has to go and look. */
  crowded: Crowded[];
  /** Everything done at the bench that was recorded, in the order the merge settled on. */
  runs: RunState[];
  /** Every run that has been proposed, open or settled, in the order the merge settled on. */
  plans: PlanState[];
  /** Every entry that could be placed, in order, with what became of it. */
  entries: Placed[];
  /** Entries that are waiting on others that have not arrived. */
  waiting: Unplaced[];
  /** Entries that were thrown out before they were placed: unreadable, badly signed, another lab's. */
  discarded: Unplaced[];
  /** Changes that overlapped. */
  overlaps: Overlap[];
  /** The latest placed entry in each key's log. */
  heads: Record<string, { seq: number; id: string }>;
  /** For each key, how far into every log its latest entry had seen. */
  knows: Record<string, Record<string, number>>;
}

/** An entry inside the merge. */
interface Node {
  id: string;
  signed: SignedEntry;
  author: string;
  seq: number;
  op: Operation;
  /** How far into each log this entry had seen, itself included. Set when it is placed. */
  vc: Map<string, number>;
  /** Whether its key was an adviser when it was placed. Set when it is placed. */
  adviser?: boolean;
}

const KEY = /^[A-Za-z0-9_-]{43}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,80}$/;
const FIELD = /^[a-z][a-z0-9_]{0,59}$/;
const RESERVED = new Set(["amount", "part", "item", "checksum", "sequence", "circular", "length", "offered", "retired", "features", "ends"]);

const text = (value: unknown, most: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= most;
/** An amount is a whole number of the item's unit: only whole numbers have one agreed spelling to sign. */
/** Fields of a place that are changed by their own operations, not by `field.set`. */
const PLACE_RESERVED = new Set(["place", "kind", "parent", "grid", "standing", "retired", "adrift"]);
/** The same, for a strain: what it is and came from is fixed when it is added. */
const STRAIN_RESERVED = new Set(["strain", "host", "carries", "parent", "from"]);
const SPECIMEN_RESERVED = new Set(["specimen", "note", "is", "added"]);
const PROSPECT_RESERVED = new Set(["prospect", "name", "kind", "madeOf", "note", "became", "by", "added"]);
const EXPECT_RESERVED = new Set(["expect", "plan", "kind", "says", "numbers", "settings", "note", "by", "met", "withdrawn", "added"]);

/**
 * What a plan's fields may not be called.
 *
 * A plan is a proposal somebody made, and what it would do is not a label on it: letting a field
 * rewrite the kind of run, what it would use or what it expects would turn a proposal into
 * something nobody proposed. A field says what a plan is *about* — which project it is part of,
 * say — and nothing about what carrying it out would do.
 */
const PLAN_RESERVED = new Set(["plan", "kind", "instrument", "inputs", "expects", "settings", "note", "by", "settled", "wanting", "orphaned", "added"]);

/** The most positions a box may have along one side, and the farthest a place may stand or reach, in millimetres. */
const MOST_SIDE = 100;
const FARTHEST = 1_000_000;

const isGrid = (value: unknown): value is { rows: number; columns: number } => {
  const grid = value as { rows?: unknown; columns?: unknown } | null;
  return typeof grid === "object" && grid !== null && [grid.rows, grid.columns].every((side) => Number.isSafeInteger(side) && (side as number) >= 1 && (side as number) <= MOST_SIDE);
};

const isSlot = (value: unknown): value is { row: number; column: number } => {
  const slot = value as { row?: unknown; column?: unknown } | null;
  return typeof slot === "object" && slot !== null && [slot.row, slot.column].every((at) => Number.isSafeInteger(at) && (at as number) >= 0);
};

const isStanding = (value: unknown): value is StandingMm => {
  const standing = value as Partial<StandingMm> | null;
  const three = (list: unknown, least: number): boolean =>
    Array.isArray(list) && list.length === 3 && list.every((one) => Number.isSafeInteger(one) && one >= least && one <= FARTHEST);
  return typeof standing === "object" && standing !== null && three(standing.at, -FARTHEST) && three(standing.size, 1)
    && [0, 90, 180, 270].includes(standing.turn as number);
};

/** The most features a part may carry, and the most pieces one feature may be in. */
const MOST_FEATURES = 2_000;
const MOST_PIECES = 100;

/**
 * The molecule a part or a run's output describes, with its checksum.
 *
 * Ends are part of what a molecule is: the same bases with different ends join to different things,
 * so they give a different checksum. Blunt ends give the checksum the bases alone always gave.
 *
 * @param sequence - Every base either strand has, read along the top strand.
 * @param circular - Whether it is a circle.
 * @param ends - What `ends` the entry carried, if any.
 * @returns The molecule's length, checksum and ends.
 * @throws If that is not a sequence, or the ends are not ones a linear molecule of that length can have.
 */
function moleculeOf(sequence: string, circular: boolean, ends: unknown, kind: PartKind = "dna"): { length: number; checksum: string; ends: PartEnds } {
  const blunt = { left: 0, right: 0 };
  if (kind === "protein") {
    // A protein has no strands, so no ends and no circle, and its checksum is counted over the
    // amino acids. The same letters as DNA must never give the same checksum.
    if (circular || (ends !== undefined && ends !== null && (ends as PartEnds).left !== 0)) throw new Error("protein");
    // A stop is not an amino acid and a part is a molecule somebody holds: there is no tube of a
    // chain with a stop in the middle of it. It was refused before this said so, because the
    // checksum underneath has no letter for it, but it was refused by an exception from two layers
    // down rather than by a rule that can be read.
    if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/i.test(sequence)) throw new Error("protein");
    return { length: sequence.length, checksum: String(seguid(sequence.toUpperCase(), "{protein}")), ends: blunt };
  }
  if (ends === undefined) { const record = new Dseqrecord(sequence, circular); return { length: record.length, checksum: record.seguid(), ends: blunt }; }
  const given = ends as Partial<PartEnds> | null;
  if (typeof given !== "object" || given === null || !amountOf(given.left) || !amountOf(given.right)) throw new Error("ends");
  if (given.left === 0 && given.right === 0) return moleculeOf(sequence, circular, undefined);
  // A circle has no ends, and two overhangs cannot between them be longer than the molecule.
  if (circular || Math.abs(given.left) + Math.abs(given.right) >= sequence.length) throw new Error("ends");
  const record = new Dseqrecord(Dseq.fromFullSequenceAndOverhangs(sequence, -given.left, -given.right));
  return { length: sequence.length, checksum: record.seguid(), ends: { left: given.left, right: given.right } };
}

/**
 * The checksum a part would have: what its identity will be once it is in the log.
 *
 * It is here because a tool sometimes has to name a molecule before the lab holds it — to say in a
 * run's settings which protein the run is expected to make, or to look for a part the lab may
 * already have. The alternative is each tool counting a checksum its own way, and a part named by a
 * checksum nobody else arrives at is a part nobody else will ever match. So the rule lives in one
 * place and this is the way to it.
 *
 * @param part - Its bases or amino acids, whether it is a circle, what ends it has, and what it is
 *   made of. DNA if nothing says.
 * @returns The checksum.
 * @throws If that is not a sequence of what it says it is, or a linear molecule of that length
 *   cannot have those ends, or it is a protein said to be a circle.
 *
 * @example
 * ```ts
 * import { partChecksum } from "@biolibs/bionet";
 *
 * partChecksum({ sequence: "MKVLILACLVALALA", kind: "protein" });    // the protein's identity
 * ```
 */
export function partChecksum(part: { sequence: string; circular?: boolean; ends?: PartEnds; kind?: PartKind }): string {
  return moleculeOf(part.sequence.replace(/\s+/g, ""), part.circular === true, part.ends, part.kind ?? "dna").checksum;
}

/** Whether something is a list of features that lie within a part of a given length. */
function areFeatures(value: unknown, length: number): value is PartFeature[] {
  if (!Array.isArray(value) || value.length > MOST_FEATURES) return false;
  return value.every((one: Partial<PartFeature> | null) => typeof one === "object" && one !== null && text(one.type, 40) && text(one.label, 200)
    && (one.strand === -1 || one.strand === 0 || one.strand === 1) && Array.isArray(one.parts) && one.parts.length >= 1 && one.parts.length <= MOST_PIECES
    && one.parts.every((piece: { start?: unknown; end?: unknown } | null) => typeof piece === "object" && piece !== null && amountOf(piece.start) && amountOf(piece.end)
      && piece.start >= 0 && piece.end > piece.start && piece.end <= length));
}

/**
 * What a value in a change may be, for the purpose of knowing it: `true` for anything at all, an
 * object for something whose fields are listed, and a list of one shape for a list of those.
 */
type Known = true | { readonly [field: string]: Known } | readonly [Known];

/**
 * Every field each kind of change may carry, and every field inside those.
 *
 * This exists because of what happened when parts learned to have ends. A version that did not know
 * `ends` took such an entry, ignored them, and worked the part's checksum out from the bases alone —
 * so two machines read one entry differently, which is the one thing the merge must never do. A kind
 * of change a version does not know is refused and said so; a *field* it does not know used to pass
 * unnoticed. Now it does not: anything not listed here is as unreadable as an unknown change.
 *
 * So adding a field is a breaking change for older readers, and it is meant to be. They will set the
 * entry aside and say why, which a person can act on, instead of quietly disagreeing about the lab.
 *
 * `true` means the value is not looked into: `settings` on a run and `value` on a field are open by
 * design, and `at`, `size` and a feature's strand are numbers rather than things with fields.
 */
const KNOWN: Readonly<Record<string, Readonly<Record<string, Known>>>> = {
  "roster.found": { name: true, person: true },
  "roster.add": { key: true, person: true, role: true },
  "roster.remove": { key: true, cutoff: true },
  "roster.role": { key: true, role: true },
  "part.add": { sequence: true, circular: true, name: true, kind: true, ends: { left: true, right: true } },
  "part.annotate": { part: true, features: [{ type: true, label: true, strand: true, parts: [{ start: true, end: true }] }] },
  "part.offer": { part: true, available: true },
  "item.add": { item: true, part: true, strain: true, specimen: true, amount: true, unit: true },
  "strain.add": { strain: true, name: true, host: true, carries: true, parent: true, from: true },
  "specimen.add": { specimen: true, name: true, note: true },
  "specimen.identify": { specimen: true, part: true },
  "expect.add": { expect: true, plan: true, kind: true, says: true, numbers: true, settings: true, note: true },
  "expect.meet": { expect: true, met: true, saw: true, run: true, note: true },
  "expect.withdraw": { expect: true, note: true },
  "prospect.add": { prospect: true, name: true, kind: true, madeOf: true, note: true },
  "prospect.realise": { prospect: true, strain: true, item: true },
  "item.adjust": { item: true, by: true },
  "item.recount": { item: true, amount: true },
  "item.retire": { item: true },
  "item.put": { item: true, place: true, slot: { row: true, column: true } },
  "place.add": { place: true, kind: true, name: true, parent: true, grid: { rows: true, columns: true } },
  "place.move": { place: true, parent: true },
  "place.stand": { place: true, standing: { at: true, size: true, turn: true } },
  "place.retire": { place: true },
  "run.record": {
    run: true, kind: true, instrument: true, settings: true, outcome: true, note: true,
    inputs: [{ item: true, amount: true, role: true }],
    outputs: [{ item: true, sequence: true, circular: true, ends: { left: true, right: true }, name: true, amount: true, unit: true }],
  },
  "plan.add": {
    plan: true, kind: true, instrument: true, settings: true, note: true, makes: true,
    inputs: [{ item: true, part: true, prospect: true, amount: true, role: true }],
    expects: [{ sequence: true, circular: true, ends: { left: true, right: true }, name: true }],
  },
  "plan.settle": { plan: true, run: true },
  "field.set": { on: true, id: true, field: true, value: true },
};

/**
 * What an adviser may write. Everything else from one is refused.
 *
 * `part.annotate` is here with a condition the roster cannot answer, so it is checked again where
 * the parts are known: an adviser may say what is on a part that nothing is marked on, and may not
 * change what somebody has already marked.
 */
// An adviser may say what to look for, because that is reading and working out. It may not say what
// was seen: a reading is made by somebody standing at a bench, and nothing with no hands was there.
const ADVISER_MAY = new Set(["part.add", "part.annotate", "plan.add", "plan.settle", "field.set", "expect.add", "expect.withdraw"]);

/**
 * The first field in a change that this version does not know, if there is one.
 *
 * @param value - What to look at.
 * @param known - What its fields may be.
 * @param where - What to call it in the answer, such as `outputs`.
 * @returns The field's name, said as a path, or `null` if every field is one this version knows.
 */
function strayIn(value: unknown, known: Known, where: string): string | null {
  if (known === true || value === null || typeof value !== "object") return null;
  if (Array.isArray(known)) {
    if (!Array.isArray(value)) return null;        // that it is not a list is settled by the checks below
    for (const [at, one] of value.entries()) {
      const stray = strayIn(one, known[0]!, `${where}[${at}]`);
      if (stray !== null) return stray;
    }
    return null;
  }
  if (Array.isArray(value)) return null;
  // Not a list, so it is the object form; TypeScript cannot see that through the tuple in the union.
  const fields = known as Readonly<Record<string, Known>>;
  for (const [field, held] of Object.entries(value as Record<string, unknown>)) {
    const path = where === "" ? field : `${where}.${field}`;
    if (!Object.hasOwn(fields, field)) return path;
    const stray = strayIn(held, fields[field]!, path);
    if (stray !== null) return stray;
  }
  return null;
}

/**
 * The first field a change carries that this version does not know.
 *
 * @param op - The change.
 * @returns The field's name, or `null` if this version knows every field it carries, or does not
 *   know the kind of change at all — which is settled elsewhere, and said differently.
 */
export function strayField(op: Operation): string | null {
  const known = Object.hasOwn(KNOWN, op.type) ? KNOWN[op.type]! : undefined;
  if (known === undefined) return null;
  const { type: _type, ...rest } = op as Record<string, unknown>;
  void _type;
  return strayIn(rest, known, "");
}

/** The most items that may go into one run or come out of it, and the most settings it may carry. */
const MOST_IN_A_RUN = 50;

/** Whether something is a run's settings: whole numbers and short text, by name. */
const areSettings = (settings: unknown): settings is Record<string, string | number> =>
  typeof settings === "object" && settings !== null && !Array.isArray(settings) && Object.keys(settings).length <= MOST_IN_A_RUN
    && Object.entries(settings).every(([name, value]) => FIELD.test(name) && (amountOf(value) || (typeof value === "string" && value.length <= 200)));

/**
 * Why a plan cannot be kept, or `null` if it can.
 *
 * Only its form is checked: that it names things the lab has and that what it expects is a
 * molecule. Whether the run would really make that is not the log's to say. Each reader's own
 * tools work it out again, which is why the plan carries its claim and not its working.
 */
function planProblem(op: Operation, items: ReadonlyMap<string, unknown>, parts: ReadonlyMap<string, unknown>, places: ReadonlyMap<string, unknown>,
                     plans: ReadonlyMap<string, unknown>, prospects: ReadonlyMap<string, unknown>): string | null {
  if (!(typeof op["plan"] === "string" && ITEM_ID.test(op["plan"])) || !text(op["kind"], 40)) return "It does not carry a plan ID and what kind of run it would be.";
  if (plans.has(op["plan"])) return "A plan with that ID already exists.";
  if (!(op["instrument"] === null || (typeof op["instrument"] === "string" && places.has(op["instrument"])))) return "The place it would be done at is not one the lab has.";
  if (!(op["note"] === null || text(op["note"], 2_000))) return "Its note is not some text.";
  if (!areSettings(op["settings"])) return "Its settings are not whole numbers and short text, by name.";
  const inputs = op["inputs"];
  if (!Array.isArray(inputs) || inputs.length > MOST_IN_A_RUN) return "It does not list what it would use.";
  for (const input of inputs as Partial<PlanInput>[]) {
    if (typeof input !== "object" || input === null || !amountOf(input.amount) || input.amount < 0 || !text(input.role, 40)) return "It does not say how many whole units of each thing it would use, and as what.";
    if ([input.item, input.part, input.prospect].filter((one) => one !== undefined).length !== 1) {
      return "Each thing it would use has to be a tube, a part or a prospect, and only one of those.";
    }
    if (input.item !== undefined && !(typeof input.item === "string" && items.has(input.item))) return "A tube it would use is not an item the lab has.";
    if (input.part !== undefined && !(typeof input.part === "string" && parts.has(input.part))) return "A part it would use is not one the lab has.";
    if (input.prospect !== undefined && !(typeof input.prospect === "string" && prospects.has(input.prospect))) return "A prospect it would use is not one the lab has.";
  }
  const expects = op["expects"];
  if (!Array.isArray(expects) || expects.length > MOST_IN_A_RUN) return "It does not list what it expects to make.";
  for (const expect of expects as Record<string, unknown>[]) {
    if (typeof expect !== "object" || expect === null || !text(expect["sequence"], LONGEST_SEQUENCE) || typeof expect["circular"] !== "boolean" || !text(expect["name"], 200)) {
      return "It does not give each thing it expects a sequence, a name and whether it is a circle.";
    }
  }
  // What a run makes that has no sequence — a strain, a culture, a curd — is named as a prospect
  // instead, so that the step after it has something to point at.
  const makes = op["makes"];
  if (makes !== undefined) {
    if (!Array.isArray(makes) || makes.length > MOST_IN_A_RUN) return "It does not list what it would bring into existence.";
    for (const one of makes as unknown[]) {
      if (!(typeof one === "string" && prospects.has(one))) return "Something it would bring into existence is not a prospect the lab has.";
    }
  }
  return null;
}

/**
 * Why a run cannot be recorded, or `null` if it can.
 *
 * Everything is checked before anything is changed: an entry from another machine may be refused,
 * and must never leave a run half applied.
 */
function runProblem(op: Operation, items: ReadonlyMap<string, unknown>, places: ReadonlyMap<string, unknown>, runs: ReadonlySet<string>): string | null {
  if (!(typeof op["run"] === "string" && ITEM_ID.test(op["run"])) || !text(op["kind"], 40)) return "It does not carry a run ID and what kind of run it was.";
  if (runs.has(op["run"])) return "A run with that ID already exists.";
  if (!(op["instrument"] === null || (typeof op["instrument"] === "string" && places.has(op["instrument"])))) return "The place it was done at is not one the lab has.";
  if (op["outcome"] !== "worked" && op["outcome"] !== "failed") return "It does not say whether it worked.";
  if (!(op["note"] === null || text(op["note"], 2_000))) return "Its note is not some text.";
  const settings = op["settings"];
  if (typeof settings !== "object" || settings === null || Array.isArray(settings) || Object.keys(settings).length > MOST_IN_A_RUN
      || !Object.entries(settings).every(([name, value]) => FIELD.test(name) && (amountOf(value) || (typeof value === "string" && value.length <= 200)))) {
    return "Its settings are not whole numbers and short text, by name.";
  }
  const inputs = op["inputs"];
  if (!Array.isArray(inputs) || inputs.length > MOST_IN_A_RUN) return "It does not list what went in.";
  for (const input of inputs as Partial<RunInput>[]) {
    if (typeof input !== "object" || input === null || !amountOf(input.amount) || input.amount < 0 || !text(input.role, 40)) return "It does not say how many whole units of each thing went in, and as what.";
    if (typeof input.item !== "string" || !items.has(input.item)) return "Something it says went in is not an item the lab has.";
  }
  const outputs = op["outputs"];
  if (!Array.isArray(outputs) || outputs.length > MOST_IN_A_RUN) return "It does not list what came out.";
  if (op["outcome"] === "failed" && outputs.length > 0) return "A run that did not work made nothing.";
  const seen = new Set<string>();
  for (const output of outputs as Record<string, unknown>[]) {
    if (typeof output !== "object" || output === null || !(typeof output["item"] === "string" && ITEM_ID.test(output["item"]))
        || !text(output["sequence"], LONGEST_SEQUENCE) || typeof output["circular"] !== "boolean" || !text(output["name"], 200)
        || !amountOf(output["amount"]) || output["amount"] < 0 || !(output["unit"] === null || text(output["unit"], 20))) {
      return "It does not give each thing that came out an item ID, a sequence, a name, a whole amount and a unit.";
    }
    if (items.has(output["item"]) || seen.has(output["item"])) return "An item with that ID already exists.";
    seen.add(output["item"]);
  }
  return null;
}

const amountOf = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const role = (value: unknown): value is Role => value === "member" || value === "keeper" || value === "adviser";

/** Whether `later` was written by somebody who held `earlier`. */
const hadSeen = (later: Node, earlier: Node): boolean => (later.vc.get(earlier.author) ?? -1) >= earlier.seq;

/**
 * Work a lab out from its entries.
 *
 * @param entries - Every entry held, from every key, in any order. Duplicates are harmless.
 * @param options - `lab` says which lab to build, when entries from more than one may be present.
 * @returns The lab. It is the same for the same set of entries, whatever order they came in.
 * @throws If the entries found more than one lab and `options.lab` does not say which is meant.
 *
 * @example
 * ```ts
 * import { adjustItem, mergeLog, nextEntry } from "@biolibs/bionet";
 *
 * const lab = await mergeLog(everyEntryHeld);
 * lab.items.find((one) => one.item === tube)?.amount;   // 9
 *
 * const used = await nextEntry(lab, key, adjustItem(tube, -1));
 * (await mergeLog([...everyEntryHeld, used])).items.find((one) => one.item === tube)?.amount;   // 8
 * ```
 */
export async function mergeLog(entries: readonly unknown[], options: { lab?: string } = {}): Promise<LabState> {
  const state: LabState = { lab: options.lab ?? null, name: null, roster: [], parts: [], items: [], places: [], crowded: [], runs: [], plans: [], strains: [], specimens: [], expectations: [], prospects: [], entries: [],
                            waiting: [], discarded: [], overlaps: [], heads: {}, knows: {} };

  // Read and check every entry on its own, before any of them is believed about the others.
  const nodes = new Map<string, Node>();
  for (const value of entries) {
    let signed: SignedEntry;
    try {
      signed = readEntry(value);
    } catch (cause) {
      state.discarded.push({ signed: value, reason: cause instanceof Error ? cause.message : String(cause) });
      continue;
    }
    const id = await entryId(signed.entry);
    if (nodes.has(id)) continue;
    const check = await verifyEntry(signed);
    if (!check.ok) {
      state.discarded.push({ signed, reason: check.problem ?? "Its signature does not hold." });
      continue;
    }
    nodes.set(id, { id, signed, author: signed.entry.author, seq: signed.entry.seq, op: signed.entry.op, vc: new Map() });
  }

  // Which lab. A founding entry is the only kind with no lab, and its ID is the lab's.
  const foundings = [...nodes.values()].filter((node) => node.signed.entry.lab === null);
  if (options.lab === undefined && foundings.length > 1) {
    throw new Error("These entries found more than one lab. Say which lab is meant.");
  }
  const founding = options.lab === undefined ? foundings[0] : foundings.find((node) => node.id === options.lab);
  if (founding === undefined) {
    for (const node of nodes.values()) state.waiting.push({ signed: node.signed, reason: "The lab's founding entry has not arrived." });
    return state;
  }
  state.lab = founding.id;

  // One chain per key: each entry must follow the one before it, and a key may say only one thing
  // at each place in its log.
  const byAuthor = new Map<string, Map<number, Node[]>>();
  for (const node of nodes.values()) {
    if (node !== founding && node.signed.entry.lab !== state.lab) {
      state.discarded.push({ signed: node.signed, reason: "It was written for another lab." });
      continue;
    }
    const log = byAuthor.get(node.author) ?? new Map<number, Node[]>();
    log.set(node.seq, [...(log.get(node.seq) ?? []), node]);
    byAuthor.set(node.author, log);
  }
  const chains = new Map<string, Node[]>();
  const chained = new Map<string, Node>();
  for (const [author, log] of byAuthor) {
    const chain: Node[] = [];
    for (let seq = 0; log.has(seq); seq++) {
      const before = chain[seq - 1];
      const here = log.get(seq)!;
      const follows = here.filter((node) => node.signed.entry.prev === (before?.id ?? null))
                          .sort((a, b) => (a === founding ? -1 : b === founding ? 1 : a.id < b.id ? -1 : 1));
      for (const node of here) {
        if (!follows.includes(node)) state.discarded.push({ signed: node.signed, reason: "It does not follow the entry before it in its own log." });
      }
      for (const node of follows.slice(1)) {
        state.discarded.push({ signed: node.signed, reason: "It is a second entry at the same place in its key's log." });
      }
      if (follows.length === 0) break;
      chain.push(follows[0]!);
      chained.set(follows[0]!.id, follows[0]!);
    }
    for (const [seq, here] of log) {
      if (seq >= chain.length) {
        for (const node of here) {
          if (!state.discarded.some((one) => one.signed === node.signed)) {
            state.waiting.push({ signed: node.signed, reason: "An earlier entry in the same log has not arrived." });
          }
        }
      }
    }
    chains.set(author, chain);
  }

  // Place the entries, and settle the roster while doing it. Whether an entry counts can depend on
  // a removal placed after it, so this is repeated with the cutoffs it found until they stop changing.
  let cuts = new Map<string, number>();
  let walked = walk(founding, chains, chained, cuts);
  for (let round = 0; round < 8 && !sameCuts(cuts, walked.cuts); round++) {
    cuts = walked.cuts;
    walked = walk(founding, chains, chained, cuts);
  }

  state.name = text(founding.op["name"], 200) ? founding.op["name"] : null;
  state.roster = [...walked.roster.values()];
  state.entries = walked.placed;
  for (const [author, chain] of chains) {
    const last = chain.filter((node) => walked.reached.has(node.id)).at(-1);
    if (last !== undefined) {
      state.heads[author] = { seq: last.seq, id: last.id };
      state.knows[author] = Object.fromEntries(last.vc);
    }
    for (const node of chain) {
      if (!walked.reached.has(node.id)) {
        state.waiting.push({ signed: node.signed, reason: "It had seen an entry that has not arrived." });
      }
    }
  }

  fold(state, walked.placed, chained);
  return state;
}

/** Whether two sets of cutoffs are the same. */
function sameCuts(a: Map<string, number>, b: Map<string, number>): boolean {
  return a.size === b.size && [...a].every(([key, cutoff]) => b.get(key) === cutoff);
}

/**
 * Put the chained entries in an order every machine agrees on, and settle the roster on the way.
 *
 * An entry is ready once the entry before it and everything it had seen are placed. Of the ready
 * ones, a roster change by a keeper goes first, the longest-standing keeper before the others; after
 * those, the lowest entry ID.
 */
function walk(founding: Node, chains: Map<string, Node[]>, chained: Map<string, Node>, cuts: Map<string, number>): {
  placed: Placed[]; roster: Map<string, RosterKey>; cuts: Map<string, number>; reached: Set<string>;
} {
  const placed: Placed[] = [];
  const roster = new Map<string, RosterKey>();
  const found = new Map<string, number>();
  const reached = new Set<string>();
  const at = new Map<string, number>();
  const since = new Map<string, number>();     // when each key became a keeper, as a count
  const isKeeper = (key: string): boolean => roster.get(key)?.role === "keeper";
  const liveKeepers = (): number => [...roster.values()].filter((one) => one.role === "keeper" && one.removed === null).length;

  const ready = (): Node[] => {
    const out: Node[] = [];
    for (const [author, chain] of chains) {
      const node = chain[at.get(author) ?? 0];
      if (node === undefined) continue;
      const seen = Object.entries(node.signed.entry.seen);
      if (seen.every(([key, id]) => reached.has(id) && chained.get(id)?.author === key)) out.push(node);
    }
    return out;
  };
  const rank = (node: Node): number =>
    node.op.type.startsWith("roster.") && isKeeper(node.author) ? (since.get(node.author) ?? 0) : Number.MAX_SAFE_INTEGER;

  for (let next = ready(); next.length > 0; next = ready()) {
    next.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
    const node = next[0]!;
    at.set(node.author, (at.get(node.author) ?? 0) + 1);
    reached.add(node.id);

    // What this entry had seen: what the one before it had, what it names, and itself.
    const before = chains.get(node.author)![node.seq - 1];
    node.vc = new Map(before?.vc ?? []);
    for (const id of Object.values(node.signed.entry.seen)) {
      for (const [key, seq] of chained.get(id)!.vc) node.vc.set(key, Math.max(node.vc.get(key) ?? -1, seq));
    }
    node.vc.set(node.author, node.seq);

    const say = (status: EntryStatus, reason: string | null = null): void => {
      placed.push({ id: node.id, signed: node.signed, status, reason });
    };
    const op = node.op;

    // Before any of it is read: a field this version does not know makes the whole change
    // unreadable, because what it would change about the rest cannot be guessed.
    const stray = strayField(op);
    if (stray !== null) {
      say("not understood", `It carries ${JSON.stringify(stray)}, which this version does not know, so it could be read differently from the way its author meant it.`);
      continue;
    }

    if (node === founding) {
      roster.set(node.author, { key: node.author, person: text(op["person"], 200) ? op["person"] : "",
                                role: "keeper", founder: true, added: node.id, removed: null });
      since.set(node.author, since.size);
      say("applied");
      continue;
    }
    const author = roster.get(node.author);
    if (author === undefined) { say("refused", "Its key is not on the lab's roster."); continue; }
    if (!hadSeen(node, chained.get(author.added)!)) { say("refused", "It was written before its key had seen itself added to the roster."); continue; }
    const cut = cuts.get(node.author);
    if (cut !== undefined && node.seq > cut) { say("set aside", "It comes after the point at which its key was removed."); continue; }

    if (!op.type.startsWith("roster.")) {
      // An adviser proposes and describes. It is turned away here, where the roster is known as it
      // stood when the entry was written, from anything that would change what the lab holds.
      if (author.role === "adviser") {
        if (!ADVISER_MAY.has(op.type)) { say("refused", "Its key is an adviser, which may add and describe parts, propose runs and file its own proposals, and nothing else."); continue; }
        node.adviser = true;
      }
      say("applied");       // whether the change itself makes sense is settled when the inventory is folded
      continue;
    }
    if (author.role !== "keeper") { say("refused", "Only a keeper may change the roster."); continue; }

    if (op.type === "roster.add") {
      if (!(typeof op["key"] === "string" && KEY.test(op["key"])) || !text(op["person"], 200) || !role(op["role"])) {
        say("refused", "It does not say which key to add, whose it is, or as what.");
      } else if (roster.has(op["key"])) {
        say("refused", "That key is already on the roster, or was removed from it.");
      } else {
        roster.set(op["key"], { key: op["key"], person: op["person"], role: op["role"], founder: false, added: node.id, removed: null });
        if (op["role"] === "keeper") since.set(op["key"], since.size);
        say("applied");
      }
    } else if (op.type === "roster.remove") {
      const target = typeof op["key"] === "string" ? roster.get(op["key"]) : undefined;
      const cutoff = op["cutoff"];
      if (target === undefined) {
        say("refused", "The key it removes is not on the roster.");
      } else if (typeof cutoff !== "number" || !Number.isInteger(cutoff) || cutoff < -1) {
        say("refused", "It does not say where in that key's log to stop.");
      } else if (cutoff > (node.vc.get(target.key) ?? -1)) {
        say("refused", "Its cutoff is past what its author had seen of that key's log.");
      } else if (target.removed === null && target.role === "keeper" && liveKeepers() === 1) {
        say("refused", "A lab cannot be left without a keeper.");
      } else {
        const stop = Math.min(cutoff, found.get(target.key) ?? cutoff);
        found.set(target.key, stop);
        target.removed = { by: target.removed?.by ?? node.id, cutoff: stop };
        say("applied");
      }
    } else if (op.type === "roster.role") {
      const target = typeof op["key"] === "string" ? roster.get(op["key"]) : undefined;
      if (target === undefined || target.removed !== null || !role(op["role"])) {
        say("refused", "It does not name a key on the roster and a role to give it.");
      } else if (target.role === "keeper" && op["role"] !== "keeper" && liveKeepers() === 1) {
        say("refused", "A lab cannot be left without a keeper.");
      } else {
        if (op["role"] === "keeper" && target.role !== "keeper") since.set(target.key, since.size);
        target.role = op["role"];
        say("applied");
      }
    } else {
      say("not understood", "This version does not know that kind of roster change.");
    }
  }
  return { placed, roster, cuts: found, reached };
}

/** A value that the latest writer wins, with the entry that set it. */
interface Register { node: Node; value: unknown }

/** Apply the inventory changes, in the order the walk settled on. */
function fold(state: LabState, placed: Placed[], chained: Map<string, Node>): void {
  const parts = new Map<string, { part: PartState; set: Map<string, Register> }>();
  const items = new Map<string, {
    item: ItemState; set: Map<string, Register>;
    base: { node: Node; amount: number; recount: boolean }; adjusted: { node: Node; by: number }[]; overlapped: boolean;
  }>();

  /** Set a value, unless a change that had not been seen and has a lower ID already set it. */
  const write = (set: Map<string, Register>, field: string, node: Node, value: unknown, what: string): void => {
    const held = set.get(field);
    if (held === undefined || hadSeen(node, held.node)) { set.set(field, { node, value }); return; }
    // Between two that overlap, the lower ID. Between a person's and an adviser's, the person's:
    // an adviser may not change what somebody wrote, and writing at the same moment is not a way round it.
    const wins = (node.adviser === true) !== (held.node.adviser === true) ? node.adviser !== true : node.id < held.node.id;
    state.overlaps.push({ what, kept: wins ? node.id : held.node.id, dropped: wins ? held.node.id : node.id });
    if (wins) set.set(field, { node, value });
  };

  const places = new Map<string, { place: PlaceState; set: Map<string, Register> }>();
  const strains = new Map<string, { strain: StrainState; set: Map<string, Register> }>();
  const specimens = new Map<string, { specimen: SpecimenState; set: Map<string, Register> }>();
  const expectations = new Map<string, { expectation: ExpectationState; seen: Node | null; set: Map<string, Register> }>();
  const prospects = new Map<string, { prospect: ProspectState; set: Map<string, Register> }>();
  /** Each plan, with the entry that settled it, if one has, and anything set on it. */
  const plans = new Map<string, { plan: PlanState; settled: Node | null; set: Map<string, Register> }>();
  /** Where each item was last put. */
  const put = new Map<string, Map<string, Register>>();

  for (const one of placed) {
    if (one.status !== "applied") continue;
    const node = chained.get(one.id)!;
    const op = node.op;
    if (op.type.startsWith("roster.")) continue;
    const refuse = (reason: string): void => { one.status = "refused"; one.reason = reason; };

    if (op.type === "part.add") {
      if (!text(op["sequence"], LONGEST_SEQUENCE) || !text(op["name"], 200) || typeof op["circular"] !== "boolean") {
        refuse("It does not carry a sequence, a name and whether the part is a circle.");
        continue;
      }
      // Both the molecule and its checksum are worked out inside the guard: an entry from another
      // machine must never be able to stop the merge, only to be refused by it.
      const kind = op["kind"] === undefined ? "dna" : op["kind"];
      if (kind !== "dna" && kind !== "protein") { refuse("A part is made of dna or of protein."); continue; }
      let molecule: ReturnType<typeof moleculeOf>;
      try {
        molecule = moleculeOf(op["sequence"], op["circular"], op["ends"], kind);
      } catch {
        refuse(kind === "protein" ? "What it carries is not a protein: a protein is written in amino acids, is not a circle and has no ends."
                                  : "What it carries is not a sequence, with ends a molecule of that length can have.");
        continue;
      }
      const checksum = molecule.checksum;
      if (!parts.has(checksum)) {
        parts.set(checksum, {
          part: { checksum, kind, sequence: op["sequence"], circular: op["circular"], length: molecule.length,
                  name: op["name"], offered: false, features: [], ends: molecule.ends, fields: {}, added: node.id },
          set: new Map([["name", { node, value: op["name"] }]]),
        });
      }
    } else if (op.type === "part.offer") {
      const held = typeof op["part"] === "string" ? parts.get(op["part"]) : undefined;
      if (held === undefined || typeof op["available"] !== "boolean") { refuse("It does not name a part the lab has, and whether to offer it."); continue; }
      write(held.set, "offered", node, op["available"], `whether ${held.part.name} is on offer`);
    } else if (op.type === "part.annotate") {
      const held = typeof op["part"] === "string" ? parts.get(op["part"]) : undefined;
      if (held === undefined) { refuse("It does not name a part the lab has."); continue; }
      if (!areFeatures(op["features"], held.part.length)) { refuse("What it marks is not a list of features that lie within the part."); continue; }
      // An adviser may describe a part nobody has described, and may not change what somebody has
      // marked. Whether anything is marked yet is read here, where the entries are in the order
      // every machine settled on, so each of them answers it the same way.
      if (node.adviser === true && held.set.has("features")) {
        refuse("Its key is an adviser, which may mark a part only while nothing is marked on it. Somebody has marked this one.");
        continue;
      }
      write(held.set, "features", node, op["features"], `what is marked on ${held.part.name}`);
    } else if (op.type === "item.add") {
      if (!(typeof op["item"] === "string" && ITEM_ID.test(op["item"])) || !amountOf(op["amount"]) || op["amount"] < 0
          || !(op["unit"] === null || text(op["unit"], 20))) {
        refuse("It does not carry an item ID, a whole starting amount and a unit.");
      } else if (items.has(op["item"])) {
        refuse("An item with that ID already exists.");
      } else if ([op["part"], op["strain"], op["specimen"]].filter((one) => one !== undefined).length !== 1) {
        refuse("An item is of a part, a culture of a strain, or a tube of a specimen, and only one of those.");
      } else if (op["part"] !== undefined && (typeof op["part"] !== "string" || !parts.has(op["part"]))) {
        refuse("The part it is an item of is not one the lab has.");
      } else if (op["strain"] !== undefined && (typeof op["strain"] !== "string" || !strains.has(op["strain"]))) {
        refuse("The strain it is a culture of is not one the lab has.");
      } else if (op["specimen"] !== undefined && (typeof op["specimen"] !== "string" || !specimens.has(op["specimen"]))) {
        refuse("The specimen it is a tube of is not one the lab has.");
      } else {
        items.set(op["item"], {
          item: { item: op["item"], part: (op["part"] as string | undefined) ?? null, strain: (op["strain"] as string | undefined) ?? null,
                  specimen: (op["specimen"] as string | undefined) ?? null,
                  unit: op["unit"], amount: 0, retired: false, needsRecount: false, from: null, where: null, fields: {}, added: node.id },
          set: new Map(), base: { node, amount: op["amount"], recount: false }, adjusted: [], overlapped: false,
        });
      }
    } else if (op.type === "item.adjust" || op.type === "item.recount" || op.type === "item.retire") {
      const held = typeof op["item"] === "string" ? items.get(op["item"]) : undefined;
      if (held === undefined) { refuse("The item it changes is not one the lab has."); continue; }
      if (op.type === "item.adjust") {
        if (!amountOf(op["by"]) || op["by"] === 0) { refuse("It does not say by how many whole units."); continue; }
        held.adjusted.push({ node, by: op["by"] });
      } else if (op.type === "item.recount") {
        if (!amountOf(op["amount"]) || op["amount"] < 0) { refuse("It does not say how many whole units are there."); continue; }
        if (!held.base.recount || hadSeen(node, held.base.node)) {
          held.base = { node, amount: op["amount"], recount: true };
          held.overlapped = false;
        } else {
          // Two people counted without knowing of each other. One count stands, and the item is flagged.
          const wins = node.id < held.base.node.id;
          state.overlaps.push({ what: `the count of item ${held.item.item}`, kept: wins ? node.id : held.base.node.id,
                                dropped: wins ? held.base.node.id : node.id });
          if (wins) held.base = { node, amount: op["amount"], recount: true };
          held.overlapped = true;
        }
      } else {
        held.item.retired = true;
      }
    } else if (op.type === "place.add") {
      const grid = op["grid"];
      if (!(typeof op["place"] === "string" && ITEM_ID.test(op["place"])) || !text(op["kind"], 40) || !text(op["name"], 200)
          || !(grid === null || isGrid(grid))) {
        refuse("It does not carry a place ID, a kind, a name, and positions that are whole numbers.");
      } else if (places.has(op["place"])) {
        refuse("A place with that ID already exists.");
      } else if (!(op["parent"] === null || (typeof op["parent"] === "string" && places.has(op["parent"])))) {
        refuse("The place it is in is not one the lab has.");
      } else {
        places.set(op["place"], {
          place: { place: op["place"], kind: op["kind"], name: op["name"], parent: null, grid: grid === null ? null : { rows: grid.rows, columns: grid.columns },
                   standing: null, retired: false, adrift: false, fields: {}, added: node.id },
          set: new Map<string, Register>([["name", { node, value: op["name"] }], ["parent", { node, value: op["parent"] }]]),
        });
      }
    } else if (op.type === "place.move" || op.type === "place.stand" || op.type === "place.retire") {
      const held = typeof op["place"] === "string" ? places.get(op["place"]) : undefined;
      if (held === undefined) { refuse("The place it changes is not one the lab has."); continue; }
      if (op.type === "place.move") {
        const parent = op["parent"];
        if (!(parent === null || (typeof parent === "string" && places.has(parent)))) { refuse("The place it moves to is not one the lab has."); continue; }
        if (parent === op["place"]) { refuse("A place cannot be inside itself."); continue; }
        write(held.set, "parent", node, parent, `where ${held.place.name} is`);
      } else if (op.type === "place.stand") {
        const standing = op["standing"];
        if (!(standing === null || isStanding(standing))) { refuse("It does not say where the place stands and how big it is, in whole millimetres."); continue; }
        write(held.set, "standing", node, standing, `where ${held.place.name} stands`);
      } else {
        held.place.retired = true;
      }
    } else if (op.type === "item.put") {
      const item = typeof op["item"] === "string" ? items.get(op["item"]) : undefined;
      if (item === undefined) { refuse("The item it puts somewhere is not one the lab has."); continue; }
      const place = op["place"];
      const slot = op["slot"];
      if (place === null) {
        if (slot !== null) { refuse("An item that is nowhere is at no position."); continue; }
      } else {
        const into = typeof place === "string" ? places.get(place) : undefined;
        if (into === undefined) { refuse("The place it puts the item in is not one the lab has."); continue; }
        if (slot !== null && !(isSlot(slot) && into.place.grid !== null && slot.row < into.place.grid.rows && slot.column < into.place.grid.columns)) {
          refuse("The position it names is not one that place has.");
          continue;
        }
      }
      if (!put.has(item.item.item)) put.set(item.item.item, new Map());
      write(put.get(item.item.item)!, "where", node, place === null ? null : { place, slot: slot === null ? null : { row: (slot as { row: number }).row, column: (slot as { column: number }).column } },
            `where item ${item.item.item.slice(0, 12)} is`);
    } else if (op.type === "run.record") {
      const problem = runProblem(op, items, places, new Set(state.runs.map((run) => run.run)));
      if (problem !== null) { refuse(problem); continue; }
      const inputs = op["inputs"] as RunInput[];
      const outputs = op["outputs"] as { item: string; sequence: string; circular: boolean; name: string; amount: number; unit: string | null; ends?: unknown }[];
      // What comes out is worked out before anything is changed, so that a run is recorded whole or not at all.
      const made: { output: (typeof outputs)[number]; record: { length: number }; checksum: string; ends: PartEnds }[] = [];
      try {
        for (const output of outputs) {
          const molecule = moleculeOf(output.sequence, output.circular, output.ends);
          made.push({ output, record: molecule, checksum: molecule.checksum, ends: molecule.ends });
        }
      } catch {
        refuse("Something it says came out is not a sequence, with ends a molecule of that length can have.");
        continue;
      }
      for (const input of inputs) if (input.amount > 0) items.get(input.item)!.adjusted.push({ node, by: -input.amount });
      for (const { output, record, checksum, ends } of made) {
        if (!parts.has(checksum)) {
          parts.set(checksum, {
            part: { checksum, kind: "dna", sequence: output.sequence, circular: output.circular, length: record.length, name: output.name, offered: false, features: [], ends, fields: {}, added: node.id },
            set: new Map([["name", { node, value: output.name }]]),
          });
        }
        items.set(output.item, {
          item: { item: output.item, part: checksum, strain: null, specimen: null, unit: output.unit, amount: 0, retired: false, needsRecount: false, from: op["run"] as string,
                  where: null, fields: {}, added: node.id },
          set: new Map(), base: { node, amount: output.amount, recount: false }, adjusted: [], overlapped: false,
        });
      }
      state.runs.push({
        run: op["run"] as string, kind: op["kind"] as string, instrument: op["instrument"] as string | null,
        inputs: inputs.map((input) => ({ item: input.item, amount: input.amount, role: input.role })),
        outputs: made.map(({ output, checksum }) => ({ item: output.item, part: checksum })),
        settings: { ...(op["settings"] as Record<string, string | number>) }, outcome: op["outcome"] as "worked" | "failed",
        note: op["note"] as string | null, added: node.id,
      });
    } else if (op.type === "strain.add") {
      const carries = op["carries"];
      if (!(typeof op["strain"] === "string" && ITEM_ID.test(op["strain"])) || !text(op["name"], 200) || !text(op["host"], 200)) {
        refuse("It does not carry a strain ID, what to call it and what organism it is.");
      } else if (strains.has(op["strain"])) {
        refuse("A strain with that ID already exists.");
      } else if (!Array.isArray(carries) || carries.length > MOST_IN_A_RUN || !carries.every((one) => typeof one === "string" && parts.has(one))) {
        refuse("What it says the strain carries is not a list of parts the lab has.");
      } else if (!(op["parent"] === null || (typeof op["parent"] === "string" && strains.has(op["parent"])))) {
        refuse("The strain it says this one came from is not one the lab has.");
      } else if (!(op["from"] === null || (typeof op["from"] === "string" && state.runs.some((one) => one.run === op["from"])))) {
        refuse("The run it says made this strain is not one the lab has.");
      } else {
        strains.set(op["strain"], {
          strain: { strain: op["strain"], name: op["name"], host: op["host"], carries: [...new Set(carries as string[])],
                    parent: op["parent"] as string | null, from: op["from"] as string | null, fields: {}, added: node.id },
          set: new Map([["name", { node, value: op["name"] }]]),
        });
      }
    } else if (op.type === "specimen.add") {
      if (!(typeof op["specimen"] === "string" && ITEM_ID.test(op["specimen"])) || !text(op["name"], 200)
          || !(op["note"] === null || text(op["note"], 2_000))) {
        refuse("It does not carry a specimen ID, what to call it and a note or nothing.");
      } else if (specimens.has(op["specimen"])) {
        refuse("A specimen with that ID already exists.");
      } else {
        specimens.set(op["specimen"], {
          specimen: { specimen: op["specimen"], name: op["name"], note: op["note"] as string | null, is: null, fields: {}, added: node.id },
          set: new Map([["name", { node, value: op["name"] }]]),
        });
      }
    } else if (op.type === "specimen.identify") {
      const held = typeof op["specimen"] === "string" ? specimens.get(op["specimen"]) : undefined;
      if (held === undefined) {
        refuse("The specimen it identifies is not one the lab has.");
      } else if (!(typeof op["part"] === "string" && parts.has(op["part"]))) {
        refuse("What it says the specimen is is not a part the lab has.");
      } else {
        // Two people may identify the same tube without knowing of each other. This is a register
        // like any other, so the same rule settles it and every lab reads the same answer.
        write(held.set, "is", node, op["part"], `what specimen ${op["specimen"]} is`);
      }
    } else if (op.type === "prospect.add") {
      if (!(typeof op["prospect"] === "string" && ITEM_ID.test(op["prospect"])) || !text(op["name"], 200)
          || !text(op["kind"], 40) || !text(op["madeOf"], 2_000)
          || !(op["note"] === null || text(op["note"], 2_000))) {
        refuse("It does not carry a prospect ID, what to call it, what kind of thing it is, what it would be made of, and a note or nothing.");
      } else if (prospects.has(op["prospect"])) {
        refuse("A prospect with that ID already exists.");
      } else {
        prospects.set(op["prospect"], {
          prospect: { prospect: op["prospect"], name: op["name"], kind: op["kind"], madeOf: op["madeOf"],
                      note: op["note"] as string | null, became: null, by: node.author, fields: {}, added: node.id },
          set: new Map([["name", { node, value: op["name"] }]]),
        });
      }
    } else if (op.type === "prospect.realise") {
      const held = typeof op["prospect"] === "string" ? prospects.get(op["prospect"]) : undefined;
      const strain = op["strain"], item = op["item"];
      if (held === undefined) {
        refuse("The prospect it says was made is not one the lab has.");
      } else if ([strain, item].filter((one) => one !== null && one !== undefined).length !== 1) {
        refuse("A prospect becomes a strain or an item, and only one of those.");
      } else if (strain !== null && strain !== undefined && !(typeof strain === "string" && strains.has(strain))) {
        refuse("The strain it says the prospect became is not one the lab has.");
      } else if (item !== null && item !== undefined && !(typeof item === "string" && items.has(item))) {
        refuse("The item it says the prospect became is not one the lab has.");
      } else {
        // Two people may make the same thing and say so without knowing of each other. It is a
        // register like any other, so the same rule settles it and every lab reads the same answer.
        // What it became and which kind of thing that is are one fact and go in one register: two
        // registers could be won by different writers, and leave a strain's ID labelled an item.
        const became = strain !== null && strain !== undefined ? `strain:${strain}` : `item:${item}`;
        write(held.set, "became", node, became, `what prospect ${op["prospect"]} became`);
      }
    } else if (op.type === "expect.add") {
      const numbers = op["numbers"], settings = op["settings"];
      if (!(typeof op["expect"] === "string" && ITEM_ID.test(op["expect"])) || !text(op["kind"], 40) || !text(op["says"], 2_000)
          || !(op["note"] === null || text(op["note"], 2_000))) {
        refuse("It does not carry an expectation ID, how it would be seen, what to expect, and a note or nothing.");
      } else if (!(typeof op["plan"] === "string" && plans.has(op["plan"]))) {
        refuse("The plan it is about is not one the lab has.");
      } else if (!Array.isArray(numbers) || numbers.length > MOST_IN_A_RUN || !numbers.every((one) => amountOf(one) && one >= 0)) {
        // A fraction never reaches here: the log will not sign one, because two devices that round
        // differently would put their names to different documents. So a band read at 4,757.5 bases
        // is written in the words. What this catches is a negative reading, which signs and means
        // nothing, and a list that is not a list.
        refuse("Its readings are not whole numbers that are not negative.");
      } else if (typeof settings !== "object" || settings === null || Array.isArray(settings) || Object.keys(settings).length > MOST_IN_A_RUN
                 || !Object.entries(settings).every(([name, value]) => FIELD.test(name) && (amountOf(value) || (typeof value === "string" && value.length <= 200)))) {
        refuse("Its settings are not whole numbers and short text, by name.");
      } else if (expectations.has(op["expect"])) {
        refuse("An expectation with that ID already exists.");
      } else {
        expectations.set(op["expect"], {
          seen: null,
          expectation: { expect: op["expect"], plan: op["plan"], kind: op["kind"], says: op["says"],
                         numbers: [...(numbers as number[])], settings: { ...(settings as Record<string, string | number>) },
                         note: op["note"] as string | null, by: node.author, met: null, withdrawn: null, fields: {}, added: node.id },
          set: new Map(),
        });
      }
    } else if (op.type === "expect.meet") {
      const held = typeof op["expect"] === "string" ? expectations.get(op["expect"]) : undefined;
      const saw = op["saw"], run = op["run"];
      if (held === undefined) {
        refuse("The expectation it answers is not one the lab has.");
      } else if (typeof op["met"] !== "boolean" || !(op["note"] === null || text(op["note"], 2_000))) {
        refuse("It does not say whether what was seen is what was expected.");
      } else if (!Array.isArray(saw) || saw.length > MOST_IN_A_RUN || !saw.every((one) => amountOf(one) && one >= 0)) {
        refuse("What it says was seen is not whole numbers that are not negative.");
      } else if (!(run === null || (typeof run === "string" && state.runs.some((one) => one.run === run)))) {
        refuse("The run it says this was seen in is not one the lab has.");
      } else {
        const meet = (): void => {
          held.seen = node;
          held.expectation.met = { met: op["met"] as boolean, saw: [...(saw as number[])], run: run as string | null,
                                   note: op["note"] as string | null, by: node.author, entry: node.id };
        };
        // A reading beats a withdrawal. Somebody looked, and what they saw is a fact about the
        // world; an expectation is an intention about what to look for, and an intention yields to
        // a fact. So a reading on a withdrawn expectation stands, and puts it back.
        held.expectation.withdrawn = null;
        if (held.seen === null) meet();
        else if (hadSeen(node, held.seen)) refuse("What was seen of that expectation is already recorded.");
        else {
          // Two people read the same gel without knowing of each other. One stands, and the overlap
          // is shown: a disagreement about what was seen is worth somebody looking at.
          const wins = node.id < held.seen.id;
          state.overlaps.push({ what: `what was seen of expectation ${held.expectation.expect.slice(0, 12)}`, kept: wins ? node.id : held.seen.id, dropped: wins ? held.seen.id : node.id });
          if (wins) meet();
        }
      }
    } else if (op.type === "expect.withdraw") {
      const held = typeof op["expect"] === "string" ? expectations.get(op["expect"]) : undefined;
      if (held === undefined) {
        refuse("The expectation it takes back is not one the lab has.");
      } else if (!(op["note"] === null || text(op["note"], 2_000))) {
        refuse("Its note is not some text.");
      } else if (held.expectation.met !== null) {
        // Once somebody has said what they saw, this is no longer a thing to look for: it is part
        // of what happened, and what happened is not taken back.
        refuse("What was seen of that expectation is recorded, so it cannot be taken back.");
      } else if (node.adviser === true && held.expectation.by !== node.author) {
        refuse("An adviser may only take back an expectation of its own.");
      } else {
        held.expectation.withdrawn = { note: op["note"] as string | null, by: node.author, entry: node.id };
      }
    } else if (op.type === "plan.add") {
      const problem = planProblem(op, items, parts, places, plans, prospects);
      if (problem !== null) { refuse(problem); continue; }
      const expects: PlanState["expects"] = [];
      try {
        for (const expect of op["expects"] as { sequence: string; circular: boolean; name: string; ends?: unknown }[]) {
          const molecule = moleculeOf(expect.sequence, expect.circular, expect.ends);
          expects.push({ name: expect.name, sequence: expect.sequence, circular: expect.circular, ends: molecule.ends, length: molecule.length, checksum: molecule.checksum });
        }
      } catch {
        refuse("Something it expects to make is not a sequence, with ends a molecule of that length can have.");
        continue;
      }
      plans.set(op["plan"] as string, {
        settled: null, set: new Map(),
        plan: {
          plan: op["plan"] as string, kind: op["kind"] as string, instrument: op["instrument"] as string | null,
          inputs: (op["inputs"] as PlanInput[]).map((input) => ({
            ...(input.item !== undefined ? { item: input.item } : input.part !== undefined ? { part: input.part } : { prospect: input.prospect! }),
            amount: input.amount, role: input.role })),
          makes: [...((op["makes"] as string[] | undefined) ?? [])],
          expects, settings: { ...(op["settings"] as Record<string, string | number>) }, note: op["note"] as string | null,
          by: node.author, settled: null, wanting: [], orphaned: [], fields: {}, added: node.id,
        },
      });
    } else if (op.type === "plan.settle") {
      const held = typeof op["plan"] === "string" ? plans.get(op["plan"]) : undefined;
      const run = op["run"];
      if (held === undefined) { refuse("It does not name a plan the lab has."); continue; }
      if (!(run === null || (typeof run === "string" && state.runs.some((one) => one.run === run)))) { refuse("The run it says carried the plan out is not one the lab has."); continue; }
      // Only somebody who can do a run can say one was done; an adviser can take back what it proposed.
      if (node.adviser === true && (run !== null || held.plan.by !== node.author)) { refuse("An adviser may only set aside a plan of its own."); continue; }
      const settle = (): void => { held.settled = node; held.plan.settled = { run: run as string | null, by: node.author, entry: node.id }; };
      if (held.settled === null) settle();
      else if (hadSeen(node, held.settled)) refuse("That plan is already settled.");
      else {
        // Two people settled it without knowing of each other. One stands, and the overlap is shown.
        const wins = node.id < held.settled.id;
        state.overlaps.push({ what: `what became of plan ${held.plan.plan.slice(0, 12)}`, kept: wins ? node.id : held.settled.id, dropped: wins ? held.settled.id : node.id });
        if (wins) settle();
      }
    } else if (op.type === "field.set") {
      const field = op["field"];
      const value = op["value"];
      const target = op["on"] === "part" && typeof op["id"] === "string" ? parts.get(op["id"])
                   : op["on"] === "item" && typeof op["id"] === "string" ? items.get(op["id"])
                   : op["on"] === "place" && typeof op["id"] === "string" ? places.get(op["id"])
                   : op["on"] === "strain" && typeof op["id"] === "string" ? strains.get(op["id"])
                   : op["on"] === "specimen" && typeof op["id"] === "string" ? specimens.get(op["id"])
                   : op["on"] === "plan" && typeof op["id"] === "string" ? plans.get(op["id"])
                   : op["on"] === "expectation" && typeof op["id"] === "string" ? expectations.get(op["id"])
                   : op["on"] === "prospect" && typeof op["id"] === "string" ? prospects.get(op["id"]) : undefined;
      if (target === undefined) { refuse("It does not name a part, an item, a place, a strain, a specimen, a plan, an expectation or a prospect the lab has."); continue; }
      if (op["on"] === "place" && typeof field === "string" && PLACE_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (op["on"] === "strain" && typeof field === "string" && STRAIN_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (op["on"] === "specimen" && typeof field === "string" && SPECIMEN_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (op["on"] === "plan" && typeof field === "string" && PLAN_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (op["on"] === "expectation" && typeof field === "string" && EXPECT_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (op["on"] === "prospect" && typeof field === "string" && PROSPECT_RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      // An adviser may file its own proposals and nothing else. It proposes the work, so leaving it
      // unable to say which project the work is for would have a person filing every step by hand;
      // letting it set any field at all would let it rename the lab's parts. This is the same line
      // `plan.settle` draws: a plan of its own, and no further.
      if (node.adviser === true && !(op["on"] === "plan" && (target as { plan: PlanState }).plan.by === node.author)) {
        refuse("An adviser may only set a field on a plan of its own.");
        continue;
      }
      if (field === "name" && (op["on"] === "place" || op["on"] === "strain" || op["on"] === "specimen") && !text(value, 200)) { refuse("A name has to be some text."); continue; }
      if (typeof field !== "string" || !FIELD.test(field) || RESERVED.has(field)) { refuse("It does not name a field that can be set."); continue; }
      if (!(value === null || amountOf(value) || (typeof value === "string" && value.length <= 2_000))) { refuse("Its value is not text, a whole number or nothing."); continue; }
      if (field === "name" && op["on"] === "part" && !text(value, 200)) { refuse("A part's name has to be some text."); continue; }
      write(target.set, field, node, value, `${field} of ${op["on"]} ${String(op["id"]).slice(0, 12)}`);
    } else {
      one.status = "not understood";
      one.reason = "This version does not know that kind of change.";
    }
  }

  for (const { part, set } of parts.values()) {
    for (const [field, held] of set) {
      if (field === "name") part.name = held.value as string;
      else if (field === "offered") part.offered = held.value as boolean;
      else if (field === "features") part.features = (held.value as PartFeature[]).map((one) => ({ type: one.type, label: one.label, strand: one.strand, parts: one.parts.map((piece) => ({ start: piece.start, end: piece.end })) }));
      else part.fields[field] = held.value as string | number | null;
    }
    state.parts.push(part);
  }
  for (const { strain, set } of strains.values()) {
    for (const [field, held] of set) {
      if (field === "name") strain.name = held.value as string;
      else strain.fields[field] = held.value as string | number | null;
    }
    state.strains.push(strain);
  }
  for (const { specimen, set } of specimens.values()) {
    for (const [field, held] of set) {
      if (field === "name") specimen.name = held.value as string;
      else if (field === "is") specimen.is = held.value as string;
      else specimen.fields[field] = held.value as string | number | null;
    }
    state.specimens.push(specimen);
  }
  for (const { prospect, set } of prospects.values()) {
    for (const [field, held] of set) {
      if (field === "name") prospect.name = held.value as string;
      else if (field === "became") { /* read below, as one value */ }
      else prospect.fields[field] = held.value as string | number | null;
    }
    const became = set.get("became");
    if (became !== undefined) {
      const [kind, ...rest] = String(became.value).split(":");
      const id = rest.join(":");
      prospect.became = { strain: kind === "strain" ? id : null, item: kind === "item" ? id : null,
                          by: became.node.author, entry: became.node.id };
    }
    state.prospects.push(prospect);
  }
  for (const { expectation, set } of expectations.values()) {
    for (const [field, held] of set) expectation.fields[field] = held.value as string | number | null;
    state.expectations.push(expectation);
  }
  for (const { item, set, base, adjusted, overlapped } of items.values()) {
    // A recount replaces the adjustments its author had seen. Everything else still counts.
    const since = adjusted.filter((one) => !hadSeen(base.node, one.node)).reduce((sum, one) => sum + one.by, 0);
    item.amount = base.amount + since;
    item.needsRecount = item.amount < 0 || overlapped;
    // Once a specimen has been identified, its tubes read as tubes of that molecule. The tube is
    // the same tube: it keeps its place, its amount and its history, and says where it came from.
    if (item.specimen !== null && item.part === null) {
      item.part = (specimens.get(item.specimen)?.set.get("is")?.value as string | undefined) ?? null;
    }
    for (const [field, held] of set) item.fields[field] = held.value as string | number | null;
    item.where = (put.get(item.item)?.get("where")?.value ?? null) as ItemState["where"];
    state.items.push(item);
  }
  // Which molecules the lab could actually put into a plan: one a live tube holds, or one a plan
  // still open is expected to make. And, separately, the ones whose only maker has been set aside.
  const heldNow = new Set(state.items.filter((one) => !one.retired && one.amount > 0 && one.part !== null).map((one) => one.part!));
  const willBeMade = new Set<string>(), wasToBeMade = new Set<string>();
  for (const { plan } of plans.values())
    for (const expect of plan.expects) (plan.settled === null ? willBeMade : wasToBeMade).add(expect.checksum);
  // A plan counts on tubes that go on being used after it is written. It is not refused for that:
  // it is kept, and says which of them are no longer what it needs.
  for (const { plan, set } of plans.values()) {
    for (const [field, held] of set) plan.fields[field] = held.value as string | number | null;
    if (plan.settled === null) {
      plan.wanting = plan.inputs.flatMap((input) => {
        const held = input.item === undefined ? undefined : items.get(input.item)?.item;
        return held !== undefined && (held.retired || held.amount < input.amount) ? [held.item] : [];
      });
      // Refiling a plan leaves the plans downstream of it pointing at what the old one would have
      // made. Nothing about either plan is wrong on its own, so neither is refused; what is wrong is
      // the pair, and only the lab as a whole can see it. A molecule still to be ordered is not this:
      // it was never any plan's output, so it is left alone. This is the molecule a plan the lab has
      // set aside would have made, and that nothing open makes now.
      plan.orphaned = plan.inputs.flatMap((input) =>
        input.part !== undefined && !heldNow.has(input.part) && !willBeMade.has(input.part) && wasToBeMade.has(input.part)
          ? [input.part] : []);
    }
    state.plans.push(plan);
  }
  for (const { place, set } of places.values()) {
    for (const [field, held] of set) {
      if (field === "name") place.name = held.value as string;
      else if (field === "parent") place.parent = held.value as string | null;
      else if (field === "standing") place.standing = held.value as StandingMm | null;
      else place.fields[field] = held.value as string | number | null;
    }
    state.places.push(place);
  }
  // Two people apart can each move a place into the other. Neither move is wrong alone, so neither
  // is refused: every place caught in the loop is shown as being in nothing, and says so.
  for (const { place } of places.values()) {
    const passed = new Set<string>();
    for (let up = place.parent; up !== null && !passed.has(up); up = places.get(up)!.place.parent) {
      if (up === place.place) { place.adrift = true; break; }
      passed.add(up);
    }
  }
  for (const { place } of places.values()) if (place.adrift) place.parent = null;
  // Two tubes cannot stand in one position, but two people apart can each say theirs does.
  const stood = new Map<string, Crowded>();
  for (const item of state.items) {
    if (item.retired || item.where === null || item.where.slot === null) continue;
    const key = `${item.where.place} ${item.where.slot.row} ${item.where.slot.column}`;
    const held = stood.get(key) ?? { place: item.where.place, slot: item.where.slot, items: [] };
    held.items.push(item.item);
    stood.set(key, held);
  }
  state.crowded = [...stood.values()].filter((one) => one.items.length > 1);
}

/**
 * Write the next entry in a key's log, given the lab as it stands.
 *
 * It works out the three things an entry has to say about its place: which lab, what came before it
 * in this key's log, and which other logs have moved on since this key last wrote.
 *
 * @param state - The lab, from `mergeLog` over everything held.
 * @param key - The device's key.
 * @param op - The change.
 * @param options - A name to sign under, and when.
 * @returns The signed entry, to be added to what is held and sent to the others.
 * @throws If `state` has no lab.
 */
export async function nextEntry(state: LabState, key: SigningKey, op: Operation,
                                options: SignOptions = {}): Promise<SignedEntry> {
  if (state.lab === null) throw new Error("There is no lab here to write to.");
  const head = state.heads[key.publicKey];
  const prev = head === undefined ? null : state.entries.find((one) => one.id === head.id)!.signed;
  const known = state.knows[key.publicKey] ?? {};
  const seen: Record<string, string> = {};
  for (const [author, theirs] of Object.entries(state.heads)) {
    if (author !== key.publicKey && (known[author] ?? -1) < theirs.seq) seen[author] = theirs.id;
  }
  return writeEntry(key, { lab: state.lab, prev, seen }, op, options);
}

/**
 * What a lab shows the world: the parts it has in stock, and whether each is on offer.
 *
 * The logs hold everything — every tube, every amount, who took what. None of that leaves. A part is
 * listed if some item of it that has not been retired has anything left, it is on offer only if a
 * member said so, and the only note that travels is one written to be public (`public_note`).
 *
 * @param state - The lab.
 * @param lab - Who is publishing, and from where.
 * @param options - Other labs to point at, and when to say it was published.
 * @returns An inventory, ready for a member to sign with `signInventory`.
 */
export function publicInventory(state: LabState, lab: LabModel,
                                options: { peers?: readonly PeerModel[]; publishedAt?: string } = {}): InventoryDocument {
  const inStock = new Set(state.items.filter((item) => !item.retired && item.amount > 0).map((item) => item.part));
  const parts: InventoryPart[] = state.parts.filter((part) => inStock.has(part.checksum)).map((part, at) => ({
    id: String(at + 1),
    name: part.name,
    checksum: part.checksum,
    length: part.length,
    circular: part.circular,
    available: part.offered,
    note: typeof part.fields["public_note"] === "string" ? part.fields["public_note"] : null,
  }));
  return {
    bionet_inventory_version: INVENTORY_VERSION,
    lab,
    parts,
    ...(options.peers === undefined ? {} : { peers: [...options.peers] }),
    published_at: options.publishedAt ?? new Date().toISOString(),
  };
}
