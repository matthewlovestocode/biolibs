/**
 * The panels, rendered to text against a real lab.
 *
 * Each is given a lab made by `@biolibs/bionet-client` and drawn with no browser. What is checked is
 * that a panel shows what the lab holds, in the words the design chose, and that the window takes a
 * person through the places they can be: no name yet, no lab yet, not let in yet, and in.
 */
import { readFileSync } from "node:fs";
import { Lab, memoryKeys, memoryStore, sourceOf, type LabSnapshot, type LabSource, type PeerView } from "@biolibs/bionet-client";
import { Freezer, History, LabWindow, People, Sharing, SyncStatus, TABS, amountOf, describeEntry, listedParts,
         syncWords } from "@biolibs/bionet-panels";
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
    expect(TABS).toEqual(["freezer", "people", "history", "sharing"]);
    expect(draw(lab, h(LabWindow, { tab: "people" }))).toContain("Who is in the lab");
    expect(draw(lab, h(LabWindow, { tab: "history" }))).toContain("Everything that has happened");
    expect(draw(lab, h(LabWindow, { tab: "sharing", copy: async () => {} }))).toContain("What other labs are shown");
    expect(draw(lab, h(LabWindow))).toContain("Add a part");
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

  it("is said the way a person would want to hear it", () => {
    expect(syncWords(peer({ url: null }))).toBe("No peer set · working on this device only");
    expect(syncWords(peer({ status: "synced" }))).toBe("In step with the lab");
    expect(syncWords(peer({ status: "syncing" }))).toBe("Syncing…");
    expect(syncWords(peer({ status: "waiting" }))).toBe("Waiting to be let in");
    expect(syncWords(peer({ status: "connecting", pending: 2 }))).toBe("Reaching the lab's peer… · 2 changes to send");
    expect(syncWords(peer({ status: "offline", pending: 1 }))).toBe("Offline · 1 change to send");
    expect(syncWords(peer({ status: "offline" }))).toBe("Offline");
    expect(renderToStaticMarkup(h(SyncStatus, { peer: peer({ status: "synced", problem: "a reason" }) })))
      .toBe('<div class="sync" title="a reason"><span class="dot synced"></span><span>In step with the lab</span></div>');
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
