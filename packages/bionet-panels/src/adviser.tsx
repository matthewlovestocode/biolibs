"use client";

/**
 * The adviser a device hosts: an agent let into the lab as a member with no hands.
 *
 * Three decisions are a person's, and this is where each is made: whether this device hosts an
 * adviser at all, whether a keeper lets its key into the lab, and whether the door an agent comes in
 * by is open. None of them is made for anybody, and each says what it does before it is done.
 */
import { useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Copy } from "./parts.js";

/** One thing the adviser lately did. */
export interface AdviserSeen {
  /** Which of its tools it used. */
  tool: string;
  /** Whether that worked. */
  ok: boolean;
  /** When, as an ISO date. */
  at: string;
  /** Where in the lab it would be seen, if it has a place there, as the adviser's tools report it. */
  shows?: unknown;
}

/** The way an agent reaches the adviser's tools on this device, as a host offers it. */
export interface AdviserDoor {
  /** Whether it is open. */
  on: boolean;
  /** Where it is, when it is open. */
  url: string | null;
  /** What the adviser has lately done, newest last. */
  seen?: readonly AdviserSeen[];
  /** Open or shut it. */
  turn: (on: boolean) => Promise<unknown>;
  /** Put the way to connect, token and all, on the clipboard. The window is never shown the token. */
  copy: () => Promise<unknown>;
  /** Make the token anew, shutting out whatever had the old one. */
  renew?: () => Promise<unknown>;
}

const TOOL_WORDS: Readonly<Record<string, string>> = {
  lab_overview: "looked over the lab", list_parts: "read the list of parts", get_part: "read a part closely", list_tubes: "read the list of tubes",
  list_runs: "read what has been done", list_proposals: "read what is proposed", find_cutters: "looked for enzymes that cut a part",
  design_primers: "designed a pair of primers", work_out_pcr: "worked out a PCR", work_out_digest: "worked out a digest", work_out_ligation: "worked out a ligation",
  search_ncbi: "searched NCBI", fetch_from_ncbi: "read a sequence from NCBI", keep_from_ncbi: "kept a sequence from NCBI", add_part: "added a part", propose_pcr: "proposed a PCR", propose_digest: "proposed a digest", propose_ligation: "proposed a ligation", withdraw_proposal: "took a proposal back",
};

/**
 * What the adviser did, in a few words.
 *
 * @param tool - Which of its tools it used.
 * @returns Something like `worked out a digest`.
 */
export const adviserDid = (tool: string): string => TOOL_WORDS[tool] ?? `used ${tool}`;

/**
 * The adviser this device hosts, and the door to it.
 *
 * @param props - `door` is the way an agent reaches it, for a host that has one to offer. Without
 *   it the adviser can still be hosted and let in, and something else has to carry what it says.
 *   `onWatch`, if given, adds a way to go and watch the adviser at work in the lab.
 */
export function Adviser({ door, onWatch }: { door?: AdviserDoor; onWatch?: () => void }): ReactNode {
  const state = useLab();
  const act = useAct();
  const [person, setPerson] = useState("Claude");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const lab = state?.lab;
  if (state === null || lab === null || lab === undefined) return null;
  const hosting = state.hosting;
  const ask = async (work: () => Promise<unknown>): Promise<void> => { setBusy(true); try { await work(); } finally { setBusy(false); } };
  const theirs = hosting === null ? [] : lab.plans.filter((one) => one.by === hosting.key);

  return (
    <>
      <section className="card">
        <h2>An adviser on this device</h2>
        <p className="small">An adviser is a member with no hands: an agent that can read what the lab holds, work things out with the lab's own tools, add a part by its sequence, and propose a run for a person to carry out.</p>
        <p className="dim small">It cannot say that anything was done, used or moved, and it cannot change what you have marked on a part. That is not a setting here: its key has the role of adviser, and every device in the lab refuses anything else it writes. What it proposes is shown at the tool that would carry it out, with its reasons, and nothing happens until a person does it.</p>
        {hosting === null ? (
          <button type="button" disabled={busy} onClick={() => void ask(() => act("hostAdviser"))}>Host an adviser on this device</button>
        ) : (
          <>
            <div className="keybox">
              <div><span className="label">The adviser's key</span><Copy words={hosting.key} label="Copy key" /></div>
              <code className="wrap">{hosting.key}</code>
              <p className="dim small">Fingerprint <code>{hosting.fingerprint}</code>. It is a key of its own, kept on this device and apart from yours: what the adviser writes is signed with it and never with your key.</p>
            </div>
            {hosting.standing === "adviser" && <p className="small good" role="status">It is in the lab as an adviser.</p>}
            {hosting.standing === "removed" && <p className="small trouble" role="status">It was removed from the lab. What it wrote until then is kept.</p>}
            {(hosting.standing === "member" || hosting.standing === "keeper") && (
              <p className="small trouble" role="status">This key is in the lab as a {hosting.standing}, which can do more than advise. Nothing is written with it from here until a keeper makes it an adviser.</p>
            )}
            {hosting.standing === null && (lab.keeper ? (
              <fieldset disabled={busy} className="stack">
                <p className="small">It is not in the lab yet. Until it is, it can read and work things out, and propose nothing.</p>
                <label>Call it<input value={person} onChange={(event) => setPerson(event.target.value)} maxLength={200} aria-label="What to call the adviser" /></label>
                <button type="button" disabled={person.trim() === ""} onClick={() => void ask(() => act("addMember", { key: hosting.key, person: person.trim(), role: "adviser" }))}>Let it into the lab as an adviser</button>
              </fieldset>
            ) : <p className="small">It is not in the lab yet. Only a keeper can let it in: send them the key above, to add as an adviser.</p>)}
          </>
        )}
      </section>

      {hosting !== null && door !== undefined && (
        <section className="card">
          <h2>The way in</h2>
          <p className="small">An agent reaches the adviser's tools through a door on this computer. It is shut until you open it, it cannot be reached from the network, and whoever comes through it needs a token that is kept sealed on this device.</p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void ask(() => door.turn(!door.on))}>{door.on ? "Shut the door" : "Open the door"}</button>
            <span className={door.on ? "small good" : "dim small"} role="status">{door.on ? "Open, on this computer only." : "Shut. Nothing can reach the adviser."}</span>
          </div>
          {door.on && door.url !== null && (
            <>
              <div className="keybox">
                <div><span className="label">Where it is</span></div>
                <code className="wrap">{door.url}</code>
              </div>
              <div className="row">
                <button type="button" className="quiet" disabled={busy} onClick={() => void ask(async () => { await door.copy(); setCopied(true); setTimeout(() => setCopied(false), 2500); })}>
                  {copied ? "Copied" : "Copy the command that connects Claude Code"}
                </button>
                {door.renew !== undefined && <button type="button" className="quiet" disabled={busy} onClick={() => void ask(() => door.renew!())}>Make a new token</button>}
              </div>
              <p className="dim small">The command carries the token, so it goes to the clipboard and is not shown here. Paste it into a terminal once. A new token shuts the door and shuts out whatever had the old one.</p>
            </>
          )}
        </section>
      )}

      {hosting !== null && (
        <section className="card">
          <h2>What it has done</h2>
          {theirs.length === 0 ? <p className="dim small">It has proposed nothing.</p> : (
            <p className="small">It has proposed {theirs.length} {theirs.length === 1 ? "run" : "runs"}: {theirs.filter((one) => one.settled === null).length} open,{" "}
              {theirs.filter((one) => one.settled !== null && one.settled.run !== null).length} carried out, {theirs.filter((one) => one.settled !== null && one.settled.run === null).length} set aside. Each is at its tool, under Proposed.</p>
          )}
          {door?.seen !== undefined && door.seen.length > 0 && (
            <table>
              <thead><tr><th>When</th><th>It</th><th /></tr></thead>
              <tbody>
                {[...door.seen].reverse().slice(0, 12).map((one, at) => (
                  <tr key={`${one.at} ${at}`}>
                    <td className="dim">{new Date(one.at).toLocaleTimeString()}</td>
                    <td>{adviserDid(one.tool)}</td>
                    <td>{one.ok ? "" : <span className="badge">could not</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {onWatch !== undefined && (
            <div className="row">
              <button type="button" onClick={onWatch}>Watch it work</button>
              <span className="dim small">The lab, with the view going wherever the adviser is looking.</span>
            </div>
          )}
          <p className="dim small">Everything it writes is in History under its own name, like anybody's.</p>
        </section>
      )}
    </>
  );
}

/**
 * What the adviser is doing, said over the lab while it is being watched.
 *
 * Watching is following: the view goes where the adviser last looked. A person can stop following
 * and take the controls, since what is drawn under this is the lab and its tools and not a film of them.
 *
 * @param props - `last` is the latest thing it did, if it has done anything; `following` is whether
 *   the view is going where it looks, and `onFollow` changes that; `onBack` leaves.
 */
export function AdviserStrip({ last, following, onFollow, onBack }: {
  last: AdviserSeen | null; following: boolean; onFollow: (following: boolean) => void; onBack: () => void;
}): ReactNode {
  const state = useLab();
  const hosting = state?.hosting ?? null;
  const name = state?.lab?.roster.find((one) => one.key === hosting?.key)?.person ?? "The adviser";
  return (
    <section className="card adviserstrip" aria-live="polite">
      <div className="row">
        <p>
          {last === null ? <span className="dim">{name} has not done anything yet. What it does will be shown here, where it does it.</span>
            : <><strong>{name}</strong> {adviserDid(last.tool)}{last.ok ? "" : ", and could not"} <span className="dim small">at {new Date(last.at).toLocaleTimeString()}</span></>}
        </p>
        <label className="check small"><input type="checkbox" checked={following} onChange={(event) => onFollow(event.target.checked)} /> Follow it</label>
        <button type="button" className="quiet" onClick={onBack}>Back</button>
      </div>
      {!following && <p className="dim small">You have the controls. What it does next is still listed, and the view stays where you put it.</p>}
    </section>
  );
}
