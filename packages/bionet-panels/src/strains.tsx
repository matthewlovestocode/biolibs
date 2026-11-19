"use client";

/**
 * The strains: what the lab keeps alive, and the cultures of each.
 *
 * A part is known by its sequence, so two labs that made the same molecule agree without ever
 * having spoken. A strain is not like that and this panel says so where a person can read it: a
 * strain is this lab's, made here from something, and the same plasmid put into the same published
 * host twice is two strains. That is why one is added by hand rather than worked out.
 */
import { useState } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "./freezer.js";
import { Ask } from "./parts.js";
import { PutItem } from "./places.js";

/** What a run that made a strain is called, for the lab's record. */
export const TRANSFORMATION = "transformation";

/**
 * Every strain, its cultures, and what has been proposed for one. Draws nothing until the lab has
 * arrived.
 */
export function Strains() {
  const state = useLab();
  const act = useAct();
  const [busy, setBusy] = useState(false);
  const lab = state?.lab;
  if (state === null || lab === null || lab === undefined) return null;
  const carried = (checksums: readonly string[]): string =>
    checksums.map((one) => lab.parts.find((part) => part.checksum === one)?.name ?? "a part the lab no longer lists").join(", ");
  const person = (key: string): string => lab.roster.find((one) => one.key === key)?.person ?? "a device";
  const tubeName = (item: string): string => {
    const held = lab.items.find((one) => one.item === item);
    if (held === undefined) return "a tube";
    return held.part === null ? lab.strains.find((one) => one.strain === held.strain)?.name ?? "a culture"
                              : lab.parts.find((one) => one.checksum === held.part)?.name ?? "a part";
  };
  /** The proposals for a transformation, which have no bench of their own to be shown at. */
  const proposed = lab.plans.filter((one) => one.settled === null && one.kind === TRANSFORMATION);
  /** A transformation that was done and that no strain yet says it came out of. */
  const awaiting = lab.runs.filter((one) => one.kind === TRANSFORMATION && one.outcome === "worked" && !lab.strains.some((each) => each.from === one.run));
  /** What a run put in, and into what: the two things a strain made by it would carry and come from. */
  const outOf = (run: (typeof lab.runs)[number]): { carries: string[]; parent: string | null; host: string } => {
    const held = (role: string) => lab.items.find((one) => one.item === run.inputs.find((each) => each.role === role)?.item);
    const construct = held("construct");
    const into = held("host");
    const parent = into?.strain ?? null;
    return { carries: construct?.part === null || construct?.part === undefined ? [] : [construct.part],
             parent, host: lab.strains.find((one) => one.strain === parent)?.host ?? "" };
  };
  const ask = async (work: () => Promise<unknown>): Promise<void> => { setBusy(true); try { await work(); } finally { setBusy(false); } };
  /** Record a proposed transformation as done, one way or the other, and settle the proposal with it. */
  const done = (plan: (typeof lab.plans)[number], outcome: "worked" | "failed"): Promise<unknown> =>
    act("recordRun", {
      kind: TRANSFORMATION, plan: plan.plan, outcome, note: plan.note,
      inputs: plan.inputs.flatMap((one) => (one.item === undefined ? [] : [{ item: one.item, amount: one.amount, role: one.role }])),
    });

  return (
    <>
      {proposed.length > 0 && (
        <section className="card proposed">
          <h2>Proposed</h2>
          <p className="dim small">A transformation is not run at a machine, so what is proposed for one is shown here. Carrying it out is yours. Whether it worked is whether anything grew, which only you can say; either way it used what it used.</p>
          {proposed.map((plan) => (
            <article key={plan.plan} className="plan">
              <p className="small"><strong>{person(plan.by)}</strong> proposes {plan.inputs.map((one) => `${one.item === undefined ? carried([one.part!]) : tubeName(one.item)} as ${one.role}`).join(", ")}.</p>
              {plan.note !== null && <p className="small why">{plan.note}</p>}
              {plan.wanting.length > 0 && <p className="small attention">Since this was proposed, {plan.wanting.map(tubeName).join(" and ")} has been retired or run short.</p>}
              {plan.orphaned.length > 0 && <p className="small attention">Nothing is going to make {plan.orphaned.map((one) => carried([one])).join(" or ")} any more: the only plan that would have has been set aside. If it was refiled, this one is still asking for what the old plan would have made.</p>}
              <div className="row tight">
                {/* A transformation makes no molecule, so whether it worked is not something the
                    record can tell from what came out: it is whether anything grew, and only a
                    person knows that. Both answers take what it used, because it was done either way. */}
                <button type="button" disabled={busy} onClick={() => void ask(() => done(plan, "worked"))}>Colonies grew</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => void ask(() => done(plan, "failed"))}>Nothing grew</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => void ask(() => act("settlePlan", { plan: plan.plan }))}>Set it aside</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {awaiting.map((run) => {
        const { carries, parent, host } = outOf(run);
        return (
          <section className="card" key={run.run}>
            <h2>What came of it</h2>
            <p className="small">A transformation was recorded{carries.length === 0 ? "" : <> with {carried(carries)}</>}{parent === null ? "" : <> into {lab.strains.find((one) => one.strain === parent)!.name}</>}, and nothing yet says what strain came out of it. Name it once you have colonies.</p>
            <Ask onAsk={(data) => act("addStrain", {
              name: String(data.get("name") ?? ""), host: String(data.get("host") ?? ""), carries, parent, from: run.run,
            })} className="stack">
              <label>Call it<input name="name" required maxLength={200} defaultValue={`${lab.strains.find((one) => one.strain === parent)?.name ?? "a host"} ${carried(carries) || "transformant"}`} /></label>
              <label>What it is<input name="host" required maxLength={200} defaultValue={host} /></label>
              <button type="submit">That is what came of it</button>
            </Ask>
            <p className="dim small">It will say it came from this run and from {parent === null ? "nothing the lab keeps" : lab.strains.find((one) => one.strain === parent)!.name}, so the whole way back is in the record.</p>
          </section>
        );
      })}

      {lab.strains.length === 0 ? <p className="empty">The lab keeps no strains yet. A strain is an organism with something put into it, and it is named here rather than worked out: two labs that put the same plasmid into the same host have two strains.</p> : (
        lab.strains.map((strain) => {
          const cultures = lab.items.filter((one) => one.strain === strain.strain && !one.retired);
          const parent = lab.strains.find((one) => one.strain === strain.parent);
          const run = lab.runs.find((one) => one.run === strain.from);
          return (
            <section className="card" key={strain.strain}>
              <div className="toolhead">
                <h2>{strain.name}</h2>
                <span className="dim small">{strain.host}</span>
              </div>
              <p className="small">
                {strain.carries.length === 0 ? <span className="dim">Nothing has been put into it.</span> : <>Carries {carried(strain.carries)}.</>}
                {parent !== undefined && <> Made from {parent.name}.</>}
                {run !== undefined && <> By a {run.kind} run.</>}
              </p>
              {typeof strain.fields["note"] === "string" && <p className="small why">{strain.fields["note"]}</p>}
              {cultures.length === 0 ? <p className="dim small">No cultures of it. Add one below when there is something growing.</p> : (
                <table>
                  <thead><tr><th>Culture</th><th>How much</th><th>Where</th><th /></tr></thead>
                  <tbody>
                    {cultures.map((one) => (
                      <tr key={one.item}>
                        <td><code>{one.item.slice(0, 8)}</code>{one.needsRecount && <span className="badge">needs counting</span>}</td>
                        <td>{amountOf(one)}</td>
                        <td><PutItem item={one} /></td>
                        <td><button type="button" className="plain" onClick={() => void act("retire", { item: one.item })}>retire</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Ask onAsk={(data) => act("addItem", { strain: strain.strain, amount: Number(String(data.get("amount") ?? "")), unit: String(data.get("unit") ?? "") })} className="row">
                <label>Add a culture<input name="amount" type="number" min={0} step={1} defaultValue={5} required aria-label="How much" /></label>
                <label>of<input name="unit" defaultValue="mL" maxLength={20} aria-label="Unit" /></label>
                <button type="submit">Add</button>
              </Ask>
            </section>
          );
        })
      )}

      <section className="card">
        <h2>Add a strain</h2>
        <p className="dim small">What organism it is, and what has been put into it. Adding one grows nothing: add a culture of it once there is something in a flask.</p>
        <Ask onAsk={(data) => act("addStrain", {
          name: String(data.get("name") ?? ""), host: String(data.get("host") ?? ""),
          carries: data.getAll("carries").map(String).filter((one) => one !== ""),
          parent: String(data.get("parent") ?? "") === "" ? null : String(data.get("parent")),
        })} className="stack">
          <label>Call it<input name="name" required maxLength={200} placeholder="W303 pWren1-1" /></label>
          <label>What it is<input name="host" required maxLength={200} placeholder="Saccharomyces cerevisiae W303" /></label>
          <label>It carries
            <select name="carries" multiple size={Math.min(5, Math.max(2, lab.parts.length))} aria-label="What it carries">
              {lab.parts.map((one) => <option key={one.checksum} value={one.checksum}>{one.name}</option>)}
            </select>
          </label>
          <label>Made from
            <select name="parent" aria-label="The strain it was made from">
              <option value="">nothing the lab keeps</option>
              {lab.strains.map((one) => <option key={one.strain} value={one.strain}>{one.name}</option>)}
            </select>
          </label>
          <button type="submit">Add the strain</button>
        </Ask>
      </section>
    </>
  );
}
