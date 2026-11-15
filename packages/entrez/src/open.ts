/**
 * Biopython's `_open`: send a request politely, try again when that is worth doing, and hand back the
 * reply.
 */
import { UnboundLocalError, pyDecodeUtf8 } from "@biolibs/core";
import { HTTPError, URLError, UnicodeDecodeError } from "./errors.js";
import { type EntrezRequest, hasApiKey } from "./request.js";
import { settings } from "./settings.js";
import type { Reply } from "./transport.js";

/**
 * When the last request was sent, in seconds: Python's `_open.previous`. Set `previous` back to 0 to
 * forget it.
 */
export const throttle = { previous: 0 };

/**
 * The subtype of a `Content-Type` header, as Python's `email.message.Message.get_content_subtype`
 * reads it.
 *
 * @param contentType - The header, or `null` if the reply had none.
 * @returns The part after the slash, in lower case. A missing header, and one that does not have
 *   exactly one slash, both count as `text/plain`.
 */
export function contentSubtype(contentType: string | null): string {
  if (contentType === null) return "plain";
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  const parts = type.split("/");
  return parts.length === 2 ? parts[1]! : "plain";
}

/** A reply from an E-utility: the counterpart of the handle Biopython returns. */
export class EntrezHandle {
  /** Where the reply came from. */
  readonly url: string;
  /** True when the server declared the reply to be plain text, which is when Biopython hands back text. */
  readonly text: boolean;
  /** The body, as it arrived. */
  readonly bytes: Uint8Array;

  /** @param reply - What the transport returned. */
  constructor(reply: Reply) {
    this.url = reply.url;
    this.text = contentSubtype(reply.contentType) === "plain";
    this.bytes = reply.body;
  }

  /**
   * The body, as Python's `handle.read()` gives it.
   *
   * @returns Text for a plain-text reply, decoded as UTF-8 with every line ending turned into `\n`, as
   *   Python's text mode does; otherwise the bytes, which is how XML arrives.
   * @throws {@link UnicodeDecodeError} for a plain-text reply that is not valid UTF-8.
   */
  read(): string | Uint8Array {
    return this.text ? this.readText() : this.bytes;
  }

  /**
   * The body as text, whatever the server called it. This is what the parsers in `@biolibs/seqio` take.
   *
   * @returns The body decoded as UTF-8, with line endings turned into `\n`.
   * @throws {@link UnicodeDecodeError} if the bytes are not valid UTF-8.
   */
  readText(): string {
    let decoded: string;
    try {
      decoded = pyDecodeUtf8(this.bytes);
    } catch (error) {
      throw new UnicodeDecodeError(error instanceof Error ? error.message : String(error));
    }
    return decoded.replace(/\r\n?/g, "\n");
  }
}

/**
 * Biopython's `_open`: send a request and return the reply.
 *
 * Requests are spaced out so as not to exceed NCBI's limit: at least 0.37 seconds apart, or 0.1 with
 * an API key. A request that gets no answer is tried again after `settings.sleepBetweenTries` seconds;
 * one that gets a server error or "too many requests" is tried again at once; one that gets any other
 * 4xx status is not tried again, since asking twice will not change the answer. After
 * `settings.maxTries` attempts the last error is thrown.
 *
 * @param request - What to send, from {@link buildRequest}.
 * @returns The reply.
 * @throws {@link HTTPError} or {@link URLError} once the attempts run out, or at once for a 4xx status
 *   other than 429.
 * @throws UnboundLocalError if `settings.maxTries` is 0, since nothing was sent and there is no reply
 *   to return. That is what Python raises, by accident, in the same situation.
 */
export async function open(request: EntrezRequest): Promise<EntrezHandle> {
  const delay = hasApiKey(request) ? 0.1 : 0.37;
  const current = settings.now();
  const wait = throttle.previous + delay - current;
  if (wait > 0) {
    // Recorded before waiting, not after as Python does, so that a second request started meanwhile
    // queues behind this one instead of going out alongside it.
    throttle.previous = current + wait;
    await settings.sleep(wait);
  } else {
    throttle.previous = current;
  }

  let reply: Reply | undefined;
  for (let attempt = 0; attempt < settings.maxTries; attempt++) {
    const last = attempt >= settings.maxTries - 1;
    try {
      reply = await settings.transport(request);
      break;
    } catch (error) {
      // HTTPError is tested first because it is also a URLError.
      if (error instanceof HTTPError) {
        if (last) throw error;
        if (Math.floor(error.code / 100) === 4 && error.code !== 429) throw error;
      } else if (error instanceof URLError) {
        if (last) throw error;
        await settings.sleep(settings.sleepBetweenTries);
      } else {
        throw error;
      }
    }
  }
  if (reply === undefined) throw new UnboundLocalError("cannot access local variable 'handle' where it is not associated with a value");
  return new EntrezHandle(reply);
}
