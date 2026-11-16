"use client";

/** Sharing: what other labs are shown, and the lab's web peer. */
import { useState } from "react";
import type { ItemState, PartState } from "@biolibs/bionet";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Ask, Copy } from "./parts.js";

/**
 * The parts other labs would be shown: those with a tube that has not been retired and is not empty.
 *
 * @param parts - Every part.
 * @param items - Every item.
 * @returns The parts that would be listed, in order.
 */
export function listedParts(parts: readonly PartState[], items: readonly ItemState[]): PartState[] {
  const inStock = new Set(items.filter((item) => !item.retired && item.amount > 0).map((item) => item.part));
  return parts.filter((part) => inStock.has(part.checksum));
}

/** What would be published, a button to publish it, and the peer's settings. Draws nothing until the lab has arrived. */
export function Sharing() {
  const state = useLab();
  const act = useAct();
  const [said, setSaid] = useState<string | null>(null);
  const lab = state?.lab;
  if (state === null || lab === null || lab === undefined) return null;
  const listed = listedParts(lab.parts, lab.items);
  const publish = async () => {
    setSaid("Publishing…");
    const answer = await act("publish");
    const result = answer.ok ? (answer.result as { ok: boolean; reason: string | null; parts: number }) : { ok: false, reason: answer.error, parts: 0 };
    setSaid(result.ok ? `Published: ${result.parts} ${result.parts === 1 ? "part" : "parts"}, signed by this device.` : `Not published. ${result.reason ?? ""}`);
  };
  return (
    <>
      <section className="card">
        <h2>What other labs are shown</h2>
        <p className="dim small">Only this: which parts the lab has in stock, and whether each can be asked for. Tubes, amounts and who did what stay inside the lab.</p>
        {listed.length === 0 ? <p className="dim">Nothing would be listed: no part has a tube with anything in it.</p> : (
          <table>
            <thead><tr><th>Part</th><th>Length</th><th>Other labs may ask for it</th></tr></thead>
            <tbody>{listed.map((part) => <tr key={part.checksum}><td>{part.name}</td><td>{part.length} bp</td><td>{part.offered ? "yes" : "no"}</td></tr>)}</tbody>
          </table>
        )}
        <div className="row">
          <button type="button" onClick={() => void publish()} disabled={state.peer.url === null}>Publish this</button>
          {said !== null && <span className="small">{said}</span>}
        </div>
        <p className="dim small">
          {state.peer.origin === null ? "Set the lab's web peer below to have somewhere to publish." : <>Published at <code>{state.peer.origin}/.well-known/bionet.json</code>, signed by this device's key.</>}
          {state.published !== null && <> Last published from this device {new Date(state.published).toLocaleString()}.</>}
        </p>
      </section>
      <section className="card">
        <h2>The lab's web peer</h2>
        <p className="dim small">A server at the lab's address that holds a copy of the lab and passes changes between members who are never online together. It has no key, so it cannot change anything.</p>
        <Ask onAsk={(data) => act("setPeer", String(data.get("peer") ?? ""))} className="row">
          <input name="peer" placeholder="wss://your-lab.example/sync" defaultValue={state.peer.url ?? ""} spellCheck={false} />
          <button type="submit" className="quiet">Use this peer</button>
        </Ask>
        {state.peer.problem !== null && <p className="note">{state.peer.problem}</p>}
        <div className="keybox">
          <div><span className="label">This lab's ID</span>{lab.id !== null && <Copy words={lab.id} label="Copy ID" />}</div>
          <code className="wrap">{lab.id}</code>
          <p className="dim small">Whoever runs the lab's peer sets this as <code>BIONET_LAB</code>, so that it serves this lab and no other.</p>
        </div>
      </section>
    </>
  );
}
