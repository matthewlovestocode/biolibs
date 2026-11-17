/**
 * The adviser's tools, served to an agent over the Model Context Protocol.
 *
 * It is the smallest server that speaks the protocol's HTTP transport honestly: an agent posts a
 * request and gets a JSON answer. There are no sessions and nothing is streamed, because nothing
 * here takes long or happens unasked.
 *
 * It is a way into somebody's lab, so it is shut by default in every way it can be:
 *
 * - it listens on this machine only, never on the network;
 * - every request has to carry the token, compared in constant time;
 * - a request that says it comes from a web page is refused, and so is one addressed to any name
 *   but this machine's, which is how a page in a browser would otherwise reach a server like this;
 * - and behind it the tools themselves can only read, work things out and propose.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AGENT_INSTRUCTIONS, type AgentTool } from "./tools.js";

/** The versions of the protocol this speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** The most one request may be, in bytes. A sequence is the largest thing an agent sends. */
const MOST_BYTES = 2_000_000;

/** A server that is up. */
export interface AgentServer {
  /** Where an agent connects: `http://127.0.0.1:<port>/mcp`. */
  url: string;
  /** The port it took. */
  port: number;
  /** Stop it. */
  close: () => Promise<void>;
}

/** @returns A new token: 32 random bytes, in base64url. Whoever has it can reach the adviser's tools. */
export const newAgentToken = (): string => randomBytes(32).toString("base64url");

const sameText = (a: string, b: string): boolean => {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
};

/** One JSON-RPC answer, or `null` for a message that wants none. */
type Answer = Record<string, unknown> | null;

/**
 * Answer one message of the protocol.
 *
 * @param message - What arrived.
 * @param tools - The tools on offer.
 * @param about - What to call this server and its version.
 * @returns The answer, or `null` if the message was a notification.
 */
export async function answerAgent(message: unknown, tools: readonly AgentTool[], about: { name: string; version: string }): Promise<Answer> {
  const asked = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: Record<string, unknown> } | null;
  const id = asked !== null && typeof asked === "object" && (typeof asked.id === "string" || typeof asked.id === "number") ? asked.id : null;
  const fail = (code: number, says: string): Answer => ({ jsonrpc: "2.0", id, error: { code, message: says } });
  if (asked === null || typeof asked !== "object" || asked.jsonrpc !== "2.0" || typeof asked.method !== "string") return fail(-32600, "That is not a request.");
  // A notification is told, not asked: it has no ID and gets no answer.
  if (asked.id === undefined) return null;
  const done = (result: Record<string, unknown>): Answer => ({ jsonrpc: "2.0", id, result });

  switch (asked.method) {
    case "initialize": {
      const wanted = asked.params?.["protocolVersion"];
      const version = (PROTOCOL_VERSIONS as readonly unknown[]).includes(wanted) ? (wanted as string) : PROTOCOL_VERSIONS[0];
      return done({ protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: about.name, version: about.version }, instructions: AGENT_INSTRUCTIONS });
    }
    case "ping": return done({});
    case "tools/list":
      return done({ tools: tools.map((tool) => ({
        name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.input,
        annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
      })) });
    case "tools/call": {
      const tool = tools.find((one) => one.name === asked.params?.["name"]);
      if (tool === undefined) return fail(-32602, `There is no tool called ${JSON.stringify(asked.params?.["name"] ?? null)}.`);
      const args = asked.params?.["arguments"];
      if (!(args === undefined || (typeof args === "object" && args !== null && !Array.isArray(args)))) return fail(-32602, "A tool's arguments are given by name.");
      const given = (args ?? {}) as Record<string, unknown>;
      // Something the tool was not told to expect is refused, not ignored: an agent that sends it
      // meant something by it, and going on without it would do other than it asked.
      const stray = Object.keys(given).find((name) => !(name in tool.input.properties));
      const missing = (tool.input.required ?? []).find((name) => given[name] === undefined);
      try {
        if (stray !== undefined) throw new Error(`${tool.name} takes nothing called ${JSON.stringify(stray)}. It takes: ${Object.keys(tool.input.properties).join(", ") || "nothing"}.`);
        if (missing !== undefined) throw new Error(`${tool.name} needs ${JSON.stringify(missing)}.`);
        return done({ content: [{ type: "text", text: JSON.stringify(await tool.run(given), null, 1) }] });
      } catch (cause) {
        // A tool that could not do what was asked says why to the agent, which can then do something about it.
        return done({ content: [{ type: "text", text: cause instanceof Error ? cause.message : String(cause) }], isError: true });
      }
    }
    default: return fail(-32601, `This server does not do ${JSON.stringify(asked.method)}.`);
  }
}

/**
 * Serve the adviser's tools on this machine.
 *
 * @param options - `tools` are the tools; `token` is what every request has to carry, as a bearer
 *   token; `port` is the port to take, or 0 for any that is free; `name` and `version` are what the
 *   server calls itself.
 * @returns Where it is listening, and a way to stop it.
 *
 * @example
 * ```ts
 * import { agentTools, newAgentToken, serveAgent } from "@biolibs/bionet-agent";
 *
 * const token = newAgentToken();
 * const server = await serveAgent({ tools: agentTools(lab), token });
 * server.url;      // http://127.0.0.1:53124/mcp — give this and the token to the agent
 * ```
 */
export async function serveAgent(options: { tools: readonly AgentTool[]; token: string; port?: number; name?: string; version?: string }): Promise<AgentServer> {
  if (options.token.length < 32) throw new Error("The token is too short to keep anybody out.");
  const about = { name: options.name ?? "bionet-adviser", version: options.version ?? "0.1.0" };
  let port = 0;
  const say = (response: ServerResponse, status: number, body: unknown, more: Record<string, string> = {}): void => {
    const text = body === null ? "" : JSON.stringify(body);
    response.writeHead(status, { ...(body === null ? {} : { "content-type": "application/json" }), "cache-control": "no-store", ...more });
    response.end(text);
  };
  const read = (request: IncomingMessage): Promise<string | null> => new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Past the limit the rest is let go by without being kept, so that whoever sent it can be
      // told it was too much instead of having the line cut under them.
      if (size <= MOST_BYTES) chunks.push(chunk); else chunks.length = 0;
    });
    request.on("end", () => resolve(size > MOST_BYTES ? null : Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(null));
  });

  const server: Server = createServer((request, response) => {
    void (async () => {
      // A browser says where a request comes from and which name it was sent to. Nothing that is
      // meant to use this is a web page, and nothing that is meant to use it calls it by another name.
      if (request.headers.origin !== undefined) return say(response, 403, { error: "This is not for web pages." });
      const host = request.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return say(response, 403, { error: "This answers only to this machine's own name." });
      if (new URL(request.url ?? "/", "http://x").pathname !== "/mcp") return say(response, 404, { error: "There is nothing here." });
      const given = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1] ?? "";
      if (!sameText(given, options.token)) return say(response, 401, { error: "That is not this adviser's token." }, { "www-authenticate": "Bearer" });
      // Nothing is sent unasked, so there is no stream to open and no session to end.
      if (request.method !== "POST") return say(response, 405, { error: "Ask by POST." }, { allow: "POST" });

      const body = await read(request);
      if (body === null) return say(response, 413, { error: "That is more than one request may be." });
      let message: unknown;
      try { message = JSON.parse(body); } catch { return say(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "That is not JSON." } }); }
      if (Array.isArray(message)) {
        const answers = (await Promise.all(message.map((one) => answerAgent(one, options.tools, about)))).filter((one) => one !== null);
        return answers.length === 0 ? say(response, 202, null) : say(response, 200, answers);
      }
      const answer = await answerAgent(message, options.tools, about);
      return answer === null ? say(response, 202, null) : say(response, 200, answer);
    })().catch(() => { if (!response.headersSent) say(response, 500, { error: "Something went wrong here." }); });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // This machine only: never every address the machine has.
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`, port,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}
