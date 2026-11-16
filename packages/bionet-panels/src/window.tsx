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
import { useState, type ReactNode } from "react";
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

/** A view a host adds to the window beside its own, such as a drawing of the lab. */
export interface ExtraTab {
  /** What tells it apart. */
  id: string;
  /** What its tab says. */
  label: string;
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
export function LabWindow({ tab: first = "freezer", copy, save, extra = [] }: {
  tab?: Tab | string; copy?: (words: string) => Promise<void>; save?: (name: string, text: string) => Promise<boolean | void>; extra?: readonly ExtraTab[];
}) {
  let window = <Body first={first} extra={extra} />;
  if (save !== undefined) window = <SaveContext.Provider value={save}>{window}</SaveContext.Provider>;
  if (copy !== undefined) window = <CopyContext.Provider value={copy}>{window}</CopyContext.Provider>;
  return <div className="bionet">{window}</div>;
}

function Body({ first, extra }: { first: string; extra: readonly ExtraTab[] }) {
  const state = useLab();
  const [tab, setTab] = useState<string>(first);
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
      <nav>
        {TABS.map((one) => <button key={one} type="button" className={one === tab ? "tab on" : "tab"} onClick={() => setTab(one)}>{label[one]}</button>)}
        {extra.map((one) => <button key={one.id} type="button" className={one.id === tab ? "tab on" : "tab"} onClick={() => setTab(one.id)}>{one.label}</button>)}
      </nav>
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
