/**
 * Walking from labs you know to labs you do not.
 *
 * The happy path is the least of it. What is checked hardest here is what a walk refuses to do: it
 * will not let a lab that fails its own checks put addresses into the queue, it will not visit an
 * address twice however many labs point at it, it will not walk past the bounds it was given, and it
 * will not follow a pointer to an address whose connection would prove nothing. Each of those is a
 * way a walk could be steered by whoever can answer for one address, so each has a test that would
 * fail loudly if the guard were removed.
 */
import { Dseqrecord } from "@biolibs/dseqrecord";
import { generateSigningKey, keyFingerprint, type SigningKey } from "@biolibs/opencloning";
import { discover, inventoryFrom, introducedDifferently, partsNeeded, peer, settledLabs, signInventory,
         unsourced, whoHas, type PeerModel, type SignedInventory } from "@biolibs/bionet";
import { CloningStrategy } from "@biolibs/opencloning";
import { gibsonAssembly } from "@biolibs/assembly2";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const F2 = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const F3 = "GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

const parts = (): Dseqrecord[] => [
  new Dseqrecord(F1, false, undefined, "1", "f1"),
  new Dseqrecord(F2, false, undefined, "2", "f2"),
  new Dseqrecord(F3, false, undefined, "3", "f3"),
];

/** @returns A plan whose three starting fragments are what labs are asked for. */
function plan(): CloningStrategy {
  const [plasmid] = gibsonAssembly(parts(), 25, true);
  plasmid!.id = "100";
  return CloningStrategy.fromRecords([plasmid!], { description: "a 75 bp circle" });
}

/** What one made-up lab serves. */
interface Served {
  /** What it publishes, or nothing if the address does not answer. */
  body?: SignedInventory;
  /** The status to answer with. */
  status?: number;
  /** Something that is not JSON at all. */
  text?: string;
}

/**
 * A stand-in network: a fetch that answers for the addresses given and 404s for anything else.
 *
 * @param labs - What each address serves.
 * @returns Something to fetch with, and the addresses it was asked for.
 */
function network(labs: Record<string, Served>): { fetch: typeof globalThis.fetch; asked: string[] } {
  const asked: string[] = [];
  const fetch = (async (url: string) => {
    const origin = new URL(url).origin;
    asked.push(origin);
    const lab = labs[origin];
    if (lab === undefined) return { ok: false, status: 404, text: async () => "" };
    return {
      ok: (lab.status ?? 200) === 200,
      status: lab.status ?? 200,
      text: async () => lab.text ?? JSON.stringify(lab.body),
    };
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}

/**
 * An inventory for `origin`, signed by `key`, holding `held` and pointing at `peers`.
 *
 * With no peers given it writes no list at all, which is what an inventory from before there were
 * peers looks like — not an empty list.
 */
async function lab(key: SigningKey, origin: string, name: string, held: Dseqrecord[],
                   peers?: PeerModel[]): Promise<SignedInventory> {
  return signInventory(
    inventoryFrom(held, { name, origin, contact: null, note: null },
                  { publishedAt: "2026-01-01T00:00:00.000Z", ...(peers === undefined ? {} : { peers }) }),
    key, { signer: name });
}

describe("walking the network", () => {
  let key: SigningKey;
  let other: SigningKey;
  let print: string;

  beforeAll(async () => {
    key = await generateSigningKey();
    other = await generateSigningKey();
    print = await keyFingerprint(key.publicKey);
  });

  it("reaches a lab it was never told about, and says how", async () => {
    const far = await lab(key, "https://far.example", "Far lab", [parts()[2]!]);
    const near = await lab(key, "https://near.example", "Near lab", [parts()[0]!],
                           [peer("far.example", { name: "Far lab" })]);
    const { fetch } = network({ "https://near.example": { body: near }, "https://far.example": { body: far } });

    const walk = await discover(["near.example"], { fetch });
    expect(walk.reached.map((one) => one.found.origin)).toEqual(["https://near.example", "https://far.example"]);
    expect(walk.reached[1]!.depth).toBe(1);
    expect(walk.reached[1]!.introducedBy).toBe("https://near.example");
    expect(walk.reached[1]!.path).toEqual(["https://near.example", "https://far.example"]);
    expect(walk.unreachable).toEqual([]);
    expect(walk.stoppedEarly).toBe(false);
  });

  it("says whether a lab's key is the one it was introduced with", async () => {
    const far = await lab(key, "https://far.example", "Far lab", [parts()[2]!]);
    const asSaid = await lab(key, "https://near.example", "Near lab", [], [peer("far.example", { key: print })]);
    const asNotSaid = await lab(key, "https://near.example", "Near lab", [], [peer("far.example", { key: "0000-1111-2222-3333" })]);
    const served = { "https://far.example": { body: far } };

    const agreeing = await discover(["near.example"],
      { fetch: network({ ...served, "https://near.example": { body: asSaid } }).fetch });
    expect(agreeing.reached[1]!.asIntroduced).toBe("agrees");
    expect(introducedDifferently(agreeing)).toEqual([]);

    const differing = await discover(["near.example"],
      { fetch: network({ ...served, "https://near.example": { body: asNotSaid } }).fetch });
    expect(differing.reached[1]!.asIntroduced).toBe("differs");
    expect(introducedDifferently(differing).map((one) => one.found.origin)).toEqual(["https://far.example"]);
    expect(differing.reached[1]!.settled, "the far lab is still perfectly valid in itself").toBe(true);
  });

  it("says nothing about a seed's key, which nobody introduced", async () => {
    const only = await lab(key, "https://near.example", "Near lab", []);
    const walk = await discover(["near.example"], { fetch: network({ "https://near.example": { body: only } }).fetch });
    expect(walk.reached[0]!.asIntroduced).toBe("unsaid");
    expect(walk.reached[0]!.introducedBy).toBeNull();
    expect(walk.reached[0]!.depth).toBe(0);
  });

  it("will not let a lab that does not check out introduce anyone", async () => {
    const hidden = await lab(key, "https://hidden.example", "Somewhere else", []);
    // Signed for one address, served from another: it fails its own check, so its pointers are dropped.
    const liar = await lab(key, "https://elsewhere.example", "Liar", [], [peer("hidden.example")]);
    const { fetch, asked } = network({ "https://near.example": { body: liar }, "https://hidden.example": { body: hidden } });

    const walk = await discover(["near.example"], { fetch });
    expect(walk.reached.length).toBe(1);
    expect(walk.reached[0]!.settled, "it answered, and it is reported").toBe(false);
    expect(walk.reached[0]!.found.fromItsOwnAddress).toBe(false);
    expect(asked, "the address it pointed at was never fetched").toEqual(["https://near.example"]);
  });

  it("will not let an unsigned lab introduce anyone either", async () => {
    const unsigned = inventoryFrom([], { name: "Unsigned", origin: "https://near.example", contact: null, note: null },
                                   { peers: [peer("hidden.example")] });
    const { fetch, asked } = network({ "https://near.example": { body: { inventory: unsigned, signatures: [] } } });

    const walk = await discover(["near.example"], { fetch });
    expect(walk.reached[0]!.settled).toBe(false);
    expect(asked).toEqual(["https://near.example"]);
  });

  it("visits an address once however many labs point at it", async () => {
    const shared = await lab(key, "https://shared.example", "Shared", [parts()[1]!]);
    const first = await lab(key, "https://first.example", "First", [], [peer("shared.example"), peer("shared.example")]);
    const second = await lab(other, "https://second.example", "Second", [], [peer("shared.example"), peer("first.example")]);
    const { fetch, asked } = network({
      "https://first.example": { body: first },
      "https://second.example": { body: second },
      "https://shared.example": { body: shared },
    });

    const walk = await discover(["first.example", "second.example", "first.example"], { fetch });
    expect(asked.filter((one) => one === "https://shared.example").length).toBe(1);
    expect(walk.reached.map((one) => one.found.origin))
      .toEqual(["https://first.example", "https://second.example", "https://shared.example"]);
  });

  it("walks in a circle without going round it", async () => {
    const there = await lab(key, "https://there.example", "There", [], [peer("here.example")]);
    const here = await lab(key, "https://here.example", "Here", [], [peer("there.example")]);
    const { fetch, asked } = network({ "https://here.example": { body: here }, "https://there.example": { body: there } });

    const walk = await discover(["here.example"], { fetch, maxDepth: 10 });
    expect(asked.length).toBe(2);
    expect(walk.reached.length).toBe(2);
    expect(walk.stoppedEarly).toBe(false);
  });

  it("goes no further than it was told to", async () => {
    const three = await lab(key, "https://three.example", "Three", []);
    const two = await lab(key, "https://two.example", "Two", [], [peer("three.example")]);
    const one = await lab(key, "https://one.example", "One", [], [peer("two.example")]);
    const served = {
      "https://one.example": { body: one }, "https://two.example": { body: two }, "https://three.example": { body: three },
    };

    const seedsOnly = await discover(["one.example"], { fetch: network(served).fetch, maxDepth: 0 });
    expect(seedsOnly.reached.map((lab_) => lab_.found.origin)).toEqual(["https://one.example"]);

    const oneHop = await discover(["one.example"], { fetch: network(served).fetch, maxDepth: 1 });
    expect(oneHop.reached.length).toBe(2);

    const far = await discover(["one.example"], { fetch: network(served).fetch, maxDepth: 2 });
    expect(far.reached.map((lab_) => lab_.depth)).toEqual([0, 1, 2]);
    expect(far.reached[2]!.path).toEqual(["https://one.example", "https://two.example", "https://three.example"]);
  });

  it("stops at the number of labs it was given, and says it stopped", async () => {
    const three = await lab(key, "https://three.example", "Three", []);
    const two = await lab(key, "https://two.example", "Two", [], [peer("three.example")]);
    const one = await lab(key, "https://one.example", "One", [], [peer("two.example")]);
    const { fetch, asked } = network({
      "https://one.example": { body: one }, "https://two.example": { body: two }, "https://three.example": { body: three },
    });

    const walk = await discover(["one.example"], { fetch, maxLabs: 2, maxDepth: 10 });
    expect(walk.reached.length).toBe(2);
    expect(walk.stoppedEarly).toBe(true);
    expect(asked.length).toBe(2);
  });

  it("records what it could not reach, and who sent it there", async () => {
    const pointing = await lab(key, "https://near.example", "Near", [], [
      peer("gone.example"), peer("rubbish.example"),
    ]);
    const { fetch } = network({
      "https://near.example": { body: pointing },
      "https://gone.example": { status: 404 },
      "https://rubbish.example": { text: "<html>not json</html>" },
    });

    const walk = await discover(["near.example", "not an address at all"], { fetch });
    expect(walk.reached.length).toBe(1);
    const why = Object.fromEntries(walk.unreachable.map((one) => [one.origin, one.why]));
    expect(why["https://gone.example"]).toMatch(/no inventory to read \(404\)/);
    expect(why["https://rubbish.example"]).toMatch(/is not JSON/);
    expect(why["not an address at all"]).toMatch(/not an address/);
    expect(walk.unreachable.find((one) => one.origin === "https://gone.example")!.introducedBy)
      .toBe("https://near.example");
    expect(walk.unreachable.find((one) => one.origin === "not an address at all")!.introducedBy).toBeNull();
  });

  it("will not follow a pointer to an address whose connection proves nothing", async () => {
    // Written straight into the document and then signed, past `peer()`, which would have refused it.
    const pointing = await lab(key, "https://near.example", "Near", [],
                               [{ origin: "http://plain.example", name: null, key: null, note: null }]);
    const { fetch, asked } = network({ "https://near.example": { body: pointing } });

    const walk = await discover(["near.example"], { fetch });
    expect(walk.reached[0]!.settled, "the lab itself is fine; it is the pointer that is not").toBe(true);
    expect(asked).toEqual(["https://near.example"]);
    expect(walk.unreachable[0]!.why).toMatch(/must be https/);
    expect(walk.unreachable[0]!.introducedBy).toBe("https://near.example");
  });

  it("drops the pointers of a lab whose document was altered after signing", async () => {
    const altered = await lab(key, "https://near.example", "Near", [], [peer("known.example")]);
    altered.inventory.peers!.push(peer("slipped-in.example"));
    const { fetch, asked } = network({ "https://near.example": { body: altered } });

    const walk = await discover(["near.example"], { fetch });
    expect(walk.reached[0]!.settled).toBe(false);
    expect(walk.reached[0]!.found.checks[0]!.ok).toBe(false);
    expect(asked, "neither the real pointer nor the added one was followed").toEqual(["https://near.example"]);
  });

  it("refuses to write such a pointer in the first place", () => {
    expect(() => peer("http://plain.example")).toThrow(/must be https/);
    expect(() => peer("not an address")).toThrow(/not an address/);
    expect(peer("otherlab.example/parts").origin).toBe("https://otherlab.example");
  });

  it("finds the parts of a plan across labs nobody listed in one place", async () => {
    const third = await lab(other, "https://third.example", "Third lab", [parts()[2]!]);
    const second = await lab(key, "https://second.example", "Second lab", [parts()[1]!], [peer("third.example")]);
    const first = await lab(key, "https://first.example", "First lab", [parts()[0]!], [peer("second.example")]);
    const { fetch } = network({
      "https://first.example": { body: first },
      "https://second.example": { body: second },
      "https://third.example": { body: third },
    });

    const walk = await discover(["first.example"], { fetch });
    const sourcing = whoHas(partsNeeded(plan().document), settledLabs(walk));
    expect(sourcing.map((one) => one.holders[0]?.lab))
      .toEqual(["First lab", "Second lab", "Third lab"]);
    expect(unsourced(sourcing)).toEqual([]);
    expect(walk.reached[2]!.path.length, "the third lab was two pointers away").toBe(3);
  });

  it("keeps an inventory that never heard of peers perfectly valid", async () => {
    const old = await lab(key, "https://near.example", "Near", [parts()[0]!]);
    expect("peers" in old.inventory, "nothing was added to it").toBe(false);
    const walk = await discover(["near.example"], { fetch: network({ "https://near.example": { body: old } }).fetch });
    expect(walk.reached[0]!.settled).toBe(true);
    expect(walk.reached.length).toBe(1);
  });
});
