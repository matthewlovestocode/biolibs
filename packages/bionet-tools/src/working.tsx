/**
 * The working, drawn: a figure that opens to show the steps that give it.
 *
 * It is shut until asked for, so a tool reads the same as before to somebody who trusts it, and
 * opens to somebody who wants to follow it. Whether a figure is exact or an estimate is said on the
 * outside, since that is worth knowing without opening anything.
 */
import type { ReactNode } from "react";
import type { CutSite } from "./digest-working.js";
import type { BindingWorking, FacedBase, Working } from "./pcr-working.js";

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
