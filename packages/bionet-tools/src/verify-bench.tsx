"use client";

/**
 * Checking a construct against the design, at a desk.
 *
 * Every other tool here proposes. This one confirms, and the thing it has to be careful about is
 * the opposite of theirs: not to say more than it has checked. A read covers the stretch its primer
 * reached and no more, so what it covers is said before what it found, and the rest is called
 * unchecked rather than passed.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { SequenceMap } from "./map.js";
import { checkRead, saysDifference, verifyRun, verifyWorking } from "./verify.js";
import { ShowWorking } from "./working.js";

const count = (value: number): string => value.toLocaleString("en-US");

/** What a host is handed to draw beside the panel. */
export interface VerifyDesk {
  /** The tube of the design, to look at, if the lab has one that has been put somewhere. */
  focus: { place: string; item: string } | null;
}

/**
 * Checking a read against one of the lab's parts.
 *
 * @param options - `start` says what to open on, for a tour or a link.
 * @returns `panel`, the tool itself, and `desk`, what a scene beside it should look at.
 *
 * @example
 * ```tsx
 * import { useVerifyBench } from "@biolibs/bionet-tools";
 *
 * const bench = useVerifyBench();
 * <LabView lab={lab} wide beside={bench.panel} />
 * ```
 */
export function useVerifyBench({ start }: {
  /** What to show: the design and the read. Followed whenever it changes. */
  start?: { design?: string; read?: string };
} = {}): { panel: ReactNode; desk: VerifyDesk } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [design, setDesign] = useState(start?.design ?? "");
  const [read, setRead] = useState(start?.read ?? "");
  const [primer, setPrimer] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.design !== undefined) setDesign(start.design);
    if (start.read !== undefined) setRead(start.read);
  }, [asked]);

  // A read is of DNA; a protein is not something to compare bases against.
  const dna = useMemo(() => (lab?.parts ?? []).filter((one) => one.kind !== "protein"), [lab?.parts]);
  const part = dna.find((one) => one.checksum === design);
  const checked = useMemo(() => (part === undefined || read.trim() === "" ? null : checkRead(part, read)), [part, read]);
  const working = useMemo(() => (checked === null || checked.problem !== null || part === undefined ? [] : verifyWorking(checked, part)), [checked, part]);
  const tubes = useMemo(() => (lab?.items ?? []).filter((one) => one.part === design && !one.retired), [lab?.items, design]);
  const held = tubes.find((one) => one.where !== null);
  const desk: VerifyDesk = { focus: held?.where == null ? null : { place: held.where.place, item: held.item } };

  const record = async (): Promise<void> => {
    const tube = tubes[0];
    if (checked === null || checked.problem !== null || tube === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", verifyRun(checked, { tube: tube.item, primer }));
    setBusy(false);
    setSaid(answer.ok ? `Recorded: the check is in the lab's history, and ${checked.matches ? "it matched" : "it did not match"}.` : answer.error);
  };

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet verify">
      <section className="card">
        <h2>Check a construct</h2>
        <p className="small"><Glossed text="Sequencing reads the bases of a piece of DNA, one read covering a few hundred bases from where its primer sat." /></p>
        <p className="dim small">Paste what came back from the facility and it is compared with the design, base by base. Either strand will do. What the read does not reach is not checked, and is said so rather than passed.</p>
        {dna.length === 0 ? <p className="empty">The lab has no DNA to check against.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>It was supposed to be
              <select value={design} onChange={(event) => { setDesign(event.target.value); setSaid(null); }} aria-label="The design">
                <option value="">Choose a part…</option>
                {dna.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length)} bp</option>)}
              </select>
            </label>
            <label>The read
              <textarea value={read} onChange={(event) => { setRead(event.target.value); setSaid(null); }} rows={5} spellCheck={false}
                        placeholder="Paste the bases that came back" aria-label="The read" />
            </label>
            <label>Read from which primer<input value={primer} onChange={(event) => setPrimer(event.target.value)} maxLength={200} placeholder="optional" aria-label="The primer it was read from" /></label>
          </fieldset>
        )}
      </section>

      {checked !== null && checked.problem !== null && <p className="trouble" role="status">{checked.problem}</p>}

      {checked !== null && checked.problem === null && part !== undefined && (
        <>
          <section className="card">
            <h2>{checked.matches ? "It is the design" : "It is not the design"}</h2>
            <p className="voice">What was read</p>
            {checked.covers === null ? <p className="trouble small">The read does not line up against this part anywhere. It may be a read of something else.</p> : (
              <>
                <p className="small">
                  Bases {count(checked.covers.from)}–{count(checked.covers.to)} of {count(part.length)}, which is {Math.round(checked.covered * 100)}% of it.
                  {checked.reversed && <> The read was turned round to line up, which is only which primer it came off.</>}
                </p>
                <SequenceMap name={part.name} length={part.length} circular={part.circular} features={part.features}
                             spans={[{ start: checked.covers.from - 1, end: checked.covers.to, label: "read", strand: 0 }]}
                             marks={checked.differences.slice(0, 40).map((one) => ({ at: one.at - 1, label: one.kind === "substitution" ? `${one.was}→${one.now}` : one.kind }))} />
              </>
            )}
            <p className="voice">What was found</p>
            {checked.matches ? <p className="small good">Every base the read covers is the base the design has.</p> : (
              <p className={checked.changesProtein ? "small attention" : "small"}>
                {count(checked.differences.length)} {checked.differences.length === 1 ? "difference" : "differences"}
                {checked.changesProtein ? ", and at least one changes a protein." : ", none of which changes a protein."}
              </p>
            )}
            {checked.differences.length > 0 && (
              <ul className="checks">
                {checked.differences.slice(0, 15).map((one) => (
                  <li key={`${one.at} ${one.kind}`} className={one.protein !== null && one.protein.kind !== "silent" ? "stop" : "look"}>{saysDifference(one)}</li>
                ))}
              </ul>
            )}
            {checked.differences.length > 15 && <p className="dim small">and {count(checked.differences.length - 15)} more.</p>}
            {checked.warnings.length > 0 && <ul className="checks">{checked.warnings.map((one) => <li key={one} className="look">{one}</li>)}</ul>}
            {tubes.length > 0 && (
              <fieldset disabled={busy} className="row">
                <button type="button" onClick={() => void record()}>Record the check</button>
                <span className="dim small">A run against {part.name}, using a little of its tube.</span>
              </fieldset>
            )}
            {said !== null && <p className="small" role="status">{said}</p>}
          </section>

          <section className="card">
            <h2>The working</h2>
            {working.map((one) => <ShowWorking key={one.of} working={one} />)}
          </section>
        </>
      )}
    </div>
  );
  return { panel, desk };
}

/**
 * The checking tool on its own, for a lab that has not drawn its room.
 *
 * @param props - `start` says what to open on.
 */
export function VerifyTool(props: Parameters<typeof useVerifyBench>[0]) {
  return <>{useVerifyBench(props).panel}</>;
}
