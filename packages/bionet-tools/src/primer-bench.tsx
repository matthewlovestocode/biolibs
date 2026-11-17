"use client";

/**
 * Designing primers, at a desk.
 *
 * Primers are not made at a machine. They are chosen by somebody looking at a sequence, sent off to
 * be made, and arrive as tubes. So this tool has no instrument: it has a part from the lab, a
 * stretch of it to amplify, and the pair that would amplify it — with every candidate that was
 * weighed, what a careful person would stop at, and the working for each figure.
 *
 * Like the tools that do stand at a machine, it knows nothing of three dimensions. It hands a host
 * the tube of the template to look at and the template as a molecule with the stretch and the pair
 * marked on it, and a scene that is showing that tube draws them over it.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { PartState } from "@biolibs/bionet";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { DEFAULT_DESIGN } from "@biolibs/pcr";
import { SequenceMap, type MapSpan } from "./map.js";
import { planPcr } from "./pcr.js";
import { designPair, featureStretches, primerOrder, stretchLength, type DesignedPrimer, type PrimerDesign, type Stretch } from "./primer-design.js";
import { crossWorking, gcWorking, primerTmWorking, productWorking, scoreWorking, selfWorking, tmApartWorking } from "./primer-working.js";
import { featureTone, moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { PairedBases, ShowWorking } from "./working.js";

const count = (value: number): string => value.toLocaleString("en-US");
const whole = (text: string): number | undefined => (text.trim() === "" || !Number.isFinite(Number(text)) ? undefined : Math.round(Number(text)));

/** The parts of the panel, in the order they are read, for a host that wants one of them in view. */
export type PrimerSection = "choose" | "pair" | "considered" | "working" | "order";

/** What a host is handed to draw beside the panel: where to look, and what to picture there. */
export interface PrimerDesk {
  /** The tube of the template to look at, and the place it is in, if the lab has one that has been put somewhere. */
  focus: { place: string; item: string } | null;
  /** The template as a molecule, with the stretch and the two primers marked on it. `null` until a part is chosen. */
  molecule: DrawnMolecule | null;
  /** The tubes a PCR of this design would be run from, once the lab has a tube of each: the template and the two primers. */
  ready: { template: string; forward: string; reverse: string } | null;
}

/**
 * The template with a design drawn on it: its own features, the stretch, and a primer at each end.
 *
 * @param part - The template.
 * @param design - The design, if there is one.
 * @param names - What the two primers are called.
 * @returns The molecule, as a scene draws one.
 */
export function designedMolecule(part: Pick<PartState, "name" | "length" | "circular" | "features">, design: PrimerDesign | null,
                                 names: { forward: string; reverse: string }): DrawnMolecule {
  const drawn = moleculeOf(part);
  if (design === null) return drawn;
  // A stretch through the origin is drawn as the two pieces either side of it.
  const pieces = (start: number, end: number): [number, number][] =>
    (end <= part.length ? [[start, end]] : [[start, part.length], [0, end - part.length]]);
  const mark = (start: number, end: number, strand: -1 | 0 | 1, tone: DrawnMolecule["features"][number]["tone"], label: string) =>
    pieces(start, end).filter(([from, to]) => to > from).map(([from, to], at) => ({ start: from, end: to, strand, tone, label: at === 0 ? label : "" }));
  return {
    ...drawn,
    features: [
      ...drawn.features,
      ...mark(design.stretch.start, design.stretch.start + design.length, 0, "good", `${count(design.length)} bp`),
      ...mark(design.forward.start, design.forward.end, 1, featureTone("primer_bind"), names.forward),
      ...mark(design.reverse.start, design.reverse.end, -1, featureTone("primer_bind"), names.reverse),
    ],
  };
}

/**
 * A part laid out as a strip, to drag a stretch out on.
 *
 * What is marked on the part is drawn above the line, so that a stretch can be dragged to fit a
 * feature by eye. The stretch chosen is shaded. Typing the numbers does the same thing, and is the
 * only way to say a stretch that runs through a circle's origin.
 *
 * @param props - `part` is the part; `stretch` is what is chosen; `onStretch` is told a new one.
 */
export function StretchStrip({ part, stretch, onStretch }: { part: Pick<PartState, "name" | "length" | "features">; stretch: Stretch | null; onStretch: (stretch: Stretch) => void }) {
  const [width, left, axis] = [640, 12, 34];
  const across = width - 2 * left;
  const x = (position: number): number => left + (position / part.length) * across;
  const dragging = useRef<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const at = (event: PointerEvent<SVGSVGElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    const along = ((event.clientX - box.left) / box.width) * width;
    return Math.round(Math.min(Math.max((along - left) / across, 0), 1) * part.length);
  };
  const shown: [number, number][] = drag !== null ? [[Math.min(...drag), Math.max(...drag)]]
    : stretch === null ? [] : stretch.end > stretch.start ? [[stretch.start, stretch.end]] : [[stretch.start, part.length], [0, stretch.end]];
  return (
    <svg className="strip" viewBox={`0 0 ${width} 52`} role="img" style={{ touchAction: "none" }}
         aria-label={`${part.name} as a strip of ${count(part.length)} bases. ${stretch === null ? "No stretch is chosen." : `The stretch chosen is ${count(stretch.start + 1)} to ${count(stretch.end)}.`} Drag across it to choose another.`}
         onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragging.current = at(event); setDrag([dragging.current, dragging.current]); }}
         onPointerMove={(event) => { if (dragging.current !== null) setDrag([dragging.current, at(event)]); }}
         onPointerUp={(event) => {
           const from = dragging.current;
           dragging.current = null;
           setDrag(null);
           if (from === null) return;
           const [start, end] = [Math.min(from, at(event)), Math.max(from, at(event))];
           // A press without a drag chooses nothing.
           if (end - start >= 2) onStretch({ start, end });
         }}>
      {shown.map(([from, to], index) => <rect key={index} x={x(from)} y={4} width={Math.max(1, x(to) - x(from))} height={44} className="chosen" />)}
      {part.features.flatMap((feature, index) => feature.parts.filter((piece) => piece.end > piece.start).map((piece, nth) => (
        <rect key={`${index} ${nth}`} x={x(piece.start)} y={axis - 16} width={Math.max(1.5, x(piece.end) - x(piece.start))} height={9} rx={2} className={`feature tone-${featureTone(feature.type)}`}>
          <title>{`${feature.label}, ${count(piece.start + 1)}..${count(piece.end)}`}</title>
        </rect>
      )))}
      <line x1={left} x2={left + across} y1={axis} y2={axis} className="backbone" />
      <text x={left} y={axis + 13} className="length">1</text>
      <text x={left + across} y={axis + 13} textAnchor="end" className="length">{count(part.length)}</text>
      {shown.length > 0 && <text x={(x(shown[0]![0]) + x(shown[0]![1])) / 2} y={axis + 13} textAnchor="middle" className="spanned">{count(shown[0]![0] + 1)}–{count(shown[0]![1])}</text>}
    </svg>
  );
}

/**
 * The one picture that makes a pair of primers plain: the template's two strands, and a primer on
 * each, at the two ends of the stretch, pointing at each other.
 *
 * The forward primer has the top strand's sequence, so it lies on the bottom strand and is extended
 * rightwards; the reverse primer the other way about. It is not to scale along its length: the ends
 * are drawn large enough to read and the middle is cut short.
 *
 * @param props - `design` is the design; `names` is what the primers are called.
 */
export function PairPicture({ design, names }: { design: PrimerDesign; names: { forward: string; reverse: string } }) {
  const [f, r] = [design.forward.chosen.report, design.reverse.chosen.report];
  const says = `The template's two strands, with ${count(design.length)} bases between the ends of the stretch. ${names.forward}, ${f.length} bases, lies on the bottom strand at the left end, from base ${count(design.forward.start + 1)}, and points right. `
    + `${names.reverse}, ${r.length} bases, lies on the top strand at the right end, up to base ${count(design.stretch.end)}, and points left. What lies between their far ends is copied.`;
  const [from, to, top, bottom] = [90, 550, 34, 92];
  const arrow = (x1: number, x2: number, y: number): string => { const back = x2 > x1 ? -8 : 8; return `M${x1},${y} L${x2},${y} M${x2 + back},${y - 5} L${x2},${y} L${x2 + back},${y + 5}`; };
  return (
    <svg className="pairpicture" viewBox="0 0 640 128" role="img" aria-label={says}>
      <rect x={from} y={top - 12} width={to - from} height={bottom - top + 24} className="chosen" />
      <line x1={20} x2={620} y1={top} y2={top} className="strand" /><line x1={20} x2={620} y1={bottom} y2={bottom} className="strand" />
      <text x={14} y={top + 4} textAnchor="end" className="ends">5′</text><text x={626} y={top + 4} className="ends">3′</text>
      <text x={14} y={bottom + 4} textAnchor="end" className="ends">3′</text><text x={626} y={bottom + 4} className="ends">5′</text>
      <text x={320} y={top - 16} textAnchor="middle" className="ends">top strand</text><text x={320} y={bottom + 28} textAnchor="middle" className="ends">bottom strand</text>
      <path d={arrow(from, from + 120, bottom - 12)} className="primer" />
      <text x={from} y={bottom - 22} className="named">{names.forward} · 5′→3′ · {f.length} bases</text>
      <path d={arrow(to, to - 120, top + 12)} className="primer" />
      <text x={to} y={top + 32} textAnchor="end" className="named">{names.reverse} · 5′→3′ · {r.length} bases</text>
      <text x={320} y={(top + bottom) / 2 + 4} textAnchor="middle" className="between">{count(design.length)} bp copied</text>
      <text x={from} y={bottom + 28} textAnchor="middle" className="ends">{count(design.stretch.start + 1)}</text>
      <text x={to} y={top - 16} textAnchor="middle" className="ends">{count(design.stretch.end)}</text>
    </svg>
  );
}

/** The candidates for one primer, as a comparison. */
function Candidates({ end, name, targetTm, onUse }: { end: DesignedPrimer; name: string; targetTm: number; onUse: (length: number | undefined) => void }) {
  return (
    <div className="candidates">
      <h3>{name} <span className="dim">· {end.which}</span></h3>
      <table>
        <thead><tr><th>Bases</th><th>Tm</th><th>from {targetTm}°</th><th>GC</th><th>3′ end</th><th>Self</th><th>Score</th><th /></tr></thead>
        <tbody>
          {end.candidates.map((one) => {
            const { report } = one;
            const [chosen, best] = [one === end.chosen, one === end.best];
            return (
              <tr key={report.length} className={chosen ? "chosen" : undefined} aria-current={chosen ? "true" : undefined}>
                <td>{report.length}</td>
                <td>{report.tm.toFixed(1)}</td>
                <td>{one.offTarget.toFixed(1)}</td>
                <td>{(report.gc * 100).toFixed(0)}%</td>
                <td className={report.gcClamp ? undefined : "look"} title={report.gcClamp ? "It ends in G or C." : "It does not end in G or C, which adds 2 to its score."}>{report.sequence.at(-1)}{report.gcClamp ? "" : " +2"}</td>
                <td title={`${report.selfComplement} bases in a row pair with itself; ${report.endSelfComplement} at its 3′ end. Longest run of one base: ${report.longestRun}.`}>{report.selfComplement}/{report.endSelfComplement}</td>
                <td><strong>{one.score.toFixed(2)}</strong></td>
                <td className="small">
                  {best && <span className="good">scored best</span>}
                  {chosen && !best && <span>in use</span>}
                  {!chosen && <button type="button" className="plain" onClick={() => onUse(best ? undefined : report.length)} aria-label={`Use ${report.length} bases for the ${end.which} primer`}>use</button>}
                  {report.warnings.length > 0 && <span className="look" title={report.warnings.join("\n")}> · {report.warnings.length} {report.warnings.length === 1 ? "warning" : "warnings"}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small">{end.why}{end.chosen !== end.best && <> <strong>{end.chosen.report.length} bases is in use instead, by your choice.</strong></>}</p>
    </div>
  );
}

/**
 * Designing primers.
 *
 * @param options - `start` says what to open on, for a tour or a link: the part by its checksum, a
 *   stretch or a feature of it by name, what to call the pair, and which part of the panel to have in view. `onPcr`, if given, adds a way to
 *   go on to a PCR once the lab has a tube of the template and of each primer, and is told which.
 * @returns `panel`, the tool itself, and `desk`, what a scene beside it should look at and picture.
 *
 * @example
 * ```tsx
 * import { usePrimerBench } from "@biolibs/bionet-tools";
 *
 * const primers = usePrimerBench();
 * // LabView is the scene package's. The room stays, with the template's tube in view and the pair drawn on its molecule.
 * <LabView lab={lab} wide beside={primers.panel} {...(primers.desk.focus === null ? {} : { focus: primers.desk.focus })}
 *          molecule={(item) => (item === primers.desk.focus?.item ? primers.desk.molecule : null)} />
 * ```
 */
export function usePrimerBench({ start, onPcr }: {
  /** What to show. Followed whenever it changes. */
  start?: { part?: string; stretch?: Stretch; feature?: string; name?: string; section?: PrimerSection };
  onPcr?: (tubes: { template: string; forward: string; reverse: string }) => void;
} = {}): { panel: ReactNode; desk: PrimerDesk } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [chosen, setChosen] = useState<string | null>(start?.part ?? null);
  const [from, setFrom] = useState(start?.stretch === undefined ? "" : String(start.stretch.start + 1));
  const [to, setTo] = useState(start?.stretch === undefined ? "" : String(start.stretch.end));
  const [target, setTarget] = useState(String(DEFAULT_DESIGN.targetTm));
  const [shortest, setShortest] = useState(String(DEFAULT_DESIGN.minLength));
  const [longest, setLongest] = useState(String(DEFAULT_DESIGN.maxLength));
  const [lengths, setLengths] = useState<{ forward?: number; reverse?: number }>({});
  const [base, setBase] = useState(start?.name ?? "");
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  // The lab as it stands now, for reading straight after asking it to change.
  const latest = useRef(lab);
  latest.current = lab;

  // Templates worth designing on: anything long enough to hold a pair with something between them.
  const parts = useMemo(() => (lab?.parts ?? []).filter((one) => one.kind !== "protein" && one.length >= 2 * DEFAULT_DESIGN.minLength + 1), [lab?.parts]);
  const part = parts.find((one) => one.checksum === chosen) ?? parts.find((one) => one.features.length > 0) ?? parts[0];
  const offered = useMemo(() => (part === undefined ? [] : featureStretches(part)), [part]);
  const choose = (stretch: Stretch): void => { setFrom(String(stretch.start + 1)); setTo(String(stretch.end)); setLengths({}); setSaid(null); };

  // A host driving the tool — a tour, or a link — says what to show by changing `start`.
  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.part !== undefined) setChosen(start.part);
    if (start.name !== undefined) setBase(start.name);
    const held = latest.current?.parts.find((one) => one.checksum === start.part);
    const named = start.feature === undefined || held === undefined ? undefined : featureStretches(held).find((one) => one.label === start.feature);
    const stretch = start.stretch ?? named;
    if (stretch !== undefined) choose(stretch);
  }, [asked]);
  // The panel is long, so a host that is talking about one part of it can ask for that part to be in view.
  const shown = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (start?.section === undefined) return;
    const held = setTimeout(() => shown.current?.querySelector(`[data-section="${start.section}"]`)?.scrollIntoView({ block: "start" }), 60);
    return () => clearTimeout(held);
  }, [asked]);

  // Typed as a sequence file numbers bases: from 1, and the last one counted.
  const stretch = useMemo((): Stretch | null => {
    const [first, last] = [whole(from), whole(to)];
    if (part === undefined || first === undefined || last === undefined) return null;
    const typed = { start: first - 1, end: last };
    return stretchLength(typed, part) === 0 ? null : typed;
  }, [part, from, to]);
  const ask = useMemo(() => ({
    targetTm: whole(target) ?? DEFAULT_DESIGN.targetTm, minLength: whole(shortest) ?? DEFAULT_DESIGN.minLength, maxLength: whole(longest) ?? DEFAULT_DESIGN.maxLength,
    ...(lengths.forward === undefined ? {} : { forwardLength: lengths.forward }), ...(lengths.reverse === undefined ? {} : { reverseLength: lengths.reverse }),
  }), [target, shortest, longest, lengths]);
  const design = useMemo(() => {
    if (part === undefined || stretch === null) return null;
    try { return designPair(part, stretch, ask); } catch { return null; }
  }, [part, stretch, ask]);

  const feature = stretch === null ? undefined : offered.find((one) => one.start === stretch.start && one.end === stretch.end);
  const usual = (base.trim() || feature?.label || part?.name || "primer").slice(0, 190);
  const order = design === null ? null : primerOrder(design, { base: usual });
  const names = { forward: order?.parts[0].name ?? "forward", reverse: order?.parts[1].name ?? "reverse" };
  // The same engine the PCR tool uses, given the pair: what a PCR with them would in fact make.
  const made = useMemo(() => (part === undefined || design === null ? null
    : planPcr(part, design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence, { annealAtLeast: Math.min(18, design.forward.chosen.report.length, design.reverse.chosen.report.length) })), [part, design]);

  const tubeOf = (sequence: string | undefined, circular: boolean): string | undefined => {
    const held = lab?.parts.find((one) => one.circular === circular && one.sequence.toUpperCase() === sequence?.toUpperCase());
    return held === undefined ? undefined : lab?.items.find((item) => item.part === held.checksum && !item.retired && item.amount > 0)?.item;
  };
  const templateTube = part === undefined ? undefined : lab?.items.filter((item) => item.part === part.checksum && !item.retired).sort((a, b) => Number(b.where !== null) - Number(a.where !== null))[0];
  const [forwardTube, reverseTube] = [tubeOf(order?.parts[0].sequence, false), tubeOf(order?.parts[1].sequence, false)];
  const held = order === null ? [false, false] : order.parts.map((one) => lab?.parts.some((each) => !each.circular && each.sequence.toUpperCase() === one.sequence) === true);
  const ready = templateTube === undefined || templateTube.amount <= 0 || forwardTube === undefined || reverseTube === undefined ? null
    : { template: templateTube.item, forward: forwardTube, reverse: reverseTube };
  const desk: PrimerDesk = {
    focus: templateTube === undefined || templateTube.where === null ? null : { place: templateTube.where.place, item: templateTube.item },
    molecule: part === undefined ? null : designedMolecule(part, design, names),
    ready,
  };

  /** Add the two primers as parts, and a tube of each if they have arrived. */
  const add = async (arrived: boolean): Promise<void> => {
    if (order === null) return;
    setBusy(true);
    const tubes = whole(amount);
    let trouble: string | null = null;
    for (const primer of order.parts) {
      const answer = await act("addPart", primer);
      if (!answer.ok) { trouble = answer.error; break; }
      if (!arrived) continue;
      // The part is known by its sequence, so the one just added is the one with these bases. The
      // window hears of it a moment after the lab has it.
      let found: PartState | undefined;
      for (let tries = 0; tries < 40 && found === undefined; tries++) {
        found = latest.current?.parts.find((one) => !one.circular && one.sequence.toUpperCase() === primer.sequence);
        if (found === undefined) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (found === undefined) { trouble = `${primer.name} was added, but the lab has not shown it yet, so no tube of it was added.`; break; }
      const tube = await act("addItem", { part: found.checksum, amount: tubes === undefined || tubes < 0 ? 100 : tubes, unit: "µL" });
      if (!tube.ok) { trouble = tube.error; break; }
    }
    setBusy(false);
    setSaid(trouble ?? (arrived
      ? `${names.forward} and ${names.reverse} are parts in the freezer now, with a tube of each, not yet put anywhere. No run was recorded, because nothing was made here: the tubes say only that they are in the lab.`
      : `${names.forward} and ${names.reverse} are parts in the freezer now, with no tubes. Add a tube of each when they arrive.`));
  };

  // One set for the panel, so that a term is explained where it is first met and not at every mention.
  const seen = new Set<string>();
  const spans: MapSpan[] = part === undefined || design === null ? [] : designedMolecule({ ...part, features: [] }, design, names).features
    .map((one) => ({ start: one.start, end: one.end, label: one.label, strand: one.strand }));
  const stops = design?.warnings.filter((one) => one.weight === "stop").length ?? 0;

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet benchpanel primers" ref={shown}>
      <section className="card" data-section="choose">
        <div className="toolhead"><h2>Design primers</h2></div>
        <p className="small"><Glossed seen={seen} text="A pair of primers marks the two ends of the stretch a PCR copies. Choose a part and the stretch of it to amplify, and the pair is designed here, in this window, from the lab's own sequence." /></p>
        {part === undefined ? <p className="empty">The lab has no part long enough to design primers on. Bring one in on the Sequences tool.</p> : (
          <>
            <fieldset disabled={busy} className="choosing">
              <label>Template
                <select value={part.checksum} aria-label="Template" onChange={(event) => { setChosen(event.target.value); setFrom(""); setTo(""); setLengths({}); setSaid(null); }}>
                  {parts.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length)} bp{one.circular ? " · circular" : ""}</option>)}
                </select>
              </label>
              <label>Amplify a feature
                <select value={feature === undefined ? "" : String(offered.indexOf(feature))} aria-label="Amplify a feature" disabled={offered.length === 0}
                        onChange={(event) => { const picked = offered[Number(event.target.value)]; if (event.target.value !== "" && picked !== undefined) choose(picked); }}>
                  <option value="">{offered.length === 0 ? "Nothing is marked on this part" : "Choose a feature…"}</option>
                  {offered.map((one, index) => <option key={index} value={index}>{one.label} · {one.type} · {count(one.start + 1)}..{count(one.end)} · {count(one.length)} bp</option>)}
                </select>
              </label>
              <label>From base<input type="number" min={1} max={part.length} step={1} value={from} onChange={(event) => { setFrom(event.target.value); setLengths({}); }} aria-label="From base" /></label>
              <label>To base<input type="number" min={1} max={part.length} step={1} value={to} onChange={(event) => { setTo(event.target.value); setLengths({}); }} aria-label="To base" /></label>
            </fieldset>
            <StretchStrip part={part} stretch={stretch} onStretch={choose} />
            <p className="dim small">
              Drag across the strip, type the two bases, or choose a feature.
              {part.circular && " On a circle, a From after the To runs the stretch through the origin."}
              {stretch === null && from !== "" && to !== "" && <strong className="trouble"> That is not a stretch of this part.</strong>}
            </p>
            <div className="mapped">
              <SequenceMap name={part.name} length={part.length} circular={part.circular} features={part.features} spans={spans} />
              <fieldset disabled={busy} className="aims">
                <label>Aim for<input type="number" min={40} max={80} step={1} value={target} onChange={(event) => { setTarget(event.target.value); setLengths({}); }} aria-label="Melting temperature aimed for" /> °C</label>
                <label>Shortest<input type="number" min={8} max={60} step={1} value={shortest} onChange={(event) => { setShortest(event.target.value); setLengths({}); }} aria-label="Shortest primer" /> bases</label>
                <label>Longest<input type="number" min={8} max={60} step={1} value={longest} onChange={(event) => { setLongest(event.target.value); setLengths({}); }} aria-label="Longest primer" /> bases</label>
                <p className="dim small"><Glossed seen={seen} text="The melting temperature both primers are aimed at, and the lengths tried for each. Every length in the range is measured; nothing is thrown away unseen." /></p>
              </fieldset>
            </div>
          </>
        )}
      </section>

      {part !== undefined && stretch !== null && design === null && (
        <section className="card"><p className="trouble" role="status">No primer can be designed at one end of this stretch: it is shorter than the shortest primer asked for, or its end holds a base that is not known for certain.</p></section>
      )}

      {part !== undefined && design !== null && order !== null && (
        <>
          <section className="card" data-section="pair">
            <h2>The pair</h2>
            <p className="voice">This design</p>
            <PairPicture design={design} names={names} />
            <table className="pair">
              <thead><tr><th>Primer</th><th>5′ → 3′</th><th>Bases</th><th>Tm</th><th>GC</th><th>3′ end</th></tr></thead>
              <tbody>
                {[design.forward, design.reverse].map((end, index) => (
                  <tr key={end.which}>
                    <td>{order.parts[index]!.name}</td>
                    <td><code className="oligo">{end.chosen.report.sequence}</code></td>
                    <td>{end.chosen.report.length}</td>
                    <td>{end.chosen.report.tm.toFixed(1)} °C</td>
                    <td>{(end.chosen.report.gc * 100).toFixed(0)}%</td>
                    <td>{end.chosen.report.sequence.at(-1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small">
              <strong>{count(design.length)} bp</strong> product{design.wraps ? ", through the origin" : ""} · melting temperatures {design.tmApart.toFixed(1)} °C apart
              {made !== null && (made.problem === null && made.products[0]!.length === design.length
                ? <span className="good"> · the PCR engine makes one product of {count(design.length)} bp from this pair</span>
                : <span className="trouble"> · the PCR engine does not make one product of this length from this pair{made.problem === null ? "" : `: ${made.problem}`}</span>)}
            </p>

            <p className="voice">Checks</p>
            {design.warnings.length === 0 ? <p className="small good"><Glossed seen={seen} text="Nothing about this pair looks wrong: the melting temperatures are close, neither primer folds into a hairpin or pairs with the other as a primer dimer, and each binds this template in one place." /></p> : (
              <>
                <ul className="checks">{design.warnings.map((one) => <li key={one.says} className={one.weight}><Glossed seen={seen} text={one.says} /></li>)}</ul>
                <p className="dim small">{stops > 0 ? "The ones in red are likely to spoil the PCR. Try another length for that primer below, or move the stretch a few bases." : "None of these need stop you. They are what to think of first if the PCR gives trouble."}</p>
              </>
            )}
          </section>

          <section className="card" data-section="considered">
            <h2>What was considered</h2>
            <p className="small"><Glossed seen={seen} text="A primer has to start at its end of the stretch, so the only choice is how long it is. Here is every length tried, with what was measured of it. The score is how far its melting temperature is from the one aimed for, plus 2 if it lacks a GC clamp, plus a little for a GC content off the middle. The lowest wins." /></p>
            <div className="considered">
              <Candidates end={design.forward} name={names.forward} targetTm={design.targetTm} onUse={(length) => setLengths(({ forward: _, ...rest }) => (length === undefined ? rest : { ...rest, forward: length }))} />
              <Candidates end={design.reverse} name={names.reverse} targetTm={design.targetTm} onUse={(length) => setLengths(({ reverse: _, ...rest }) => (length === undefined ? rest : { ...rest, reverse: length }))} />
            </div>
            <p className="dim small">Self is how many bases in a row pair with the primer itself, anywhere and at its 3′ end. Press <em>use</em> to take a different length; the checks and the working follow.</p>
          </section>

          <section className="card" data-section="working">
            <h2>The working</h2>
            <p className="dim small">Every figure above, opened out. Each was worked out here from the bases and can be followed by hand.</p>
            {[design.forward, design.reverse].map((end, index) => {
              const name = order.parts[index]!.name;
              const { sequence } = end.chosen.report;
              const tm = primerTmWorking(name, sequence);
              const self = selfWorking(name, sequence);
              return (
                <div key={end.which} className="workings">
                  <p className="voice">{name}</p>
                  {tm !== null && (
                    <ShowWorking working={tm}>
                      <table className="counts">
                        <thead><tr><th>Pair</th><th>Times</th><th>ΔH each</th><th>ΔS each</th><th>ΔH</th><th>ΔS</th></tr></thead>
                        <tbody>
                          {tm.terms.pairs.map((one) => <tr key={one.pair}><td>{one.pair}</td><td>{one.times}</td><td>{one.dH.toFixed(1)}</td><td>{one.dS.toFixed(1)}</td><td>{(one.times * one.dH).toFixed(1)}</td><td>{(one.times * one.dS).toFixed(1)}</td></tr>)}
                          <tr><td>ends</td><td>2</td><td /><td /><td>{tm.terms.ends.dH.toFixed(1)}</td><td>{tm.terms.ends.dS.toFixed(1)}</td></tr>
                          <tr><td>salt</td><td /><td /><td /><td /><td>{tm.terms.salt.toFixed(2)}</td></tr>
                          <tr><th>sum</th><td /><td /><td /><th>{tm.terms.dH.toFixed(1)}</th><th>{tm.terms.dS.toFixed(2)}</th></tr>
                        </tbody>
                      </table>
                    </ShowWorking>
                  )}
                  <ShowWorking working={gcWorking(name, sequence)} />
                  <ShowWorking working={self}>
                    {self.longest > 0 && <PairedBases paired={self.paired} upper={name} lower={`${name} again`} />}
                    {self.atEnd > 0 && (self.paired.endShift !== self.paired.shift || self.paired.endFrom !== self.paired.from) && <PairedBases paired={self.paired} upper={name} lower={`${name} again`} run="end" />}
                  </ShowWorking>
                  <ShowWorking working={scoreWorking(end, end.chosen, design.targetTm)} />
                </div>
              );
            })}
            <p className="voice">The pair</p>
            <ShowWorking working={productWorking(design, part, made?.problem === null ? made.products[0]!.length : undefined)} />
            <ShowWorking working={tmApartWorking(design, names)} />
            {(() => { const cross = crossWorking(design, names); return (
              <ShowWorking working={cross}>
                {cross.longest > 0 && <PairedBases paired={cross.paired} upper={names.forward} lower={names.reverse} />}
                {cross.atEnd > 0 && (cross.paired.endShift !== cross.paired.shift || cross.paired.endFrom !== cross.paired.from) && <PairedBases paired={cross.paired} upper={names.forward} lower={names.reverse} run="end" />}
              </ShowWorking>
            ); })()}
          </section>

          <section className="card" data-section="order">
            <h2>Order them, and keep them</h2>
            <p className="small">Primers are ordered, not made at the bench. These two lines are what is sent to whoever makes them: a name, and the bases 5′ to 3′.</p>
            <code className="wrap order">{order.lines.map((line) => <span key={line}>{line.replace("\t", "   ")}</span>)}</code>
            <fieldset disabled={busy} className="stack">
              <label>Call them<input value={base} onChange={(event) => setBase(event.target.value)} placeholder={usual} maxLength={190} aria-label="What to call the pair" /></label>
              <label>When they arrive, each tube holds, in µL<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount in each tube, in µL" /></label>
              <div className="row">
                <button type="button" disabled={held.every(Boolean)} onClick={() => void add(false)} title="Adds the two primers to the lab as parts, known by their sequences. No tubes: there is nothing in the freezer yet.">{held.every(Boolean) ? "The design is kept" : "Keep the design"}</button>
                <button type="button" className="quiet" onClick={() => void add(true)} title="Adds the two primers as parts, and a tube of each. No run is recorded, since nothing was made here.">They have arrived: add a tube of each</button>
              </div>
            </fieldset>
            <p className="dim small">Keeping the design adds two parts. A tube is added only when there is one, and it is recorded as a tube that came into the lab, not as something a run made.</p>
            {said !== null && <p className="small" role="status">{said}</p>}
            {ready !== null && (
              <p className="small good">The lab has a tube of {part.name} and of each primer, so this PCR can be run.
                {onPcr !== undefined && <> <button type="button" onClick={() => onPcr(ready)}>Run the PCR</button></>}
              </p>
            )}
            {ready === null && held.every(Boolean) && <p className="dim small">A PCR needs a tube of {part.name} and of each primer. {templateTube === undefined || templateTube.amount <= 0 ? `There is no tube of ${part.name} with anything in it. ` : ""}{forwardTube === undefined || reverseTube === undefined ? "There is no tube of the primers yet." : ""}</p>}
          </section>
        </>
      )}
    </div>
  );
  return { panel, desk };
}

/**
 * The primer design tool on its own, for a lab that has not drawn its room.
 *
 * @param props - `start` says what to open on; `onPcr` adds a way to go on to the PCR.
 */
export function PrimerTool(props: Parameters<typeof usePrimerBench>[0]) {
  return <>{usePrimerBench(props).panel}</>;
}
