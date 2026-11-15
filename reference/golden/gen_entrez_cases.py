"""Golden cases for Bio.Entrez -> packages/entrez/test/golden/entrez.json

Nothing here touches the network. What a client for the E-utilities has to get right is the request it
sends and what it does when the reply is slow, missing or an error, and all of that can be recorded
with the last step replaced:

* the eight E-utility functions are run with `_open` swapped for something that hands the request
  back, so each case records the method, the full URL and the POST body Biopython built, with the
  warning it gives when no email address is set;
* the helpers underneath (`_format_ids`, `_construct_params`, `_build_request`, `_has_api_key`,
  `_update_ecitmatch_variables`) are run directly, because the public functions do not reach every
  branch of them;
* `_open` itself is run against a scripted `urlopen`, a scripted clock and a recording `sleep`, so the
  cases cover the pause between requests, which errors are retried and how often, and the conversion
  of a `text/plain` reply into text.

Every case is built from fixed lists and a seeded `random.Random`; nothing iterates a set.
"""
import io, json, os, random, warnings
from email.message import Message
from urllib.error import HTTPError, URLError

from Bio import Entrez

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "entrez", "test", "golden", "entrez.json")
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
rnd = random.Random(11)


def enc(value):
    """A Python argument as JSON: bytes are tagged, tuples become lists, everything else is itself."""
    if isinstance(value, bytes):
        return {"bytes": value.decode("latin1")}
    if isinstance(value, (list, tuple)):
        return [enc(v) for v in value]
    if isinstance(value, dict):
        return {"pairs": [[k, enc(v)] for k, v in value.items()]}
    return value


def pairs(params):
    """A dict as ordered pairs, since the order of the parameters is part of what is recorded."""
    return None if params is None else [[k, enc(v)] for k, v in params.items()]


def request(req):
    """What a `urllib.request.Request` would send."""
    return {"method": req.get_method(), "url": req.full_url,
            "data": None if req.data is None else req.data.decode("latin1")}


def guard(fn):
    """Run something, recording its value or the error it raised, and any warnings on the way."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": {"type": type(e).__name__, "msg": str(e)}}
    if caught:
        out["warnings"] = [{"category": w.category.__name__, "message": str(w.message)} for w in caught]
    return out


class settings:
    """Set `Entrez.email`, `tool` and `api_key` for the length of a `with` block."""

    def __init__(self, s):
        self.s = s

    def __enter__(self):
        self.old = (Entrez.email, Entrez.tool, Entrez.api_key)
        Entrez.email = self.s.get("email")
        Entrez.tool = self.s.get("tool", "biopython")
        Entrez.api_key = self.s.get("api_key")

    def __exit__(self, *exc):
        Entrez.email, Entrez.tool, Entrez.api_key = self.old


SETTINGS = [{}, {"email": "a.n.other@example.com"}, {"email": "a.n.other@example.com", "api_key": "0123456789abcdef"},
            {"email": "x@y.org", "tool": "my tool/1.0"}, {"tool": None, "api_key": "k"}]

# ---------------------------------------------------------------------------- _format_ids
IDS = [5, 0, -3, 10 ** 20, True, "12345", "1,2,3", " 1 , 2 ,3 ", "", ",", "a b, c d", [1, 2, 3], ["1", " 2 ", "3"],
       (4, 5), [], [7], ["x", 8, True, None, 1.5], [[1, 2], 3], 1.5, None, "NM_000546.6, NP_000537.3",
       ["é", "日本"], range(3), b"12"]
format_ids = []
for ids in IDS:
    arg = list(ids) if isinstance(ids, range) else ids
    format_ids.append({"ids": enc(arg), **guard(lambda: Entrez._format_ids(arg))})

# ---------------------------------------------------------------------------- _construct_params
PARAMS = [None, {}, {"db": "nucleotide"}, {"db": "nucleotide", "id": "1, 2"}, {"db": "pubmed", "id": [1, 2, 3]},
          {"id": 12345, "db": "protein"}, {"db": "x", "retmax": None, "retmode": "xml"},
          {"email": "explicit@example.com", "db": "x"}, {"email": None, "db": "x"}, {"tool": "mine", "db": "x"},
          {"api_key": None, "tool": None, "email": None}, {"api_key": "abc", "db": "x"},
          {"db": "x", "id": []}, {"db": "x", "id": None}, {"db": "x", "id": 1.5}, {"id": "a,b", "email": "e@f.g", "tool": "t"}]
construct_params = []
for s in SETTINGS:
    for params in PARAMS:
        for join_ids in (True, False):
            with settings(s):
                given = None if params is None else dict(params)
                got = guard(lambda: pairs(Entrez._construct_params(given, join_ids=join_ids)))
            construct_params.append({"settings": s, "params": pairs(params), "join_ids": join_ids, **got})

# ---------------------------------------------------------------------------- _build_request
#: Text that exercises every class of character `urlencode` treats differently.
TEXTS = ["plain", "two words", "a+b", "a&b=c", "100%", "sl/ash", "q?m#h", "~tilde_under-dash.dot", "é", "日本語",
         "emoji \U0001F9EC", "tab\there", "new\nline", "\x00\x7f", "'quotes\" <tags>", "[brackets]{braces}",
         "pipe|pipe", "comma,semi;colon:", "at@sign", "back\\slash", "", " ", "*!()$", "\ud800", "a\udfffb",
         "\ud800\udbff", "biopython[title] AND 2020:2024[dp]", "Opuntia[orgn] AND rpl16"]
build_request = []


def build(cgi, params, post=None, ecitmatch=False, join_ids=True, s=SETTINGS[1]):
    with settings(s):
        given = None if params is None else dict(params)
        got = guard(lambda: request(Entrez._build_request(cgi, given, post=post, ecitmatch=ecitmatch, join_ids=join_ids)))
    build_request.append({"settings": s, "cgi": cgi, "params": pairs(params), "post": post, "ecitmatch": ecitmatch,
                          "join_ids": join_ids, **got})


for text in TEXTS:
    build(EUTILS + "esearch.fcgi", {"db": "nucleotide", "term": text})
    build(EUTILS + "esearch.fcgi", {text: "value"})
for post in (None, True, False):
    for n in (1, 2, 199, 200, 201, 500):
        build(EUTILS + "efetch.fcgi", {"db": "nucleotide", "id": list(range(1000, 1000 + n))}, post=post)
        build(EUTILS + "efetch.fcgi", {"db": "nucleotide", "id": ",".join(str(i) for i in range(n))}, post=post)
    build(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": "x" * 990}, post=post)
    build(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": "x" * 1200}, post=post)
    build(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": "é" * 200}, post=post)
for length in range(955, 975):       # either side of the 1,000-character limit, once the rest is added
    build(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": "y" * length})
# values that are not text
for value in (5, -1, 0, 10 ** 20, 0.5, -2.25, 1e-07, 1e+22, True, False, b"bytes \xff", [1, "two", 3.5, True, None], (), ["a b", "c&d"],
              [b"x", "y"], ["\ud800"]):
    build(EUTILS + "esummary.fcgi", {"db": "protein", "retmax": value})
# `id` handled without joining, as elink asks for: a list repeats the key, anything else is counted as text
for ids in ([1, 2, 3], ["1", "2"], "1,2,3", "7", 7, [], [","] * 3, list(range(250)), ",".join(["9"] * 250), None, 2.5, True):
    for post in (None, False):
        build(EUTILS + "elink.fcgi", {"dbfrom": "pubmed", "id": ids}, post=post, join_ids=False)
# ecitmatch leaves the pipe alone
for ecitmatch in (False, True):
    build(EUTILS + "ecitmatch.cgi", {"db": "pubmed", "retmode": "xml", "bdata": "proc natl acad sci u s a|1991|88|3248|mann bj|Art1|"},
          ecitmatch=ecitmatch)
    build(EUTILS + "ecitmatch.cgi", {"bdata": "a|b\rc|d%7C", "x|y": "%7c|"}, ecitmatch=ecitmatch)
for s in SETTINGS:
    build(EUTILS + "einfo.fcgi", None, s=s)
    build(EUTILS + "einfo.fcgi", {"db": "pubmed"}, s=s)
    build("http://localhost:1/x.cgi?already=1", {"q": "v"}, s=s)
for _ in range(60):                   # random text, so the quoting is checked beyond the hand-picked cases
    n = rnd.randint(0, 12)
    text = "".join(chr(rnd.choice([rnd.randint(32, 126), rnd.randint(160, 0x24F), rnd.randint(0x4E00, 0x4E40),
                                   rnd.randint(0x1F600, 0x1F640), rnd.randint(0, 31)])) for _ in range(n))
    build(EUTILS + "esearch.fcgi", {"db": "nucleotide", "term": text, text: rnd.randint(0, 99)})

has_api_key = []
for case in build_request:
    if "value" in case and len(has_api_key) < 400:
        v = case["value"]
        req = Entrez.Request(v["url"], data=None if v["data"] is None else v["data"].encode("latin1"), method=v["method"])
        has_api_key.append({"request": v, "value": Entrez._has_api_key(req)})
for url, data, method in [("http://h/x?api_key=1", None, "GET"), ("http://h/x?my_api_key=1", None, "GET"), ("http://h/x?API_KEY=1", None, "GET"),
                          ("http://h/x", "db=x&api_key=k", "POST"), ("http://h/x?api_key=1", "db=x", "POST"), ("http://h/x", "", "POST"),
                          ("http://h/api_key=", None, "GET")]:
    req = Entrez.Request(url, data=None if data is None else data.encode(), method=method)
    has_api_key.append({"request": {"method": method, "url": url, "data": data}, "value": Entrez._has_api_key(req)})

# ---------------------------------------------------------------------------- ecitmatch's variables
CITATIONS = [{"journal_title": "proc natl acad sci u s a", "year": "1991", "volume": "88", "first_page": "3248",
              "author_name": "mann bj", "key": "citation_1"},
             {"journal_title": "science", "year": "1987", "volume": "235", "first_page": "182", "author_name": "palmenberg ac",
              "key": "citation_2"}]
ECIT = [{"db": "pubmed", "bdata": "science|1987|235|182|palmenberg ac|Art2|"},
        {"db": "pubmed", "bdata": CITATIONS[:1]}, {"db": "pubmed", "bdata": CITATIONS}, {"db": "pubmed", "bdata": []},
        {"db": "pubmed", "bdata": [{}]}, {"db": "pubmed", "bdata": [{"year": "2000", "extra": "ignored"}]},
        {"db": "pubmed", "bdata": [{"year": 2000}]}, {"bdata": CITATIONS[:1]}, {"db": "pubmed"},
        {"db": "pubmed", "bdata": "x", "retmode": "text", "other": 1}, {"bdata": "only"},
        {"db": "pmc", "bdata": CITATIONS[1:], "retmode": "text"}, {"db": "pubmed", "bdata": (CITATIONS[0],)},
        {"db": "pubmed", "bdata": [{"key": None}]}, {"db": "pubmed", "bdata": 5}]
ecitmatch_variables = [{"keywds": pairs(k), **guard(lambda: pairs(Entrez._update_ecitmatch_variables(dict(k))))} for k in ECIT]

# ---------------------------------------------------------------------------- the eight functions
real_open = Entrez._open
Entrez._open = request                     # hand the request back in place of fetching it
CALLS = [("efetch", ["nucleotide"], {"id": "EU490707", "rettype": "gb", "retmode": "text"}),
         ("efetch", ["nucleotide"], {"id": ["EU490707", "EU490706"], "rettype": "fasta"}),
         ("efetch", ["pubmed"], {"id": 19304878, "retmode": "xml"}),
         ("efetch", ["protein"], {"id": list(range(300)), "rettype": "fasta", "retmode": "text"}),
         ("efetch", ["nucleotide"], {}), ("efetch", ["nucleotide"], {"id": None, "retmax": 5, "retstart": 10}),
         ("efetch", ["pubmed"], {"WebEnv": "MCID_abc", "query_key": 1, "retmax": 3}),
         ("efetch", ["nucleotide"], {"id": "X", "email": "per.call@example.com", "tool": "percall", "api_key": "kk"}),
         ("esearch", ["pubmed", "biopython"], {}), ("esearch", ["pubmed", "biopython[title]"], {"retmax": "20", "usehistory": "y"}),
         ("esearch", ["nucleotide", "Opuntia[orgn] AND rpl16"], {"idtype": "acc", "sort": "relevance"}),
         ("esearch", ["pubmed", "x" * 1100], {}), ("esearch", ["nlmcatalog", "é ü 日本"], {"retmax": 1}),
         ("esearch", ["pubmed", ""], {}), ("esearch", ["pubmed", "a"], {"term2": "b", "field": None}),
         ("epost", ["pubmed"], {"id": "19304878,14630660"}), ("epost", ["pubmed"], {"id": [1, 2, 3]}), ("epost", ["pubmed"], {}),
         ("epost", ["protein"], {"id": "5", "WebEnv": "W", "query_key": "2"}),
         ("elink", [], {"dbfrom": "pubmed", "id": "19304878", "linkname": "pubmed_pubmed"}),
         ("elink", [], {"dbfrom": "protein", "db": "gene", "id": ["15718680", "157427902"]}),
         ("elink", [], {"dbfrom": "protein", "db": "gene", "id": "15718680,157427902"}), ("elink", [], {}),
         ("elink", [], {"dbfrom": "pubmed", "id": 19304878}), ("elink", [], {"dbfrom": "pubmed", "id": list(range(205))}),
         ("elink", [], {"dbfrom": "pubmed", "cmd": "neighbor_history", "id": ["1", "2"], "term": "a b"}),
         ("einfo", [], {}), ("einfo", [], {"db": "pubmed"}), ("einfo", [], {"db": "pubmed", "version": "2.0", "retmode": "json"}),
         ("esummary", [], {"db": "nlmcatalog", "id": "101660833"}), ("esummary", [], {"db": "pubmed", "id": [1, 2], "retmode": "json"}),
         ("esummary", [], {}), ("esummary", [], {"db": "protein", "id": list(range(200))}),
         ("espell", [], {"term": "biopythooon"}), ("espell", [], {"db": "pmc", "term": "fluorecence & microscopy"}), ("espell", [], {}),
         ("ecitmatch", [], {"db": "pubmed", "bdata": CITATIONS}), ("ecitmatch", [], {"db": "pubmed", "bdata": CITATIONS[:1]}),
         ("ecitmatch", [], {"db": "pubmed", "bdata": "science|1987|235|182|palmenberg ac|Art2|"}),
         ("ecitmatch", [], {"db": "pubmed"}), ("ecitmatch", [], {"bdata": CITATIONS}), ("ecitmatch", [], {})]
eutils = []
for name, args, keywds in CALLS:
    for s in SETTINGS:
        with settings(s):
            got = guard(lambda: getattr(Entrez, name)(*args, **keywds))
        eutils.append({"fn": name, "args": args, "keywds": pairs(keywds), "settings": s, **got})
Entrez._open = real_open


# ---------------------------------------------------------------------------- _open
class Handle(io.BytesIO):
    """A reply: its bytes, where it came from and its headers, which is all `_open` looks at."""

    def __init__(self, body, url, content_type):
        super().__init__(body)
        self.url = url
        self.headers = Message()
        if content_type is not None:
            self.headers["Content-Type"] = content_type


def run_open(case):
    """Run `_open` with the network, the clock and `sleep` scripted. @returns What happened."""
    steps = list(case["steps"])
    sleeps, calls = [], []
    req = Entrez.Request(case["request"]["url"], data=None if case["request"]["data"] is None else case["request"]["data"].encode("latin1"),
                         method=case["request"]["method"])

    def urlopen(r):
        calls.append(r.full_url)
        step = steps.pop(0) if steps else {"ok": {"body": "", "content_type": None}}
        if "http" in step:
            raise HTTPError(r.full_url, step["http"], step["msg"], None, None)
        if "url" in step:
            raise URLError(step["url"])
        ok = step["ok"]
        return Handle(ok["body"].encode("latin1"), ok.get("url", r.full_url), ok["content_type"])

    old = (Entrez.urlopen, Entrez.time.time, Entrez.time.sleep, Entrez.max_tries, Entrez.sleep_between_tries, Entrez._open.previous)
    Entrez.urlopen = urlopen
    Entrez.time.time = lambda: case["now"]
    Entrez.time.sleep = sleeps.append
    Entrez.max_tries = case.get("max_tries", 3)
    Entrez.sleep_between_tries = case.get("sleep_between_tries", 15)
    Entrez._open.previous = case["previous"]

    def go():
        handle = Entrez._open(req)
        text = isinstance(handle, io.TextIOWrapper)
        out = {"text": text, "url": handle.url}
        try:
            body = handle.read()
            out["body"] = body if text else body.decode("latin1")
        except Exception as e:
            out["read_exc"] = {"type": type(e).__name__, "msg": str(e)}
        return out

    try:
        got = guard(go)
        got.update({"sleeps": sleeps, "calls": len(calls), "previous_after": Entrez._open.previous})
    finally:
        Entrez.urlopen, Entrez.time.time, Entrez.time.sleep, Entrez.max_tries, Entrez.sleep_between_tries, Entrez._open.previous = old
    return got


GET = {"method": "GET", "url": EUTILS + "einfo.fcgi?tool=biopython&email=a%40b.c", "data": None}
GET_KEY = {"method": "GET", "url": EUTILS + "einfo.fcgi?tool=biopython&api_key=abc", "data": None}
POST = {"method": "POST", "url": EUTILS + "epost.fcgi", "data": "db=pubmed&id=1&tool=biopython"}
POST_KEY = {"method": "POST", "url": EUTILS + "epost.fcgi", "data": "db=pubmed&id=1&api_key=abc"}
ok = lambda body="<x/>", content_type="text/xml; charset=UTF-8", **more: {"ok": {"body": body, "content_type": content_type, **more}}
http = lambda code, msg: {"http": code, "msg": msg}
open_cases = []
# the pause between requests: with and without a key, just inside and just outside it
for req in (GET, GET_KEY, POST, POST_KEY):
    for previous, now in ((0, 1000.0), (1000.0, 1000.0), (1000.0, 1000.05), (1000.0, 1000.1), (1000.0, 1000.2), (1000.0, 1000.36),
                          (1000.0, 1000.37), (1000.0, 1000.5), (1000.0, 999.0), (1700000000.25, 1700000000.3), (0.1, 0.2)):
        open_cases.append({"request": req, "previous": previous, "now": now, "steps": [ok()]})
# what the reply's content type does
for content_type in ("text/plain", "text/plain; charset=UTF-8", "TEXT/PLAIN", "text/xml", "application/json", "text/html", None, "",
                     "plain", "text/plain/extra", "application/vnd.ncbi+plain", " text/plain ", "text/x-plain", "text"):
    for body in ("LOCUS x\r\nline two\rline three\n", "caf\xc3\xa9 \xe6\x97\xa5", "bad \xff\xfe utf8", ""):
        open_cases.append({"request": GET, "previous": 0, "now": 50.0, "steps": [ok(body, content_type)]})
open_cases.append({"request": GET, "previous": 0, "now": 50.0, "steps": [ok("moved", "text/plain", url="https://elsewhere.example/x")]})
# errors: which are retried, how many times, and what is slept between
SCRIPTS = [[http(500, "Internal Server Error"), ok()], [http(500, "Internal Server Error")] * 2 + [ok()], [http(500, "Internal Server Error")] * 3,
           [http(502, "Bad Gateway"), http(503, "Service Unavailable"), ok()], [http(429, "Too Many Requests"), ok()],
           [http(429, "Too Many Requests")] * 3, [http(400, "Bad Request"), ok()], [http(404, "Not Found"), ok()], [http(414, "Request-URI Too Long")],
           [http(403, "Forbidden")], [http(301, "Moved"), ok()], [http(199, "Odd"), ok()], [http(600, "Odder"), ok()],
           [{"url": "timed out"}, ok()], [{"url": "timed out"}] * 2 + [ok()], [{"url": "[Errno 8] nodename nor servname provided, or not known"}] * 3,
           [{"url": "x"}, http(500, "E"), ok()], [http(500, "E"), {"url": "x"}, ok()], [http(500, "E"), {"url": "x"}, http(404, "Not Found")],
           [{"url": "x"}, {"url": "y"}, http(429, "Too Many Requests")], [ok("first"), ok("second")]]
for steps in SCRIPTS:
    for max_tries, sleep_between_tries in ((3, 15), (1, 15), (2, 0.5), (5, 2), (0, 15)):
        open_cases.append({"request": GET, "previous": 99.9, "now": 100.0, "steps": steps, "max_tries": max_tries,
                           "sleep_between_tries": sleep_between_tries})
opened = [{**case, **run_open(case)} for case in open_cases]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
sections = {"format_ids": format_ids, "construct_params": construct_params, "build_request": build_request,
            "has_api_key": has_api_key, "ecitmatch_variables": ecitmatch_variables, "eutils": eutils, "open": opened}
json.dump(sections, open(OUT, "w"), indent=0)
print(", ".join(f"{len(v)} {k}" for k, v in sections.items()), "->", os.path.relpath(OUT))
