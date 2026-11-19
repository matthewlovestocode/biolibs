"use client";

/**
 * Every open proposal, read as one piece of work rather than as a pile of cards.
 *
 * The tools each show the proposals for their own machine, which is right when somebody is standing
 * at that machine. It is no use at all for seeing where a build has got to: eleven proposals spread
 * over four tabs, in the order they happened to be made, with nothing saying which comes first or
 * what is waiting on what. This is the other view — the whole of it, in order, in chains.
 *
 * It asserts nothing. Everything here comes from `planOfWork`, which works the order out from what
 * each proposal makes and what each one needs, so what is drawn cannot drift from what is true.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { FILED_UNDER, UNFILED, planOfWork, saysWork, type Project, type Step } from "./ordering.js";
import { protocolText, protocolsFor } from "./protocol.js";
import { checkRoute, routeOf, saysRoute } from "./route.js";

/** What a step is called, by what kind of run it is. */
const CALLED: Readonly<Record<string, string>> = {
  pcr: "Copy it", digest: "Cut it", ligation: "Join it", assembly: "Build the ring",
  transformation: "Put it into a host", induction: "Grow it and look for the protein",
};

/**
 * The lab's open proposals as one piece of work: in order, in chains, with what can start now.
 *
 * @param props - `onOpen`, if given, offers a way to go to the tool that would carry a step out,
 *   and is handed the proposal.
 *
 * @example
 * ```tsx
 * import { WorkToDo } from "@biolibs/bionet-tools";
 *
 * <WorkToDo onOpen={(plan) => goToTool(plan.kind)} />
 * ```
 */
export function WorkToDo({ onOpen }: { onOpen?: (plan: Step["plan"]) => void } = {}) {
  const lab = useLab()?.lab;
  const act = useAct();
  // Which project is being looked at, or null for all of them at once.
  const [only, setOnly] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);
  const [into, setInto] = useState("");
  // Writing the method out, and taking one somebody else wrote.
  const [method, setMethod] = useState<string | null>(null);
  // The sheet to carry to a bench, which is a different thing from the method: one is for another
  // lab's software to read, the other for a person standing up with gloves on.
  const [sheet, setSheet] = useState<string | null>(null);
  const [taking, setTaking] = useState("");
  const [told, setTold] = useState<string | null>(null);
  // Which expectation is being answered, and what the person says they saw.
  // Which step's note is open in full. A note is one field doing several jobs — what the step is
  // for, and every correction since — so the first sentence is shown and the rest is asked for.
  const [reading, setReading] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [saw, setSaw] = useState("");
  // Whether each step's route has one answer. Putting a plan's pieces back together every way round
  // costs tens of milliseconds, so it is worked out once per plan and kept until that plan's product
  // or its enzymes change.
  const open = lab?.plans.filter((one) => one.settled === null) ?? [];
  const routes = useMemo(
    () => new Map(open.flatMap((plan) => {
      const enzymes = routeOf(plan);
      const design = plan.expects[0];
      return enzymes.length === 0 || design === undefined ? [] : [[plan.plan, checkRoute(design, enzymes)] as const];
    })),
    [open.map((plan) => `${plan.plan}:${plan.expects[0]?.checksum ?? ""}:${String(plan.settings["cut_with"] ?? "")}`).join("|")],
  );
  if (lab === null || lab === undefined) return null;
  const whole = planOfWork(lab);
  const shown: Project | undefined = only === null ? undefined : whole.projects.find((one) => one.name === only);
  // Looking at one project shows its chains and its steps, and nothing of anybody else's.
  const work = shown === undefined ? whole : (() => {
    const mine = new Set(shown.order.map((one) => one.plan.plan));
    return {
      ...whole, threads: shown.threads, order: shown.order, ready: shown.ready,
      held: shown.order.filter((one) => one.held !== null),
      // What to get first is this project's, not the lab's: showing another project's missing part
      // here would have somebody ordering something their own work does not need.
      toGet: whole.toGet.flatMap((one) => {
        const forSteps = one.forSteps.filter((each) => mine.has(each));
        return forSteps.length === 0 ? [] : [{ ...one, forSteps }];
      }),
      tangled: whole.tangled.filter((one) => mine.has(one)),
    };
  })();
  const said = saysWork(whole);
  /** Tubes the lab holds and cannot name. Nothing here matches them to anything: only a read can. */
  const unread = (lab?.specimens ?? []).filter((one) => one.is === null).length;
  const projects = whole.projects;
  const filedAs = (plan: Step["plan"]): string => {
    const says = plan.fields[FILED_UNDER];
    return typeof says === "string" && says.trim() !== "" ? says.trim() : UNFILED;
  };
  const asASheet = (): void => {
    const sheets = protocolsFor(lab, { ...(only === null || only === UNFILED ? {} : { project: only }) });
    setSheet(sheets.length === 0 ? null : sheets.map(protocolText).join("\n\n---\n\n"));
  };
  const writeOut = async (): Promise<void> => {
    const answer = await act("publishMethod", { ...(only === null ? {} : { project: only }) });
    setTold(answer.ok ? null : answer.error);
    setMethod(answer.ok ? JSON.stringify(answer.result, null, 2) : null);
  };
  const take = async (): Promise<void> => {
    const answer = await act("takeMethod", { method: taking, ...(only === null || only === UNFILED ? {} : { project: only }) });
    if (!answer.ok) { setTold(answer.error); return; }
    const got = answer.result as { proposed: string[]; missing: { name: string }[]; alive: { name: string }[] };
    setTaking("");
    setTold(`${got.proposed.length} ${got.proposed.length === 1 ? "step is" : "steps are"} proposed here.`
      + (got.missing.length === 0 ? "" : ` ${got.missing.map((one) => one.name).join(" and ")} has to be got first.`)
      + (got.alive.length === 0 ? "" : ` ${got.alive.map((one) => one.name).join(" and ")} is alive and cannot be sent: make your own.`));
  };
  const file = async (plan: string, name: string): Promise<void> => {
    await act("setField", { on: "plan", id: plan, field: FILED_UNDER, value: name.trim() === "" ? null : name.trim() });
    setFiling(null); setInto("");
  };
  /**
   * Say what was seen of an expectation. Whether it matches is the person's call, so the two buttons
   * say what they saw and not whether the step passed: a reading that was not expected is a result.
   */
  const met = async (expectation: string, matched: boolean): Promise<void> => {
    const numbers = saw.split(/[^0-9]+/).filter((one) => one !== "").map(Number).slice(0, 40);
    await act("meet", { expect: expectation, met: matched, saw: numbers });
    setAnswering(null); setSaw("");
  };
  /** A note's first sentence, which is what a step is for; the rest is history and is asked for. */
  const opening = (note: string): { first: string; rest: boolean } => {
    const end = /[.!?](\s|$)/.exec(note.slice(0, 400));
    if (end === null) return { first: note.slice(0, 220), rest: note.length > 220 };
    const first = note.slice(0, end.index + 1);
    return { first, rest: note.trim().length > first.trim().length };
  };
  const person = (key: string): string => lab.roster.find((one) => one.key === key)?.person ?? "a device";
  const partName = (checksum: string | undefined): string => lab.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  /** A thing nobody has made, named so that it does not read as something the freezer holds. */
  const prospectName = (id: string | undefined): string => {
    const one = (lab.prospects ?? []).find((each) => each.prospect === id);
    if (one === undefined) return "something not made yet";
    return one.became === null ? `${one.name}, which nobody has made yet` : one.name;
  };
  const tubeName = (item: string | undefined): string => {
    const held = lab.items.find((one) => one.item === item);
    if (held === undefined) return "a tube";
    return held.part === null ? lab.strains.find((one) => one.strain === held.strain)?.name ?? "a culture" : partName(held.part);
  };
  const stepName = (plan: Step["plan"]): string => CALLED[plan.kind] ?? plan.kind;
  /**
   * Where a step sits in its own piece of work.
   *
   * Counted inside the chain and not across the whole lot, which is safe because a chain is every
   * step joined to every other by what they make and need: a step can only ever wait on one in the
   * same chain. Numbering across all of them would make the numbers in one card jump wherever
   * another chain's steps fell between, for no gain.
   */
  const at = (id: string): number => {
    const thread = work.threads.find((one) => one.steps.some((step) => step.plan.plan === id));
    return (thread?.steps.findIndex((step) => step.plan.plan === id) ?? 0) + 1;
  };

  const why = (step: Step): ReactNode => {
    if (step.held === null) return <span className="good">could be done now</span>;
    if (step.held.why === "a step before it") {
      return <>waiting on {step.held.steps.map((one) => `step ${at(one)}`).join(" and ")}</>;
    }
    if (step.held.why === "something nobody is making") {
      // The names are on the line below, under what it uses. Saying them twice reads as two
      // different problems, so this says only that there is one.
      const many = step.held.parts.length !== 1;
      return <span className="attention">{many ? `${step.held.parts.length} of the things it uses have` : "something it uses has"} to be ordered or made first</span>;
    }
    return <span className="attention">{step.held.tubes.map(tubeName).join(" and ")} has been retired or run short</span>;
  };

  /**
   * Giving the work to somebody else, and taking somebody's.
   *
   * Shown whether or not this lab has any work of its own, because a lab taking a method for the
   * first time has none — which is exactly the lab that needs this, and the one that would have
   * found nothing here if it were only drawn beside work that already existed.
   */
  const crossing = (
    <section className="card">
      <h2>Giving it to somebody else</h2>
      <p className="small"><Glossed text="A method is this plan written so another lab can carry it out: every tube replaced by the checksum of what is in it, which is the one name two labs that have never spoken already agree on." /></p>
      <p className="dim small">
        Two things cannot be sent, and it says so rather than pretending. Anything alive: a strain is this lab&rsquo;s own, so whoever follows it makes their own.
        And a starting molecule&rsquo;s sequence, if a keeper chose not to publish it — then it says which molecules are needed and not what they are.
      </p>
      {work.order.length > 0 && (
        <div className="row tight">
          <button type="button" onClick={() => void writeOut()}>Write {only === null ? "it all" : only} out</button>
          {method !== null && <button type="button" className="quiet" onClick={() => setMethod(null)}>Hide it</button>}
        </div>
      )}
      {method !== null && <textarea className="method" value={method} readOnly rows={12} aria-label="The method, to give to somebody" onFocus={(event) => event.currentTarget.select()} />}
      <p className="voice">Taking one</p>
      <form className="stack" onSubmit={(event) => { event.preventDefault(); void take(); }}>
        <label>A method somebody published
          <textarea value={taking} onChange={(event) => setTaking(event.target.value)} rows={4} spellCheck={false}
                    placeholder="Paste it here" aria-label="A method to take" />
        </label>
        <div className="row"><button type="submit" disabled={taking.trim() === ""}>Propose its steps here</button></div>
      </form>
      <p className="dim small">Nothing is used and nothing is recorded as done: what lands is proposals, as if somebody here had made them. A molecule it needs that this lab has never heard of is said rather than guessed at.</p>
      {told !== null && <p className="small" role="status">{told}</p>}
    </section>
  );

  if (work.order.length === 0 && work.tangled.length === 0) {
    return (
      <div className="bionet work">
        <section className="card">
          <h2>The work</h2>
          <p className="empty">Nothing is proposed here. A proposal is a run somebody could carry out, and a lab member or its adviser makes one at the tool that would do it. Several together are read as one piece of work.</p>
        </section>
        {work.order.length > 0 && (
        <section className="card">
          <h2>Taking it to the bench</h2>
          <p className="small">The same work as a sheet to print or carry: what to fetch, what to set a machine to, what to do, and what to record afterwards.</p>
          <p className="dim small">
            Every number on it — a volume, a temperature, a time — is one somebody set or one the lab&rsquo;s own tools worked out.
            Nothing is filled in to make it look finished: what a plan does not say is listed under each step instead, so the hole is found standing at a bench and not halfway through.
          </p>
          <div className="row tight">
            <button type="button" onClick={asASheet}>Write {only === null ? "it all" : only} as a protocol</button>
            {sheet !== null && <button type="button" className="quiet" onClick={() => setSheet(null)}>Hide it</button>}
          </div>
          {sheet !== null && <textarea className="method sheet" value={sheet} readOnly rows={18} aria-label="The protocol, to print or carry" onFocus={(event) => event.currentTarget.select()} />}
        </section>
      )}

      {crossing}
      </div>
    );
  }

  return (
    <div className="bionet work">
      <section className="card">
        <h2>The work</h2>
        <p className="small"><Glossed text="Each step is a proposed run: nothing has been used and nothing is recorded as done until somebody carries it out and says so." /></p>
        {said.map((one) => <p key={one} className="small">{one}</p>)}
        {/* The lab may already hold what it is missing, without knowing it does. The panel says so
            and stops there: which tube is which is not something a name or a size can decide, and
            guessing would put a wrong molecule into a plan that then looks perfectly sound. */}
        {whole.toGet.length > 0 && unread > 0 && (
          <p className="small attention">
            {unread === 1
              ? <>One tube is being held unidentified. It may be something on that list &#8212; sequencing it is the only way to know.</>
              : <>{unread} tubes are being held unidentified. One of them may be something on that list &#8212; sequencing them is the only way to know.</>}
          </p>
        )}
        {projects.length > 1 && (
          <div className="row tight pick" role="tablist" aria-label="Projects">
            <button type="button" role="tab" aria-selected={only === null} className={only === null ? "" : "quiet"} onClick={() => setOnly(null)}>Everything</button>
            {projects.map((one) => (
              <button key={one.name} type="button" role="tab" aria-selected={only === one.name} className={only === one.name ? "" : "quiet"} onClick={() => setOnly(one.name)}>
                {one.name}{one.ready.length > 0 ? ` · ${one.ready.length} ready` : ""}
              </button>
            ))}
          </div>
        )}
        <p className="dim small">
          Nothing here was declared. A proposal says what it expects to make and what it needs, and where one expects what another needs, the first has to happen first.
          What a transformation makes is alive and has no checksum, so it is named as a prospect — a thing the lab means to have and has not made — and the step after it points at that.
        </p>
      </section>

      {work.order.length > 0 && (
        <section className="card">
          <h2>Taking it to the bench</h2>
          <p className="small">The same work as a sheet to print or carry: what to fetch, what to set a machine to, what to do, and what to record afterwards.</p>
          <p className="dim small">
            Every number on it — a volume, a temperature, a time — is one somebody set or one the lab&rsquo;s own tools worked out.
            Nothing is filled in to make it look finished: what a plan does not say is listed under each step instead, so the hole is found standing at a bench and not halfway through.
          </p>
          <div className="row tight">
            <button type="button" onClick={asASheet}>Write {only === null ? "it all" : only} as a protocol</button>
            {sheet !== null && <button type="button" className="quiet" onClick={() => setSheet(null)}>Hide it</button>}
          </div>
          {sheet !== null && <textarea className="method sheet" value={sheet} readOnly rows={18} aria-label="The protocol, to print or carry" onFocus={(event) => event.currentTarget.select()} />}
        </section>
      )}

      {crossing}

      {work.toGet.length > 0 && (
        <section className="card">
          <h2>To get first</h2>
          <p className="small">Nothing proposed makes {work.toGet.length === 1 ? "this" : "these"}, and the lab has no tube of {work.toGet.length === 1 ? "it" : "them"}. Until {work.toGet.length === 1 ? "it arrives" : "they arrive"} the steps that need {work.toGet.length === 1 ? "it" : "them"} cannot start.</p>
          <table>
            <thead><tr><th>What</th><th>For</th></tr></thead>
            <tbody>
              {work.toGet.map((one) => (
                <tr key={one.checksum}>
                  <td>{partName(one.checksum) === "a part" ? one.name : partName(one.checksum)} <code>{one.checksum.slice(0, 12)}</code></td>
                  <td className="dim">{[...new Set(one.forSteps.map((each) => {
                    const thread = work.threads.find((who) => who.steps.some((step) => step.plan.plan === each));
                    return `step ${at(each)} of ${thread?.name ?? "the work"}`;
                  }))].join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {work.threads.map((thread) => (
        <section className="card" key={thread.name + thread.steps[0]!.plan.plan}>
          <div className="toolhead">
            <h2>{thread.name}</h2>
            <span className="dim small">
              {[...new Set(thread.steps.map((one) => filedAs(one.plan)))].join(", ")} · {thread.steps.length} {thread.steps.length === 1 ? "step" : "steps"}
            </span>
          </div>
          {!thread.clear && <p className="small attention">Something in this one has to be dealt with before it can be finished.</p>}
          <ol className="steps">
            {thread.steps.map((step) => {
              const checked = routes.get(step.plan.plan);
              const aboutRoute = checked === undefined ? null : saysRoute(checked);
              return (
              <li key={step.plan.plan} className={step.held === null ? "ready" : "held"}>
                <p className="small">
                  <strong>{at(step.plan.plan)}. {stepName(step.plan)}</strong>
                  <span className="dim"> · {step.plan.kind}</span>
                  {" — "}{why(step)}
                </p>
                <p className="dim small">
                  Uses {step.plan.inputs.map((one) => `${one.prospect !== undefined ? prospectName(one.prospect) : one.item === undefined ? partName(one.part) : tubeName(one.item)} as ${one.role}`).join(", ") || "nothing the lab holds"}
                  {step.plan.expects.length > 0 && <>, making {step.plan.expects.map((one) => `${one.name} (${one.length.toLocaleString("en-US")} bp${one.circular ? ", circular" : ""})`).join(" and ")}</>}
                  {/* What it brings into existence that has no sequence: a strain, a culture, a curd.
                      Said plainly, because a step that says it makes nothing nameable reads as a dead
                      end, and this one is not — the step after it points at exactly this. */}
                  {step.plan.expects.length === 0 && (step.plan.makes ?? []).length > 0 && (
                    <>, bringing {(step.plan.makes ?? []).map(prospectName).join(" and ")} into existence</>
                  )}
                  {step.plan.expects.length === 0 && (step.plan.makes ?? []).length === 0 && (step.plan.kind === "transformation"
                    ? <>, making nothing the lab can name: what comes of it is alive</>
                    : <>, making nothing it has declared</>)}
                  . Proposed by {person(step.plan.by)}.
                </p>
                {step.plan.note !== null && (reading === step.plan.plan || !opening(step.plan.note).rest
                  ? <p className="small why">{step.plan.note}{opening(step.plan.note).rest && <> <button type="button" className="quiet" onClick={() => setReading(null)}>Less</button></>}</p>
                  : <p className="small why">{opening(step.plan.note).first} <button type="button" className="quiet" onClick={() => setReading(step.plan.plan)}>More</button></p>)}
                {step.plan.replaces !== null && (
                  <p className="dim small">Filed in place of an earlier plan: {step.plan.replaces.why}</p>
                )}
                {(lab.expectations ?? []).filter((one) => one.plan === step.plan.plan)
                  // One taken back is not shown as something to look for. It is still in the log,
                  // where somebody reading the history will find it, and the field is read too for
                  // the ones marked that way before there was a change that could take one back.
                  .filter((one) => one.withdrawn === null && (one.fields["superseded"] ?? null) === null)
                  .map((one) => (
                  <div key={one.expect} className="small expectation">
                    <p>
                      <strong>Expect</strong> · {one.kind} — {one.says}
                      {one.numbers.length > 0 && <span className="dim"> · {one.numbers.map((n) => n.toLocaleString("en-US")).join(", ")}</span>}
                    </p>
                    {one.met === null
                      ? (answering === one.expect
                          ? (
                            <form className="row tight" onSubmit={(event) => { event.preventDefault(); void met(one.expect, true); }}>
                              <input value={saw} onChange={(event) => setSaw(event.target.value)} maxLength={200}
                                     placeholder="What was seen, as numbers" aria-label="What was seen, as numbers" />
                              <button type="submit">That is what I saw</button>
                              <button type="button" className="quiet" onClick={() => void met(one.expect, false)}>I saw something else</button>
                            </form>
                          )
                          : <p className="dim">Nobody has looked yet. <button type="button" className="quiet" onClick={() => { setAnswering(one.expect); setSaw(""); }}>Say what was seen</button></p>)
                      : (
                        <p className={one.met.met ? "good" : "attention"}>
                          {person(one.met.by)} saw {one.met.saw.length > 0 ? one.met.saw.map((n) => n.toLocaleString("en-US")).join(", ") : "it"}
                          {one.met.met ? ", which is what was expected." : ", which is not what was expected."}
                          {one.met.note !== null && <> {one.met.note}</>}
                        </p>
                      )}
                  </div>
                ))}
                {step.plan.orphaned.length > 0 && <p className="small attention">Nothing is going to make {step.plan.orphaned.map(partName).join(" or ")} any more: the only plan that would have has been set aside. If it was refiled, this step is still asking for what the old plan would have made.</p>}
                {aboutRoute !== null && <p className="small attention">{aboutRoute}</p>}
                <div className="row tight">
                  {onOpen !== undefined && step.held === null && <button type="button" onClick={() => onOpen(step.plan)}>Set it up</button>}
                  <button type="button" className="quiet" onClick={() => { setFiling(filing === step.plan.plan ? null : step.plan.plan); setInto(filedAs(step.plan) === UNFILED ? "" : filedAs(step.plan)); }}>
                    {filedAs(step.plan) === UNFILED ? "File it under…" : "Move it…"}
                  </button>
                  <button type="button" className="quiet" onClick={() => void act("settlePlan", { plan: step.plan.plan })}>Set it aside</button>
                </div>
                {filing === step.plan.plan && (
                  <form className="row tight" onSubmit={(event) => { event.preventDefault(); void file(step.plan.plan, into); }}>
                    <input value={into} onChange={(event) => setInto(event.target.value)} maxLength={200} list="bionet-projects"
                           placeholder="Which project" aria-label="Which project to file it under" />
                    <datalist id="bionet-projects">{projects.filter((one) => one.filed).map((one) => <option key={one.name} value={one.name} />)}</datalist>
                    <button type="submit">{into.trim() === "" ? "Take it out" : "File it"}</button>
                  </form>
                )}
              </li>
              );
            })}
          </ol>
          {thread.ends.length > 0 && (
            <p className="dim small">It ends with {thread.ends.map((one) => partName(one.checksum) === "a part" ? one.name : partName(one.checksum)).join(" and ")}.</p>
          )}
        </section>
      ))}

      {work.tangled.length > 0 && (
        <section className="card">
          <h2>Cannot be ordered</h2>
          <p className="small trouble">{work.tangled.length} {work.tangled.length === 1 ? "proposal depends" : "proposals depend"} on each other in a circle, so there is no order to carry them out in. Set one aside and propose it again.</p>
          <ul className="checks">
            {work.tangled.map((one) => {
              const plan = lab.plans.find((each) => each.plan === one)!;
              return <li key={one} className="stop">{stepName(plan)} · {plan.kind} · proposed by {person(plan.by)}</li>;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
