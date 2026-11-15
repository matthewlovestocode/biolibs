/**
 * Replays the Bio.Entrez golden cases (reference/golden/gen_entrez_cases.py).
 *
 * No case touches the network. The cases record the request Biopython builds, the parameters it adds,
 * the warning it gives, the errors it raises, and what `_open` does with a scripted network, clock and
 * `sleep`; each is replayed here and compared exactly, including the text of every message.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { EntrezRequest, HTTPError, type Reply, URLError, buildRequest, constructParams, ecitmatch, efetch, einfo, elink, epost, esearch,
  espell, esummary, formatIds, hasApiKey, open, settings, throttle, updateEcitmatchVariables } from "@biolibs/entrez";
import { afterEach, describe, expect, it } from "vitest";

type Encoded = string | number | boolean | null | { bytes: string } | { pairs: [string, Encoded][] } | Encoded[];
type Pairs = [string, Encoded][] | null;
interface Outcome { value?: unknown; exc?: { type: string; msg: string }; warnings?: { category: string; message: string }[] }
interface Sent { method: string; url: string; data: string | null }
interface PySettings { email?: string | null; tool?: string | null; api_key?: string | null }
type Step = { http: number; msg: string } | { url: string } | { ok: { body: string; content_type: string | null; url?: string } };
interface OpenCase extends Outcome {
  request: Sent; previous: number; now: number; steps: Step[]; max_tries?: number; sleep_between_tries?: number;
  sleeps: number[]; calls: number; previous_after: number;
}

const golden = JSON.parse(readFileSync(new URL("./golden/entrez.json", import.meta.url), "utf8")) as {
  format_ids: ({ ids: Encoded } & Outcome)[];
  construct_params: ({ settings: PySettings; params: Pairs; join_ids: boolean } & Outcome)[];
  build_request: ({ settings: PySettings; cgi: string; params: Pairs; post: boolean | null; ecitmatch: boolean; join_ids: boolean } & Outcome)[];
  has_api_key: { request: Sent; value: boolean }[];
  ecitmatch_variables: ({ keywds: Pairs } & Outcome)[];
  eutils: ({ fn: string; args: string[]; keywds: Pairs; settings: PySettings } & Outcome)[];
  open: OpenCase[];
};

const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const fromLatin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

/** A recorded Python value as the value the port takes. @param value - JSON from the generator. @returns Its TypeScript form. */
function decode(value: Encoded): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === "object") return "bytes" in value ? latin1(value.bytes) : new Map(value.pairs.map(([k, v]) => [k, decode(v)]));
  return value;
}
const params = (pairs: Pairs) => (pairs === null ? null : new Map(pairs.map(([k, v]) => [k, decode(v)] as [string, unknown])));

/** The port's value in the generator's encoding. @param value - What the port returned. @returns It, as JSON. */
function encode(value: unknown): unknown {
  if (value instanceof Uint8Array) return { bytes: fromLatin1(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (value instanceof Map) return [...value].map(([k, v]) => [k, encode(v)]);
  if (value instanceof EntrezRequest) return sent(value);
  return value;
}
const sent = (request: EntrezRequest): Sent => ({ method: request.method, url: request.fullUrl, data: request.data && fromLatin1(request.data) });

/** Python's settings, applied to the port's. @param s - `Entrez.email` and friends as the case had them. */
function apply(s: PySettings): void {
  settings.email = s.email ?? null;
  settings.tool = "tool" in s ? (s.tool ?? null) : "biopython";
  settings.apiKey = s.api_key ?? null;
}

const defaults = { ...settings };
afterEach(() => {
  Object.assign(settings, defaults);
  throttle.previous = 0;
});

/**
 * Compare a recorded outcome with the port's: the value, or the error's type and message, and the warnings.
 *
 * Python's `str()` of a `KeyError` is the key's `repr()`, where the port's message is the key itself.
 *
 * @param want - What Biopython did. @param run - How to get the port's answer.
 */
function check(want: Outcome, run: () => unknown): void {
  const got = captureWarnings(run);
  if (want.exc) {
    expect(got.error, `expected ${want.exc.type}: ${want.exc.msg}`).toBeInstanceOf(Error);
    const error = got.error as Error;
    expect(error.name).toBe(want.exc.type);
    expect(error.name === "KeyError" ? `'${error.message}'` : error.message).toBe(want.exc.msg);
  } else {
    expect(got.error).toBeUndefined();
    expect(encode(got.result)).toEqual(want.value);
  }
  expect(got.warnings).toEqual(want.warnings ?? []);
}

describe("_format_ids", () => {
  it.each(golden.format_ids.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    check(c, () => formatIds(decode(c.ids)));
  });
});

describe("_construct_params", () => {
  it.each(golden.construct_params.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    apply(c.settings);
    check(c, () => constructParams(params(c.params), c.join_ids));
  });
});

describe("_build_request", () => {
  it.each(golden.build_request.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    apply(c.settings);
    check(c, () => buildRequest(c.cgi, params(c.params), c.post, c.ecitmatch, c.join_ids));
  });
});

describe("_has_api_key", () => {
  it.each(golden.has_api_key.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    const request = new EntrezRequest(c.request.url, c.request.method as "GET" | "POST", c.request.data === null ? null : latin1(c.request.data));
    expect(hasApiKey(request)).toBe(c.value);
  });
});

describe("_update_ecitmatch_variables", () => {
  it.each(golden.ecitmatch_variables.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    check(c, () => updateEcitmatchVariables(params(c.keywds)));
  });
});

describe("the E-utilities", () => {
  const functions = {
    efetch: (args: string[], k: Map<string, unknown> | null) => efetch(args[0]!, k),
    esearch: (args: string[], k: Map<string, unknown> | null) => esearch(args[0]!, args[1]!, k),
    epost: (args: string[], k: Map<string, unknown> | null) => epost(args[0]!, k),
    elink: (_: string[], k: Map<string, unknown> | null) => elink(k),
    einfo: (_: string[], k: Map<string, unknown> | null) => einfo(k),
    esummary: (_: string[], k: Map<string, unknown> | null) => esummary(k),
    espell: (_: string[], k: Map<string, unknown> | null) => espell(k),
    ecitmatch: (_: string[], k: Map<string, unknown> | null) => ecitmatch(k),
  };

  it.each(golden.eutils.map((c, i) => [i, c.fn, c] as const))("case %i: %s", (_, fn, c) => {
    apply(c.settings);
    // In place of the network: note what would have been sent. The request is built before the
    // function returns, so the first `await` inside `open` is the only thing left to happen.
    let captured: EntrezRequest | undefined;
    settings.now = () => 1000;
    settings.sleep = async () => {};
    settings.transport = async (request) => {
      captured = request;
      return { url: request.fullUrl, contentType: "text/xml", body: new Uint8Array() };
    };
    let pending: Promise<unknown> | undefined;
    check({ ...c, value: undefined }, () => {
      pending = functions[fn as keyof typeof functions](c.args, params(c.keywds));
    });
    if (c.exc) return;
    return pending!.then(() => expect(sent(captured!)).toEqual(c.value));
  });
});

describe("_open", () => {
  it.each(golden.open.map((c, i) => [i, c] as const))("case %i", async (_, c) => {
    const steps = [...c.steps];
    const sleeps: number[] = [];
    let calls = 0;
    settings.maxTries = c.max_tries ?? 3;
    settings.sleepBetweenTries = c.sleep_between_tries ?? 15;
    settings.now = () => c.now;
    settings.sleep = async (seconds) => void sleeps.push(seconds);
    settings.transport = async (request): Promise<Reply> => {
      calls++;
      const step = steps.shift() ?? { ok: { body: "", content_type: null } };
      if ("http" in step) throw new HTTPError(request.fullUrl, step.http, step.msg);
      if ("url" in step) throw new URLError(step.url);
      return { url: step.ok.url ?? request.fullUrl, contentType: step.ok.content_type, body: latin1(step.ok.body) };
    };
    throttle.previous = c.previous;
    const request = new EntrezRequest(c.request.url, c.request.method as "GET" | "POST", c.request.data === null ? null : latin1(c.request.data));

    let outcome: Outcome;
    try {
      const handle = await open(request);
      const value: Record<string, unknown> = { text: handle.text, url: handle.url };
      try {
        const body = handle.read();
        value.body = typeof body === "string" ? body : fromLatin1(body);
      } catch (error) {
        value.read_exc = { type: (error as Error).name, msg: (error as Error).message };
      }
      outcome = { value };
    } catch (error) {
      outcome = { exc: { type: (error as Error).name, msg: (error as Error).message } };
    }
    expect(outcome.exc).toEqual(c.exc);
    expect(outcome.value).toEqual(c.value);
    expect(sleeps).toEqual(c.sleeps);
    expect(calls).toBe(c.calls);
    expect(throttle.previous).toBe(c.previous_after);
  });
});
