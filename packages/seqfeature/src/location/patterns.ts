/**
 * Regular expressions for GenBank/EMBL location strings, ported from Biopython.
 *
 * Biopython builds these from pieces and *reassigns* some of the pieces halfway
 * through (for example `_oneof_position` first has no capture group, later one).
 * The order below follows the original exactly, because the final patterns
 * depend on which version of each piece was current when they were built.
 */

// --- used to split "a,b,c" into parts, respecting one-of(...) and complement(...) ---
const reference = "(?:[a-zA-Z][a-zA-Z0-9_\\.\\|]*[a-zA-Z0-9]?\\:)";
const oneofPositionPlain = "one\\-of\\(\\d+[,\\d+]+\\)";
const oneofLocationPlain = `[<>]?(?:\\d+|${oneofPositionPlain})\\.\\.[<>]?(?:\\d+|${oneofPositionPlain})`;
const anyLocation = `(${reference}?${oneofLocationPlain}|complement\\(${oneofLocationPlain}\\)|[^,]+|complement\\([^,]+\\))`;

/** Splits a comma-separated list of parts; the captured parts are at the odd indices of the result. */
export const SPLIT = new RegExp(anyLocation);

// --- used to classify a single part ---
const pairLocation = "[<>]?-?\\d+\\.\\.[<>]?-?\\d+";
const betweenLocation = "\\d+\\^\\d+";
const withinPosition = "\\(\\d+\\.\\d+\\)";
const withinLocation = `([<>]?\\d+|${withinPosition})\\.\\.([<>]?\\d+|${withinPosition})`;
// oneofLocation is built from the *plain* oneof position (the capturing version comes later in Biopython).
const oneofLocation = `([<>]?\\d+|${oneofPositionPlain})\\.\\.([<>]?\\d+|${oneofPositionPlain})`;
const soloLocation = "[<>]?\\d+";
const soloBond = `bond\\(${soloLocation}\\)`;

/**
 * Classifies a part as `pair`, `between`, `within`, `oneof`, `bond` or `solo`.
 * Python's `re.match` anchors at the start only, so alternatives are tried in this order from the start of the text.
 */
export const LOCATION_CATEGORY = new RegExp(
  `^(?:(?<pair>${pairLocation})|(?<between>${betweenLocation})|(?<within>${withinLocation})|(?<oneof>${oneofLocation})|(?<bond>${soloBond})|(?<solo>${soloLocation})$)`,
);

/** Category names in the order Biopython checks them. */
export const CATEGORY_ORDER = ["pair", "between", "within", "oneof", "bond", "solo"] as const;
