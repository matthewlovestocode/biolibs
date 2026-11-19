/**
 * One signed change to a lab, and the log it belongs to.
 *
 * A published inventory is what a lab shows the world. This is what happens inside it: every change
 * anybody makes — somebody joined, a tube was added, some of it was used — is one entry, signed by
 * the key of the device it was made on, and appended to that key's own log. Nobody writes to another
 * key's log, so two people working offline cannot overwrite each other; what the lab holds is
 * whatever `merge.ts` makes of all the logs together.
 *
 * An entry says three things beyond the change itself. Which lab it is for, so it cannot be replayed
 * into another. Where it sits in its own key's log, so a missing or substituted entry shows. And what
 * its author had seen of everybody else's logs when they wrote it, which is the only honest way to
 * order changes made on laptops whose clocks agree about nothing.
 *
 * Reading is the careful half here too. An entry arrives from another machine, so `readEntry` checks
 * its shape and its size before anything else looks at it.
 */
import { canonicalJson, signUnder, verifyUnder, type DocumentSignature, type SignatureCheck,
         type SignOptions, type SigningKey } from "@biolibs/opencloning";

/** The version of the entry format written here. */
export const LOG_VERSION = 1;

/** What the bytes of a signed entry are for. No other kind of document is signed under this. */
export const LOG_DOMAIN = "biolibs/bionet log entry v1";

/** The longest one entry may be, as canonical text. A plasmid's sequence has to fit. */
export const LONGEST_ENTRY = 600_000;

/** How many other logs one entry may say it had seen. */
export const MOST_SEEN = 1_000;

/**
 * What a key on the roster may do: change the inventory, change the roster as well, or only advise.
 *
 * An adviser has no hands. It may say what parts there are and propose runs, and nothing it writes
 * can move an amount, a tube or a place: that limit is applied where every log is merged, so it
 * holds on every device and not only in the app the adviser is reached through.
 */
export type Role = "member" | "keeper" | "adviser";

/**
 * One change. `type` says which; the rest is whatever that change carries.
 *
 * It is deliberately loose. An entry whose `type` this version does not know is kept and chained
 * like any other and simply not applied, so that an older app survives a newer one writing to the
 * same lab. The operations this version does know are built by the functions at the foot of this
 * file and checked by `merge.ts` when they are applied.
 */
export interface Operation {
  /** Which change this is, like `item.adjust`. */
  type: string;
  [field: string]: unknown;
}

/** One entry in one key's log. This is what is signed. */
export interface LogEntry {
  /** Always `1`. */
  bionet_log_version: number;
  /** The lab this is for: the ID of its founding entry. `null` only in that founding entry. */
  lab: string | null;
  /** The key whose log this is in, 32 bytes in base64url. It must be the key that signs. */
  author: string;
  /** Where this sits in that log, from 0. */
  seq: number;
  /** The ID of the entry before it in the same log, or `null` at 0. */
  prev: string | null;
  /**
   * What the author had of other keys' logs: for each key, the ID of the latest entry they held.
   * Only keys whose latest entry changed since this author's previous entry need be listed.
   */
  seen: Record<string, string>;
  /** The change. */
  op: Operation;
}

/** An entry with its signature beside it, which is how one travels. */
export interface SignedEntry {
  /** The entry, exactly as it was signed. */
  entry: LogEntry;
  /** The author's signature over it. */
  signature: DocumentSignature;
}

const HEX_ID = /^[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;

/**
 * The ID of an entry: the SHA-256 of its canonical form, in hex.
 *
 * It covers the entry and not the signature, so it names the change itself. An entry's ID is how the
 * next entry in the log points back at it and how another key says it has seen it.
 *
 * @param entry - The entry.
 * @returns 64 hex characters.
 */
export async function entryId(entry: LogEntry): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(entry));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What `writeEntry` needs to know about where an entry goes. */
export interface EntryPlace {
  /** The lab's ID. */
  lab: string;
  /** This key's previous entry, or `null` if this is its first. */
  prev: SignedEntry | null;
  /** The latest entry held from each other key, where that changed since `prev`. */
  seen?: Record<string, string>;
}

/**
 * Write and sign the next entry in a key's log.
 *
 * Most callers want `nextEntry` in `merge.ts`, which works the place out from the lab's merged state.
 * This is the plain form underneath it.
 *
 * @param key - The device's key. Its log is the one written to.
 * @param place - Which lab, what came before in this log, and what had been seen of the others.
 * @param op - The change.
 * @param options - A name to sign under, and when.
 * @returns The signed entry.
 * @throws If `prev` belongs to another key or another lab.
 */
export async function writeEntry(key: SigningKey, place: EntryPlace, op: Operation,
                                 options: SignOptions = {}): Promise<SignedEntry> {
  const before = place.prev?.entry ?? null;
  if (before !== null && before.author !== key.publicKey) {
    throw new Error("The previous entry is from another key's log.");
  }
  if (before !== null && before.lab !== place.lab && !(before.lab === null && before.seq === 0)) {
    throw new Error("The previous entry is from another lab.");
  }
  const entry: LogEntry = {
    bionet_log_version: LOG_VERSION,
    lab: place.lab,
    author: key.publicKey,
    seq: before === null ? 0 : before.seq + 1,
    prev: before === null ? null : await entryId(before),
    seen: { ...(place.seen ?? {}) },
    op,
  };
  return { entry, signature: await sign(entry, key, options) };
}

/** Sign an entry, saying in this file's own terms why one cannot be signed. */
async function sign(entry: LogEntry, key: SigningKey, options: SignOptions): Promise<DocumentSignature> {
  try {
    canonicalJson(entry);
  } catch {
    throw new Error("An entry can carry only whole numbers: an amount is a whole number of the item's unit.");
  }
  return signUnder(LOG_DOMAIN, entry, key, options);
}

/**
 * Found a lab: write the entry every other entry in it will point back to.
 *
 * The lab's ID is this entry's ID, so a lab is named by an act — this key, founding this lab, at this
 * claimed moment — and not by an address, which can change, or a name, which anybody can use.
 *
 * @param key - The founder's device key. It becomes the lab's first keeper.
 * @param about - What the lab is called, and who is founding it.
 * @param options - A name to sign under, and when.
 * @returns The founding entry. `entryId` of its `entry` is the lab's ID.
 *
 * @example
 * ```ts
 * import { entryId, foundLab } from "@biolibs/bionet";
 *
 * const founding = await foundLab(key, { name: "The Wren Lab", person: "Ada" });
 * const lab = await entryId(founding.entry);
 * ```
 */
export async function foundLab(key: SigningKey, about: { name: string; person: string },
                               options: SignOptions = {}): Promise<SignedEntry> {
  const entry: LogEntry = {
    bionet_log_version: LOG_VERSION,
    lab: null,
    author: key.publicKey,
    seq: 0,
    prev: null,
    seen: {},
    op: { type: "roster.found", name: about.name, person: about.person },
  };
  return { entry, signature: await sign(entry, key, { signer: about.person, ...options }) };
}

/**
 * Whether a value is shaped like a signed entry. Says nothing about whether the signature holds.
 *
 * @param value - Anything.
 * @returns Whether it has an entry and a signature.
 */
export function isSignedEntry(value: unknown): value is SignedEntry {
  if (typeof value !== "object" || value === null) return false;
  const held = value as { entry?: unknown; signature?: unknown };
  return typeof held.entry === "object" && held.entry !== null
      && typeof held.signature === "object" && held.signature !== null;
}

/**
 * Read an entry that came from somewhere else.
 *
 * This checks shape and size and nothing more: that it could be an entry. Whether its signature
 * holds is `verifyEntry`'s question, and whether it belongs in the lab is `mergeLog`'s.
 *
 * @param value - What arrived.
 * @returns The same value, known to be shaped like an entry.
 * @throws If it is not one, saying what is wrong.
 */
export function readEntry(value: unknown): SignedEntry {
  if (!isSignedEntry(value)) throw new Error("This is not a signed log entry.");
  const entry = value.entry as Partial<LogEntry>;
  if (entry.bionet_log_version !== LOG_VERSION) {
    throw new Error(`This entry is in a format this does not read (version ${String(entry.bionet_log_version)}).`);
  }
  if (typeof entry.author !== "string" || !KEY.test(entry.author)) throw new Error("This entry does not say whose log it is in.");
  if (!Number.isInteger(entry.seq) || entry.seq! < 0 || entry.seq! > 1_000_000_000) {
    throw new Error("This entry does not say where in the log it sits.");
  }
  if (entry.prev !== null && (typeof entry.prev !== "string" || !HEX_ID.test(entry.prev))) {
    throw new Error("This entry's pointer to the one before it is not an entry ID.");
  }
  if ((entry.seq === 0) !== (entry.prev === null)) {
    throw new Error("Only the first entry in a log has nothing before it.");
  }
  if (entry.lab !== null && (typeof entry.lab !== "string" || !HEX_ID.test(entry.lab))) {
    throw new Error("This entry does not say which lab it is for.");
  }
  const op = entry.op as Partial<Operation> | null | undefined;
  if (typeof op !== "object" || op === null || Array.isArray(op) || typeof op.type !== "string"
      || op.type.length === 0 || op.type.length > 60) {
    throw new Error("This entry carries no change.");
  }
  if (entry.lab === null && !(entry.seq === 0 && op.type === "roster.found")) {
    throw new Error("Only a founding entry may leave out the lab.");
  }
  if (op.type === "roster.found" && entry.lab !== null) {
    throw new Error("A founding entry cannot be written into an existing lab.");
  }
  const seen = entry.seen as unknown;
  if (typeof seen !== "object" || seen === null || Array.isArray(seen)) throw new Error("This entry does not say what it had seen.");
  const others = Object.entries(seen as Record<string, unknown>);
  if (others.length > MOST_SEEN) throw new Error(`An entry may name at most ${MOST_SEEN} other logs.`);
  for (const [key, id] of others) {
    if (!KEY.test(key) || typeof id !== "string" || !HEX_ID.test(id) || key === entry.author) {
      throw new Error("This entry's record of what it had seen is not a list of keys and entry IDs.");
    }
  }
  const signature = value.signature as Partial<DocumentSignature>;
  if (typeof signature.algorithm !== "string" || typeof signature.public_key !== "string"
      || typeof signature.signature !== "string" || typeof signature.signed_at !== "string"
      || signature.signed_at.length > 40 || signature.signature.length > 200
      || (signature.signer !== null && (typeof signature.signer !== "string" || signature.signer.length > 200))) {
    throw new Error("This entry's signature is not a signature.");
  }
  if (canonicalJson(entry).length > LONGEST_ENTRY) throw new Error("This entry is longer than will be read.");
  return value;
}

/**
 * Check an entry's signature.
 *
 * Two things have to be true: the signature holds over these bytes under the log's own domain, and
 * the key that signed is the key whose log the entry claims to be in. The second matters as much as
 * the first — without it anybody could sign an entry into somebody else's log with their own key.
 *
 * @param signed - The entry.
 * @returns The check. `ok` only if both hold; `problem` says which did not.
 */
export async function verifyEntry(signed: SignedEntry): Promise<SignatureCheck> {
  const [check] = await verifyUnder(LOG_DOMAIN, signed.entry, [signed.signature]);
  if (check!.ok && signed.signature.public_key !== signed.entry.author) {
    return { ...check!, ok: false, problem: "This entry was signed by a key other than the one whose log it is in." };
  }
  return check!;
}

/** @returns The change that adds a key to the roster. */
export const addToRoster = (key: string, person: string, role: Role = "member"): Operation =>
  ({ type: "roster.add", key, person, role });

/**
 * @param key - The key to remove.
 * @param cutoff - The last `seq` of that key's log the lab accepts. -1 accepts none of it.
 * @returns The change that removes a key, keeping its entries up to the cutoff.
 */
export const removeFromRoster = (key: string, cutoff: number): Operation =>
  ({ type: "roster.remove", key, cutoff });

/** @returns The change that makes a key a keeper, or an ordinary member again. */
export const setRole = (key: string, role: Role): Operation => ({ type: "roster.role", key, role });

/**
 * What a linear part's two ends are like, when they are not blunt.
 *
 * A piece cut out by a restriction enzyme usually has a few unpaired bases at each end, and those
 * decide what it can be joined to. The part's sequence is every base either strand has, read along
 * the top strand; each number here says how many of them at that end are on one strand only. A
 * positive number is a 5′ overhang, a negative one a 3′ overhang, and 0 is blunt.
 */
export interface PartEnds {
  /** The left-hand end. */
  left: number;
  /** The right-hand end. */
  right: number;
}

/**
 * What a part is made of.
 *
 * A lab keeps protein as well as DNA, and the two cannot be told apart by looking: `ACGT` is a
 * perfectly good peptide — alanine, cysteine, glycine, threonine — as well as a perfectly good
 * piece of DNA. So which it is has to be said, and the two are counted by different checksums, as
 * they should be: a gene and the protein it codes for are not the same thing.
 */
export type PartKind = "dna" | "protein";

/**
 * @param part - Its sequence, its name, whether it is a circle, its ends if they are not blunt, and
 *   what it is made of if it is not DNA.
 * @returns The change that adds a part, by its sequence. Its checksum is computed when applied, and
 *   takes the ends in: the same bases with different ends are a different molecule.
 */
export const addPart = (part: { sequence: string; circular?: boolean; name: string; ends?: PartEnds; kind?: PartKind }): Operation =>
  ({ type: "part.add", sequence: part.sequence, circular: part.circular === true, name: part.name,
     ...(part.kind === undefined || part.kind === "dna" ? {} : { kind: part.kind }),
     ...(part.ends === undefined || (part.ends.left === 0 && part.ends.right === 0) ? {} : { ends: { left: part.ends.left, right: part.ends.right } }) });

/** Something marked on a part's sequence: a gene, a promoter, an origin, a primer's binding site. */
export interface PartFeature {
  /** What kind of thing it is, as sequence files say it: `CDS`, `promoter`, `rep_origin`. */
  type: string;
  /** What it is called. */
  label: string;
  /** Which strand it is on: 1 for the one written, -1 for the other, 0 for neither or both. */
  strand: -1 | 0 | 1;
  /** Where it is: one stretch, or several for something in pieces. Each counts bases from 0 and stops before `end`. */
  parts: { start: number; end: number }[];
}

/** @returns The change that says what is marked on a part's sequence, in place of whatever was marked before. */
export const annotatePart = (part: string, features: PartFeature[]): Operation => ({ type: "part.annotate", part, features });

/** @returns The change that says whether a part is on offer to other labs. */
export const offerPart = (part: string, available: boolean): Operation => ({ type: "part.offer", part, available });

/**
 * @returns The change that adds one physical lot: a tube of a part, a culture of a strain, or a
 *   tube of a specimen nobody has identified. Exactly one of `part`, `strain` and `specimen` is
 *   given, and `amount` is a whole number of `unit`.
 */
export const addItem = (item: { item: string; part?: string; strain?: string; specimen?: string; amount: number; unit?: string | null }): Operation =>
  ({ type: "item.add", item: item.item, ...(item.part === undefined ? {} : { part: item.part }),
     ...(item.strain === undefined ? {} : { strain: item.strain }),
     ...(item.specimen === undefined ? {} : { specimen: item.specimen }), amount: item.amount, unit: item.unit ?? null });

/** @returns The change that adds to or takes from an item. `by` is a whole-number difference, never a total. */
export const adjustItem = (item: string, by: number): Operation => ({ type: "item.adjust", item, by });

/** @returns The change that says how much of an item is physically there. */
export const recountItem = (item: string, amount: number): Operation => ({ type: "item.recount", item, amount });

/** @returns The change that retires an item. It stays in the history. */
export const retireItem = (item: string): Operation => ({ type: "item.retire", item });

/** Where a place stands and how big it is, in whole millimetres, since only whole numbers are signed. */
export interface StandingMm {
  /** The centre of its base, measured from the centre of the base of the place it is in: across, up, and towards the front. */
  at: [number, number, number];
  /** How wide, how tall and how deep it is. */
  size: [number, number, number];
  /** Which way it faces, in quarter turns. */
  turn: 0 | 90 | 180 | 270;
}

/**
 * @returns The change that adds a place: a room, a freezer, a shelf, a box. `parent` is the place it
 *   is in, or `null` for one that is in nothing. `grid` makes it a box, with positions.
 */
export const addPlace = (place: { place: string; kind: string; name: string; parent?: string | null;
                                  grid?: { rows: number; columns: number } | null }): Operation =>
  ({ type: "place.add", place: place.place, kind: place.kind, name: place.name, parent: place.parent ?? null, grid: place.grid ?? null });

/** @returns The change that puts a place inside another, or inside nothing. */
export const movePlace = (place: string, parent: string | null): Operation => ({ type: "place.move", place, parent });

/** @returns The change that says where a place stands and how big it is, or with `null` that nobody has said. */
export const standPlace = (place: string, standing: StandingMm | null): Operation => ({ type: "place.stand", place, standing });

/** @returns The change that retires a place. It stays in the history. */
export const retirePlace = (place: string): Operation => ({ type: "place.retire", place });

/**
 * @returns The change that says where an item is: in which place, and at which position if the
 *   place is a box. `null` for the place says it is nowhere the lab has recorded.
 */
export const putItem = (item: string, place: string | null, slot: { row: number; column: number } | null = null): Operation =>
  ({ type: "item.put", item, place, slot });

/** One item that went into a run, and how much of it was used. */
export interface RunInput {
  /** The item. */
  item: string;
  /** How much of it was used, in the item's own unit. A whole number, which may be 0. */
  amount: number;
  /** What it was there as: a template, a forward primer. */
  role: string;
}

/** One item that came out of a run. */
export interface RunOutput {
  /** The new item's ID. */
  item: string;
  /** The bases of what it is. */
  sequence: string;
  /** Whether that is a circle. */
  circular: boolean;
  /** Its ends, if it is linear and they are not blunt. */
  ends?: PartEnds;
  /** What to call the part, if the lab does not have it already. */
  name: string;
  /** How much there is. A whole number of `unit`. */
  amount: number;
  /** What one of that is. */
  unit: string | null;
}

/** Something done at the bench, as it is recorded. */
export interface RunRecord {
  /** The run's ID. */
  run: string;
  /** What kind of run it was: `pcr`. */
  kind: string;
  /** The place it was done at, such as a thermocycler, or `null`. */
  instrument: string | null;
  /** What went in. */
  inputs: RunInput[];
  /** What came out. None, for a run that did not work. */
  outputs: RunOutput[];
  /** How it was set up: whole numbers and short text, by name. */
  settings: Record<string, string | number>;
  /** Whether it worked. */
  outcome: "worked" | "failed";
  /** Anything worth saying about it. */
  note: string | null;
}

/**
 * @returns The change that records something done at the bench. In one entry it takes what was used
 *   from each input, adds each output as an item (and as a part, if it is new), and keeps the run
 *   itself, so that any item it made can say where it came from.
 */
export const recordRun = (run: RunRecord): Operation => ({ type: "run.record", ...run });

/** @returns A new ID for a run, made the way an item's is. */
export const newRunId = (): string => newItemId();

/** One thing a planned run would use: a tube the lab has, or a part it would first have to get. */
export interface PlanInput {
  /** The item, if the lab holds a tube of it. Exactly one of `item`, `part` and `prospect` is given. */
  item?: string;
  /** The part's checksum, if there is no tube of it yet: something to be ordered or made first. */
  part?: string;
  /**
   * The prospect, for something nobody has made and nobody can checksum — the strain a transformation
   * would give, the culture grown from it. A plan that names one is a plan that cannot be carried out
   * yet, and says so plainly rather than naming nothing at all.
   */
  prospect?: string;
  /** How much of it the run would use, in the item's own unit. A whole number, which may be 0. */
  amount: number;
  /** What it would be there as: a template, a forward primer. */
  role: string;
}

/** One thing a planned run is expected to make. Nothing exists yet, so it has no item and no amount. */
export interface PlanExpect {
  /** The bases of what it would be. */
  sequence: string;
  /** Whether that is a circle. */
  circular: boolean;
  /** Its ends, if it is linear and they are not blunt. */
  ends?: PartEnds;
  /** What to call it. */
  name: string;
}

/**
 * A run that has not been done: what somebody proposes doing at the bench.
 *
 * It is a recorded run with everything that claims something happened taken out. It carries what it
 * expects to make and not how that was worked out, because every reader can work that out again
 * with their own engine and see whether they agree.
 */
export interface PlanRecord {
  /** The plan's ID. */
  plan: string;
  /** What kind of run it would be: `pcr`. */
  kind: string;
  /** The place to do it at, such as a thermocycler, or `null`. */
  instrument: string | null;
  /** What it would use. */
  inputs: PlanInput[];
  /** What it is expected to make, where that is a molecule with a sequence. */
  expects: PlanExpect[];
  /**
   * The prospects it would bring into existence, by ID, where what it makes has no sequence to
   * expect: a strain, a culture, a curd. Without this a transformation makes nothing the record can
   * name, and the chain of work stops at it.
   */
  makes?: string[];
  /** How to set it up: whole numbers and short text, by name. */
  settings: Record<string, string | number>;
  /** Why, and anything else worth saying. */
  note: string | null;
}

/**
 * @returns The change that proposes a run. It changes nothing the lab holds: no amount moves and no
 *   item or part is made. It is kept so that somebody can carry it out and say that they did.
 */
export const planRun = (plan: PlanRecord): Operation => ({ type: "plan.add", ...plan });

/**
 * @returns The change that closes a plan: carried out as `run`, or set aside if `run` is `null`.
 *   It is an entry of its own and not something a recorded run carries, so that a device too old to
 *   know of plans still reads the run.
 */
export const settlePlan = (plan: string, run: string | null): Operation => ({ type: "plan.settle", plan, run });

/** @returns A new ID for a plan, made the way an item's is. */
export const newPlanId = (): string => newItemId();

/**
 * Something the lab understands the makeup of and has not made.
 *
 * A part is known by the checksum of its sequence, so everything the lab holds that *has* a sequence
 * can be named before it exists — the nine designed plasmids are parts with no tube. What has no
 * sequence cannot be: a strain that will carry a construct, the culture grown from it, a mixture of
 * four proteins, curd. The chain of work stops at the first of those, and everything after it has to
 * be proposed afresh once somebody is holding something.
 *
 * A prospect is how that chain carries on. It is the mirror of a specimen: a specimen is a tube the
 * lab holds and cannot name, and this is a thing the lab can name and does not hold. It has no
 * checksum — there is no sequence to count one over — so, exactly like a specimen and a culture, it
 * cannot travel in a method. Saying what to do with a thing somebody else does not have is not a
 * method, it is a wish.
 */
export interface ProspectRecord {
  /** The prospect's ID. */
  prospect: string;
  /** What it would be called: `GS115 carrying pPIC9K-alphaS1`. */
  name: string;
  /** What kind of thing: `strain`, `culture`, `mixture`, `curd`. Free, like a run's kind. */
  kind: string;
  /** What it would be made of, said for a person. No part of this is machine-readable on purpose. */
  madeOf: string;
  /** Anything else worth saying, or `null`. */
  note: string | null;
}

/**
 * @returns The change that names something the lab means to have and has not made.
 *
 * It makes no tube and no part. It exists so that the steps after it can be written down while it is
 * still hypothetical, and so that a reader can tell at a glance which parts of a plan rest on
 * something nobody is holding.
 */
export const addProspect = (prospect: ProspectRecord): Operation => ({ type: "prospect.add", ...prospect });

/**
 * @returns The change that says a prospect has come into existence, and what it turned out to be.
 *
 * Exactly one of `strain` and `item` is given, and it has to be one the lab already has: the thing
 * is added first, the way a specimen's part is, and then this says the prospect was it.
 */
export const realiseProspect = (prospect: string, became: { strain?: string; item?: string }): Operation =>
  ({ type: "prospect.realise", prospect, strain: became.strain ?? null, item: became.item ?? null });

/** @returns A new ID for a prospect, made the way an item's is. */
export const newProspectId = (): string => newItemId();

/**
 * What a lab expects to see if a plan worked, as it would be written before doing it.
 *
 * A plan says what it would make. This says what somebody at the bench would *observe* — the bands a
 * check digest should show, the size a colony PCR should give, where a protein should run. The two
 * are different claims: one is about a molecule, the other about a reading, and a reading can be
 * wrong about a molecule that is perfectly correct.
 */
export interface ExpectationRecord {
  /** The expectation's ID. */
  expect: string;
  /** The plan it is about. */
  plan: string;
  /** How it would be observed: `digest`, `colony pcr`, `protein gel`, `sequencing`. Free, like a run's kind. */
  kind: string;
  /** What to expect, for somebody standing at the bench to read. */
  says: string;
  /**
   * The readings themselves, as whole numbers: band sizes in bases, a product's length, a mass in
   * daltons. An entry carries only whole numbers, so anything with a fraction belongs in `says`.
   */
  numbers: readonly number[];
  /** How it would be observed: which enzymes, which gel, which ladder. */
  settings: Record<string, string | number>;
  /** Anything else worth saying, or `null`. */
  note: string | null;
}

/**
 * @returns The change that writes down what a plan's result should look like.
 *
 * It is a change of its own rather than a field on the plan, so that a device too old to know of
 * expectations still reads the plan, and so that an adviser may write one: saying what to look for
 * is reading and working out, which is all an adviser does.
 */
export const expectOf = (expectation: ExpectationRecord): Operation => ({ type: "expect.add", ...expectation });

/**
 * @returns The change that says what was actually seen, and whether it was what was expected.
 *
 * Whether a reading matches is a person's call, not the log's: a gel photograph is read by eye, and
 * two bands a tool would call different may be one band to the person who ran it. So `met` is said,
 * the way a run's outcome is said, and `saw` records the reading it was said about.
 *
 * @param expect - The expectation.
 * @param met - Whether what was seen is what was expected.
 * @param saw - The reading, as whole numbers. Empty where there is nothing to count.
 * @param options - The run it was seen in, and anything to say about it.
 */
export const meetExpectation = (expect: string, met: boolean, saw: readonly number[] = [],
                                options: { run?: string | null; note?: string | null } = {}): Operation =>
  ({ type: "expect.meet", expect, met, saw: [...saw], run: options.run ?? null, note: options.note ?? null });

/**
 * @returns The change that takes an expectation back, for one written in error or on the wrong step.
 *
 * It cannot take back a reading. Once somebody has said what they saw, the expectation is part of
 * what happened and stays: an intention yields to a fact, not the other way round.
 *
 * @param expect - The expectation.
 * @param note - Why, or `null`.
 */
export const withdrawExpectation = (expect: string, note: string | null = null): Operation =>
  ({ type: "expect.withdraw", expect, note });

/** @returns A new ID for an expectation, made the way an item's is. */
export const newExpectationId = (): string => newItemId();


/**
 * A living thing the lab keeps: an organism, and what has been put into it.
 *
 * A part is known by its sequence, so two labs that made the same molecule call it the same thing
 * without ever having spoken. A strain is not like that. Two labs that put the same plasmid into
 * the same published host have two strains, which may behave differently and did not come from each
 * other, so a strain is known by an ID the way a tube or a place is, and says what it came from.
 */
export interface StrainRecord {
  /** The strain's ID. */
  strain: string;
  /** What the lab calls it. */
  name: string;
  /** The organism it is, as a person would say it: `Saccharomyces cerevisiae W303`. */
  host: string;
  /** The checksums of the parts it carries. None, for a host nothing has been put into. */
  carries: string[];
  /** The strain it was made from, if the lab has that one. */
  parent: string | null;
  /** The run that made it, if one did. */
  from: string | null;
}

/** A thing the lab physically has and cannot yet name. */
export interface SpecimenRecord {
  /** The specimen's ID. */
  specimen: string;
  /** What the lab would write on the tube: `pET from the back of the -80`. Not a claim of identity. */
  name: string;
  /** Anything worth saying about where it came from, or `null`. */
  note: string | null;
}

/**
 * @returns The change that says the lab has something it has not identified. It makes no tube of
 *   it: `addItem` with the specimen does that, the way a tube of a part is added after the part.
 *
 * A specimen is the freezer's honest answer to a tube nobody has sequenced. It has no checksum,
 * because a checksum is of a sequence and there is no sequence yet, so it cannot satisfy a plan and
 * cannot travel in a method — the same way a culture cannot, and for the same reason.
 */
export const addSpecimen = (specimen: SpecimenRecord): Operation => ({ type: "specimen.add", ...specimen });

/**
 * @returns The change that says what a specimen turned out to be.
 *
 * The part has to be one the lab already has, so the sequence that came back is added first. The
 * tube does not move and does not change: it keeps its place, its amount and its history, because
 * the tube never changed — only what is known about it did.
 */
export const identifySpecimen = (specimen: string, part: string): Operation =>
  ({ type: "specimen.identify", specimen, part });

/** @returns A new ID for a specimen, made the way an item's is. */
export const newSpecimenId = (): string => newItemId();

/**
 * @returns The change that says the lab has a strain. It makes no culture of it: `addItem` with the
 *   strain does that, the way a tube of a part is added after the part.
 */
export const addStrain = (strain: StrainRecord): Operation => ({ type: "strain.add", ...strain });

/** @returns A new ID for a strain, made the way an item's is. */
export const newStrainId = (): string => newItemId();

/**
 * @returns The change that sets one field on a part (by checksum), or an item, a place, a strain or
 *   a plan (by ID).
 *
 * A plan can carry one because a lab's proposals are not one undifferentiated pile: a lab with
 * several projects on at once needs to know which is which, and that is a thing people decide
 * rather than something the molecules say. A device too old to know a plan can be filed refuses
 * the entry and still reads the plan itself, so it loses the label and nothing else.
 */
export const setField = (on: "part" | "item" | "place" | "strain" | "plan", id: string, field: string, value: string | number | null): Operation =>
  ({ type: "field.set", on, id, field, value });

/** @returns A new ID for a place, made the way an item's is. */
export const newPlaceId = (): string => newItemId();

/**
 * A new ID for an item: 16 random bytes in hex.
 *
 * Random, because items are created on laptops that are offline, and two of them counting up from
 * the same number would collide the moment they met.
 *
 * @returns 32 hex characters.
 */
export function newItemId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
