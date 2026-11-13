/** Error classes private to the tabular reader. */

export { AssertionError } from "./rows.js";

/** Python's `AttributeError` for a parser attribute that was never set; the goldens report it as a `TypeError` without a message. */
export class TypeError_ extends TypeError {
  constructor() { super("object has no attribute"); }
}
