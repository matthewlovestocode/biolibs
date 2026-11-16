/**
 * A lab's web peer, spoken to directly.
 *
 * `@biolibs/bionet-client`'s tests run whole devices against it. These speak the protocol by hand,
 * to check the things a well-behaved device never tries: asking for the lab without being in it,
 * publishing without saying hello, replacing the inventory with an older one, sending nonsense.
 */
import { appendFileSync, mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addItem, addPart, addToRoster, adjustItem, entryId, foundLab, haveOf, mergeLog, newItemId, nextEntry,
         publicInventory, readMessage, signHello, signInventory, writeEntry, type Operation, type SignedEntry,
         type SyncMessage } from "@biolibs/bionet";
import { INVENTORY_PATHS, WS_OPTIONS, attachPeer, createPeer, filePeerStore, fromWs, loopback, memoryPeerStore,
         serveInventory, type Peer, type PeerSocket, type PeerStore, type WsLike } from "@biolibs/bionet-peer";
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const ORIGIN = "https://lab-wren.onrender.com";
const WHERE = { name: "The Wren Lab", origin: ORIGIN, contact: null, note: null };

let ada: SigningKey;
let bob: SigningKey;
let eve: SigningKey;
beforeAll(async () => {
  [ada, bob, eve] = await Promise.all([generateSigningKey(), generateSigningKey(), generateSigningKey()]);
});

const write = async (held: SignedEntry[], key: SigningKey, op: Operation): Promise<SignedEntry> => {
  const entry = await nextEntry(await mergeLog(held), key, op);
  held.push(entry);
  return entry;
};

/** Ada's lab with Bob in it and one tube of ten, held by a peer. */
async function wren(store: PeerStore = memoryPeerStore()): Promise<{ lab: string; held: SignedEntry[]; tube: string; store: PeerStore; peer: Peer }> {
  const held = [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })];
  await write(held, ada, addToRoster(bob.publicKey, "Bob"));
  await write(held, ada, addPart({ sequence: F1, name: "f1" }));
  const tube = newItemId();
  await write(held, ada, addItem({ item: tube, part: (await mergeLog(held)).parts[0]!.checksum, amount: 10 }));
  const lab = await entryId(held[0]!.entry);
  store.append(held);
  return { lab, held, tube, store, peer: createPeer({ lab, origin: ORIGIN, store, nonce: () => "a-number" }) };
}

/** One end of a connection, held by the test. */
function dial(peer: Peer): { said: SyncMessage[]; send: (message: unknown) => void; hangUp: () => void; closed: () => boolean; next: (type: string) => Promise<SyncMessage> } {
  const said: SyncMessage[] = [];
  let toPeer: (text: string) => void = () => {};
  let ended: () => void = () => {};
  let closed = false;
  const socket: PeerSocket = {
    send: (text) => { said.push(readMessage(text)); },
    close: () => { closed = true; },
    onMessage: (heard) => { toPeer = heard; },
    onClose: (end) => { ended = end; },
  };
  peer.connect(socket);
  return {
    said,
    send: (message) => toPeer(typeof message === "string" ? message : JSON.stringify(message)),
    hangUp: () => ended(),
    closed: () => closed,
    async next(type) {
      for (let tries = 0; tries < 400; tries++) {
        const found = said.find((one) => one.type === type);
        if (found !== undefined) { said.splice(said.indexOf(found), 1); return found; }
        await new Promise((done) => setTimeout(done, 5));
      }
      throw new Error(`the peer never said ${type}; it said ${said.map((one) => one.type).join(", ") || "nothing"}`);
    },
  };
}

/** Say hello as a key, the way a device does. */
async function hello(line: ReturnType<typeof dial>, lab: string, key: SigningKey, have = {}): Promise<void> {
  const challenge = await line.next("challenge") as Extract<SyncMessage, { type: "challenge" }>;
  line.send({ type: "hello", have, signature: await signHello(key, lab, challenge.nonce) });
}

describe("who is sent the lab", () => {
  it("turns everybody away until it has been told which lab it serves", () => {
    const line = dial(createPeer({ lab: null, origin: ORIGIN, store: memoryPeerStore() }));
    expect(line.said).toMatchObject([{ type: "refused", code: "bad-message" }]);
    expect(line.closed()).toBe(true);
  });

  it("opens with the lab and a number to sign", async () => {
    const { lab, peer } = await wren();
    expect(await dial(peer).next("challenge")).toEqual({ type: "challenge", lab, nonce: "a-number" });
    const fresh = createPeer({ lab, origin: ORIGIN, store: memoryPeerStore() });
    const [one, two] = [await dial(fresh).next("challenge"), await dial(fresh).next("challenge")] as { nonce: string }[];
    expect(one!.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(one!.nonce).not.toBe(two!.nonce);
  });

  it("welcomes a member and sends exactly what they lack", async () => {
    const { lab, held, peer } = await wren();
    const line = dial(peer);
    await hello(line, lab, bob, haveOf(held.slice(0, 2)));
    expect(await line.next("welcome")).toEqual({ type: "welcome", have: { [ada.publicKey]: 3 } });
    const sent = await line.next("entries") as Extract<SyncMessage, { type: "entries" }>;
    expect(sent.entries.map((one) => one.entry.seq)).toEqual([2, 3]);
    expect(peer.members).toBe(1);
    line.hangUp();
    expect(peer.members).toBe(0);
  });

  it("refuses a stranger, a hello signed for another number, and a hello signed for another lab", async () => {
    const { lab, peer } = await wren();
    for (const answer of [await signHello(eve, lab, "a-number"), await signHello(bob, lab, "another-number"), await signHello(bob, "f".repeat(64), "a-number")]) {
      const line = dial(peer);
      await line.next("challenge");
      line.send({ type: "hello", have: {}, signature: answer });
      expect(await line.next("refused")).toMatchObject({ code: "not-a-member" });
      expect(line.said).toEqual([]);
    }
    expect(peer.members).toBe(0);
  });
});

describe("what it keeps and passes on", () => {
  it("keeps a member's entries, and nothing from a stranger", async () => {
    const { lab, held, tube, store, peer } = await wren();
    const used = await write([...held], bob, adjustItem(tube, -1));
    const stranger = await writeEntry(eve, { lab, prev: null }, adjustItem(tube, -9));
    const line = dial(peer);
    line.send({ type: "entries", entries: [used, stranger] });       // without saying hello: writing needs no proof
    expect(await line.next("kept")).toEqual({ type: "kept", count: 1 });
    expect(store.held).toHaveLength(5);
    line.send({ type: "entries", entries: [used] });
    expect(await line.next("kept")).toEqual({ type: "kept", count: 0 });
  });

  it("passes a change to the other members who are connected, and not back to its sender", async () => {
    const { lab, held, tube, peer } = await wren();
    const [hers, his] = [dial(peer), dial(peer)];
    await hello(hers, lab, ada, haveOf(held));
    await hello(his, lab, bob, haveOf(held));
    await hers.next("welcome"); await his.next("welcome");
    const used = await write([...held], bob, adjustItem(tube, -1));
    his.send({ type: "entries", entries: [used] });
    expect((await hers.next("entries") as { entries: SignedEntry[] }).entries).toEqual([used]);
    await his.next("kept");
    expect(his.said).toEqual([]);
  });

  it("answers nonsense with a reason and carries on", async () => {
    const { lab, peer } = await wren();
    const line = dial(peer);
    line.send("{not json");
    expect(await line.next("refused")).toMatchObject({ code: "bad-message", reason: "That message is not JSON." });
    line.send({ type: "welcome", have: {} });
    expect(await line.next("refused")).toMatchObject({ reason: "That is not something to send a peer." });
    await hello(line, lab, bob);
    expect(await line.next("welcome")).toBeTruthy();
  });
});

describe("what it publishes", () => {
  it("publishes a member's inventory, and will not go back to an older one", async () => {
    const { lab, held, store, peer } = await wren();
    const state = await mergeLog(held);
    const line = dial(peer);
    const fresh = await signInventory(publicInventory(state, WHERE, { publishedAt: "2026-11-15T12:00:00.000Z" }), bob);
    line.send({ type: "inventory", signed: fresh });
    expect(await line.next("refused")).toMatchObject({ code: "not-a-member", reason: "Only a member who has said hello may publish." });
    expect(store.inventory()).toBeNull();

    await hello(line, lab, bob, haveOf(held));
    await line.next("welcome");
    line.send({ type: "inventory", signed: fresh });
    expect(await line.next("published")).toEqual({ type: "published", published_at: "2026-11-15T12:00:00.000Z" });
    expect(store.inventory()).toEqual(fresh);

    line.send({ type: "inventory", signed: await signInventory(publicInventory(state, WHERE, { publishedAt: "2020-01-01T00:00:00.000Z" }), ada) });
    expect(await line.next("refused")).toMatchObject({ code: "bad-inventory", reason: "That inventory is not newer than the one already published." });
    line.send({ type: "inventory", signed: await signInventory(publicInventory(state, { ...WHERE, origin: "https://elsewhere.example" }), bob) });
    expect(await line.next("refused")).toMatchObject({ code: "bad-inventory" });
    expect(store.inventory()).toEqual(fresh);
  });
});

describe("where it keeps things", () => {
  it("reads back from a folder what it was given, and shrugs off a line torn by a crash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bionet-peer-"));
    const { held, store } = await wren(filePeerStore(dir));
    const signed = await signInventory(publicInventory(await mergeLog(held), WHERE), ada);
    store.publish(signed);
    store.append([]);
    appendFileSync(join(dir, "log.jsonl"), '{"entry":{"half":\n\n"not an entry"\n');

    const again = filePeerStore(dir);
    expect(again.held).toEqual(held);
    expect(again.inventory()).toEqual(signed);
    expect((await mergeLog(again.held)).items[0]!.amount).toBe(10);
  });

  it("treats an unreadable inventory as none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bionet-peer-"));
    appendFileSync(join(dir, "inventory.json"), "{broken");
    expect(filePeerStore(dir).inventory()).toBeNull();
    appendFileSync(join(mkdtempSync(join(tmpdir(), "bionet-peer-")), "inventory.json"), '"not an inventory"');
  });
});

describe("on a web server", () => {
  const respond = (): { response: ServerResponse; status: () => number; headers: () => Record<string, string>; body: () => string } => {
    let status = 0; let headers: Record<string, string> = {}; let body = "";
    const response = { writeHead: (code: number, given: Record<string, string>) => { status = code; headers = given; },
                       end: (text?: string) => { body = text ?? ""; } } as unknown as ServerResponse;
    return { response, status: () => status, headers: () => headers, body: () => body };
  };
  const ask = (method: string, url: string): IncomingMessage => ({ method, url }) as IncomingMessage;

  it("serves the published inventory at its well-known path, readable from any page", async () => {
    const { held, store } = await wren();
    const none = respond();
    expect(serveInventory(ask("GET", "/.well-known/bionet.json"), none.response, store)).toBe(false);
    const signed = await signInventory(publicInventory(await mergeLog(held), WHERE), ada);
    store.publish(signed);

    for (const path of INVENTORY_PATHS) {
      const answer = respond();
      expect(serveInventory(ask("GET", `${path}?now`), answer.response, store)).toBe(true);
      expect(answer.status()).toBe(200);
      expect(answer.headers()).toMatchObject({ "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" });
      expect(JSON.parse(answer.body())).toEqual(signed);
    }
    const head = respond();
    expect(serveInventory(ask("HEAD", "/bionet.json"), head.response, store)).toBe(true);
    expect(head.body()).toBe("");
    expect(serveInventory(ask("GET", "/"), respond().response, store)).toBe(false);
    expect(serveInventory(ask("POST", "/bionet.json"), respond().response, store)).toBe(false);
  });

  it("takes sockets at /sync and hands every other upgrade on", async () => {
    const { lab, peer } = await wren();
    let onUpgrade: (request: IncomingMessage, socket: unknown, head: unknown) => void = () => {};
    const elsewhere: string[] = [];
    const sent: string[] = [];
    const handlers: Record<string, (data?: unknown) => void> = {};
    const ws: WsLike = { readyState: 1, OPEN: 1, send: (data) => { sent.push(data); }, close: () => {},
                         on: (event: string, heard: (data?: unknown) => void) => { handlers[event] = heard; } };
    attachPeer({ on: (_event, heard) => { onUpgrade = heard; } }, { handleUpgrade: (_request, _socket, _head, done) => done(ws) }, peer,
               { elsewhere: (request) => { elsewhere.push(request.url ?? ""); } });
    onUpgrade(ask("GET", "/_next/hmr"), null, null);
    expect(elsewhere).toEqual(["/_next/hmr"]);
    onUpgrade(ask("GET", "/sync"), null, null);
    expect(readMessage(sent[0]!)).toEqual({ type: "challenge", lab, nonce: "a-number" });
    expect(WS_OPTIONS).toMatchObject({ noServer: true });

    const closedWs: WsLike = { ...ws, readyState: 3 };
    const before = sent.length;
    fromWs(closedWs).send("ignored");
    expect(sent).toHaveLength(before);
    handlers["message"]!(Buffer.from("{not json"));
    await new Promise((done) => setTimeout(done, 20));
    expect(readMessage(sent.at(-1)!)).toMatchObject({ type: "refused" });
  });
});

describe("without a network", () => {
  it("connects in process, and can be cut off and brought back", async () => {
    const { peer } = await wren();
    const network = loopback(peer);
    const heard: string[] = [];
    const socket = new network.WebSocket("wss://anywhere/sync");
    socket.addEventListener("message", (event) => { heard.push(readMessage(String(event.data)).type); });
    let closed = false;
    socket.addEventListener("close", () => { closed = true; });
    await new Promise((done) => setTimeout(done, 20));
    expect(heard).toEqual(["challenge"]);
    expect(network.open).toBe(1);

    network.down();
    expect(closed).toBe(true);
    expect(network.open).toBe(0);
    let failed = false;
    new network.WebSocket("wss://anywhere/sync").addEventListener("close", () => { failed = true; });
    await new Promise((done) => setTimeout(done, 20));
    expect(failed).toBe(true);

    network.up();
    const again = new network.WebSocket("wss://anywhere/sync");
    again.send("too early to arrive");
    await new Promise((done) => setTimeout(done, 20));
    expect(network.open).toBe(1);
    again.close();
    await new Promise((done) => setTimeout(done, 20));
    expect(network.open).toBe(0);
  });
});
