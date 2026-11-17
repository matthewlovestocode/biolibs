/**
 * Growing a strain and making it express what was put into it, and the gel that shows whether it did.
 *
 * This is the step the rest of the lab's tools lead up to. A gene is found, copied, cut, joined into
 * a construct, checked and put into a host, and all of that is still only DNA: a promise about a
 * protein that nobody has yet seen. An induction is where the promise is kept or is not. The flask
 * is fed something that turns the promoter on, it shakes for a few hours, and then a lane of a
 * polyacrylamide gel either has a band at the right mass or it does not.
 *
 * Two things about this are worth being plain about, because they are what makes an induction
 * different from every other tool here.
 *
 * - **Nothing that comes out is worked out from what went in.** A PCR's product is the stretch
 *   between the primers, and arithmetic gives it. A culture's product is whatever the cells chose to
 *   make, and no sequence predicts the yield, the solubility, or whether the thing folded. So what
 *   is computed here is only the protein the gene *codes for* and the mass its band *should* run at.
 *   Whether that band is there is read off a gel by a person, and is the one thing recorded.
 * - **The protein is not an output of the run.** A run's outputs are DNA, every device that reads
 *   the log agrees on that, and an entry that said otherwise would be refused by the ones that are
 *   older. So an induction is recorded as a run with no outputs that used some of a culture — the
 *   same shape a transformation has — and the protein is added afterwards as a part in its own
 *   right. The run says in its settings which protein it was expected to make, by the checksum that
 *   protein will have, which is how the two are tied together without a new kind of entry.
 */
import { partChecksum, type PartState, type StrainState } from "@biolibs/bionet";
import { amountOf, whereWords } from "@biolibs/bionet-panels";
import { PROTEIN_LADDERS, proteinBands, proteinGelById, proteinLadderById, type Band, type ProteinGel, type ProteinLadder } from "@biolibs/gel";
import { proteinFacts, proteinWorking, translateGene, type ProteinFacts, type Translated } from "./protein.js";
import type { Working } from "./pcr-working.js";
import type { ToolLab } from "./run.js";

/** What a run that grew a culture and made it express something is called, for the lab's record. */
export const INDUCTION = "induction";

/** The gel an induction is checked on unless somebody says otherwise: 12% acrylamide. */
export const USUAL_PROTEIN_GEL = "12";

/** The marker run beside it unless the operator picks one: `markerFor` chooses to suit the gel. */
export const USUAL_PROTEIN_LADDER = "";

/** A dalton is a gram per mole; a gel is read in thousands of them. */
export const DA_PER_KDA = 1_000;

/**
 * The marker to run beside a gel, unless somebody says otherwise: the one with most of its bands
 * inside what that gel separates.
 *
 * A marker is chosen to suit the gel, the way a person does it. A broad-range marker on a 12% gel
 * puts its 250, 150 and 100 kDa bands all in the well, where they are one smudge and no use for
 * reading anything off.
 *
 * @param gel - The gel.
 * @returns The marker.
 *
 * @example
 * ```ts
 * import { markerFor, proteinGelById } from "@biolibs/bionet-tools";
 *
 * markerFor(proteinGelById("12")).id;    // "low" — a broad-range marker's top three sit in the well
 * ```
 */
export function markerFor(gel: ProteinGel): ProteinLadder {
  const inside = (marker: ProteinLadder): number => marker.sizes.filter((one) => one <= gel.largest && one >= gel.smallest).length;
  return [...PROTEIN_LADDERS].sort((a, b) => inside(b) - inside(a) || (a.sizes.length - inside(a)) - (b.sizes.length - inside(b)))[0]!;
}

/** As much of a lab as an induction reads: an induction needs the strains, which no other tool does. */
export interface InductionLab extends ToolLab {
  strains: readonly StrainState[];
}

/** One culture that could be grown and induced. */
export interface CultureChoice {
  /** The culture's tube. */
  item: string;
  /** The strain it is a culture of. */
  strain: StrainState;
  /** How to say it in a list: what it is, how much there is, where it is. */
  label: string;
}

/** One thing a strain carries that codes for a protein, and could be expressed. */
export interface GeneChoice {
  /** The part. */
  part: PartState;
  /** The coding sequences marked on it, by label, longest first. An empty list means the whole part is the only choice. */
  coding: string[];
}

/** What somebody has chosen for an induction. */
export interface InductionChoice {
  /** The culture to grow, by its tube ID. */
  culture: string;
  /** The gene to express, by its part's checksum. One of the ones the strain carries. */
  gene: string;
  /** The label of a coding sequence marked on it, to read in place of the whole part. */
  cds?: string;
  /** Whether to take off a signal peptide marked at the start of it: for a secreted protein, that is what is collected. */
  cutSignal?: boolean;
  /** What the promoter was turned on with, and how much, as the operator writes it: `IPTG`, `0.5 mM`. */
  inducer?: string;
  concentration?: string;
  /** What the incubator was set to: degrees, revolutions a minute, and how long it ran. Whole numbers. */
  celsius?: number;
  rpm?: number;
  hours?: number;
  /** How much of the culture was used, in its own unit. A whole number. */
  used?: number;
  /** The acrylamide gel and the marker beside it, by their IDs in `@biolibs/gel`. */
  gel?: string;
  ladder?: string;
  /** The shaking incubator it was grown in, if the lab has one. */
  instrument?: string | null;
  /** What to call the protein, how much of it there is, and in what unit. */
  name?: string;
  amount?: number;
  unit?: string | null;
  /** Anything worth saying about it. */
  note?: string | null;
}

/** What an induction would be expected to give. */
export interface InductionPlan {
  /** The strain being grown, and the gene being expressed. */
  strain: StrainState | null;
  gene: PartState | null;
  /** The protein the gene codes for, or `null` if it could not be read as one. */
  made: Translated | null;
  /** What is known of that protein from its sequence alone. */
  facts: ProteinFacts | null;
  /** The checksum the protein will have in the lab, which is its identity. `null` if there is none to have. */
  checksum: string | null;
  /** What it weighs, in kilodaltons, as a gel is read: `null` unless the weight could be worked out. */
  kilodaltons: number | null;
  /** The band it should show, and the marker's bands beside it. */
  bands: Band[];
  ladder: Band[];
  /** The gel and marker it was worked out for. */
  gel: ProteinGel;
  ladderName: string;
  /** Why there is nothing to expect, said for a person, or `null` if there is. */
  problem: string | null;
}

/** An induction as chosen: what it would give, what to record, and the protein to keep if it worked. */
export interface InductionRun {
  /** What it would be expected to give. */
  plan: InductionPlan;
  /** The protein to add as a part, and the tube of it to add, if the band is there. `null` while there is no protein to expect. */
  keep: { name: string; sequence: string; kind: "protein"; amount: number; unit: string | null; checksum: string } | null;
  /** What to hand to the lab's `recordRun` if the band was there. `null` likewise. */
  showed: Record<string, unknown> | null;
  /** What to hand to it if it was grown and nothing was at that mass. `null` if the culture is missing. */
  nothing: Record<string, unknown> | null;
}

const whole = (value: number | undefined, usual: number): number =>
  value === undefined || !Number.isSafeInteger(value) || value < 0 ? usual : value;

/**
 * The cultures a lab could grow and induce: every culture with something in it.
 *
 * A tube of DNA is not offered, however much of it there is. Expression is something cells do.
 *
 * @param lab - The lab.
 * @returns The cultures to offer, the ones of a strain that carries something first, since those
 *   are the ones there is anything to express in.
 *
 * @example
 * ```ts
 * import { inductionCultures } from "@biolibs/bionet-tools";
 *
 * const cultures = inductionCultures(lab);
 * ```
 */
export function inductionCultures(lab: InductionLab): CultureChoice[] {
  const found: CultureChoice[] = [];
  for (const item of lab.items) {
    if (item.part !== null || item.retired || item.amount <= 0) continue;
    const strain = lab.strains.find((one) => one.strain === item.strain);
    if (strain === undefined) continue;
    found.push({ item: item.item, strain, label: `${strain.name} · ${amountOf(item)} · ${whereWords(item, lab.places)}` });
  }
  return found.sort((a, b) => b.strain.carries.length - a.strain.carries.length);
}

/**
 * What a culture's strain carries that there is any point inducing.
 *
 * A strain carries parts, and a part is DNA; a protein the lab happens to hold is not something to
 * express. What is marked on each is read for coding sequences, since a construct usually carries
 * more than a gene — a promoter, a marker, an origin — and it is the gene that is being asked for.
 *
 * @param lab - The lab.
 * @param culture - The culture's tube ID.
 * @returns What could be expressed, and the coding sequences marked on each.
 */
export function inductionGenes(lab: InductionLab, culture: string): GeneChoice[] {
  const item = lab.items.find((one) => one.item === culture);
  const strain = item === undefined ? undefined : lab.strains.find((one) => one.strain === item.strain);
  if (strain === undefined) return [];
  return strain.carries.flatMap((checksum) => {
    const part = lab.parts.find((one) => one.checksum === checksum);
    if (part === undefined || part.kind === "protein") return [];
    const coding = part.features.filter((one) => /^cds$/i.test(one.type) && one.parts.length === 1)
      .sort((a, b) => (b.parts[0]!.end - b.parts[0]!.start) - (a.parts[0]!.end - a.parts[0]!.start))
      .map((one) => one.label);
    return [{ part, coding }];
  });
}

/**
 * What an induction would be expected to give: the protein, and where its band should run.
 *
 * @param lab - The lab.
 * @param choice - The culture, the gene, and the gel to read it on.
 * @returns The protein, its mass, and the gel it should show.
 *
 * @example
 * ```ts
 * import { planInduction } from "@biolibs/bionet-tools";
 *
 * const plan = planInduction(lab, { culture, gene, cds: "casein", cutSignal: true });
 * plan.kilodaltons;    // what the band should run at
 * ```
 */
export function planInduction(lab: InductionLab, choice: InductionChoice): InductionPlan {
  let gel: ProteinGel;
  try { gel = proteinGelById(choice.gel ?? USUAL_PROTEIN_GEL); } catch { gel = proteinGelById(USUAL_PROTEIN_GEL); }
  // Chosen to suit the gel unless the operator has named one, since a marker whose bands all sit in
  // the well is a marker nothing can be read against.
  let marker = markerFor(gel);
  if (choice.ladder !== undefined) { try { marker = proteinLadderById(choice.ladder); } catch { /* the one that suits the gel */ } }
  const ladder = proteinBands(marker.sizes, gel).map((one) => ({ ...one, intensity: 1 }));
  const empty = (problem: string | null, strain: StrainState | null = null, gene: PartState | null = null): InductionPlan =>
    ({ strain, gene, made: null, facts: null, checksum: null, kilodaltons: null, bands: [], ladder, gel, ladderName: marker.name, problem });

  const item = lab.items.find((one) => one.item === choice.culture);
  if (item === undefined || item.part !== null) return empty("An induction grows a culture of a strain. Choose one of the lab's cultures.");
  const strain = lab.strains.find((one) => one.strain === item.strain);
  if (strain === undefined) return empty("The lab no longer lists the strain this is a culture of.");
  if (choice.gene === "") return empty(strain.carries.length === 0
    ? `Nothing has been put into ${strain.name}, so there is nothing in it to express.`
    : "Choose which of the things the strain carries to express.", strain);
  if (!strain.carries.includes(choice.gene)) return empty(`${strain.name} does not carry that part, so inducing it would not make that protein.`, strain);
  const gene = lab.parts.find((one) => one.checksum === choice.gene);
  if (gene === undefined) return empty("The lab no longer lists that part.", strain);
  if (gene.kind === "protein") return empty(`${gene.name} is a protein. What is expressed is a gene.`, strain, gene);

  const made = translateGene(gene, { ...(choice.cds === undefined || choice.cds === "" ? {} : { cds: choice.cds }), ...(choice.cutSignal === true ? { cutSignal: true } : {}) });
  if (made.problem !== null) return empty(made.problem, strain, gene);
  const facts = proteinFacts(made.protein);
  const kilodaltons = facts === null ? null : facts.weight / DA_PER_KDA;
  // A gene read in the wrong frame, or a broken one, gives a chain with a stop in the middle. That
  // is not something there can be a tube of, so it has no checksum and nothing offers to keep it —
  // but it is still shown, with the warnings that say what is wrong, because that is the finding.
  const keepable = /^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/i.test(made.protein);
  return {
    strain, gene, made, facts,
    checksum: keepable ? partChecksum({ sequence: made.protein, kind: "protein" }) : null,
    kilodaltons,
    bands: kilodaltons === null ? [] : proteinBands([kilodaltons], gel),
    ladder, gel, ladderName: marker.name, problem: null,
  };
}

/**
 * Work a choice out into an induction: what to record, and the protein to keep.
 *
 * What is recorded is a run that used some of a culture and made no molecule, because a run's
 * outputs are DNA and what this makes is not. The protein it was expected to make is named in the
 * run's settings by the checksum it will have, so that the run and the part can be put back together
 * afterwards by anybody reading the log, including a device that was not here.
 *
 * @param lab - The lab.
 * @param choice - The culture, the gene, how it was set up, and what to call what comes out.
 * @returns What it would give, what to record either way, and the protein to add if it worked.
 */
export function inductionRun(lab: InductionLab, choice: InductionChoice): InductionRun {
  const plan = planInduction(lab, choice);
  const item = lab.items.find((one) => one.item === choice.culture);
  if (item === undefined || item.part !== null) return { plan, keep: null, showed: null, nothing: null };
  const typed = choice.name?.trim() ?? "";
  const name = (typed !== "" ? typed
    : plan.made === null || plan.gene === null ? "a protein"
    : `${plan.made.signal === null ? "" : "mature "}${choice.cds !== undefined && choice.cds !== "" ? choice.cds : plan.gene.name}`).slice(0, 200);
  const inducer = choice.inducer?.trim() ?? "";
  const concentration = choice.concentration?.trim() ?? "";
  const record = {
    kind: INDUCTION, instrument: choice.instrument ?? null,
    inputs: [{ item: choice.culture, amount: whole(choice.used, 1), role: "culture" }],
    outputs: [],
    settings: {
      ...(inducer === "" ? {} : { inducer: inducer.slice(0, 200) }),
      ...(concentration === "" ? {} : { at: concentration.slice(0, 200) }),
      ...(Number.isSafeInteger(choice.celsius) ? { celsius: choice.celsius! } : {}),
      ...(Number.isSafeInteger(choice.rpm) ? { rpm: choice.rpm! } : {}),
      ...(Number.isSafeInteger(choice.hours) ? { hours: choice.hours! } : {}),
      ...(plan.gene === null ? {} : { gene: plan.gene.name.slice(0, 200), gene_part: plan.gene.checksum }),
      // Which stretch was read, and whether the signal peptide came off, because the protein's mass
      // depends on both and a name does not say either.
      ...(choice.cds === undefined || choice.cds === "" ? {} : { cds: choice.cds.slice(0, 200) }),
      ...(choice.cutSignal === true ? { signal_cut: plan.made?.signal === null ? "none marked" : "yes" } : {}),
      // Written as text, not as a number: an entry carries only whole numbers, and a mass to one
      // decimal place is what a gel is read to. Rounding it to a whole kDa would lose a small protein.
      ...(plan.kilodaltons === null ? {} : { expected_kda: (Math.round(plan.kilodaltons * 10) / 10).toFixed(1) }),
      // The protein is added as a part of its own, so this is what ties the two together.
      ...(plan.checksum === null ? {} : { made: plan.checksum }),
      gel: `${plan.gel.percent}%`,
    },
    note: choice.note ?? null,
  };
  const keep = plan.made === null || plan.checksum === null || plan.made.protein === "" ? null : {
    name, sequence: plan.made.protein, kind: "protein" as const,
    amount: whole(choice.amount, 1), unit: choice.unit === undefined ? "mL" : choice.unit, checksum: plan.checksum,
  };
  return {
    plan, keep,
    showed: keep === null ? null : { ...record, outcome: "worked" },
    nothing: { ...record, outcome: "failed" },
  };
}

/** Something a careful operator would stop and ask about an induction before setting it up. */
export interface InductionCheck {
  /** `stop` if the gel is unlikely to show what is hoped, `look` if it is only worth a second glance. */
  weight: "stop" | "look";
  /** What to say. */
  says: string;
  /** The short reason, to put beside it. */
  because: string;
}

/**
 * What a careful operator would ask of an induction before running it.
 *
 * None of this is about the protein being wrong. It is about the gel being unable to answer the
 * question: a band smaller than the gel separates runs off the front, one larger stays in the well,
 * and one that lands on a marker band cannot be told from it. A protein that the sequence says is
 * unstable is worth knowing about before a day is spent on it.
 *
 * @param plan - The induction as worked out.
 * @returns What to say, the ones worth stopping for first.
 *
 * @example
 * ```ts
 * import { inductionChecks, planInduction } from "@biolibs/bionet-tools";
 *
 * inductionChecks(planInduction(lab, choice)).filter((one) => one.weight === "stop");
 * ```
 */
export function inductionChecks(plan: InductionPlan): InductionCheck[] {
  const checks: InductionCheck[] = [];
  const kda = plan.kilodaltons;
  const round = (value: number): string => `${Math.round(value * 10) / 10} kDa`;
  if (kda !== null) {
    if (kda < plan.gel.smallest) {
      checks.push({ weight: "stop", says: `${round(kda)} is smaller than ${plan.gel.percent}% acrylamide separates, so the band would run off the front or be too faint to see. A higher percentage would hold it.`, because: `${round(kda)} < ${plan.gel.smallest} kDa` });
    } else if (kda > plan.gel.largest) {
      checks.push({ weight: "stop", says: `${round(kda)} is larger than ${plan.gel.percent}% acrylamide separates, so the band would stay at the well. A lower percentage would spread it.`, because: `${round(kda)} > ${plan.gel.largest} kDa` });
    } else {
      // A band within a few per cent of a marker band is a band nobody can report having seen.
      const near = plan.ladder.find((one) => Math.abs(one.size - kda) <= kda * 0.06);
      if (near !== undefined) {
        checks.push({ weight: "look", says: `${round(kda)} is close to the marker's ${near.size} kDa band, so the two would be hard to tell apart. A marker whose bands fall elsewhere, or a lane of uninduced cells to compare against, would settle it.`, because: `${round(kda)} ≈ ${near.size} kDa` });
      }
    }
  }
  if (plan.made !== null) {
    for (const warning of plan.made.warnings) checks.push({ weight: "look", says: warning, because: "read from the gene" });
    if (plan.made.signal !== null) {
      checks.push({ weight: "look", says: `${plan.made.signal.label} was taken off, so this is the mass of what the cells let out. What is still inside them is ${plan.made.signal.peptide.length} amino acids longer and runs higher.`, because: "signal peptide cut" });
    }
  }
  if (plan.facts !== null && plan.facts.instability > 40) {
    checks.push({ weight: "look", says: `The sequence puts the instability index at ${plan.facts.instability.toFixed(1)}, and over 40 is reckoned unstable in a tube. Keep it cold and run the gel the same day.`, because: `instability ${plan.facts.instability.toFixed(1)} > 40` });
  }
  return checks.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop"));
}

/**
 * The working behind an induction: the protein, and where its band should run.
 *
 * The first of these is the translation and what the sequence says about the protein, which is
 * `proteinWorking`'s. The last is the one thing added here, and it is the one that has to be read
 * carefully: a position on a gel is an estimate from a straight-line rule, and a mass is read
 * against the marker beside it and never off a distance.
 *
 * @param plan - The induction as worked out.
 * @returns The workings, in the order to read them. Empty if there is nothing to expect.
 */
export function inductionWorking(plan: InductionPlan): Working[] {
  if (plan.made === null) return [];
  const out = [...proteinWorking(plan.made, plan.facts)];
  const kda = plan.kilodaltons;
  if (kda !== null) {
    const [high, low, own] = [Math.log10(plan.gel.largest), Math.log10(plan.gel.smallest), Math.log10(kda)];
    const round = (value: number): string => value.toFixed(2);
    const position = plan.bands[0]?.position ?? 0;
    const inside = kda <= plan.gel.largest && kda >= plan.gel.smallest;
    out.push({
      of: `where ${Math.round(kda * 10) / 10} kDa runs on ${plan.gel.percent}% acrylamide`,
      comes: `${Math.round(position * 100)}% of the way down`, kind: "estimate",
      steps: [
        `${Math.round(plan.facts!.weight)} Da is ${Math.round(kda * 10) / 10} kDa, which is what a protein gel is read in.`,
        `This gel separates ${plan.gel.largest} kDa, which barely leaves the well, down to ${plan.gel.smallest} kDa, which reaches the front.`,
        `Distance goes with the logarithm of mass: log₁₀ ${plan.gel.largest} = ${round(high)}, log₁₀ ${plan.gel.smallest} = ${round(low)}, log₁₀ ${Math.round(kda * 10) / 10} = ${round(own)}.`,
        inside ? `So it is (${round(high)} − ${round(own)}) ÷ (${round(high)} − ${round(low)}) = ${round(position)} of the way down, beside the marker's ${plan.ladder.filter((one) => one.size >= kda).at(-1)?.size ?? plan.gel.largest} kDa band.`
               : `${Math.round(kda * 10) / 10} kDa is ${kda > plan.gel.largest ? "larger" : "smaller"} than this gel separates, so it is drawn at the ${kda > plan.gel.largest ? "well" : "front"}.`,
      ],
      rests: "SDS coats a protein with much the same charge for every unit of mass and undoes its shape, so what is left to sort chains by is size, and over a gel's working range the distance is close to a straight line against the logarithm of mass. It is an approximation. A marker's bands are themselves calibrated and run a little off their printed weights, and a protein that is glycosylated or not fully reduced runs at a size that is not the mass its sequence comes to. Read a band against the marker in the lane beside it, never off a distance.",
    });
  }
  return out;
}

/**
 * Which of a lab's parts came out of an induction, as the runs themselves say.
 *
 * A protein part is added apart from the run that made it, so the tie between them is the checksum
 * the run recorded in its settings. Reading it back this way means a device that was not there when
 * it happened arrives at the same answer from the log alone.
 *
 * @param lab - The lab, with its runs.
 * @param checksum - The protein's checksum.
 * @returns The IDs of the runs that said they would make it, in the order they were recorded.
 *
 * @example
 * ```ts
 * import { inducedBy } from "@biolibs/bionet-tools";
 *
 * inducedBy(lab, protein.checksum);    // ["…"], or [] for a protein nobody grew here
 * ```
 */
export function inducedBy(lab: { runs: readonly { run: string; kind: string; outcome: string; settings: Readonly<Record<string, string | number>> }[] },
                          checksum: string): string[] {
  return lab.runs.filter((one) => one.kind === INDUCTION && one.outcome === "worked" && one.settings["made"] === checksum).map((one) => one.run);
}

/**
 * Whether a part looks like one an induction made: a protein, with a run that says it made it.
 *
 * @param lab - The lab, with its runs.
 * @param part - The part.
 * @returns Whether some induction in the lab's record was expected to make it.
 */
export const wasInduced = (lab: Parameters<typeof inducedBy>[0], part: Pick<PartState, "checksum" | "kind">): boolean =>
  part.kind === "protein" && inducedBy(lab, part.checksum).length > 0;
