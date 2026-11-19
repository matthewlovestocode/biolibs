/**
 * The panels, rendered to text against a real lab.
 *
 * Each is given a lab made by `@biolibs/bionet-client` and drawn with no browser. What is checked is
 * that a panel shows what the lab holds, in the words the design chose, and that the window takes a
 * person through the places they can be: no name yet, no lab yet, not let in yet, and in.
 */
import { readFileSync } from "node:fs";
import { Lab, memoryKeys, memoryStore, sourceOf, type LabSnapshot, type LabSource, type PeerView } from "@biolibs/bionet-client";
import { BackUpKey, BackUpLab, Freezer, History, LabWindow, People, Places, RestoreKey, RestoreLab, Sharing, SyncStatus, TABS, amountOf, describeEntry,
         endsWords, listedParts, madeFrom, placePath, placeTree, syncWords, whereWords } from "@biolibs/bionet-panels";
import { LabProvider } from "@biolibs/bionet-react";
import { cssVariable, MEANINGS } from "@biolibs/bionet-theme";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const BOBS_KEY = "B".repeat(43);

const fresh = (): Promise<Lab> => new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
const draw = (lab: Lab | LabSource, what: ReactElement): string =>
  renderToStaticMarkup(h(LabProvider, { source: "act" in lab ? lab : sourceOf(lab), children: what })).replace(/&#x27;/g, "'");

/** Ada's lab: Bob on the roster, a part on offer with a tube of ten, three of it used. */
async function wren(): Promise<{ lab: Lab; tube: string }> {
  const lab = await fresh();
  await lab.setPerson("Ada");
  await lab.found({ name: "The Wren Lab" });
  await lab.addMember({ key: BOBS_KEY, person: "Bob" });
  await lab.addPart({ name: "f1", sequence: F1 });
  const part = lab.snapshot().lab!.parts[0]!.checksum;
  const tube = await lab.addItem({ part, amount: 10, unit: "µL" });
  await lab.adjust({ item: tube, by: -3 });
  await lab.offer({ part, available: true });
  return { lab, tube };
}

describe("the window", () => {
  it("asks who is at the device, then offers to found or join, then shows the lab", async () => {
    const lab = await fresh();
    const opening: LabSource = { subscribe: () => () => {}, snapshot: () => null, act: async () => ({ ok: true, result: null }) };
    expect(draw(opening, h(LabWindow))).toContain("Opening the lab…");
    expect(draw(lab, h(LabWindow))).toContain("Who is at this device?");
    await lab.setPerson("Ada");
    const noLab = draw(lab, h(LabWindow));
    expect(noLab).toContain("Found a lab");
    expect(noLab).toContain("Join a lab");
    expect(noLab).toContain(lab.snapshot().device.key);
    await lab.found({ name: "The Wren Lab" });
    const inLab = draw(lab, h(LabWindow));
    expect(inLab).toContain("<h1>The Wren Lab</h1>");
    expect(inLab).toContain("Ada · keeper · this device");
    expect(inLab).toContain("No peer set · working on this device only");
    for (const tab of ["Freezer · 0", "People · 1", "History · 1", "Sharing"]) expect(inLab).toContain(tab);
    expect(inLab.startsWith('<div class="bionet">')).toBe(true);
  });

  it("tells somebody who has not been let in to wait, and shows their key", async () => {
    const lab = await fresh();
    await lab.setPerson("Bob");
    await lab.join(`wss://lab.example/sync#${"a".repeat(64)}`);
    const waiting = draw(lab, h(LabWindow));
    expect(waiting).toContain("Waiting to be let in");
    expect(waiting).toContain(lab.snapshot().device.key);
    lab.close();
  });

  it("opens on the view it is asked for", async () => {
    const { lab } = await wren();
    expect(TABS).toEqual(["freezer", "places", "people", "history", "sharing"]);
    expect(draw(lab, h(LabWindow, { tab: "places" }))).toContain("Where things are kept");
    const withExtra = draw(lab, h(LabWindow, { tab: "scene", extra: [{ id: "scene", label: "Lab", view: h("p", null, "a drawing of the lab") }] }));
    expect(withExtra).toContain('<button type="button" class="tab on">Lab</button>');
    expect(withExtra).toContain("a drawing of the lab");
    expect(draw(lab, h(LabWindow, { tab: "people" }))).toContain("Who is in the lab");
    expect(draw(lab, h(LabWindow, { tab: "history" }))).toContain("Everything that has happened");
    expect(draw(lab, h(LabWindow, { tab: "sharing", copy: async () => {} }))).toContain("What other labs are shown");
    expect(draw(lab, h(LabWindow))).toContain("Add a part");
  });
});

describe("the places", () => {
  it("shows the tree, where each tube is, and what needs looking at", async () => {
    const { lab, tube } = await wren();
    expect(draw(lab, h(Places))).toContain("No places yet");
    expect(draw(lab, h(Freezer))).toContain("nowhere recorded");

    const room = await lab.addPlace({ kind: "room", name: "Main lab" });
    const freezer = await lab.addPlace({ kind: "freezer", name: "−80", parent: room });
    const box = await lab.addPlace({ kind: "box", name: "Box 7", parent: freezer, grid: { rows: 9, columns: 9 } });
    await lab.putItem({ item: tube, place: box, slot: { row: 2, column: 3 } });
    const seen = lab.snapshot().lab!;
    expect(placePath(seen.places, box)).toBe("Main lab › −80 › Box 7");
    expect(placePath(seen.places, "nowhere")).toBe("");
    expect(placeTree(seen.places).map((one) => [one.place.name, one.depth])).toEqual([["Main lab", 0], ["−80", 1], ["Box 7", 2]]);
    expect(whereWords(seen.items[0]!, seen.places)).toBe("Main lab › −80 › Box 7 · C4");
    expect(whereWords({ where: { place: freezer, slot: null } }, seen.places)).toBe("Main lab › −80");
    expect(whereWords({ where: { place: "gone", slot: null } }, seen.places)).toBe("a place the lab no longer has");

    const places = draw(lab, h(Places));
    expect(places).toContain("9 × 9");
    expect(places).not.toContain("Somebody needs to look");
    expect(draw(lab, h(Freezer))).toContain("Main lab › −80 › Box 7 · C4");
    expect(draw(lab, h(History))).toContain("put a tube of f1 in Box 7, C4");
    expect(draw(lab, h(History))).toContain("added the freezer −80 in Main lab");

    const part = seen.parts[0]!.checksum;
    const second = await lab.addItem({ part, amount: 1, unit: null });
    await lab.putItem({ item: second, place: box, slot: { row: 2, column: 3 } });
    const crowded = draw(lab, h(Places));
    expect(crowded).toContain("Somebody needs to look");
    expect(crowded).toContain("Main lab › −80 › Box 7 · C4");

    await lab.retirePlace({ place: freezer });
    expect(placeTree(lab.snapshot().lab!.places).map((one) => one.place.name)).toEqual(["Main lab"]);
  });
});

describe("where a tube came from", () => {
  it("is said under the tube a run made, and not under one that was simply added", async () => {
    const { lab, tube } = await wren();
    await lab.addPart({ name: "fwd-1", sequence: F1.slice(0, 18) });
    const primer = await lab.addItem({ part: lab.snapshot().lab!.parts[1]!.checksum, amount: 5, unit: "µL" });
    const done = await lab.recordRun({
      kind: "pcr", inputs: [{ item: tube, amount: 1, role: "template" }, { item: primer, amount: 1, role: "forward primer" }],
      outputs: [{ sequence: F1.slice(0, 40), name: "amplicon", amount: 50, unit: "µL" }],
    });
    const seen = lab.snapshot().lab!;
    expect(madeFrom(seen.items.find((one) => one.item === done.items[0])!, seen)).toBe("made by a PCR from f1 and fwd-1");
    expect(madeFrom(seen.items.find((one) => one.item === tube)!, seen)).toBeNull();
    expect(madeFrom({ from: "a run nobody recorded" }, seen)).toBeNull();
    expect(madeFrom({ from: "r" }, { runs: [{ ...seen.runs[0]!, run: "r", kind: "digest", inputs: [] }], items: [], parts: [] })).toBe("made by a digest run");
    expect(draw(lab, h(Freezer))).toContain("made by a PCR from f1 and fwd-1");
    expect(draw(lab, h(History))).toContain("ran a PCR, which made amplicon");
    await lab.recordRun({ kind: "digest", inputs: [{ item: tube, amount: 1, role: "cut" }], settings: { enzymes: "EcoRI+BamHI" }, outcome: "worked" });
    await lab.recordRun({ kind: "digest", inputs: [{ item: tube, amount: 1, role: "cut" }], outcome: "failed" });
    expect(draw(lab, h(History))).toContain("digested a tube of f1 with EcoRI and BamHI: the gel matched");
    expect(draw(lab, h(History))).toContain("digested a tube of f1: the gel did not match");
  });
});

describe("backing up the key", () => {
  it("is offered among the people, and restoring before joining", async () => {
    const { lab } = await wren();
    expect(draw(lab, h(People))).toContain("Back up this device's key");
    expect(draw(lab, h(BackUpKey))).toContain("Nothing here remembers the passphrase");
    expect(draw(lab, h(RestoreKey))).toContain("Replacing a lost device?");
    const joining = await fresh();
    await joining.setPerson("Ada");
    expect(draw(joining, h(LabWindow))).toContain("Restore its key");
    expect(draw(joining, h(LabWindow))).toContain("Have a copy of a lab? Bring it back");
    expect(draw(joining, h(BackUpLab))).toBe("");
    expect(draw(lab, h(People))).toContain("Keep a copy of the lab");
    expect(draw(lab, h(BackUpLab))).toContain(`${lab.snapshot().lab!.entries.length} so far`);
    expect(draw(lab, h(RestoreLab))).toContain("restore the key first");
  });
});

describe("the freezer", () => {
  it("shows each part, its tubes and how much is in them", async () => {
    const { lab, tube } = await wren();
    const freezer = draw(lab, h(Freezer));
    expect(freezer).toContain("<h2>f1</h2>");
    expect(freezer).toContain("50 bp");
    expect(freezer).toContain("<strong>7 µL</strong>");
    expect(freezer).toContain(`${tube.slice(0, 10)}…`);
    expect(freezer).toMatch(/type="checkbox" checked=""\/>\s*On offer to other labs/);
    expect(freezer).not.toContain("needs a count");
    await lab.adjust({ item: tube, by: -9 });
    expect(draw(lab, h(Freezer))).toContain("needs a count");
    await lab.retire({ item: tube });
    expect(draw(lab, h(Freezer))).toContain("No tubes of this.");
  });

  it("says so when there is nothing in it, and draws nothing before the lab has arrived", async () => {
    const lab = await fresh();
    expect(draw(lab, h(Freezer))).toBe("");
    await lab.setPerson("Ada");
    await lab.found({ name: "Empty" });
    expect(draw(lab, h(Freezer))).toContain("Nothing in the freezer yet.");
    expect(amountOf({ amount: 4, unit: null })).toBe("4");
    expect(amountOf({ amount: 4, unit: "tubes" })).toBe("4 tubes");
  });
});

describe("the people", () => {
  it("lists the roster and lets a keeper add somebody", async () => {
    const { lab } = await wren();
    const people = draw(lab, h(People));
    expect(people).toContain('Ada<span class="badge calm">this device</span>');
    expect(people).toContain("keeper · founder");
    expect(people).toContain("<td>Bob</td><td>member</td>");
    expect(people).toContain("Add somebody");
    expect(people).toContain("Set the lab's web peer under Sharing to have an invitation to send.");
    await lab.setPeer("wss://lab.example/sync");
    expect(draw(lab, h(People))).toContain(`wss://lab.example/sync#${lab.labId}`);
    lab.close();
  });

  it("tells a member that only a keeper can", async () => {
    const { lab } = await wren();
    const snapshot = lab.snapshot();
    const asMember: LabSnapshot = { ...snapshot, lab: { ...snapshot.lab!, keeper: false,
      roster: [...snapshot.lab!.roster.slice(0, 1), { ...snapshot.lab!.roster[1]!, removed: { by: "x", cutoff: 2 } }] } };
    const people = draw({ ...sourceOf(lab), snapshot: () => asMember }, h(People));
    expect(people).toContain("Only a keeper can change who is in the lab.");
    expect(people).not.toContain("Add somebody");
    expect(people).toContain("<td>removed</td>");
    expect(people).toContain("log kept up to entry 3");
  });
});

describe("the history", () => {
  it("says what each change was, newest first, in words", async () => {
    const { lab, tube } = await wren();
    await lab.recount({ item: tube, amount: 6 });
    await lab.adjust({ item: tube, by: 2 });
    const view = lab.snapshot().lab!;
    expect(view.entries.map((entry) => describeEntry(entry, view))).toEqual([
      "founded The Wren Lab", "added Bob as a member", "added the part f1", "added a tube of f1, 10 µL",
      "used 3 µL of a tube of f1", "put f1 on offer", "counted 6 µL in a tube of f1", "added 2 µL to a tube of f1"]);
    const history = draw(lab, h(History));
    expect(history.indexOf("added 2 µL to a tube of f1")).toBeLessThan(history.indexOf("founded The Wren Lab"));
    expect(history).toContain("<td>Ada</td>");
    expect(draw(lab, h(History, { first: 3 }))).toContain("Show all 8");
  });

  it("has words for every kind of change, and for one it does not know", async () => {
    const { lab, tube } = await wren();
    const view = lab.snapshot().lab!;
    const part = view.parts[0]!.checksum;
    const say = (op: { type: string; [field: string]: unknown }): string => describeEntry({ op }, view);
    expect(say({ type: "roster.remove", key: BOBS_KEY })).toBe("removed Bob");
    expect(say({ type: "roster.remove", key: "nobody" })).toBe("removed a device");
    expect(say({ type: "roster.role", key: BOBS_KEY, role: "keeper" })).toBe("made Bob a keeper");
    expect(say({ type: "part.offer", part, available: false })).toBe("took f1 off offer");
    expect(say({ type: "part.offer", part: "unknown", available: true })).toBe("put a part on offer");
    expect(say({ type: "item.retire", item: tube })).toBe("retired a tube of f1");
    expect(say({ type: "item.retire", item: "unknown" })).toBe("retired a tube");
    expect(say({ type: "item.add", item: "unknown", amount: 2, unit: null })).toBe("added a tube, 2");
    expect(say({ type: "field.set", field: "shelf", value: "top" })).toBe("set shelf to top");
    expect(say({ type: "item.move", item: tube })).toBe("did something this version does not know (item.move)");
  });

  it("flags changes that overlapped or are waiting, and marks the ones that did not count", async () => {
    const { lab } = await wren();
    const snapshot = lab.snapshot();
    const view = snapshot.lab!;
    const troubled: LabSnapshot = { ...snapshot, lab: { ...view, waiting: 1, overlaps: [{ what: "x", kept: "a", dropped: "b" }],
      entries: [...view.entries, { ...view.entries[0]!, id: "aside", status: "set aside", reason: "after removal", signer: null, author: BOBS_KEY }] } };
    const history = draw({ ...sourceOf(lab), snapshot: () => troubled }, h(History));
    expect(history).toContain("1 pair of changes was made without knowledge of each other.");
    expect(history).toContain("1 change is waiting on others that have not arrived yet.");
    expect(history).toContain('<span class="badge" title="after removal">set aside</span>');
    expect(history).toContain("<td>Bob</td>");
  });
});

describe("sharing", () => {
  it("shows only what other labs would be shown", async () => {
    const { lab, tube } = await wren();
    await lab.addPart({ name: "f2", sequence: F1.slice(0, 30) });
    const view = lab.snapshot().lab!;
    expect(listedParts(view.parts, view.items).map((part) => part.name)).toEqual(["f1"]);
    const sharing = draw(lab, h(Sharing));
    expect(sharing).toContain("<td>f1</td><td>50 bp</td><td>yes</td>");
    expect(sharing).not.toContain("<td>f2</td>");
    expect(sharing).not.toContain("µL");
    expect(sharing).toContain("Set the lab's web peer below to have somewhere to publish.");
    expect(sharing).toContain(lab.labId!);
    await lab.adjust({ item: tube, by: -7 });
    expect(draw(lab, h(Sharing))).toContain("Nothing would be listed");
    await lab.setPeer("wss://lab.example/sync");
    expect(draw(lab, h(Sharing))).toContain("Published at <code>https://lab.example/.well-known/bionet.json</code>");
    lab.close();
  });
});

describe("how the connection is going", () => {
  const peer = (given: Partial<PeerView>): PeerView =>
    ({ url: "wss://lab.example/sync", origin: null, invite: null, status: "offline", problem: null, pending: 0, lastSynced: null, ...given });

  /** A device that has been in step with the peer at least once since it started. */
  const since = "2026-11-19T14:00:00.000Z";

  it("is said the way a person would want to hear it", () => {
    expect(syncWords(peer({ url: null }))).toBe("No peer set · working on this device only");
    expect(syncWords(peer({ status: "synced" }))).toBe("In step with the lab");
    expect(syncWords(peer({ status: "syncing" }))).toBe("Syncing…");
    expect(syncWords(peer({ status: "waiting" }))).toBe("Waiting to be let in");
    expect(renderToStaticMarkup(h(SyncStatus, { peer: peer({ status: "synced", problem: "a reason" }) })))
      .toBe('<div class="sync" title="a reason"><span class="dot synced"></span><span>In step with the lab</span></div>');
  });

  it("counts what is unsent once there has been a sync to count from", () => {
    expect(syncWords(peer({ status: "connecting", pending: 2, lastSynced: since })))
      .toBe("Reaching the lab's peer… · 2 changes to send");
    expect(syncWords(peer({ status: "offline", pending: 1, lastSynced: since }))).toBe("Offline · 1 change to send");
    expect(syncWords(peer({ status: "offline", lastSynced: since }))).toBe("Offline");
  });

  it("does not call the whole log a backlog before the first connection is made", () => {
    // What the window showed at launch was "Reaching the lab's peer… · 643 changes to send", which
    // is every entry the lab has ever had. Nothing had failed; nothing had been tried. On a peer
    // that takes a while to wake, that line sits there long enough to be read as a broken sync.
    expect(syncWords(peer({ status: "connecting", pending: 643 }))).toBe("Reaching the lab's peer…");
    expect(syncWords(peer({ status: "connecting", pending: 0 }))).toBe("Reaching the lab's peer…");
    // Offline and never in step is worth saying plainly, since there a number would be misleading
    // in the other direction: it is not a queue that built up, it is everything.
    expect(syncWords(peer({ status: "offline", pending: 643 }))).toBe("Offline · nothing sent to the peer yet");
    expect(syncWords(peer({ status: "offline", pending: 0 }))).toBe("Offline · nothing sent to the peer yet");
    // And once it has been in step, the same numbers mean what they say again.
    expect(syncWords(peer({ status: "connecting", pending: 643, lastSynced: since })))
      .toBe("Reaching the lab's peer… · 643 changes to send");
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(new URL("../panels.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("reaches nothing outside the panels", () => {
    for (const rule of css.split("}")) {
      const selector = rule.split("{")[0]!.trim();
      if (selector === "") continue;
      for (const one of selector.split(",")) expect(one.trim(), one).toMatch(/^\.bionet(\s|$)/);
    }
  });

  it("takes every colour from the theme", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const named = new Set(MEANINGS.map(cssVariable));
    for (const [used] of css.matchAll(/--bionet-[a-z-]+/g)) expect(named.has(used), used).toBe(true);
  });
});

describe("a lab's public page", () => {
  const part = (name: string, checksum: string, more: Partial<import("@biolibs/bionet").InventoryPart> = {}): import("@biolibs/bionet").InventoryPart =>
    ({ id: name, name, checksum, length: 50, circular: false, available: true, note: null, ...more });
  const mine = [part("f1", "one"), part("f2", "two", { available: false, note: "held, but not being sent out" })];
  const theirs = [part("fragment two", "two"), part("f3", "three", { circular: true })];
  const check = { ok: true, public_key: "k", fingerprint: "aaaa-bbbb-cccc-dddd", signer: null, signed_at: "now", problem: null };

  it("frames the page with the mark and the lab's name, inside the panels' scope", async () => {
    const { LabPage } = await import("@biolibs/bionet-panels");
    const page = renderToStaticMarkup(h(LabPage, { name: "The Wren Lab", note: "A worked example.", children: h("p", null, "body") }));
    expect(page.startsWith('<div class="bionet"><main class="page">')).toBe(true);
    expect(page).toContain("<h1>The Wren Lab</h1>");
    expect(page).toContain('aria-label="Bionet"');
    expect(page).toContain("A worked example.");
    expect(page).toContain('href="/.well-known/bionet.json"');
    expect(renderToStaticMarkup(h(LabPage, { name: "Bare", children: null }))).not.toContain('<p class="dim">');
  });

  it("lists what a lab holds and says what the signature settles", async () => {
    const { Held } = await import("@biolibs/bionet-panels");
    const held = renderToStaticMarkup(h(Held, { parts: mine, checks: [check], origin: "https://lab.example", bound: true })).replace(/&#x27;/g, "'");
    expect(held).toContain("held, but not being sent out");
    expect(held).toContain('<td class="bad">no</td>');
    expect(held).toContain("aaaa-bbbb-cccc-dddd");
    expect(held).toContain("the signature holds over this list as served.");
    expect(held).toContain("Bound to <code>https://lab.example</code>: yes.");
    const broken = renderToStaticMarkup(h(Held, { parts: [], checks: [{ ...check, ok: false }], origin: "https://lab.example", bound: false }));
    expect(broken).toContain("the signature does not hold.");
    expect(broken).toContain("Nothing is listed at the moment.");
    expect(broken).toContain(": no.");
    expect(renderToStaticMarkup(h(Held, { parts: [], checks: [], origin: "x", bound: true }))).toContain("This list is not signed");
  });

  it("compares two labs by checksum and never by name", async () => {
    const { PeerAnswered, heldByBoth, onlyTheirs } = await import("@biolibs/bionet-panels");
    expect(onlyTheirs(mine, theirs).map((one) => one.name)).toEqual(["f3"]);
    expect(heldByBoth(mine, theirs).map((one) => one.name)).toEqual(["f2"]);
    const found = { origin: "https://thistle.example", fromItsOwnAddress: true, checks: [check],
                    signed: { inventory: { lab: { name: "The Thistle Lab" }, parts: theirs }, signatures: [] } } as never;
    const seen = renderToStaticMarkup(h(PeerAnswered, { found, mine })).replace(/&#x27;/g, "'");
    expect(seen).toContain("<strong>The Thistle Lab</strong> answered at <code>https://thistle.example</code> with 2 parts.");
    expect(seen).toContain("Its signature holds and it was served from the address it names.");
    expect(seen).toContain("None of that says this lab is who it says it is.");
    expect(seen).toContain("<td>f3</td>");
    expect(seen).toContain("50 bp ○");
    expect(seen).toContain("<code>f2 </code>");

    const unsettled = { ...(found as object), fromItsOwnAddress: false, signed: { inventory: { lab: { name: "Somebody" }, parts: [part("f1", "one")] }, signatures: [] } } as never;
    const doubt = renderToStaticMarkup(h(PeerAnswered, { found: unsettled, mine: [part("f1", "one")] }));
    expect(doubt).toContain("with 1 part.");
    expect(doubt).toContain("does not check out, so nothing below is settled.");
    expect(doubt).toContain("Nothing. Everything they list, we hold too.");
    expect(renderToStaticMarkup(h(PeerAnswered, { found, mine: [] }))).toContain("Nothing in common, by checksum.");
  });

  it("says plainly when another lab did not answer, without accusing it", async () => {
    const { PeerSilent } = await import("@biolibs/bionet-panels");
    const silent = renderToStaticMarkup(h(PeerSilent, { address: "https://gone.example", why: "it timed out" }));
    expect(silent).toContain("We point at <code>https://gone.example</code> and it did not answer.");
    expect(silent).toContain("The reason given was: it timed out.");
    expect(silent).toContain("is not a lab that is lying");
  });
});

describe("a part's ends, in words", () => {
  it("names each end's unpaired bases, and says nothing of a part with none", () => {
    expect(endsWords({ sequence: "AATTCGGGGGGATC", ends: { left: 4, right: 4 } })).toBe("5′ AATT … 5′ GATC");
    expect(endsWords({ sequence: "aattcgggggtac", ends: { left: 4, right: -3 } })).toBe("5′ AATT … 3′ TAC");
    expect(endsWords({ sequence: "AATTCGGGGGGATC", ends: { left: 0, right: -4 } })).toBe("blunt … 3′ GATC");
    expect(endsWords({ sequence: "AATTC", ends: { left: 0, right: 0 } })).toBeNull();
    expect(endsWords({ sequence: "AATTC" })).toBeNull();
  });
});
