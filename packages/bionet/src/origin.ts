/**
 * Where a lab's inventory lives, and what fetching it from there does and does not establish.
 *
 * A lab publishes at a fixed path on its own web address, the way a site publishes other well-known
 * files. Then the address does the work an authority would otherwise have to do: if you already know
 * that `wrenlab.example` is the Wren lab — because you read it in a paper, or a colleague told you, or
 * it is written on their door — then an inventory served from `https://wrenlab.example` and signed by
 * a key ties that key to that lab, as firmly as you trust the address and the connection.
 *
 * That is the whole of it, and it is worth being exact about the edges:
 *
 * - **It binds a key to an origin, not to a person or an institution.** Whoever controls the web
 *   address controls what key appears there.
 * - **It is https or nothing**, apart from a machine talking to itself. Over plain http the connection
 *   proves nothing and anything in the middle can swap the document.
 * - **First sight is a leap.** You cannot tell a lab's real key from a convincing stand-in on the first
 *   look. What you *can* tell, and what `trust.ts` is for, is the key changing afterwards.
 */

/** The path a lab publishes its inventory at. */
export const INVENTORY_PATH = "/.well-known/bionet.json";

/** @param host - A host name. @returns Whether it is this machine talking to itself. */
const loopback = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

/**
 * Read what somebody typed as the address of a lab.
 *
 * Accepts `wrenlab.example`, `https://wrenlab.example`, or an address with a path on it, and gives
 * back the origin alone, which is all that identifies the lab.
 *
 * @param address - What they typed.
 * @returns The origin, like `https://wrenlab.example`.
 * @throws If it is not an address, or is one whose connection would prove nothing.
 */
export function labOrigin(address: string): string {
  const trimmed = address.trim();
  if (trimmed === "") throw new Error("That is not an address.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`${trimmed} is not an address.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname))) {
    throw new Error("A lab's address must be https: over anything else, the connection says nothing about who answered.");
  }
  return url.origin;
}

/**
 * Where to fetch a lab's inventory from.
 *
 * @param address - The lab's address.
 * @returns The URL of its inventory.
 * @throws If the address is not one an inventory can be fetched from.
 */
export function inventoryUrl(address: string): string {
  return `${labOrigin(address)}${INVENTORY_PATH}`;
}

/**
 * Say whether an inventory was served from the address it claims.
 *
 * An inventory that names an origin it was not served from is refused: that claim is the whole of what
 * ties its key to a lab, so a document that gets it wrong is either misconfigured or someone else's.
 *
 * @param claimed - The origin the document names.
 * @param served - Where it was actually fetched from.
 * @returns Whether they are the same origin.
 */
export function originMatches(claimed: string, served: string): boolean {
  try {
    return labOrigin(claimed) === labOrigin(served);
  } catch {
    return false;
  }
}
