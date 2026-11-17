/**
 * The work written out as something a person can carry to a bench.
 *
 * Everything else here is for a screen: a panel that knows the lab, with the tubes in dropdowns and
 * the working folded away. None of it is any use at a bench with gloves on, and a plan nobody can
 * follow standing up is not finished.
 *
 * The whole difficulty is honesty. A plan records what the operator set — the cycling programme, the
 * enzymes, the inducer and how long for — and a protocol wants rather more than that: a polymerase,
 * a buffer, a final volume, a way of making cells competent. Those are not in the plan, and a tool
 * that wrote in plausible ones would be making things up on a page somebody carries to a bench and
 * trusts. So each step carries two lists and they are kept apart: what the plan says to do, which is
 * exact, and what the plan does not say, which is named so the lab fills it in with its own usual
 * way rather than discovering the hole halfway through.
 *
 * Nothing here invents a number. If a volume is in it, somebody set that volume.
 */
import type { PlanState } from "@biolibs/bionet";
import { planOfWork, type OrderingLab, type Step } from "./ordering.js";

/**
 * As much of a lab as a protocol reads: the work, plus the names of things, since a sheet carried to
 * a bench says "1 µL of pGene, in Box 1" and not a checksum.
 */
export interface ProtocolLab extends OrderingLab {
  parts: readonly { checksum: string; name: string; length: number; circular: boolean }[];
  strains?: readonly { strain: string; name: string; host: string }[];
  places?: readonly { place: string; name: string }[];
}

/** One step, as somebody at a bench reads it. */
export interface ProtocolStep {
  /** Its number within its piece of work. */
  number: number;
  /** What the step is, in a line. */
  title: string;
  /** What to get out before starting, with how much of each and where it is. */
  takeOut: string[];
  /** What to set a machine to, from what the plan recorded. */
  set: { what: string; to: string }[];
  /** What to do, in order. */
  doThis: string[];
  /** What to record afterwards, which is what keeps the lab's history true. */
  thenRecord: string;
  /**
   * What this plan does not say, and the lab has to supply.
   *
   * The most important list on the page. A protocol that quietly left these out would read as
   * complete and send somebody to the bench without a polymerase.
   */
  notSaid: string[];
  /** Whatever the person who proposed it wanted to say. */
  note: string | null;
}

/** One piece of work, written out. */
export interface Protocol {
  /** What it is called. */
  title: string;
  /** A line or two about what it is and what it leaves you with. */
  about: string[];
  /** What the lab has to have before the first step. */
  haveReady: string[];
  /** The steps, in the order to carry them out. */
  steps: ProtocolStep[];
  /** What you have at the end of it. */
  atTheEnd: string[];
}

/** What a kind of run is called on the page, and what a plan of that kind never says. */
const KINDS: Readonly<Record<string, { title: string; records: string; notSaid: readonly string[] }>> = {
  pcr: {
    title: "Copy it by PCR",
    records: "at the PCR tool, which takes what it used from each tube and puts the product in the freezer.",
    notSaid: ["which polymerase and which buffer", "the final volume of the reaction, and how much water",
              "how much of each primer, by concentration", "the first denaturation and the last extension"],
  },
  digest: {
    records: "at the digest and gel tool, which takes what it used and notes whether the gel showed what was expected.", title: "Cut it, and run a gel",
    notSaid: ["which buffer, and how much enzyme", "what temperature to cut at and for how long",
              "how the gel is stained and how it is looked at"],
  },
  ligation: {
    records: "at the ligation tool, which takes what it used and puts what came out in the freezer.", title: "Join the pieces",
    notSaid: ["which ligase and which buffer", "the ratio of insert to vector", "what temperature to leave it at, and for how long"],
  },
  assembly: {
    records: "at the assembly tool, which takes what it used and puts the ring in the freezer.", title: "Build the ring",
    notSaid: ["which assembly mix", "what temperature to hold it at, and for how long", "how much of each piece, by concentration"],
  },
  transformation: {
    records: "on the Strains page. Whether it worked is whether colonies grew, which only you can say, and either way it used what it used.", title: "Put it into a host",
    notSaid: ["how the cells are made competent", "heat shock or electroporation, and the settings for it",
              "how long to let them recover, and in what", "what to select on"],
  },
  induction: {
    records: "at the induction tool, which takes what it used and, if the band is there, puts the protein in the freezer.", title: "Grow it and look for the protein",
    notSaid: ["which medium, and what volume", "what density to induce at", "how the cells are broken open, if they are",
              "how the gel is stained"],
  },
  sequencing: { records: "at the checking tool, which compares the read against the design and records what it found.", title: "Have it sequenced", notSaid: ["which facility, and how they want it sent", "how much to send, and at what concentration"] },
};

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * The work of one piece, written out as a protocol.
 *
 * @param lab - The lab, for the names of what its tubes hold and where they are.
 * @param options - `project` picks one project's work; `title` names the sheet.
 * @returns One protocol for each piece of work, in the order the pieces come.
 *
 * @example
 * ```ts
 * import { protocolsFor, protocolText } from "@biolibs/bionet-tools";
 *
 * for (const sheet of protocolsFor(lab, { project: "Real Vegan Cheese" })) console.log(protocolText(sheet));
 * ```
 */
export function protocolsFor(lab: ProtocolLab, options: { project?: string; title?: string } = {}): Protocol[] {
  const work = planOfWork(lab);
  const threads = options.project === undefined ? work.threads
    : work.projects.find((one) => one.name === options.project)?.threads ?? [];

  const partName = (checksum: string | null | undefined): string =>
    lab.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  const placeName = (place: string | null | undefined): string | null =>
    (lab.places ?? []).find((one) => one.place === place)?.name ?? null;
  /** What is in a tube, by the lab's name for it. */
  const whatIsIn = (item: string): string => {
    const held = lab.items.find((one) => one.item === item);
    if (held === undefined) return "something the lab no longer has";
    return held.part === null
      ? (lab.strains ?? []).find((one) => one.strain === held.strain)?.name ?? "a culture"
      : partName(held.part);
  };
  /**
   * How much of what, for an instruction: short, because the instruction is read while doing it.
   */
  const tubeWords = (item: string, amount: number): string => {
    const held = lab.items.find((one) => one.item === item);
    const unit = held?.unit ?? "";
    return `${count(amount)}${unit === "" ? "" : ` ${unit}`} of ${whatIsIn(item)}`;
  };
  /**
   * The same, with where it is and how much the tube holds: for the list of what to fetch before
   * starting, which is read standing in front of a freezer and wants rather more.
   */
  const fetchWords = (item: string, amount: number): string => {
    const held = lab.items.find((one) => one.item === item);
    if (held === undefined) return "a tube the lab no longer has";
    const unit = held.unit ?? "";
    const where = placeName(held.where?.place);
    return `${tubeWords(item, amount)}${where === null ? "" : ` — in ${where}`}`
      + ` (the tube holds ${count(held.amount)}${unit === "" ? "" : ` ${unit}`})`;
  };

  const says = (plan: PlanState, key: string): string | null => {
    const value = plan.settings[key];
    return value === undefined ? null : String(value);
  };

  /** What to do, for a kind of run, from what the plan actually recorded. */
  const doingOf = (step: Step): { doThis: string[]; set: { what: string; to: string }[] } => {
    const plan = step.plan;
    const used = plan.inputs.map((one) => ({
      // A part the lab has no tube of has an amount but no unit, since the unit belongs to the tube.
      // A bare "1 of the insert" reads as a mistake, so it is simply named.
      ...one, words: one.item === undefined ? partName(one.part) : tubeWords(one.item, one.amount),
    }));
    const byRole = (role: string) => used.filter((one) => one.role === role);
    const makes = plan.expects.map((one) => `${one.name} (${count(one.length)} bp${one.circular ? ", a circle" : ""})`);
    const set: { what: string; to: string }[] = [];
    const doThis: string[] = [];

    if (plan.kind === "pcr") {
      const template = byRole("template")[0] ?? used[0];
      const primers = used.filter((one) => /primer/.test(one.role));
      doThis.push(`Set up the reaction with ${template?.words ?? "the template"} as the template`
        + (primers.length === 0 ? "." : `, and ${primers.map((one) => one.words).join(" and ")}.`));
      const programme = ["denature_c", "anneal_c", "anneal_s", "extend_c", "extend_s", "cycles"].map((key) => says(plan, key));
      if (programme.every((one) => one !== null)) {
        set.push({ what: "Denature", to: `${programme[0]} °C` });
        set.push({ what: "Anneal", to: `${programme[1]} °C for ${programme[2]} s` });
        set.push({ what: "Extend", to: `${programme[3]} °C for ${programme[4]} s` });
        set.push({ what: "Cycles", to: String(programme[5]) });
        doThis.push("Run the programme above.");
      } else {
        doThis.push("Run it on the thermocycler. This plan does not record the programme, so set it as the lab usually does for these primers.");
      }
      doThis.push(`Expect ${makes.join(" and ") || "one product"}.`);
    } else if (plan.kind === "digest") {
      const enzymes = (says(plan, "enzymes") ?? "").split("+").filter((one) => one !== "");
      doThis.push(`Cut ${used.map((one) => one.words).join(" and ")}`
        + (enzymes.length === 0 ? "." : ` with ${enzymes.join(" and ")}.`));
      const gel = says(plan, "gel");
      if (gel !== null) set.push({ what: "Gel", to: `${gel}% agarose` });
      for (const [key, what] of [["volts", "Run at"], ["minutes", "For"]] as const) {
        const value = says(plan, key);
        if (value !== null) set.push({ what, to: key === "volts" ? `${value} V` : `${value} min` });
      }
      const expected = says(plan, "expected");
      doThis.push("Run it on the gel beside a ladder.");
      if (expected !== null) doThis.push(`Expect bands at ${expected.split(",").map((one) => `${count(Number(one))} bp`).join(", ")}.`);
    } else if (plan.kind === "ligation" || plan.kind === "assembly") {
      doThis.push(`Put ${used.map((one) => one.words).join(" and ")} together.`);
      const overlap = says(plan, "overlap");
      if (overlap !== null) set.push({ what: "Overlap at each join", to: `${overlap} bp` });
      const joins = says(plan, "joins");
      if (joins !== null) set.push({ what: "Joins", to: String(joins) });
      doThis.push(`Expect ${makes.join(" and ") || "one product"}.`);
    } else if (plan.kind === "transformation") {
      const construct = byRole("construct")[0];
      const host = byRole("host")[0];
      doThis.push(`Put ${construct?.words ?? "the construct"} into ${host?.words ?? "the host"}.`);
      doThis.push("Plate them out and leave them to grow.");
      doThis.push("Whether it worked is whether colonies grew, which only you can say. Either way it used what it used.");
    } else if (plan.kind === "induction") {
      const culture = used[0];
      doThis.push(`Grow ${culture?.words ?? "the culture"}.`);
      const inducer = says(plan, "inducer");
      const at = says(plan, "at");
      if (inducer !== null) doThis.push(`Add ${inducer}${at === null ? "" : ` to ${at}`}.`);
      for (const [key, what, unit] of [["celsius", "Grow at", "°C"], ["rpm", "Shaking at", "rpm"], ["hours", "For", "h"]] as const) {
        const value = says(plan, key);
        if (value !== null) set.push({ what, to: `${value} ${unit}` });
      }
      const kda = says(plan, "expected_kda");
      doThis.push("Run a sample on a protein gel, beside a lane of the same culture before it was induced.");
      if (kda !== null) doThis.push(`Look for a band at ${kda} kDa that is in the induced lane and not the other.`);
    } else {
      doThis.push(`Carry out the ${plan.kind} with ${used.map((one) => one.words).join(" and ") || "what it names"}.`);
      if (makes.length > 0) doThis.push(`Expect ${makes.join(" and ")}.`);
    }
    return { doThis, set };
  };

  return threads.map((thread) => {
    const steps: ProtocolStep[] = thread.steps.map((step, at) => {
      const known = KINDS[step.plan.kind];
      const number = at + 1;
      const { doThis, set } = doingOf(step);
      // Something with no tube may be made by a step before this one, which the chain already
      // knows. Saying "order it" when step 1 makes it would send somebody shopping for nothing.
      const madeAt = (checksum: string | undefined): number | null => {
        const at = thread.steps.findIndex((each) => each.makes.includes(checksum ?? ""));
        return at < 0 || at >= number ? null : at + 1;
      };
      const takeOut = step.plan.inputs.map((one) => {
        if (one.item !== undefined) return fetchWords(one.item, one.amount);
        const from = madeAt(one.part);
        return from === null
          ? `${partName(one.part)} — the lab has no tube of it, and nothing here makes it: order or make it first`
          : `${partName(one.part)} — what step ${from} makes`;
      });
      return {
        number,
        title: known?.title ?? `Carry out the ${step.plan.kind}`,
        takeOut, set, doThis,
        // Recording is what keeps the lab's history true, and where it is done differs by kind:
        // a transformation is not run at a machine and is said on the Strains page.
        thenRecord: `Record it ${known?.records ?? `at the ${step.plan.kind} tool.`}`,
        notSaid: [...(known?.notSaid ?? ["what this plan does not record, the lab supplies as usual"])],
        note: step.plan.note,
      };
    });
    const needed = work.toGet.filter((one) => one.forSteps.some((each) => thread.steps.some((step) => step.plan.plan === each)));
    // A chain that makes nothing — a digest, a check — has no product to be named by, so it is
    // named by what it is done to, which is what somebody looking for the sheet would call it.
    const actsOn = thread.steps[0]?.plan.inputs.flatMap((one) => (one.item === undefined ? [partName(one.part)] : [whatIsIn(one.item)])) ?? [];
    return {
      title: options.title ?? (thread.ends.length > 0 ? thread.name
        : actsOn.length > 0 ? `${KINDS[thread.steps[0]!.plan.kind]?.title ?? thread.steps[0]!.plan.kind}: ${actsOn[0]}` : thread.name),
      about: [
        `${steps.length} ${steps.length === 1 ? "step" : "steps"}.`,
        ...(thread.ends.length === 0 ? [] : [`It ends with ${thread.ends.map((one) => partName(one.checksum) === "a part" ? one.name : partName(one.checksum)).join(" and ")}.`]),
        "Every step is proposed, not done: nothing is used and nothing is recorded until somebody carries it out and says so.",
      ],
      haveReady: [
        ...needed.map((one) => `${partName(one.checksum) === "a part" ? one.name : partName(one.checksum)} — nothing here makes it and the lab has no tube: order or make it first.`),
        ...[...new Set(thread.steps.flatMap((step) => step.plan.inputs.flatMap((one) => (one.item === undefined ? [] : [fetchWords(one.item, one.amount)]))))],
      ],
      steps,
      atTheEnd: thread.ends.map((one) => partName(one.checksum) === "a part" ? one.name : partName(one.checksum)),
    };
  });
}

/**
 * A protocol as text, to print or to paste.
 *
 * Markdown, because it reads as well unrendered as rendered, and somebody at a bench is as likely to
 * have it in a terminal or a text file as on a page.
 *
 * @param protocol - What `protocolsFor` gave.
 * @returns The sheet.
 */
export function protocolText(protocol: Protocol): string {
  const out: string[] = [`# ${protocol.title}`, ""];
  for (const line of protocol.about) out.push(line, "");
  if (protocol.haveReady.length > 0) {
    out.push("## Have ready", "");
    for (const one of protocol.haveReady) out.push(`- ${one}`);
    out.push("");
  }
  for (const step of protocol.steps) {
    out.push(`## ${step.number}. ${step.title}`, "");
    if (step.note !== null) out.push(`*${step.note}*`, "");
    if (step.takeOut.length > 0) {
      out.push("**Take out**", "");
      for (const one of step.takeOut) out.push(`- ${one}`);
      out.push("");
    }
    if (step.set.length > 0) {
      out.push("**Set**", "");
      for (const one of step.set) out.push(`- ${one.what}: ${one.to}`);
      out.push("");
    }
    out.push("**Do**", "");
    for (const [at, one] of step.doThis.entries()) out.push(`${at + 1}. ${one}`);
    out.push("", `**Then** ${step.thenRecord}`, "");
    out.push("**This plan does not say**", "");
    for (const one of step.notSaid) out.push(`- ${one}`);
    out.push("");
  }
  if (protocol.atTheEnd.length > 0) out.push(`At the end you have ${protocol.atTheEnd.join(" and ")}.`, "");
  out.push("---", "",
           "Everything above that is a number — a volume, a temperature, a time, a length — is what somebody",
           "set or what the lab's own tools worked out. Nothing here was filled in to make the page look finished:",
           "what the plan does not say is listed under each step instead.");
  return out.join("\n");
}
