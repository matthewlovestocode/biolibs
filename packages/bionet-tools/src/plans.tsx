"use client";

/**
 * Runs that have been proposed, at the tool that would carry them out.
 *
 * A plan is a run nobody has done: somebody, or something with no hands, saying what they would do
 * and what they expect of it. It is shown where it would be done, with who proposed it and why, and
 * a person there can set the bench up as it says, look at the working their own tools give for it,
 * and then do it or not. Nothing is taken on trust: the plan says what it expects, and the tool says
 * what it would make.
 *
 * A run is said to carry a plan out when it is of the same kind and uses exactly the tubes the plan
 * names. That is decided from what is set up, not from a button pressed earlier, so a bench that is
 * changed after being set up from a plan stops claiming to be that plan.
 */
import { useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";

/** One proposed run, as the lab holds it. */
export type Plan = NonNullable<NonNullable<ReturnType<typeof useLab>>["lab"]>["plans"][number];

/** As much of a lab as it takes to say which plan a run carries out. */
export interface PlanLab { plans: readonly Plan[] }

/**
 * A run as a tool would record it, turned into the same run proposed.
 *
 * @param run - What would be handed to `recordRun`.
 * @param note - Why it is proposed.
 * @returns What to hand to `planRun`: the same tubes and settings, and what came out as what is expected.
 *
 * @example
 * ```ts
 * import { pcrRun, toPlan } from "@biolibs/bionet-tools";
 *
 * const run = pcrRun(lab, { template, forward, reverse });
 * if (run.worked !== null) await act("planRun", toPlan(run.worked, "to check the insert is there"));
 * ```
 */
export function toPlan(run: Record<string, unknown>, note?: string): Record<string, unknown> {
  const outputs = (Array.isArray(run["outputs"]) ? run["outputs"] : []) as { sequence: string; circular?: boolean; name: string; ends?: { left: number; right: number } }[];
  const said = note?.trim() ?? "";
  return {
    kind: run["kind"], instrument: run["instrument"] ?? null, inputs: run["inputs"], settings: run["settings"] ?? {},
    expects: outputs.map((one) => ({ sequence: one.sequence, name: one.name, ...(one.circular === true ? { circular: true } : {}), ...(one.ends === undefined ? {} : { ends: one.ends }) })),
    note: said === "" ? (typeof run["note"] === "string" ? run["note"] : null) : said,
  };
}

/**
 * The open plan that a run, as it is set up, would carry out.
 *
 * @param lab - The lab.
 * @param run - What would be handed to `recordRun`, or `null` if nothing is set up.
 * @returns The plan of the same kind that names exactly the tubes the run uses and, where the plan
 *   names enzymes, the same ones; `undefined` if there is none.
 */
export function planCarried(lab: PlanLab, run: Record<string, unknown> | null): Plan | undefined {
  if (run === null) return undefined;
  const used = ((Array.isArray(run["inputs"]) ? run["inputs"] : []) as { item?: string }[]).map((one) => one.item).sort().join(" ");
  const enzymes = (run["settings"] as Record<string, unknown> | undefined)?.["enzymes"];
  return lab.plans.find((plan) => plan.settled === null && plan.kind === run["kind"] && plan.inputs.every((one) => one.item !== undefined)
    && plan.inputs.map((one) => one.item).sort().join(" ") === used && (plan.settings["enzymes"] === undefined || plan.settings["enzymes"] === enzymes));
}

/**
 * A run to record, saying which plan it carries out if it does.
 *
 * @param lab - The lab.
 * @param run - What would be handed to `recordRun`.
 * @returns The same, with the plan it carries out named, so that recording it settles the plan.
 */
export function withPlan(lab: PlanLab | null | undefined, run: Record<string, unknown>): Record<string, unknown> {
  const plan = lab === null || lab === undefined ? undefined : planCarried(lab, run);
  return plan === undefined ? run : { ...run, plan: plan.plan };
}

/**
 * The runs proposed for one kind of tool, and a way to propose the one that is set up.
 *
 * @param props - `kind` is the kind of run; `now` is the run as the tool is set up, the way it would
 *   be recorded, or `null`; `onSetUp` is told a plan to set the tool up as.
 */
export function Proposed({ kind, now, onSetUp }: { kind: string; now: Record<string, unknown> | null; onSetUp: (plan: Plan) => void }): ReactNode {
  const lab = useLab()?.lab;
  const act = useAct();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  if (lab === null || lab === undefined) return null;
  const open = lab.plans.filter((one) => one.settled === null && one.kind === kind);
  const carried = planCarried(lab, now);
  const person = (key: string): string => lab.roster.find((one) => one.key === key)?.person ?? "A device";
  const partName = (checksum: string | undefined): string => lab.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  const tubeName = (item: string | undefined): string => {
    const held = lab.items.find((one) => one.item === item);
    return held?.part === null ? lab.strains.find((one) => one.strain === held.strain)?.name ?? "a culture" : partName(held?.part);
  };
  const ask = async (action: "planRun" | "settlePlan", payload: unknown): Promise<void> => {
    setBusy(true);
    const answer = await act(action, payload);
    setBusy(false);
    setTrouble(answer.ok ? null : answer.error);
    if (answer.ok && action === "planRun") setWhy("");
  };
  if (open.length === 0 && now === null) return null;
  return (
    <section className="card proposed">
      <h2>Proposed</h2>
      {open.length === 0 && <p className="dim small">Nothing is proposed here. What is set up now can be proposed, for somebody to carry out: nothing is used and nothing is recorded as done.</p>}
      {open.map((plan) => {
        const missing = plan.inputs.filter((one) => one.item === undefined);
        return (
          <article key={plan.plan} className={plan === carried ? "plan now" : "plan"}>
            <p className="small"><strong>{person(plan.by)}</strong> proposes using {plan.inputs.map((one) => `${one.item === undefined ? partName(one.part) : tubeName(one.item)} as ${one.role}`).join(", ")}
              {plan.expects.length > 0 && <>, expecting {plan.expects.map((one) => `${one.name} (${one.length.toLocaleString("en-US")} bp${one.circular ? ", circular" : ""})`).join(" and ")}</>}.</p>
            {plan.note !== null && <p className="small why">{plan.note}</p>}
            {missing.length > 0 && <p className="small attention">There is no tube yet of {missing.map((one) => partName(one.part)).join(" or ")}. It has to be ordered or made before this can be done.</p>}
            {plan.wanting.length > 0 && <p className="small attention">Since this was proposed, {plan.wanting.map(tubeName).join(" and ")} {plan.wanting.length === 1 ? "has" : "have"} been retired or run short of what it would use.</p>}
            {plan === carried && <p className="small good">This is what is set up now. Recording the run will say this proposal was carried out.</p>}
            <div className="row tight">
              {plan !== carried && <button type="button" disabled={busy || missing.length > 0} onClick={() => onSetUp(plan)}>Set it up</button>}
              <button type="button" className="quiet" disabled={busy} onClick={() => void ask("settlePlan", { plan: plan.plan })}>Set it aside</button>
            </div>
          </article>
        );
      })}
      {now !== null && carried === undefined && (
        <fieldset disabled={busy} className="stack">
          <label>Why<input value={why} onChange={(event) => setWhy(event.target.value)} maxLength={2000} placeholder="What it is for, for whoever carries it out" aria-label="Why this run is proposed" /></label>
          <div className="row"><button type="button" className="quiet" onClick={() => void ask("planRun", toPlan(now, why))}>Propose what is set up</button></div>
        </fieldset>
      )}
      {trouble !== null && <p className="trouble small" role="alert">{trouble}</p>}
    </section>
  );
}
