# @biolibs/entrez

A TypeScript port of the request side of Biopython's `Bio.Entrez`: the eight E-utilities, the request each builds, and the pacing and retrying of `_open`. **8 of 10 items** are at parity, verified against Biopython 1.88 with **1,092 recorded cases** — 210 calls to the public functions, 240 to `_build_request`, 160 to `_construct_params`, 237 to `_has_api_key`, 206 runs of `_open` against a scripted network and clock, 24 to `_format_ids` and 15 to `_update_ecitmatch_variables`. The two items not ported are `read` and `parse`. See [the checklist](parity/Bio.Entrez.md), and [the package README](../packages/entrez/README.md) for the API with worked examples.

This is the one package that touches the network. It does so through `settings.transport`, a single function that can be replaced, and no test uses the real one.

```ts
import { efetch, esearch, settings } from "@biolibs/entrez";
import { read } from "@biolibs/seqio";

settings.email = "a.n.other@example.com";            // Python: Entrez.email = "..."

const handle = await efetch("nucleotide", { id: "EU490707", rettype: "gb", retmode: "text" });
const record = read(handle.readText(), "genbank");   // text for seqio

await esearch("pubmed", "biopython[title]", { retmax: 20 });   // XML, as bytes
```

## From Python

Keyword arguments become one object, in the order written; module variables become fields of `settings`.

| Python | TypeScript |
|---|---|
| `Entrez.efetch(db, **kw)` | `efetch(db, kw?)` |
| `Entrez.esearch(db, term, **kw)` | `esearch(db, term, kw?)` |
| `Entrez.epost(db, **kw)` | `epost(db, kw?)` |
| `Entrez.elink(**kw)`, `einfo`, `esummary`, `espell`, `ecitmatch` | `elink(kw?)`, `einfo`, `esummary`, `espell`, `ecitmatch` |
| `Entrez.email`, `Entrez.tool`, `Entrez.api_key` | `settings.email`, `settings.tool`, `settings.apiKey` |
| `Entrez.max_tries`, `Entrez.sleep_between_tries` | `settings.maxTries`, `settings.sleepBetweenTries` |
| `handle.read()` | `handle.read()` — text if the reply is `text/plain`, bytes otherwise; `handle.readText()` for text always |
| `handle.url` | `handle.url` |
| `urllib.error.HTTPError`, `URLError` | `HTTPError`, `URLError` |
| `Entrez._build_request`, `_construct_params`, `_format_ids`, `_has_api_key`, `_open` | `buildRequest`, `constructParams`, `formatIds`, `hasApiKey`, `open` |
| `urllib.parse.urlencode(p, doseq=True)`, `quote_plus` | `urlencode`, `quotePlus` |
| `Entrez.read`, `Entrez.parse` | not ported |

Each E-utility function returns a promise of the reply. The request is built before the function returns, so a bad argument throws, and the missing-email warning is given, at the call and not when the promise is awaited.

## What a request looks like

- **Order.** The parameters go out in the order given, then `tool`, `email` and `api_key` from `settings` unless the caller supplied them. One whose value is `null` or `undefined` is dropped, as `None` is.
- **Identifiers.** An `id` list is joined with commas; text is split on commas and each piece trimmed. `elink` alone does not join, and repeats `id` once per element.
- **GET or POST.** POST when the encoded parameters exceed 1,000 characters, or there are 200 or more identifiers. `epost` always posts. `post` can force either.
- **Encoding.** Python's `urlencode`, not `encodeURIComponent`: a space is `+`, `~` is left alone, `!*'()` are escaped, and a value that is not text goes through Python's `str()` (`true` is `True`, `null` inside a list is `None`, `1e-7` is `1e-07`). `ecitmatch` leaves `|` unescaped.

## Pacing and retries

`open` keeps requests at least 0.37 seconds apart, or 0.1 when the request carries an API key. It tries up to `settings.maxTries` times: an HTTP error is retried at once unless it is a 4xx other than 429, which is final; a connection that got no answer is retried after `settings.sleepBetweenTries` seconds. `settings.now` and `settings.sleep` are the clock and the wait, and can be replaced.

## Differences from Python

- **A reply is read in full before it is returned.** Biopython returns an open connection; this returns an `EntrezHandle` holding the bytes.
- **The time of the last request is recorded before waiting, not after.** The value is the same. It means a second request started during the wait queues behind the first instead of going out with it, which cannot happen in Python's single thread.
- **One number type.** A whole number is written as a Python `int`; pass a `bigint` for one too large to hold exactly, and text for a `float` with no fractional part.
- **Errors.** `HTTPError`, `URLError`, `UnicodeEncodeError` and `UnicodeDecodeError` are defined here with Python's names and messages. `TypeError` is JavaScript's own. A `KeyError`'s message is the key, without the quotes Python's `str()` adds.
- **`fetchTransport` is not measured against Biopython**, since it is the part that talks to the network. It has its own tests against a stand-in for `fetch`.
- **Not ported:** `read`, `parse` and `Bio.Entrez.Parser`; `Entrez.local_cache`, which only they use.

## Source layout

```
packages/entrez/src/
  eutils.ts      the eight E-utilities; updateEcitmatchVariables
  request.ts     EntrezRequest, buildRequest, hasApiKey
  params.ts      constructParams, formatIds, toMap, Params, EMAIL_WARNING
  urlencode.ts   urlencode, quotePlus
  pytext.ts      pyText, pyTypeOf
  open.ts        open, EntrezHandle, throttle, contentSubtype
  transport.ts   Transport, Reply, fetchTransport
  settings.ts    settings
  errors.ts      HTTPError, URLError, UnicodeEncodeError, UnicodeDecodeError
```

Golden cases: `packages/entrez/test/golden/entrez.json`, built by `reference/golden/gen_entrez_cases.py`.
