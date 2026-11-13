/**
 * Replays the @biolibs/seqedit golden cases (reference/golden/gen_seqedit_cases.py) against the port.
 *
 * Encoding: see reference/golden/codec_feature.py. The record and feature codecs are reused from the seqfeature and
 * seqrecord test helpers, so the comparison is byte-for-byte the same shape Python wrote.
 *
 * Each case names the Biopython operation that is the authority, and the port function measured against it:
 *
 *   slice  record[a:b]           -> extractRegion(record, a, b, { edgeFeatures: "drop" })
 *   rc     record.reverse_complement(...) -> reverseComplementRecord(record)
 *   shift  location + offset     -> shiftLocation(location, offset)
 */
import { captureWarnings } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { extractRegion, reverseComplementRecord, shiftLocation } from "@biolibs/seqedit";
import type { AnyLocation } from "@biolibs/seqedit";
import { dec as decF, enc as encF } from "../../seqfeature/test/golden-runner";
import { RECORDS, dec as decR, enc as encR } from "../../seqrecord/test/golden-runner";

export { RECORDS };

/** One recorded case. */
export interface Case {
  op: "slice" | "rc" | "shift";
  recv?: unknown;
  args?: unknown[];
  result?: unknown;
  exc?: { type: string; msg: string | null };
  warnings: string[];
  /**
   * Set when the port deliberately does something Biopython does not, with the reason. The recorded outcome is then
   * Biopython's and the port must *not* reproduce it; {@link diff} checks that the divergence is real.
   */
  divergence?: string;
}

/** The sequence and features of a record, which is all a `slice` case compares (see the generator's docstring). */
function featuresOnly(record: SeqRecord): unknown {
  const full = encR(record) as Record<string, unknown>;
  return { seq: full["seq"], features: full["features"] };
}

/** Run one case, returning the same outcome shape Python recorded. */
export function runCase(c: Case): { result?: unknown; exc?: { type: string; msg: string }; warnings: string[] } {
  const cap = captureWarnings(() => {
    const args = (c.args ?? []).map((a) => (typeof a === "number" ? a : decF(a)));
    if (c.op === "shift") return encF(shiftLocation(args[0] as AnyLocation, args[1] as number));
    const record = decR(c.recv) as SeqRecord;
    if (c.op === "rc") return encR(reverseComplementRecord(record));
    // Biopython's slicing drops features that cross the edge, which is `edgeFeatures: "drop"`.
    return featuresOnly(extractRegion(record, args[0] as number, args[1] as number, { edgeFeatures: "drop" }));
  });
  const out: { result?: unknown; exc?: { type: string; msg: string }; warnings: string[] } = {
    warnings: cap.warnings.map((w) => w.message),
  };
  if (cap.error !== undefined) out.exc = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  else out.result = cap.result;
  return out;
}

/** The first difference between Python's outcome and ours, or null. */
export function diff(c: Case, got: ReturnType<typeof runCase>): string | null {
  // A recorded divergence: Biopython raised and the port is expected to carry on instead. Checking it this way
  // means the divergence cannot quietly disappear, or quietly spread to a case it was not claimed for.
  if (c.divergence) {
    if (!c.exc) return `case is marked as a divergence but Biopython did not raise: ${c.divergence}`;
    if (got.exc) return `expected the port to diverge (${c.divergence}) but it raised ${got.exc.type}: ${got.exc.msg}`;
    return null;
  }
  if (c.exc) {
    if (!got.exc) return `expected ${c.exc.type}: ${c.exc.msg}, got result ${JSON.stringify(got.result)}`;
    if (c.exc.type !== got.exc.type) return `expected ${c.exc.type}, got ${got.exc.type}: ${got.exc.msg}`;
    return null;
  }
  if (got.exc) return `expected a result, got ${got.exc.type}: ${got.exc.msg}`;
  if (JSON.stringify(c.result) !== JSON.stringify(got.result)) {
    return `result:\n      expected ${JSON.stringify(c.result)}\n      got      ${JSON.stringify(got.result)}`;
  }
  if (JSON.stringify(c.warnings) !== JSON.stringify(got.warnings)) {
    return `warnings: expected ${JSON.stringify(c.warnings)}, got ${JSON.stringify(got.warnings)}`;
  }
  return null;
}
