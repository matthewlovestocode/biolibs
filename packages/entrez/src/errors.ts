/** The errors a request can end in, named and worded as Python's `urllib` and codecs name and word them. */
import { BioError, ValueError } from "@biolibs/core";

/**
 * Mirrors Python's `urllib.error.URLError`: the request never got an answer, because the name did not
 * resolve, the connection was refused or it timed out.
 *
 * @example
 * ```ts
 * new URLError("timed out").message;   // "<urlopen error timed out>"
 * ```
 */
export class URLError extends BioError {
  /** What went wrong, as the transport reported it. */
  readonly reason: string;

  /** @param reason - What went wrong. */
  constructor(reason: string) {
    super(`<urlopen error ${reason}>`);
    this.name = "URLError";
    this.reason = reason;
  }
}

/**
 * Mirrors Python's `urllib.error.HTTPError`: the server answered, with a status that is not success.
 * As in Python it is a kind of {@link URLError}, so catching that catches both.
 *
 * @example
 * ```ts
 * new HTTPError("https://example.org/x", 404, "Not Found").message;   // "HTTP Error 404: Not Found"
 * ```
 */
export class HTTPError extends URLError {
  /** The address that was asked for. */
  readonly url: string;
  /** The HTTP status. */
  readonly code: number;
  /** The reason phrase sent with the status. */
  readonly msg: string;

  /**
   * @param url - The address that was asked for.
   * @param code - The HTTP status.
   * @param msg - The reason phrase sent with it.
   */
  constructor(url: string, code: number, msg: string) {
    super(msg);
    this.name = "HTTPError";
    this.message = `HTTP Error ${code}: ${msg}`;
    this.url = url;
    this.code = code;
    this.msg = msg;
  }
}

/**
 * Mirrors Python's `UnicodeEncodeError`: text that cannot be written as UTF-8, which in JavaScript means
 * a surrogate with no partner. Python refuses it, so this does too, where `encodeURIComponent` would
 * throw a `URIError` and `TextEncoder` would quietly substitute U+FFFD.
 */
export class UnicodeEncodeError extends ValueError {
  /** @param message - Python's own wording, naming the character and where it is. */
  constructor(message: string) {
    super(message);
    this.name = "UnicodeEncodeError";
  }
}

/** Mirrors Python's `UnicodeDecodeError`: a reply declared as text whose bytes are not valid UTF-8. */
export class UnicodeDecodeError extends ValueError {
  /** @param message - Python's own wording, naming the byte and where it is. */
  constructor(message: string) {
    super(message);
    this.name = "UnicodeDecodeError";
  }
}
