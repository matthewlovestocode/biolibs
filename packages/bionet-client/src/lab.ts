/**
 * One person's device in one lab: its key, what it holds, and everything it can do.
 *
 * This is a whole lab application without a window. It knows nothing of Electron, React or a
 * browser, so the same class sits behind a desktop app, a web page or a test, and two of these and a
 * web peer are a lab.
 *
 * Everything a member does becomes a signed entry in this device's own log, is kept, and is offered
 * to the lab's web peer when there is one to offer it to. Nothing waits for the network. What the lab
 * holds is worked out from the entries each time they change, by `mergeLog`, which is why two devices
 * that have been apart agree the moment they have each other's entries.
 */
import { addItem, addPart, addPlace, addSpecimen, addStrain, addToRoster, adjustItem, annotatePart, entryId, expectOf, fetchInventory, foundLab, identifySpecimen, isMember, meetExpectation, mergeLog, newExpectationId,
         movePlace, newItemId, newPlaceId, newPlanId, newRunId, newSpecimenId, newStrainId, nextEntry, offerPart, planRun, publicInventory, publicMethod, putItem, recordRun, recountItem, retireItem, retirePlace,
         readMethod, signMethod,
         setField, settlePlan, signInventory, standPlace,
         takeEntries, type Crowded, type EntryStatus, type ItemState, type LabState, type Operation, type Overlap,
         type LabModel, type MethodDocument, type MethodOptions, type PartEnds, type PartFeature, type PartState, type PlaceState, type PartKind, type PlanInput, type PlanState, type RunInput, type RunState, type Role, type RosterKey, type SignedEntry, type SignedMethod, type ExpectationState, type SpecimenState, type StrainState } from "@biolibs/bionet";
import { exportSigningKey, generateSigningKey, importSigningKey, keyFingerprint,
         type SigningKey } from "@biolibs/opencloning";
import { openKey, sealKey } from "./backup.js";
import { PeerLink, type LinkStatus } from "./link.js";
import type { KeyKeeper, LabStore } from "./store.js";

/** One key on the roster, as a window shows it. */
export interface RosterView extends RosterKey {
  /** The key's fingerprint, for a person to compare. */
  fingerprint: string;
  /** Whether it is this device's key. */
  you: boolean;
}

/** One entry, as a window shows it. */
export interface EntryView {
  id: string;
  author: string;
  seq: number;
  op: Operation;
  status: EntryStatus;
  reason: string | null;
  /** What the signer called themselves. A claim. */
  signer: string | null;
  /** When they say they signed. A claim. */
  signedAt: string;
}

/** The lab, as a window shows it. */
export interface LabView {
  id: string | null;
  name: string | null;
  /** Whether any of the lab has reached this device yet. */
  arrived: boolean;
  /** Whether this device's key is on the roster, so it may change the lab. */
  member: boolean;
  /** Whether it may change the roster as well. */
  keeper: boolean;
  /** Whether it may only advise: add parts and propose runs, and change nothing the lab holds. */
  adviser: boolean;
  roster: RosterView[];
  parts: PartState[];
  /** Every strain the lab keeps. */
  strains: StrainState[];
  /** Every specimen: something the lab physically has and cannot yet name. */
  specimens: SpecimenState[];
  /** What the lab expects to see of its plans, and what was seen. */
  expectations: ExpectationState[];
  items: ItemState[];
  /** Every place. */
  places: PlaceState[];
  /** Positions the log says hold more than one item. */
  crowded: Crowded[];
  /** Everything done at the bench that was recorded. */
  runs: RunState[];
  /** Every run that has been proposed, open or settled. */
  plans: PlanState[];
  overlaps: Overlap[];
  /** How many entries are waiting on others that have not arrived. */
  waiting: number;
  entries: EntryView[];
}

/** The connection to the lab's web peer, as a window shows it. */
export interface PeerView {
  url: string | null;
  /** The web address the lab's inventory is published at. */
  origin: string | null;
  /** What to send somebody who should join. */
  invite: string | null;
  status: LinkStatus;
  problem: string | null;
  /** How many changes made here the peer is not known to have. */
  pending: number;
  lastSynced: string | null;
}

/**
 * An adviser this device hosts: a second key, kept here, that something with no hands signs with.
 *
 * It is a key of its own and not this device's, so that what it writes is its own in the lab's
 * history and is held to what an adviser may do by every device that merges it.
 */
export interface HostedAdviser {
  /** Its key, for a keeper to let into the lab. */
  key: string;
  /** Its fingerprint, for a person to compare. */
  fingerprint: string;
  /** Where it stands in the lab: its role, `removed`, or `null` if no keeper has let it in. */
  standing: Role | "removed" | null;
}

/** Everything a window needs to draw, as plain data. */
export interface LabSnapshot {
  device: { key: string; fingerprint: string; person: string | null };
  /** The adviser this device hosts, or `null` if it hosts none. */
  hosting: HostedAdviser | null;
  lab: LabView | null;
  peer: PeerView;
  /** When this device last published the lab's inventory. */
  published: string | null;
}

/** What a device needs. */
export interface LabOptions {
  /** Where to keep things. */
  store: LabStore;
  /** Where the device's key lives. */
  keys: KeyKeeper;
  /** Where the key of an adviser this device hosts lives. Without it the device can host none. */
  adviserKeys?: KeyKeeper;
  /** Something to fetch the published inventory with. Defaults to the runtime's own `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Something to open sockets with. Defaults to the runtime's own `WebSocket`. */
  WebSocket?: typeof globalThis.WebSocket;
}

/** The version of the document `exportLab` writes. */
export const LAB_COPY_VERSION = 1;

/** @param peer - The peer's socket address. @returns The web address it serves from. */
export function originOf(peer: string): string {
  const url = new URL(peer);
  return `${url.protocol === "ws:" ? "http:" : "https:"}//${url.host}`;
}

/**
 * Read an invitation: the peer's address, then `#`, then the lab's ID.
 *
 * @param invite - What a keeper sent.
 * @returns Where the lab's peer is, and which lab.
 * @throws If it is not an invitation.
 */
export function readInvite(invite: string): { peer: string; lab: string } {
  const [peer, lab] = invite.trim().split("#");
  if (peer === undefined || lab === undefined || !/^[0-9a-f]{64}$/.test(lab)) {
    throw new Error("That is not an invitation. One looks like wss://a-lab.example/sync#, followed by 64 letters and digits.");
  }
  const url = new URL(peer);
  if (url.protocol !== "wss:" && url.protocol !== "ws:") throw new Error("An invitation's address starts with wss://.");
  return { peer, lab };
}

const peerAddress = (peer: string | null | undefined): string | null => {
  if (peer === null || peer === undefined || peer.trim() === "") return null;
  const url = new URL(peer.trim());
  if (url.protocol !== "wss:" && url.protocol !== "ws:") throw new Error("A peer's address starts with wss://.");
  return peer.trim();
};

/**
 * One device in one lab.
 *
 * Make one with somewhere to keep things and somewhere to keep the key, `open()` it, and it is a
 * working lab application: it makes the device's key if there is none, works the lab out from what
 * is held, and starts talking to the lab's peer if it has one.
 *
 * @example
 * ```ts
 * import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
 *
 * const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
 * await lab.setPerson("Ada");
 * await lab.found({ name: "The Wren Lab" });
 * lab.snapshot().lab?.keeper;   // true
 * ```
 */
export class Lab {
  private readonly store: LabStore;
  private held: SignedEntry[] = [];
  private state: LabState | null = null;
  private link: PeerLink | null = null;
  private key!: SigningKey;
  private fingerprint = "";
  private hosted: { key: SigningKey; fingerprint: string } | null = null;
  private readonly fingerprints = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private cached: LabSnapshot | null = null;
  /** One change at a time, so two cannot both write the same place in the log. */
  private turn: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LabOptions) {
    this.store = options.store;
  }

  /**
   * Load or make the device's key, and work the lab out from what is held.
   *
   * @returns This, ready.
   */
  async open(): Promise<this> {
    let exported = await this.options.keys.load();
    if (exported === null) {
      exported = await exportSigningKey(await generateSigningKey());
      await this.options.keys.save(exported);
    }
    this.key = await importSigningKey(exported);
    this.fingerprint = await keyFingerprint(this.key.publicKey);
    const guest = await this.options.adviserKeys?.load() ?? null;
    if (guest !== null) {
      const key = await importSigningKey(guest);
      this.hosted = { key, fingerprint: await keyFingerprint(key.publicKey) };
    }
    this.held = this.store.entries();
    await this.remerge();
    this.connect();
    return this;
  }

  /**
   * Be told whenever anything a window would draw has changed.
   *
   * @param listener - Called with nothing; ask `snapshot()` for what is new.
   * @returns A function that stops the telling.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Everything a window needs to draw, as plain data. The same object is returned until something
   * changes, so it can be compared by identity.
   */
  snapshot = (): LabSnapshot => {
    if (this.cached !== null) return this.cached;
    const state = this.state;
    const mine = this.key.publicKey;
    const me = state?.roster.find((one) => one.key === mine && one.removed === null);
    const peer = this.store.setting("peer");
    this.cached = {
      device: { key: mine, fingerprint: this.fingerprint, person: this.person },
      hosting: this.hosted === null ? null : {
        key: this.hosted.key.publicKey, fingerprint: this.hosted.fingerprint,
        standing: ((guest) => (guest === undefined ? null : guest.removed !== null ? "removed" : guest.role))(state?.roster.find((one) => one.key === this.hosted!.key.publicKey)),
      },
      lab: state === null ? null : {
        id: state.lab,
        name: state.name,
        arrived: state.roster.length > 0,
        member: me !== undefined,
        keeper: me?.role === "keeper",
        adviser: me?.role === "adviser",
        roster: state.roster.map((one) => ({ ...one, fingerprint: this.fingerprints.get(one.key) ?? "", you: one.key === mine })),
        parts: state.parts,
        strains: state.strains,
        specimens: state.specimens,
        expectations: state.expectations,
        items: state.items,
        places: state.places,
        crowded: state.crowded,
        runs: state.runs,
        plans: state.plans,
        overlaps: state.overlaps,
        waiting: state.waiting.length,
        entries: state.entries.map((one) => ({
          id: one.id, author: one.signed.entry.author, seq: one.signed.entry.seq, op: one.signed.entry.op,
          status: one.status, reason: one.reason, signer: one.signed.signature.signer, signedAt: one.signed.signature.signed_at,
        })),
      },
      peer: {
        url: peer,
        origin: this.origin,
        invite: this.invite,
        status: this.link?.status ?? "offline",
        problem: this.link?.problem ?? null,
        pending: this.link?.pending ?? 0,
        lastSynced: this.link?.lastSynced ?? null,
      },
      published: this.store.setting("published"),
    };
    return this.cached;
  };

  /** The lab this device is in, or `null`. */
  get labId(): string | null { return this.store.setting("lab"); }

  /** What the person at this device is called, or `null` if they have not said. */
  get person(): string | null { return this.store.setting("person"); }

  /** The web address the lab's inventory is published at. */
  get origin(): string | null {
    const peer = this.store.setting("peer");
    return this.store.setting("origin") ?? (peer === null ? null : originOf(peer));
  }

  /** What to send somebody who should join, or `null` if the lab has no peer to join through. */
  get invite(): string | null {
    const peer = this.store.setting("peer");
    return this.labId === null || peer === null ? null : `${peer}#${this.labId}`;
  }

  /** @param name - What to call the person at this device. */
  async setPerson(name: string): Promise<void> {
    if (name.trim() === "") throw new Error("A name, so that the lab can see who made each change.");
    this.store.set("person", name.trim().slice(0, 200));
    this.changed();
  }

  /**
   * Found a lab on this device. It works straight away, with or without a peer.
   *
   * @param about - What the lab is called, and its peer's address if it has one yet.
   */
  async found(about: { name: string; peer?: string | null }): Promise<void> {
    if (this.labId !== null) throw new Error("This device is already in a lab.");
    if (this.person === null) throw new Error("Say who you are first.");
    if (about.name.trim() === "") throw new Error("A lab needs a name.");
    const peer = peerAddress(about.peer);
    const founding = await foundLab(this.key, { name: about.name.trim().slice(0, 200), person: this.person });
    const id = await entryId(founding.entry);
    this.store.add([{ id, signed: founding }]);
    this.held.push(founding);
    this.store.set("lab", id);
    this.store.set("peer", peer);
    await this.remerge();
    this.connect();
  }

  /**
   * Join a lab somebody else founded. Nothing arrives until a keeper has added this device's key.
   *
   * @param invite - The invitation a keeper sent.
   */
  async join(invite: string): Promise<void> {
    if (this.labId !== null) throw new Error("This device is already in a lab.");
    if (this.person === null) throw new Error("Say who you are first.");
    const { peer, lab } = readInvite(invite);
    this.store.set("lab", lab);
    this.store.set("peer", peer);
    await this.remerge();
    this.connect();
  }

  /** @param peer - The lab's peer, or `null` to work with none. */
  async setPeer(peer: string | null): Promise<void> {
    this.store.set("peer", peerAddress(peer));
    this.connect();
    this.changed();
  }

  /** @param origin - The web address the lab publishes from, if it is not the peer's own. */
  async setOrigin(origin: string | null): Promise<void> {
    this.store.set("origin", origin === null || origin.trim() === "" ? null : origin.trim());
    this.changed();
  }

  /**
   * Seal this device's key under a passphrase, to keep somewhere that is not this device.
   *
   * @param passphrase - What it will take to open it again. Nothing here remembers it.
   * @returns The sealed key as text, to be written to a file. It holds nothing readable without the passphrase.
   */
  async backUp(passphrase: string): Promise<string> {
    const exported = await this.options.keys.load();
    if (exported === null) throw new Error("This device has no key to back up.");
    return JSON.stringify(await sealKey(exported, passphrase), null, 2);
  }

  /**
   * Take up a key from a backup, in place of the one this device made for itself.
   *
   * This is for a new device standing in for a lost one, so it is refused once the device is in a
   * lab: a key in use on two devices at once writes two histories under one name, and the lab
   * cannot tell which is true.
   *
   * @param from - The text of the backup file, and the passphrase it was sealed under.
   */
  async restore(from: { backup: string; passphrase: string }): Promise<void> {
    if (this.labId !== null) throw new Error("This device is already in a lab, and keeps the key it has. A backup is restored on a new device, before it joins.");
    const exported = await openKey(from.backup, from.passphrase);
    await this.options.keys.save(exported);
    this.key = await importSigningKey(exported);
    this.fingerprint = await keyFingerprint(this.key.publicKey);
    this.changed();
  }

  /**
   * Everything this device holds of the lab, as text to keep in a file.
   *
   * It is every signed entry, so it is the whole lab: with it and a key on the roster, the lab can
   * be brought back on a new device with no peer to ask. It is not sealed. Every entry is signed,
   * so a copy cannot be altered without that showing, but anybody who reads it reads the lab.
   *
   * @returns The copy, as JSON.
   */
  async exportLab(): Promise<string> {
    const lab = this.labId;
    if (lab === null || this.state === null) throw new Error("This device is not in a lab yet.");
    if (this.held.length === 0) throw new Error("None of the lab has reached this device yet, so there is nothing to keep a copy of.");
    return JSON.stringify({ bionet_lab_copy: LAB_COPY_VERSION, lab, name: this.state.name, copied_at: new Date().toISOString(), entries: this.held });
  }

  /**
   * Bring a lab in from a copy made by `exportLab`.
   *
   * On a device that is in no lab, this puts it in the copy's lab, with no peer. On a device already
   * in that lab, it adds whatever the copy has that the device lacks. Entries are checked exactly as
   * ones from a peer are: badly signed ones, and ones from keys the roster never knew, are dropped.
   *
   * @param text - The text of the file.
   * @returns How many entries were new to this device.
   * @throws If it is not a copy of a lab, is a copy of a different lab, or holds nothing of use.
   */
  async importLab(text: string): Promise<number> {
    let copy: { bionet_lab_copy?: unknown; lab?: unknown; entries?: unknown };
    try { copy = JSON.parse(text) as typeof copy; } catch { throw new Error("That is not a copy of a lab."); }
    if (typeof copy !== "object" || copy === null || copy.bionet_lab_copy !== LAB_COPY_VERSION || typeof copy.lab !== "string"
        || !/^[0-9a-f]{64}$/.test(copy.lab) || !Array.isArray(copy.entries)) {
      throw new Error("That is not a copy of a lab.");
    }
    const here = this.labId;
    if (here !== null && here !== copy.lab) throw new Error("That is a copy of a different lab from the one this device is in.");
    if (here === null) {
      // Nothing is believed about the copy until its entries have been checked against its own ID.
      const { kept } = await takeEntries(copy.lab, [], copy.entries);
      if (kept.length === 0) throw new Error("Nothing in that copy belongs to the lab it says it is of.");
      this.store.set("lab", copy.lab);
    }
    const added = await this.take(copy.entries);
    this.connect();
    return added;
  }

  /** Stop talking to the peer, until `goOnline`. The device goes on working. */
  goOffline(): void { this.link?.stop(); }

  /** Start talking to the peer again. */
  goOnline(): void { this.link?.start(); }

  /** Add a device's key to the lab. Only a keeper may. */
  addMember(who: { key: string; person: string; role?: Role }): Promise<void> {
    return this.write(addToRoster(who.key.trim(), who.person.trim(), who.role ?? "member"));
  }

  /**
   * Have this device host an adviser: make a second key for one and keep it.
   *
   * The key is in no lab until a keeper adds it to the roster as an adviser, which is a decision
   * for a person and is not made here. Asked again, it gives the adviser already hosted.
   *
   * @returns The adviser's key and its fingerprint.
   * @throws If the device was given nowhere to keep such a key.
   */
  async hostAdviser(): Promise<{ key: string; fingerprint: string }> {
    if (this.hosted === null) {
      const keys = this.options.adviserKeys;
      if (keys === undefined) throw new Error("This device has nowhere to keep an adviser's key.");
      const key = await generateSigningKey();
      await keys.save(await exportSigningKey(key));
      this.hosted = { key, fingerprint: await keyFingerprint(key.publicKey) };
      this.changed();
    }
    return { key: this.hosted.key.publicKey, fingerprint: this.hosted.fingerprint };
  }

  /**
   * What the adviser this device hosts may do, signed with the adviser's own key.
   *
   * There are three things and no others: say what a part is and what is marked on it, propose a
   * run, and take back a proposal of its own. The lab would refuse anything else from an adviser
   * wherever its logs are merged; this is the same limit, said where it can be read.
   *
   * What is marked is only said about a part nobody has described, since an adviser may not change
   * somebody's reading of one. `addPart` answers whether it marked the part, so a caller can say so.
   *
   * @throws On use, if this device hosts no adviser, or the key is in the lab as anything else.
   */
  get advise(): {
    addPart: (part: { name: string; sequence: string; circular?: boolean; features?: PartFeature[]; kind?: PartKind }) => Promise<{ marked: boolean }>;
    planRun: (plan: Parameters<Lab["planRun"]>[0]) => Promise<{ plan: string }>;
    settlePlan: (which: { plan: string }) => Promise<void>;
    filePlan: (which: { plan: string; field: string; value: string | null }) => Promise<void>;
  } {
    return {
      addPart: async (part) => ({ marked: (await this.addPart(part, true)) === true }),
      planRun: (plan) => this.planRun(plan, true),
      settlePlan: (which) => this.write(settlePlan(which.plan, null), true),
      // An adviser may set a field on a plan it proposed and nothing else, which is the same line
      // `settlePlan` draws. The lab holds it to that whatever is written here.
      filePlan: (which) => this.write(setField("plan", which.plan, which.field, which.value), true),
    };
  }

  /** Add a part, by its sequence, with whatever is marked on it. A protein says so with `kind`. */
  async addPart(part: { name: string; sequence: string; circular?: boolean; features?: PartFeature[]; ends?: PartEnds; kind?: PartKind }, advising = false): Promise<boolean | undefined> {
    const bases = part.sequence.replace(/\s+/g, "");
    // The library underneath accepts any letters as a sequence. A freezer should not: a part named
    // by a checksum of the wrong letters is a part nobody else will ever match. Which letters are
    // right depends on what it is made of, since the two overlap: ACGT is DNA and a peptide both.
    if (part.kind === "protein") {
      if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/i.test(bases)) throw new Error("A protein is written in the letters for amino acids.");
      if (part.circular === true) throw new Error("A protein is not a circle.");
    } else if (!/^[ACGTURYSWKMBDHVN]+$/i.test(bases)) {
      throw new Error("A sequence is written in the letters for bases: A, C, G, T, and the codes for an uncertain base.");
    }
    await this.write(addPart({ name: part.name.trim(), sequence: bases, circular: part.circular === true,
                               ...(part.kind === undefined ? {} : { kind: part.kind }), ...(part.ends === undefined ? {} : { ends: part.ends }) }), advising);
    if (part.features === undefined || part.features.length === 0) return advising ? false : undefined;
    // A part is known by its sequence, so the one just added is the one with these bases. Somebody
    // else may have added it first under another name; what is marked on it is said either way.
    const added = this.state?.parts.find((one) => one.sequence.toUpperCase() === bases.toUpperCase() && one.circular === (part.circular === true)
      && one.kind === (part.kind ?? "dna") && one.ends.left === (part.ends?.left ?? 0) && one.ends.right === (part.ends?.right ?? 0));
    if (added === undefined) return advising ? false : undefined;
    // An adviser may describe a part nobody has described. Where somebody has, theirs stands and the
    // entry would be refused, so it is not written and the caller is told it was not.
    if (advising && added.features.length > 0) return false;
    await this.write(annotatePart(added.checksum, part.features), advising);
    return advising ? true : undefined;
  }

  /** Say what is marked on a part's sequence, in place of whatever was marked before. */
  annotatePart(marks: { part: string; features: PartFeature[] }): Promise<void> { return this.write(annotatePart(marks.part, marks.features)); }

  /**
   * Add one physical lot: a tube of a part, or a culture of a strain.
   *
   * @param item - The part's checksum or the strain's ID, and how much there is.
   * @returns The new item's ID.
   */
  async addItem(item: { part?: string; strain?: string; specimen?: string; amount: number; unit?: string | null }): Promise<string> {
    const of = [item.part, item.strain, item.specimen].filter((one) => one !== undefined);
    if (of.length !== 1) throw new Error("An item is of a part, a culture of a strain, or a tube of a specimen, and only one of those.");
    const id = newItemId();
    await this.write(addItem({ item: id, ...(item.part !== undefined ? { part: item.part }
                                           : item.strain !== undefined ? { strain: item.strain }
                                           : { specimen: item.specimen! }),
                               amount: item.amount, unit: item.unit === "" ? null : item.unit ?? null }));
    return id;
  }

  /**
   * Say the lab has something it cannot yet name, so that a tube of it can be put somewhere.
   *
   * This is for the tube at the back of the freezer that nobody has sequenced. It has no checksum,
   * because a checksum is of a sequence, so it cannot satisfy a plan and cannot travel in a method.
   * `identifySpecimen` is how it stops being one of these.
   *
   * @param specimen - `name` is what you would write on the tube, not a claim about what is in it.
   * @returns Its ID.
   */
  async addSpecimen(specimen: { name: string; note?: string | null }): Promise<string> {
    if (specimen.name.trim() === "") throw new Error("A specimen needs something to call it.");
    const id = newSpecimenId();
    await this.write(addSpecimen({ specimen: id, name: specimen.name.trim().slice(0, 200),
                                   note: specimen.note === undefined || specimen.note === null || specimen.note.trim() === "" ? null : specimen.note.trim() }));
    return id;
  }

  /**
   * Say what a specimen turned out to be. The part has to be one the lab already has.
   *
   * Afterwards its tubes read as tubes of that molecule, keeping their place, their amount and
   * their history: the tube never changed, only what is known about it.
   */
  identifySpecimen(what: { specimen: string; part: string }): Promise<void> {
    return this.write(identifySpecimen(what.specimen, what.part));
  }

  /**
   * Write down what a plan's result should look like, before doing it.
   *
   * A plan says what it would make; this says what somebody would see if it worked — the bands a
   * check digest should show, the size a colony PCR should give. Writing it beforehand is the point:
   * an expectation set down afterwards is a description of what happened, which is a different and
   * much weaker thing.
   *
   * @param expectation - The plan it is about, how it would be seen, what to expect in words, and
   *   the readings as whole numbers. Anything with a fraction in it belongs in `says`.
   * @returns Its ID.
   */
  async expect(expectation: { plan: string; kind: string; says: string; numbers?: readonly number[];
                              settings?: Record<string, string | number>; note?: string | null }): Promise<string> {
    if (expectation.says.trim() === "") throw new Error("An expectation needs to say what to look for.");
    const id = newExpectationId();
    await this.write(expectOf({ expect: id, plan: expectation.plan, kind: expectation.kind.trim().slice(0, 40),
                                says: expectation.says.trim().slice(0, 2_000), numbers: [...(expectation.numbers ?? [])],
                                settings: { ...(expectation.settings ?? {}) },
                                note: expectation.note === undefined || expectation.note === null || expectation.note.trim() === "" ? null : expectation.note.trim() }));
    return id;
  }

  /**
   * Say what was actually seen, and whether it was what was expected.
   *
   * Whether a reading matches is yours to say, not the lab's: a gel is read by eye, and two bands a
   * tool would call different may be one band to the person who ran it. A reading that was not what
   * was expected is a result and is recorded the same way.
   */
  meet(what: { expect: string; met: boolean; saw?: readonly number[]; run?: string | null; note?: string | null }): Promise<void> {
    return this.write(meetExpectation(what.expect, what.met, what.saw ?? [],
                                      { run: what.run ?? null, note: what.note ?? null }));
  }

  /**
   * Say the lab has a strain: an organism, and what has been put into it.
   *
   * It makes no culture of it, the way adding a part puts nothing in the freezer; `addItem` with the
   * strain does that. A strain is known by an ID and not by what it carries, because two labs that
   * put the same plasmid into the same published host have two strains, which may behave
   * differently and did not come from each other.
   *
   * @param strain - What to call it, what organism it is, what it carries, and what it came from.
   * @returns The new strain's ID.
   */
  async addStrain(strain: { name: string; host: string; carries?: readonly string[]; parent?: string | null; from?: string | null }): Promise<string> {
    const id = newStrainId();
    await this.write(addStrain({ strain: id, name: strain.name.trim(), host: strain.host.trim(), carries: [...(strain.carries ?? [])],
                                 parent: strain.parent ?? null, from: strain.from ?? null }));
    return id;
  }

  /** Add to or take from an item. `by` is a whole-number difference. */
  adjust(change: { item: string; by: number }): Promise<void> { return this.write(adjustItem(change.item, change.by)); }

  /** Say how much of an item is physically there. */
  recount(count: { item: string; amount: number }): Promise<void> { return this.write(recountItem(count.item, count.amount)); }

  /** Retire an item. It stays in the history. */
  retire(which: { item: string }): Promise<void> { return this.write(retireItem(which.item)); }

  /** Say whether a part is on offer to other labs. */
  offer(offer: { part: string; available: boolean }): Promise<void> { return this.write(offerPart(offer.part, offer.available)); }

  /**
   * Add a place: a room, a freezer, a shelf, a box.
   *
   * @param place - What kind it is, what it is called, the place it is in if any, for a box how
   *   many rows and columns of positions it has, and for an instrument which one it is.
   * @returns The new place's ID.
   */
  async addPlace(place: { kind: string; name: string; parent?: string | null; grid?: { rows: number; columns: number } | null; model?: string | null }): Promise<string> {
    const id = newPlaceId();
    await this.write(addPlace({ place: id, kind: place.kind.trim().toLowerCase(), name: place.name.trim(), parent: place.parent ?? null, grid: place.grid ?? null }));
    // Which instrument it is is a field like any other, so a lab can correct it later.
    if (typeof place.model === "string" && place.model.trim() !== "") await this.write(setField("place", id, "model", place.model.trim()));
    return id;
  }

  /** Put a place inside another, or with `null` inside nothing. */
  movePlace(move: { place: string; parent: string | null }): Promise<void> { return this.write(movePlace(move.place, move.parent)); }

  /**
   * Say where a place stands and how big it is, in metres, or with `null` that nobody has said.
   * It is kept to the millimetre.
   */
  standPlace(stand: { place: string; standing: { position: [number, number, number]; size: [number, number, number]; turn?: 0 | 90 | 180 | 270 } | null }): Promise<void> {
    const mm = (list: [number, number, number]): [number, number, number] => [Math.round(list[0] * 1000), Math.round(list[1] * 1000), Math.round(list[2] * 1000)];
    return this.write(standPlace(stand.place, stand.standing === null ? null
      : { at: mm(stand.standing.position), size: mm(stand.standing.size), turn: stand.standing.turn ?? 0 }));
  }

  /** Retire a place. It stays in the history. */
  retirePlace(which: { place: string }): Promise<void> { return this.write(retirePlace(which.place)); }

  /** Say where an item is: which place, and which position if the place is a box. `null` for nowhere recorded. */
  putItem(put: { item: string; place: string | null; slot?: { row: number; column: number } | null }): Promise<void> {
    return this.write(putItem(put.item, put.place, put.slot ?? null));
  }

  /**
   * Record something done at the bench: what went in and how much of each, and what came out.
   *
   * It is one change. What was used is taken from each tube, each thing that came out becomes a
   * tube (and a part, if the lab did not have it), and the run is kept so those tubes can say where
   * they came from. A run that did not work is recorded with nothing coming out.
   *
   * @param run - What kind of run, where, what went in, what came out, how it was set up, whether it
   *   worked, and anything worth saying.
   * @returns The run's ID, and the IDs of the tubes it made, in order.
   */
  async recordRun(run: {
    kind: string; instrument?: string | null; inputs: RunInput[];
    outputs?: { sequence: string; circular?: boolean; name: string; amount: number; unit?: string | null; features?: PartFeature[]; ends?: PartEnds }[];
    settings?: Record<string, string | number>; outcome?: "worked" | "failed"; note?: string | null;
    /** The plan this run carries out, if it does. The plan is settled as this run once the run is recorded. */
    plan?: string;
  }): Promise<{ run: string; items: string[] }> {
    const id = newRunId();
    const outputs = (run.outputs ?? []).map((output) => ({
      item: newItemId(), sequence: output.sequence.replace(/\s+/g, ""), circular: output.circular === true, name: output.name.trim(),
      amount: output.amount, unit: output.unit === "" ? null : output.unit ?? null,
      ...(output.ends === undefined || (output.ends.left === 0 && output.ends.right === 0) ? {} : { ends: output.ends }),
    }));
    const note = run.note === undefined || run.note === null || run.note.trim() === "" ? null : run.note.trim();
    await this.write(recordRun({
      run: id, kind: run.kind, instrument: run.instrument ?? null, inputs: run.inputs, outputs, settings: run.settings ?? {},
      outcome: run.outcome ?? (outputs.length > 0 ? "worked" : "failed"), note,
    }));
    // What is marked on what came out is said after the run, since the run is what makes the part.
    for (const [at, output] of (run.outputs ?? []).entries()) {
      const part = this.state?.items.find((one) => one.item === outputs[at]!.item)?.part;
      const held = this.state?.parts.find((one) => one.checksum === part);
      if (output.features !== undefined && output.features.length > 0 && held !== undefined && held.features.length === 0) await this.write(annotatePart(held.checksum, output.features));
    }
    // Said after the run and apart from it, so that a device too old to know of plans still reads the run.
    if (run.plan !== undefined && this.state?.plans.some((one) => one.plan === run.plan && one.settled === null)) await this.write(settlePlan(run.plan, id));
    return { run: id, items: outputs.map((output) => output.item) };
  }

  /**
   * Propose something to be done at the bench, without saying that it was.
   *
   * Nothing the lab holds changes: no amount moves and nothing is made. The plan is kept for
   * somebody to carry out, and it is what a member with no hands — an adviser — has to offer.
   *
   * @param plan - What kind of run, where, what it would use (a tube, or a part there is no tube of
   *   yet), what it is expected to make, how to set it up, and why.
   * @returns The plan's ID.
   */
  async planRun(plan: {
    kind: string; instrument?: string | null; inputs: PlanInput[];
    expects?: { sequence: string; circular?: boolean; name: string; ends?: PartEnds }[];
    settings?: Record<string, string | number>; note?: string | null;
  }, advising = false): Promise<{ plan: string }> {
    const id = newPlanId();
    const note = plan.note === undefined || plan.note === null || plan.note.trim() === "" ? null : plan.note.trim();
    await this.write(planRun({
      plan: id, kind: plan.kind, instrument: plan.instrument ?? null, inputs: plan.inputs, settings: plan.settings ?? {}, note,
      expects: (plan.expects ?? []).map((expect) => ({
        sequence: expect.sequence.replace(/\s+/g, ""), circular: expect.circular === true, name: expect.name.trim(),
        ...(expect.ends === undefined || (expect.ends.left === 0 && expect.ends.right === 0) ? {} : { ends: expect.ends }),
      })),
    }), advising);
    return { plan: id };
  }

  /**
   * Publish the lab's open plans as a method another lab could carry out.
   *
   * @param what - Which plans or project, what to call it, whether to write out the sequences of
   *   what it starts from, and `lab`: who is publishing, as an inventory says it.
   * @returns The method, signed with this device's key.
   *
   * @example
   * ```ts
   * const method = await lab.publishMethod({ project: "Real Vegan Cheese",
   *                                          lab: { name: "The Wren Lab", origin: "https://wrenlab.example", contact: null, note: null } });
   * ```
   */
  async publishMethod(what: MethodOptions & { lab?: LabModel } = {}): Promise<SignedMethod> {
    if (this.key === null) throw new Error("This device has no key yet.");
    const { lab: who, ...options } = what;
    return signMethod(this.methodFor(options, who), this.key, { ...(this.person === null ? {} : { signer: this.person }) });
  }

  /**
   * The method, written out and not signed.
   *
   * Publishing is a keeper's act — it puts a lab's name and key behind something — so writing the
   * method out and standing behind it are kept apart. An adviser may do the first and not the second.
   *
   * @param options - Which plans or project, what to call it, and whether to write out the
   *   sequences of what it starts from.
   * @param who - The lab, as an inventory says it. The lab's own name and no address, if not given.
   * @returns The method.
   */
  methodFor(options: MethodOptions = {}, who?: LabModel): MethodDocument {
    if (this.state === null) throw new Error("This device is not in a lab yet.");
    return publicMethod(this.state, who ?? { name: this.state.name ?? "a lab", origin: "", contact: null, note: null }, options);
  }

  /**
   * Take a method somebody published and propose its steps here.
   *
   * This is the other half of publishing one, and the half that says whether publishing was worth
   * anything. Every step's tubes were replaced by checksums when it was published, so taking it is
   * the reverse: for each thing a step uses, look for the molecule in this lab by checksum, and use
   * a tube of it where there is one, name the part where the lab knows it but has none, and say it
   * is missing where the lab has never heard of it.
   *
   * A part the method wrote a sequence for is added here if the lab does not know it, since a plan
   * may only name a part the lab knows of. One it named only by checksum cannot be: a checksum is
   * not something a molecule can be made from, and `whoHas` is the way to find who holds one.
   *
   * Nothing is used and nothing is recorded as done: what lands is proposals, as if somebody here
   * had made them.
   *
   * @param what - `method` is the method, as text or as the document; `project` files every step
   *   under a project here.
   * @returns What was proposed, and what the lab would have to get before any of it can start.
   */
  async takeMethod(what: { method: unknown; project?: string }): Promise<{
    proposed: string[]; missing: { checksum: string | null; name: string; forSteps: number[] }[]; alive: { name: string; forSteps: number[] }[];
  }> {
    if (this.state === null) throw new Error("This device is not in a lab yet.");
    // What arrives may be text from anywhere, so it is read and checked before anything uses it.
    const method = readMethod(what.method);
    const options = { ...(what.project === undefined ? {} : { project: what.project }) };
    const missing = new Map<string, { checksum: string | null; name: string; forSteps: number[] }>();
    const alive = new Map<string, { name: string; forSteps: number[] }>();
    const proposed: string[] = [];
    // What a step of the method makes, once it has been proposed here, is a part this lab knows of.
    for (const step of method.method.steps) {
      for (const made of step.makes) {
        if (made.sequence === undefined) continue;
        if (this.state.parts.some((one) => one.checksum === made.checksum)) continue;
        await this.addPart({ name: made.name, sequence: made.sequence, circular: made.circular,
                             ...(made.ends.left === 0 && made.ends.right === 0 ? {} : { ends: made.ends }) });
      }
    }
    // And so is anything it starts from that was written out in full.
    for (const need of method.method.needs) {
      if (need.part === null || need.sequence === undefined) continue;
      if (this.state.parts.some((one) => one.checksum === need.part)) continue;
      await this.addPart({ name: need.name, sequence: need.sequence, circular: need.circular === true,
                           ...(need.ends === undefined ? {} : { ends: need.ends }) });
    }
    for (const step of method.method.steps) {
      const inputs: PlanInput[] = [];
      let canPropose = true;
      for (const used of step.uses) {
        if (used.part === null) {
          // Something alive, which has no checksum and cannot be matched. It has to be made here.
          const held = alive.get(used.name) ?? { name: used.name, forSteps: [] };
          held.forSteps.push(step.step);
          alive.set(used.name, held);
          canPropose = false;
          continue;
        }
        const known = this.state.parts.find((one) => one.checksum === used.part);
        if (known === undefined) {
          const held = missing.get(used.part) ?? { checksum: used.part, name: used.name, forSteps: [] };
          held.forSteps.push(step.step);
          missing.set(used.part, held);
          canPropose = false;
          continue;
        }
        // A tube of it if there is one, and otherwise the part, which says it has to be got first.
        const tube = this.state.items.find((one) => one.part === known.checksum && !one.retired && one.amount >= used.amount);
        inputs.push({ ...(tube === undefined ? { part: known.checksum } : { item: tube.item }), amount: used.amount, role: used.role });
      }
      if (!canPropose) continue;
      const { plan } = await this.planRun({
        kind: step.kind, instrument: null, inputs,
        expects: step.makes.flatMap((made) => (made.sequence === undefined ? [] : [{ sequence: made.sequence, circular: made.circular, name: made.name, ends: made.ends }])),
        settings: { ...step.settings }, note: step.note,
      });
      proposed.push(plan);
      if (options.project !== undefined) await this.setField({ on: "plan", id: plan, field: "project", value: options.project });
    }
    return { proposed, missing: [...missing.values()], alive: [...alive.values()] };
  }

  /** Close a plan: as carried out by a run, or, with no run, as set aside. */
  settlePlan(which: { plan: string; run?: string | null }): Promise<void> { return this.write(settlePlan(which.plan, which.run ?? null)); }

  /** Set one field on a part (by checksum), or an item, a place or a strain (by ID). */
  setField(change: { on: "part" | "item" | "place" | "strain" | "plan"; id: string; field: string; value: string | number | null }): Promise<void> {
    return this.write(setField(change.on, change.id, change.field, change.value));
  }

  /**
   * Make one change: sign it into this device's log, keep it, and offer it to the peer.
   *
   * The change is tried before it is kept. A log is forever, so an entry the lab would refuse — a
   * sequence that is not one, an item that does not exist — is turned down here, with the reason,
   * and never written.
   *
   * @param op - The change.
   * @param advising - Whether to sign it as the adviser this device hosts, in the adviser's own log.
   * @throws If this device may not change the lab, or the lab would refuse the change.
   */
  write(op: Operation, advising = false): Promise<void> {
    return this.inTurn(async () => {
      const state = this.state;
      if (state === null || state.lab === null) throw new Error("This device is not in a lab yet.");
      let key = this.key;
      let signer = this.person;
      if (advising) {
        if (this.hosted === null) throw new Error("This device hosts no adviser.");
        const guest = state.roster.find((one) => one.key === this.hosted!.key.publicKey);
        if (guest === undefined || guest.removed !== null) throw new Error("The adviser this device hosts is not in the lab. A keeper has to let it in first, as an adviser.");
        // A key this device hosts is for advising and nothing more, whatever a keeper has since made it.
        if (guest.role !== "adviser") throw new Error(`The key this device hosts is in the lab as a ${guest.role}, not as an adviser, so nothing is written with it from here.`);
        key = this.hosted.key;
        signer = guest.person;
      } else if (!isMember(state, this.key.publicKey)) {
        throw new Error("This device's key is not on the lab's roster, so it cannot change the lab.");
      }
      const signed = await nextEntry(state, key, op, { signer });
      const id = await entryId(signed.entry);
      const tried = (await mergeLog([...this.held, signed], { lab: state.lab })).entries.find((one) => one.id === id);
      if (tried?.status !== "applied") throw new Error(tried?.reason ?? "The lab would not accept that change.");
      this.store.add([{ id, signed }]);
      this.held.push(signed);
      await this.remerge();
      this.link?.push();
    });
  }

  /**
   * Take entries that arrived from somewhere else.
   *
   * @param incoming - What arrived.
   * @returns How many were kept.
   */
  take(incoming: readonly unknown[]): Promise<number> {
    return this.inTurn(async () => {
      const lab = this.labId;
      if (lab === null) return 0;
      const { kept } = await takeEntries(lab, this.held, incoming);
      if (kept.length === 0) return 0;
      this.store.add(await Promise.all(kept.map(async (signed) => ({ id: await entryId(signed.entry), signed }))));
      this.held.push(...kept);
      await this.remerge();
      return kept.length;
    });
  }

  /**
   * Publish what the lab shows the world: sign the public inventory and hand it to the peer.
   *
   * The lab keeps pointing at whichever labs its published inventory already points at.
   *
   * @returns Whether it was published, why not if not, and how many parts it listed.
   */
  async publish(): Promise<{ ok: boolean; reason: string | null; parts: number }> {
    const origin = this.origin;
    if (this.state === null || this.link === null || origin === null) {
      return { ok: false, reason: "The lab has no peer to publish through.", parts: 0 };
    }
    let peers;
    try {
      peers = (await fetchInventory(origin, { timeoutMs: 6_000, ...(this.options.fetch === undefined ? {} : { fetch: this.options.fetch }) })).signed.inventory.peers;
    } catch {
      peers = undefined;       // nothing published yet, or unreachable: publish without pointers
    }
    const inventory = publicInventory(this.state, { name: this.state.name ?? "A lab", origin, contact: null, note: null },
                                      peers === undefined ? {} : { peers });
    const signed = await signInventory(inventory, this.key, { signer: this.person });
    const answer = await this.link.publish(signed);
    if (answer.ok) {
      this.store.set("published", inventory.published_at);
      this.changed();
    }
    return { ...answer, parts: inventory.parts.length };
  }

  /** Stop talking to the peer and finish with the store. */
  close(): void {
    this.link?.stop();
    this.link = null;
    this.store.close();
  }

  private changed(): void {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  private async remerge(): Promise<void> {
    const lab = this.labId;
    this.state = lab === null ? null : await mergeLog(this.held, { lab });
    for (const one of this.state?.roster ?? []) {
      if (!this.fingerprints.has(one.key)) this.fingerprints.set(one.key, await keyFingerprint(one.key));
    }
    this.changed();
  }

  private connect(): void {
    this.link?.stop();
    this.link = null;
    const lab = this.labId;
    const url = this.store.setting("peer");
    if (lab === null || url === null) return;
    this.link = new PeerLink({
      url, lab, key: this.key, held: () => this.held, take: (entries) => this.take(entries), onChange: () => this.changed(),
      ...(this.options.WebSocket === undefined ? {} : { WebSocket: this.options.WebSocket }),
    });
    this.link.start();
  }

  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = this.turn.then(work, work);
    this.turn = next.catch(() => {});
    return next;
  }
}
