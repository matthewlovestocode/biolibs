/**
 * The working, drawn: a figure that opens to show the steps that give it.
 *
 * It is shut until asked for, so a tool reads the same as before to somebody who trusts it, and
 * opens to somebody who wants to follow it. Whether a figure is exact or an estimate is said on the
 * outside, since that is worth knowing without opening anything.
 */
import type { ReactNode } from "react";
import type { CutSite } from "./digest-working.js";
import type { JoinOverhangs } from "./ligate-working.js";
import type { BindingWorking, FacedBase, Working } from "./pcr-working.js";
import type { PairedStrands } from "./primer-design.js";

/**
 * One figure and its working.
 *
 * @param props - `working` is the figure; `children` is drawn under the steps, for a table or a picture that goes with them.
 *
 * @example
 * ```tsx
 * import { ShowWorking, tmWorking } from "@biolibs/bionet-tools";
 *
 * const working = tmWorking("fwd", "GGATCACAGTCTACACTG");
 * {working !== null && <ShowWorking working={working} />}
 * ```
 */
export function ShowWorking({ working, children }: { working: Working; children?: ReactNode }) {
  return (
    <details className="working">
      <summary>
        <span className="of">{working.of}</span> <strong>{working.comes}</strong>
        <span className={`kind ${working.kind}`} title={working.kind === "exact" ? "This follows from the sequences alone." : "This rests on a rule of thumb. A different rule would give a different figure."}>{working.kind}</span>
      </summary>
      <ol>{working.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {children}
      {working.rests !== undefined && <p className="rests">{working.rests}</p>}
    </details>
  );
}

/**
 * A primer laid against the strand it binds, each base over the one it faces.
 *
 * The primer is written 5′ to 3′. A line joins each pair that holds. The bases at the 3′ end that
 * must pair are underlined, and a tail that does not bind stands apart from the strand.
 *
 * @param props - `working` is from `bindingWorking`; `name` is what the primer is called.
 */
export function FacedBases({ working, name }: { working: BindingWorking; name: string }) {
  const says = `${name}, 5′ to 3′, against the ${working.strand} strand: ${working.faced.filter((one) => one.pairs).length} of ${working.faced.length} bases pair.`;
  const cell = (base: string, extra = ""): ReactNode => <span className={`base base-${base.toLowerCase() || "none"} ${extra}`}>{base || "·"}</span>;
  return (
    <div className="faced" role="img" aria-label={says}>
      <div className="row"><span className="end">5′</span>{working.faced.map((one: FacedBase, at) => <span key={at}>{cell(one.primer, one.needed ? "needed" : "")}</span>)}<span className="end">3′ {name}</span></div>
      <div className="row"><span className="end" />{working.faced.map((one, at) => <span key={at} className={one.pairs ? "bond" : "bond none"}>{one.pairs ? "|" : " "}</span>)}<span className="end" /></div>
      <div className="row"><span className="end">3′</span>{working.faced.map((one, at) => <span key={at}>{cell(one.faces)}</span>)}<span className="end">5′ {working.strand} strand</span></div>
    </div>
  );
}

/**
 * A cut, drawn in the bases it is made in: both strands, the recognised bases marked, and a bar
 * where each strand is cut.
 *
 * @param props - `site` is from `cutSites`.
 */
export function CutBases({ site }: { site: CutSite }) {
  const { top, bottom, site: [start, end], cutTop, cutBottom } = site.around;
  const says = `${site.enzyme} at base ${site.at.toLocaleString("en-US")}: it recognises ${site.recognises} and leaves ${site.overhang === "blunt" ? "a blunt end" : `a ${site.overhang} overhang of ${site.bases}`}.`;
  const row = (bases: string, cut: number): ReactNode => [...bases].map((base, at) => (
    <span key={at} className={`base base-${base.toLowerCase()}${at >= start && at < end ? " site" : ""}${at === cut ? " cut" : ""}`}>{base}</span>
  ));
  return (
    <div className="faced cutbases" role="img" aria-label={says}>
      <div className="row"><span className="end">5′</span>{row(top, cutTop)}<span className="end">3′ top</span></div>
      <div className="row"><span className="end">3′</span>{row(bottom, cutBottom)}<span className="end">5′ bottom</span></div>
    </div>
  );
}

/**
 * Two ends of a ligation written one over the other, so that the pairing can be read.
 *
 * @param props - `bases` is from `joinWorking`.
 */
export function JoinBases({ bases }: { bases: JoinOverhangs }) {
  if (bases.kind === "blunt") return <p className="faced blunt">Both ends are blunt, so there is nothing to pair: ligase seals them as they meet.</p>;
  const says = `${bases.from}'s ${bases.kind} overhang ${bases.left} against ${bases.to}'s ${bases.right}.`;
  const row = (text: string): ReactNode => [...text].map((base, at) => <span key={at} className={`base base-${base.toLowerCase()}`}>{base}</span>);
  return (
    <div className="faced" role="img" aria-label={says}>
      <div className="row"><span className="end">{bases.from}</span>{row(bases.left)}<span className="end" /></div>
      <div className="row"><span className="end" />{[...bases.left].map((base, at) => <span key={at} className="bond">|</span>)}<span className="end" /></div>
      <div className="row"><span className="end">{bases.to}</span>{row(bases.right)}<span className="end" /></div>
    </div>
  );
}

/**
 * Two primers, or two copies of one, written one over the other as they would pair.
 *
 * The upper is written 5′ to 3′ and the lower 3′ to 5′, slid to where the run being shown pairs. A
 * line joins every pair at that place, and the bases of the run itself are underlined.
 *
 * @param props - `paired` is from `pairedStrands`; `upper` and `lower` are what to call the two
 *   strands; `run` is which run to show: the longest anywhere, or the longest that reaches a 3′ end.
 */
export function PairedBases({ paired, upper, lower, run = "longest" }: { paired: PairedStrands; upper: string; lower: string; run?: "longest" | "end" }) {
  const [shift, from, length] = run === "end" ? [paired.endShift, paired.endFrom, paired.endLength] : [paired.shift, paired.from, paired.length];
  const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G" };
  const [first, last] = [Math.min(0, shift), Math.max(paired.upper.length, shift + paired.lower.length)];
  const columns = Array.from({ length: last - first }, (_, at) => first + at);
  const over = (column: number): string => paired.upper[column] ?? "";
  const under = (column: number): string => paired.lower[column - shift] ?? "";
  const inRun = (column: number): boolean => column >= from && column < from + length;
  const says = `${upper}, 5′ to 3′, over ${lower}, 3′ to 5′: ${length} ${length === 1 ? "base pairs" : "bases in a row pair"}${length === 0 ? "" : `, ${paired.upper.slice(from, from + length)} with ${paired.lower.slice(from - shift, from - shift + length)}`}.`;
  const cell = (base: string, marked: boolean): ReactNode => <span className={`base base-${base.toLowerCase() || "none"}${marked ? " needed" : ""}`}>{base || " "}</span>;
  return (
    <div className="faced paired" role="img" aria-label={says}>
      <div className="row"><span className="end">5′</span>{columns.map((column) => <span key={column}>{cell(over(column), inRun(column))}</span>)}<span className="end">3′ {upper}</span></div>
      <div className="row"><span className="end" />{columns.map((column) => { const pairs = over(column) !== "" && PAIR[over(column)] === under(column); return <span key={column} className={pairs ? "bond" : "bond none"}>{pairs ? "|" : " "}</span>; })}<span className="end" /></div>
      <div className="row"><span className="end">3′</span>{columns.map((column) => <span key={column}>{cell(under(column), inRun(column))}</span>)}<span className="end">5′ {lower}</span></div>
    </div>
  );
}
