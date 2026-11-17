/**
 * @packageDocumentation
 * `@biolibs/bionet-agent`: a lab's adviser.
 *
 * An agent can be let into a lab as a member with no hands. It reads what the lab holds, works
 * things out with the lab's own tools, and proposes runs for people to carry out. It cannot say
 * that anything was done, used or moved: its key has the role `adviser`, and every device that
 * merges the lab's logs holds it to that.
 *
 * - `tools.ts` — what an adviser is given: the lab to read, the engines, and three things to write
 * - `lookup.ts` — the two that reach outside it, to NCBI's public databases
 * - `serve.ts` — those tools served over the Model Context Protocol, on this machine only
 *
 * The device that hosts the adviser keeps its key (`hostAdviser` in `@biolibs/bionet-client`), and
 * a keeper lets that key into the lab. Until then the adviser can read and work things out, and
 * anything it tries to write says what is missing.
 */
export * from "./tools.js";
export * from "./lookup.js";
export * from "./serve.js";
