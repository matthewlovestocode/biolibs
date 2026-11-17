"use client";

/**
 * Building a construct: the pieces in the order they go round the ring, and the primers that make
 * them fit.
 *
 * This is the step between having a sequence and having something that can be put into a cell. A
 * ligation joins pieces that have already been cut and whose ends happen to match; here you say
 * what the ring should be made of and the overlaps are designed, which is how a promoter, a coding
 * sequence and a terminator actually get into a vector.
 *
 * It is a desk, not a machine: nothing here is at an instrument. What it hands a scene is the ring
 * it would make, drawn over the tube of the first piece.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { assemblyParts, assemblyWorking, designAssembly, type AssemblyDesign } from "./assembly-design.js";
import { SequenceMap } from "./map.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { ShowWorking } from "./working.js";

/** The parts of the panel, in the order they are read, for a host that wants one of them in view. */
export type AssemblySection = "pieces" | "ring" | "junctions" | "primers" | "working";

/** What a host is handed to draw beside the panel. */
export interface AssemblyDesk {
  /** The tube of the first piece, to look at, if the lab has one that has been put somewhere. */
  focus: { place: string; item: string } | null;
  /** The ring as a molecule, with what each piece carries marked on it. `null` until there is a design. */
  molecule: DrawnMolecule | null;
  /** The design as it stands, or `null`. */
  design: AssemblyDesign | null;
}

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * Designing a construct from the lab's own parts.
 *
 * @param options - `start` says what to open on, for a tour or a link.
 * @returns `panel`, the tool itself, and `desk`, what a scene beside it should look at and picture.
 *
 * @example
 * ```tsx
 * import { useAssemblyBench } from "@biolibs/bionet-tools";
 *
 * const bench = useAssemblyBench();
 * <LabView lab={lab} wide beside={bench.panel} {...(bench.desk.focus === null ? {} : { focus: bench.desk.focus })} />
 * ```
 */
export function useAssemblyBench({ start }: {
  /** What to show: the pieces in order, the overlap, and which part of the panel to have in view. Followed whenever it changes. */
  start?: { pieces?: readonly string[]; overlap?: number; name?: string; section?: AssemblySection };
} = {}): { panel: ReactNode; desk: AssemblyDesk } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [chosen, setChosen] = useState<string[]>([...(start?.pieces ?? [])]);
  const [fixed, setFixed] = useState<string[]>([]);
  const [overlap, setOverlap] = useState(String(start?.overlap ?? 25));
  const [name, setName] = useState(start?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  // A host driving the tool — a tour, or a link — says what to show by changing `start`.
  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.pieces !== undefined) setChosen([...start.pieces]);
    if (start.overlap !== undefined) setOverlap(String(start.overlap));
    if (start.name !== undefined) setName(start.name);
  }, [asked]);

  const whole = (text: string, fallback: number): number => (/^\d+$/.test(text.trim()) ? Number(text) : fallback);
  const offered = useMemo(() => (lab === null || lab === undefined ? [] : assemblyParts(lab, whole(overlap, 25))), [lab?.parts, overlap]);
  const design = useMemo(() => {
    if (lab === null || lab === undefined || chosen.length < 2) return null;
    return designAssembly(lab, {
      pieces: chosen.map((one) => ({ part: one, amplify: !fixed.includes(one) })),
      overlap: whole(overlap, 25), ...(name.trim() === "" ? {} : { name: name.trim() }),
    });
  }, [lab?.parts, chosen, fixed, overlap, name]);
  const made = design !== null && design.problem === null ? design : null;
  const working = useMemo(() => (made === null ? [] : assemblyWorking(made)), [made]);

  const nameOf = (checksum: string): string => lab?.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  const firstTube = lab?.items.find((one) => one.part === chosen[0] && !one.retired && one.where !== null);
  const desk: AssemblyDesk = {
    focus: firstTube?.where == null ? null : { place: firstTube.where.place, item: firstTube.item },
    molecule: made === null ? null : moleculeOf({ name: made.name, length: made.length, circular: true, features: made.features }),
    design,
  };

  const move = (at: number, by: number): void => {
    const to = at + by;
    if (to < 0 || to >= chosen.length) return;
    const next = [...chosen];
    [next[at], next[to]] = [next[to]!, next[at]!];
    setChosen(next);
    setSaid(null);
  };
  /** Keep the designed primers as parts, so that they can be ordered and then used in the PCRs. */
  const keep = async (): Promise<void> => {
    if (made === null) return;
    setBusy(true);
    let added = 0;
    for (const primer of made.primers) {
      const answer = await act("addPart", { name: primer.name, sequence: primer.sequence });
      if (answer.ok) added += 1;
    }
    setBusy(false);
    setSaid(`${added} of ${made.primers.length} primers are in the lab as parts. There are no tubes of them until they are ordered and arrive.`);
  };

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet assembly">
      <section className="card">
        <h2>Build a ring</h2>
        <p className="small"><Glossed text="An assembly joins several pieces of DNA into one circle in a single reaction, with each piece overlapping the next." /></p>
        <p className="dim small">Choose the pieces in the order they go round. The overlaps are designed for you: each amplified piece gets primer tails that reach into its neighbours. A piece used as it is cannot be given tails, so its neighbours carry the whole overlap.</p>
        {offered.length < 2 ? <p className="empty">The lab has fewer than two parts long enough to be pieces. Bring sequences in on the Sequences tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>Add a piece
              <select value="" aria-label="Add a piece" onChange={(event) => { if (event.target.value !== "") { setChosen([...chosen, event.target.value]); setSaid(null); } }}>
                <option value="">Choose a part…</option>
                {offered.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length)} bp{one.circular ? " · circular" : ""}</option>)}
              </select>
            </label>
            <label>Overlap at each join<input type="number" min={10} max={80} step={1} value={overlap} onChange={(event) => setOverlap(event.target.value)} aria-label="Overlap in bases" /> bases</label>
            <label>Call the ring<input value={name} onChange={(event) => setName(event.target.value)} placeholder={made?.name ?? ""} maxLength={200} aria-label="What to call the ring" /></label>
          </fieldset>
        )}
        {chosen.length > 0 && (
          <ol className="pieces">
            {chosen.map((one, at) => (
              <li key={`${one} ${at}`}>
                <span>{nameOf(one)}</span>
                <label className="check small"><input type="checkbox" checked={!fixed.includes(one)} onChange={(event) => { setFixed(event.target.checked ? fixed.filter((each) => each !== one) : [...fixed, one]); setSaid(null); }} /> amplify</label>
                <button type="button" className="plain" onClick={() => move(at, -1)} disabled={at === 0} aria-label={`Move ${nameOf(one)} earlier`}>↑</button>
                <button type="button" className="plain" onClick={() => move(at, 1)} disabled={at === chosen.length - 1} aria-label={`Move ${nameOf(one)} later`}>↓</button>
                <button type="button" className="plain" onClick={() => { setChosen(chosen.filter((_, each) => each !== at)); setSaid(null); }} aria-label={`Take ${nameOf(one)} out`}>take out</button>
              </li>
            ))}
          </ol>
        )}
        {design !== null && design.problem !== null && <p className="trouble" role="status">{design.problem}</p>}
      </section>

      {made !== null && (
        <>
          <section className="card">
            <h2>The ring</h2>
            <p className="voice">This design</p>
            <p><strong>{count(made.length)} bp</strong> <span className="dim">circular · {made.pieces.length} pieces · {made.junctions.length} joins</span></p>
            <SequenceMap name={made.name} length={made.length} circular features={made.features}
                         spans={made.pieces.map((one, at) => ({ start: one.start, end: one.end, label: one.part.name, strand: (at % 2 === 0 ? 1 : -1) as 1 | -1 }))} />
            <p className="dim small">What was marked on each piece is marked on the ring, where that piece now is.</p>
          </section>

          <section className="card">
            <h2>The joins</h2>
            <table>
              <thead><tr><th>Between</th><th>Overlap</th><th>Melts near</th><th>Carried by</th></tr></thead>
              <tbody>
                {made.junctions.map((one) => (
                  <tr key={`${one.from} ${one.to}`}>
                    <td>{one.from} → {one.to}</td>
                    <td><code>{one.length} bp</code></td>
                    <td className={one.tm < 48 ? "attention" : undefined}>{Math.round(one.tm)} °C</td>
                    <td className="dim small">{one.carried.toForward > 0 ? `${one.to}'s forward primer` : ""}{one.carried.toForward > 0 && one.carried.fromReverse > 0 ? " and " : ""}{one.carried.fromReverse > 0 ? `${one.from}'s reverse primer` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>The primers to order</h2>
            {made.primers.length === 0 ? <p className="dim small">Every piece is used as it is, so there is nothing to amplify and no primer to order.</p> : (
              <>
                <table>
                  <thead><tr><th>Primer</th><th>Tail</th><th>Binds</th><th>Melts near</th></tr></thead>
                  <tbody>
                    {made.primers.map((one) => (
                      <tr key={one.name}>
                        <td>{one.name}</td>
                        <td className="dim">{one.tail === "" ? "none" : `${one.tail.length} bases`}</td>
                        <td>{one.binding.length} bases</td>
                        <td>{Math.round(one.binding_report.tm)} °C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {made.primers.map((one) => (
                  <p key={one.name} className="small"><strong>{one.name}</strong> <code className="wrap"><span className="dim">{one.tail}</span>{one.binding}</code></p>
                ))}
                <p className="dim small">The tail is shown faint: it does not bind the template, it is the neighbour's end that makes the overlap. The annealing temperature comes from the binding part alone.</p>
                <fieldset disabled={busy} className="row">
                  <button type="button" onClick={() => void keep()}>Keep the primers as parts</button>
                  <span className="dim small">No tubes: they have to be ordered.</span>
                </fieldset>
                {said !== null && <p className="small" role="status">{said}</p>}
              </>
            )}
          </section>

          {made.warnings.length > 0 && (
            <section className="card">
              <h2>Checks</h2>
              <ul className="checks">{made.warnings.map((one) => <li key={one} className="look">{one}</li>)}</ul>
            </section>
          )}

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
 * The assembly design tool on its own, for a lab that has not drawn its room.
 *
 * @param props - `start` says what to open on.
 */
export function AssemblyTool(props: Parameters<typeof useAssemblyBench>[0]) {
  return <>{useAssemblyBench(props).panel}</>;
}
