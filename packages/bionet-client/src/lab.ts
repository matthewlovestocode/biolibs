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
import { addItem, addPart, addPlace, addToRoster, adjustItem, entryId, fetchInventory, foundLab, isMember, mergeLog,
         movePlace, newItemId, newPlaceId, newRunId, nextEntry, offerPart, publicInventory, putItem, recordRun, recountItem, retireItem, retirePlace,
         setField, signInventory, standPlace,
         takeEntries, type Crowded, type EntryStatus, type ItemState, type LabState, type Operation, type Overlap,
         type PartState, type PlaceState, type RunInput, type RunState, type Role, type RosterKey, type SignedEntry } from "@biolibs/bionet";
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
  roster: RosterView[];
  parts: PartState[];
  items: ItemState[];
  /** Every place. */
  places: PlaceState[];
  /** Positions the log says hold more than one item. */
  crowded: Crowded[];
  /** Everything done at the bench that was recorded. */
  runs: RunState[];
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

/** Everything a window needs to draw, as plain data. */
export interface LabSnapshot {
  device: { key: string; fingerprint: string; person: string | null };
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
      lab: state === null ? null : {
        id: state.lab,
        name: state.name,
        arrived: state.roster.length > 0,
        member: me !== undefined,
        keeper: me?.role === "keeper",
        roster: state.roster.map((one) => ({ ...one, fingerprint: this.fingerprints.get(one.key) ?? "", you: one.key === mine })),
        parts: state.parts,
        items: state.items,
        places: state.places,
        crowded: state.crowded,
        runs: state.runs,
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

  /** Add a part, by its sequence. */
  async addPart(part: { name: string; sequence: string; circular?: boolean }): Promise<void> {
    const bases = part.sequence.replace(/\s+/g, "");
    // The library underneath accepts any letters as a sequence. A freezer should not: a part named
    // by a checksum of the wrong letters is a part nobody else will ever match.
    if (!/^[ACGTURYSWKMBDHVN]+$/i.test(bases)) {
      throw new Error("A sequence is written in the letters for bases: A, C, G, T, and the codes for an uncertain base.");
    }
    return this.write(addPart({ name: part.name.trim(), sequence: bases, circular: part.circular === true }));
  }

  /** Add one physical item of a part. @returns The new item's ID. */
  async addItem(item: { part: string; amount: number; unit?: string | null }): Promise<string> {
    const id = newItemId();
    await this.write(addItem({ item: id, part: item.part, amount: item.amount, unit: item.unit === "" ? null : item.unit ?? null }));
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
    outputs?: { sequence: string; circular?: boolean; name: string; amount: number; unit?: string | null }[];
    settings?: Record<string, string | number>; outcome?: "worked" | "failed"; note?: string | null;
  }): Promise<{ run: string; items: string[] }> {
    const id = newRunId();
    const outputs = (run.outputs ?? []).map((output) => ({
      item: newItemId(), sequence: output.sequence.replace(/\s+/g, ""), circular: output.circular === true, name: output.name.trim(),
      amount: output.amount, unit: output.unit === "" ? null : output.unit ?? null,
    }));
    const note = run.note === undefined || run.note === null || run.note.trim() === "" ? null : run.note.trim();
    await this.write(recordRun({
      run: id, kind: run.kind, instrument: run.instrument ?? null, inputs: run.inputs, outputs, settings: run.settings ?? {},
      outcome: run.outcome ?? (outputs.length > 0 ? "worked" : "failed"), note,
    }));
    return { run: id, items: outputs.map((output) => output.item) };
  }

  /** Set one field on a part (by checksum), an item or a place (by ID). */
  setField(change: { on: "part" | "item" | "place"; id: string; field: string; value: string | number | null }): Promise<void> {
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
   * @throws If this device may not change the lab, or the lab would refuse the change.
   */
  write(op: Operation): Promise<void> {
    return this.inTurn(async () => {
      const state = this.state;
      if (state === null || state.lab === null) throw new Error("This device is not in a lab yet.");
      if (!isMember(state, this.key.publicKey)) {
        throw new Error("This device's key is not on the lab's roster, so it cannot change the lab.");
      }
      const signed = await nextEntry(state, this.key, op, { signer: this.person });
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
