"use client";

/**
 * A whole lab application, in one component.
 *
 * It holds no state of its own about the lab. It is told the lab as it stands, every time it
 * changes, and draws it; a button asks for one thing to be done and waits to be told how the lab
 * changed. So what is on screen is always what the signed logs say, and never what a form hoped.
 *
 * It walks a person through the three places they can be: nobody has said who is at this device,
 * the device is in no lab, the device is waiting to be let into one — and then the lab itself.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Logo, Mark, useAct, useLab } from "@biolibs/bionet-react";
import { Freezer } from "./freezer.js";
import { History } from "./history.js";
import { Ask, CopyContext, DeviceKey, SyncStatus, Trouble } from "./parts.js";
import { RestoreKey, RestoreLab, SaveContext } from "./backup.js";
import { People } from "./people.js";
import { Places } from "./places.js";
import { Sharing } from "./sharing.js";

/** The things a member looks at. */
export const TABS = ["freezer", "places", "people", "history", "sharing"] as const;

/** One of them. */
export type Tab = (typeof TABS)[number];

/**
 * The headings the views are gathered under, in the order they are shown.
 *
 * A flat list of views says nothing about what they are. Thirteen of them say nothing and do not
 * fit: the bar they used to sit in ran 16 pixels past a 1,100 pixel window, and further with every
 * digit the counts gained. Gathered, a person can see at a glance that the freezer and the strains
 * are the same kind of thing and the glossary is not.
 */
export const GROUPS = ["What is here", "At the bench", "The lab", "Reference"] as const;

/** One of them, or any other heading a host sends. */
export type Group = (typeof GROUPS)[number] | string;

/** Which heading each of the window's own views belongs under. */
const UNDER: Record<Tab, Group> = {
  freezer: "What is here", places: "What is here",
  people: "The lab", history: "The lab", sharing: "The lab",
};

/** A view a host adds to the window beside its own, such as a drawing of the lab. */
export interface ExtraTab {
  /** What tells it apart. */
  id: string;
  /** What its tab says. */
  label: string;
  /**
   * The heading to gather it under. One of {@link GROUPS}, or any words of the host's own, which
   * are then shown as their own heading after the ones the window knows.
   *
   * A view with none is shown under no heading at the end, so a host that says nothing still gets
   * every one of its views.
   */
  group?: Group;
  /** What it shows. It is inside the lab's provider, so it may use the hooks. */
  view: ReactNode;
}

/**
 * The window.
 *
 * @param props - `tab` is which view to open on; `copy` puts words on the clipboard and `save` hands
 *   over a file, for a host that cannot use the browser's own way; `extra` are views the host adds,
 *   shown after the window's own.
 */
export function LabWindow({ tab: first = "freezer", at, copy, save, extra = [] }: {
  tab?: Tab | string;
  /**
   * A tab to move to, followed whenever it changes.
   *
   * `tab` says where to open; this says where to go. Without it nothing in the window can send
   * anybody anywhere — a list of work could show that a step is ready and had no way to take
   * somebody to the machine that would do it.
   */
  at?: string;
  copy?: (words: string) => Promise<void>; save?: (name: string, text: string) => Promise<boolean | void>; extra?: readonly ExtraTab[];
}) {
  let window = <Body first={first} extra={extra} {...(at === undefined ? {} : { at })} />;
  if (save !== undefined) window = <SaveContext.Provider value={save}>{window}</SaveContext.Provider>;
  if (copy !== undefined) window = <CopyContext.Provider value={copy}>{window}</CopyContext.Provider>;
  return <div className="bionet">{window}</div>;
}

function Body({ first, at, extra }: { first: string; at?: string; extra: readonly ExtraTab[] }) {
  const state = useLab();
  const [tab, setTab] = useState<string>(first);
  // Followed rather than read once, so that a host asking for the same tab twice still moves there.
  useEffect(() => { if (at !== undefined && at !== "") setTab(at); }, [at]);
  if (state === null) return <main className="centre"><p className="dim">Opening the lab…</p></main>;
  if (state.device.person === null) return <main className="centre"><Logo /><Trouble /><Who /></main>;
  if (state.lab === null) return <main className="centre"><Logo /><Trouble /><NoLab /></main>;
  if (!state.lab.member) return <main className="centre"><Logo /><Trouble /><Waiting /></main>;

  const lab = state.lab;
  const label: Record<Tab, string> = {
    freezer: `Freezer · ${lab.items.filter((item) => !item.retired).length}`,
    places: `Places · ${lab.places.filter((place) => !place.retired).length}`,
    people: `People · ${lab.roster.filter((key) => key.removed === null).length}`,
    history: `History · ${lab.entries.length}`,
    sharing: "Sharing",
  };
  return (
    <div className="shell">
      <header>
        <div className="title">
          <Mark size={34} />
          <div>
            <h1>{lab.name ?? "A lab"}</h1>
            <p className="dim small">{state.device.person} · {lab.keeper ? "keeper" : lab.adviser ? "adviser" : "member"} · this device <code>{state.device.fingerprint}</code></p>
          </div>
        </div>
        <SyncStatus peer={state.peer} />
      </header>
      <div className="body">
        <Ways tab={tab} setTab={setTab} label={label} extra={extra} />
        <main>
          <Trouble />
          {tab === "freezer" && <Freezer />}
          {tab === "places" && <Places />}
          {tab === "people" && <People />}
          {tab === "history" && <History />}
          {tab === "sharing" && <Sharing />}
          {extra.find((one) => one.id === tab)?.view}
        </main>
      </div>
    </div>
  );
}

/** One thing a person can go to. */
interface Way { id: string; label: string; group: Group }

/**
 * Every view, in order, gathered under its heading.
 *
 * The headings the window knows come first, in {@link GROUPS} order; a heading a host invented
 * follows them, in the order its views were given; and anything with no heading comes last under
 * none, so nothing a host sends can go missing by saying nothing about where it belongs.
 *
 * @param ways - Every view, in the order they were declared.
 * @returns Each heading with its views, headings a person should not be shown marked `null`.
 */
export function gather(ways: readonly Way[]): { group: Group | null; ways: Way[] }[] {
  const held = new Map<Group | null, Way[]>();
  for (const one of ways) {
    const under = one.group === "" ? null : one.group;
    held.set(under, [...(held.get(under) ?? []), one]);
  }
  const known = GROUPS.filter((one) => held.has(one)).map((one) => ({ group: one as Group | null, ways: held.get(one)! }));
  const theirs = [...held.keys()]
    .filter((one): one is Group => one !== null && !(GROUPS as readonly string[]).includes(one))
    .map((one) => ({ group: one as Group | null, ways: held.get(one)! }));
  const loose = held.has(null) ? [{ group: null, ways: held.get(null)! }] : [];
  return [...known, ...theirs, ...loose];
}

/** The way through the window: every view, under its heading, down the side. */
function Ways({ tab, setTab, label, extra }: {
  tab: string; setTab: (to: string) => void;
  label: Record<Tab, string>; extra: readonly ExtraTab[];
}) {
  const gathered = gather([
    ...TABS.map((one) => ({ id: one, label: label[one], group: UNDER[one] })),
    ...extra.map((one) => ({ id: one.id, label: one.label, group: one.group ?? "" })),
  ]);
  return (
    <nav aria-label="The lab">
      {gathered.map(({ group, ways }) => (
        <div className="group" key={group ?? "loose"}>
          {group !== null && <p className="heading">{group}</p>}
          {ways.map((one) => (
            <button key={one.id} type="button" className={one.id === tab ? "tab on" : "tab"}
                    aria-current={one.id === tab ? "page" : undefined} onClick={() => setTab(one.id)}>
              {one.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Asking who is at this device, before anything else. */
export function Who() {
  const act = useAct();
  return (
    <section className="card narrow">
      <h1>Who is at this device?</h1>
      <p className="dim">Every change you make is signed by a key made on this device, and shown to your lab under this name. The key never leaves this computer.</p>
      <Ask onAsk={(data) => act("setPerson", String(data.get("name") ?? ""))} className="row">
        <input name="name" placeholder="Your name" autoFocus required maxLength={200} />
        <button type="submit">Continue</button>
      </Ask>
    </section>
  );
}

/** Founding a lab, or joining one. */
export function NoLab() {
  const state = useLab();
  const act = useAct();
  if (state === null) return null;
  return (
    <div className="pair">
      <section className="card">
        <h2>Found a lab</h2>
        <p className="dim">You become its first keeper. It works on this device straight away, with or without a network.</p>
        <Ask onAsk={(data) => act("found", { name: String(data.get("name") ?? ""), peer: String(data.get("peer") ?? "") })} className="stack">
          <label>What is it called?<input name="name" placeholder="The Wren Lab" required maxLength={200} /></label>
          <label><span>Its web peer, if it has one (optional)</span><input name="peer" placeholder="wss://your-lab.example/sync" /></label>
          <button type="submit">Found the lab</button>
        </Ask>
      </section>
      <section className="card">
        <h2>Join a lab</h2>
        <p className="dim">Send a keeper this device's key, and paste the invitation they send back. The lab arrives once they have added you.</p>
        <DeviceKey device={state.device} />
        <Ask onAsk={(data) => act("join", String(data.get("invite") ?? ""))} className="stack">
          <label>Invitation<input name="invite" placeholder="wss://your-lab.example/sync#…" required /></label>
          <button type="submit">Join</button>
        </Ask>
        <RestoreKey />
        <RestoreLab />
      </section>
    </div>
  );
}

/** Waiting for a keeper to add this device. */
export function Waiting() {
  const state = useLab();
  if (state === null) return null;
  return (
    <section className="card narrow">
      <h1>Waiting to be let in</h1>
      <p>This device has asked to join a lab, and none of the lab has been sent to it yet. A keeper has to add this device's key, and then it arrives on its own.</p>
      <DeviceKey device={state.device} />
      <SyncStatus peer={state.peer} />
      {state.peer.problem !== null && <p className="dim small">{state.peer.problem}</p>}
    </section>
  );
}
