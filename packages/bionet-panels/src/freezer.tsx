"use client";

/** The freezer: every part, its tubes, and what can be done to them. */
import type { ItemState, PartState } from "@biolibs/bionet";
import type { LabView } from "@biolibs/bionet-client";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Ask } from "./parts.js";
import { PutItem } from "./places.js";

const whole = (data: FormData, name: string): number => Number(String(data.get(name) ?? "").trim());

/**
 * How much of an item there is, with its unit.
 *
 * @param item - The item.
 * @returns Something like `7 µL`.
 */
export const amountOf = (item: Pick<ItemState, "amount" | "unit">): string => `${item.amount}${item.unit === null ? "" : ` ${item.unit}`}`;

/**
 * Where a tube came from, if a run made it.
 *
 * @param item - The tube.
 * @param lab - The lab's runs, items and parts.
 * @returns Something like `made by a PCR from pWren-402, fwd-1 and rev-1`, or `null` for a tube
 *   that was simply added.
 */
export function madeFrom(item: Pick<ItemState, "from">, lab: Pick<LabView, "runs" | "items" | "parts">): string | null {
  const run = item.from === null ? undefined : lab.runs.find((one) => one.run === item.from);
  if (run === undefined) return null;
  const names = run.inputs.map((input) => {
    const tube = lab.items.find((one) => one.item === input.item);
    return lab.parts.find((part) => part.checksum === tube?.part)?.name ?? "a tube";
  });
  const from = names.length === 0 ? "" : ` from ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`}`;
  return `made by ${run.kind === "pcr" ? "a PCR" : `a ${run.kind} run`}${from}`;
}

/** Every part with its tubes, and a form to add a part. Draws nothing until the lab has arrived. */
export function Freezer() {
  const lab = useLab()?.lab;
  const act = useAct();
  if (lab === null || lab === undefined) return null;
  return (
    <>
      {lab.parts.length === 0 && <p className="empty">Nothing in the freezer yet. Add the first part below.</p>}
      {lab.parts.map((part) => <PartCard key={part.checksum} part={part} items={lab.items.filter((item) => item.part === part.checksum)} />)}
      <section className="card">
        <h2>Add a part</h2>
        <p className="dim small">A part is a molecule, known by the checksum of its sequence. Two people adding the same sequence get the same part, whatever each calls it.</p>
        <Ask onAsk={(data) => act("addPart", { name: String(data.get("name") ?? ""), sequence: String(data.get("sequence") ?? ""), circular: data.get("circular") === "on" })} className="stack">
          <label>Name<input name="name" placeholder="pUC19" required maxLength={200} /></label>
          <label>Sequence<textarea name="sequence" placeholder="GGATCACAGTCTACACTGCTCACTCC…" required rows={3} spellCheck={false} /></label>
          <label className="check"><input type="checkbox" name="circular" /> It is a circle</label>
          <button type="submit">Add part</button>
        </Ask>
      </section>
    </>
  );
}

/** One part and its tubes. */
export function PartCard({ part, items }: { part: PartState; items: ItemState[] }) {
  const act = useAct();
  const live = items.filter((item) => !item.retired);
  return (
    <section className="card part">
      <div className="parthead">
        <div>
          <h2>{part.name}</h2>
          <p className="dim small">{part.length} bp{part.circular ? " · circular" : ""} · <code>{part.checksum.slice(0, 26)}…</code></p>
        </div>
        <label className="check" title="Whether other labs are told this part can be asked for">
          <input type="checkbox" checked={part.offered} onChange={(event) => void act("offer", { part: part.checksum, available: event.target.checked })} />
          On offer to other labs
        </label>
      </div>
      {live.length === 0 ? <p className="dim small">No tubes of this.</p> : (
        <table>
          <thead><tr><th>Tube</th><th>Amount</th><th>Where</th><th>Use or add</th><th>Count</th><th /></tr></thead>
          <tbody>{live.map((item) => <ItemRow key={item.item} item={item} />)}</tbody>
        </table>
      )}
      <Ask onAsk={(data) => act("addItem", { part: part.checksum, amount: whole(data, "amount"), unit: String(data.get("unit") ?? "") })} className="row tight">
        <input name="amount" type="number" min={0} step={1} placeholder="Amount" required />
        <input name="unit" placeholder="Unit, e.g. µL" maxLength={20} />
        <button type="submit" className="quiet">Add a tube</button>
      </Ask>
    </section>
  );
}

/** One tube: how much there is, and the ways to change that. */
export function ItemRow({ item }: { item: ItemState }) {
  const act = useAct();
  const lab = useLab()?.lab;
  const origin = lab === null || lab === undefined ? null : madeFrom(item, lab);
  return (
    <tr className={item.needsRecount ? "flagged" : undefined}>
      <td>
        <code>{item.item.slice(0, 10)}…</code>
        {origin !== null && <div className="dim small origin">{origin}</div>}
      </td>
      <td>
        <strong>{amountOf(item)}</strong>
        {item.needsRecount && <span className="badge" title="The log has lost track of this tube: it went below zero, or two people counted it at once.">needs a count</span>}
      </td>
      <td><PutItem item={item} /></td>
      <td>
        <div className="row tight">
          <button type="button" className="quiet" onClick={() => void act("adjust", { item: item.item, by: -1 })}>−1</button>
          <button type="button" className="quiet" onClick={() => void act("adjust", { item: item.item, by: 1 })}>+1</button>
          <Ask onAsk={(data) => act("adjust", { item: item.item, by: whole(data, "by") })} className="row tight">
            <input name="by" type="number" step={1} placeholder="±" required className="num" aria-label="Change by" />
            <button type="submit" className="quiet">Apply</button>
          </Ask>
        </div>
      </td>
      <td>
        <Ask onAsk={(data) => act("recount", { item: item.item, amount: whole(data, "amount") })} className="row tight">
          <input name="amount" type="number" min={0} step={1} placeholder="There is" required className="num" aria-label="Amount there is" />
          <button type="submit" className="quiet">Set</button>
        </Ask>
      </td>
      <td><button type="button" className="plain" onClick={() => void act("retire", { item: item.item })}>retire</button></td>
    </tr>
  );
}
