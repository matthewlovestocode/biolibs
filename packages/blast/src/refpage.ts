/**
 * Reading NCBI's "please wait" page, which is what a submitted search answers with.
 *
 * It is an HTML page with the request's identifier buried in a comment. Biopython finds it by
 * looking for the text `RID =`, which is what this does: not a parser, a search for two lines, the
 * way `Bio.Blast._parse_qblast_ref_page` does it. When they are missing the page is an error page,
 * and three layouts of error message are recognised because NCBI has used three over the years.
 */
import { pyRepr, ValueError } from "@biolibs/core";

/** What a submitted search answers with. */
export interface Submitted {
  /** The request identifier, which every poll afterwards names. */
  rid: string;
  /** NCBI's estimate of how long it will take, in seconds. */
  rtoe: number;
}

/** The text after `marker` up to the end of its line, trimmed, or `null` if the marker is not there. */
function after(page: string, marker: string): string | null {
  const at = page.indexOf(marker);
  if (at === -1) return null;
  const end = page.indexOf("\n", at);
  return page.slice(at + marker.length, end === -1 ? undefined : end).trim();
}

/** The message inside `<div class="error msInf">` or `<p class="error">`, up to its closing tag. */
function errorIn(page: string, open: string, close: string): string | null {
  const at = page.indexOf(open);
  if (at === -1) return null;
  const message = page.slice(at + open.length).trim().split(close, 1)[0]!.split("\n", 1)[0]!.trim();
  return message === "" ? null : message;
}

/**
 * Read the request identifier out of the page a submitted search answers with.
 *
 * @param page - The page, as text.
 * @returns The identifier and NCBI's estimate of how long the search will take.
 * @throws {@link ValueError} where the page carries neither, which is what an error page does. The
 *   message is NCBI's own where one of the three known layouts holds it, and says plainly that none
 *   was recognised where not — Biopython's wording, because somebody searching for the message
 *   should find the same answers.
 *
 * @example
 * ```ts
 * readRefPage("    RID = ABC123XYZ\n    RTOE = 27\n");   // { rid: "ABC123XYZ", rtoe: 27 }
 * ```
 */
export function readRefPage(page: string): Submitted {
  const rid = after(page, "RID =");
  const rtoe = after(page, "RTOE =");
  if (!rid && !rtoe) {
    // An error page. NCBI has used three layouts for the message, and Biopython tries all three
    // before admitting it does not recognise the page.
    const message = errorIn(page, '<div class="error msInf">', "</div>")
      ?? errorIn(page, '<p class="error">', "</p>")
      ?? (page.includes("Message ID#") ? page.slice(page.indexOf("Message ID#")).split("<", 1)[0]!.split("\n", 1)[0]!.trim() : null);
    if (message !== null && message !== "") throw new ValueError(`Error message from NCBI: ${message}`);
    throw new ValueError("No RID and no RTOE found in the 'please wait' page, there was probably an error in your request but we could not extract a helpful error message.");
  }
  if (!rid) throw new ValueError(`No RID found in the 'please wait' page. (although RTOE = ${pyRepr(rtoe)})`);
  if (!rtoe) throw new ValueError(`No RTOE found in the 'please wait' page. (although RID = ${pyRepr(rid)})`);
  // Biopython reads it as a whole number of seconds, and says so plainly when it is not one.
  if (!/^[+-]?\d+$/.test(rtoe.trim())) throw new ValueError(`A non-integer RTOE found in the 'please wait' page, ${pyRepr(rtoe)}`);
  return { rid, rtoe: Number(rtoe.trim()) };
}
