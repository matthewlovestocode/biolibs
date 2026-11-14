"""Golden cases for the XML scanner's error messages -> packages/seqio/test/golden/xmlerr.json

Expat decides between "not well-formed (invalid token)", "syntax error", "junk after document element" and
"unclosed token" — and the column it points at — from its own tokenizer's state, so the only way to port that
faithfully is to measure it. Every shape of junk goes here, before the document element and after it, with and
without more input following, and the reason and position expat gives are recorded.
"""
import itertools, json, os
import xml.parsers.expat as expat

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqio", "test", "golden", "xmlerr.json")

# One of each shape: text, markup that is valid but out of place, markup that is incomplete, characters that
# cannot begin a token at all, and the gap characters that end a name.
JUNK = [
    "x", "xy", "ab ", "ab\t", "ab\n", "ab>", "ab/", "ab=", "ab(", "ab)", "ab[", "ab]", "ab,", "ab;", "ab?",
    "ab*", "ab+", "ab|", "ab%", "ab!", "ab#", "ab$", "ab@", "ab~", "ab^", "ab`", "ab'", 'ab"', "ab&", "ab<",
    "ab-", "ab.", "ab:", "ab0", "aba", "ab\\", "ab{", "ab}",
    "&", "&amp;", "&#", "&#x", "&#38;", "<", "<x", "<x>", "<x/>", "<!", "<!X", "<!X y", "<!D", "<!-", "<!--",
    "<!-->", "<!---->", "<!-- c -->x", "<!DOCTYPE x>", "<![", "<![x", "<![CDATA[", "<![CDATA[a]]", "<![CDATA[a]]>",
    "<?", "<?x", "<?pi?>", "<?pi x", "<?pi?>x", "<?xml?>", "<?xml version='1.0'?>", "</", "</x", "</x>", "</>",
    "<//", "<-", "<0", "<:", "<_", "<.", "]]", "]]>", "]]>x", ">", "=", "-", "?", "%x", "%x;", "#x", "'a'", "'a",
    '"a"', "(x)", ")x", "\x05", "\x01", "\x7f", "ÿ", " x", "\n x", "\n\n  x", "\t<x/>", "\r\n x", "", " ",
]
# Content inside the document element, where a reference is the interesting case.
CONTENT = ["&", "&\n", "& ", "&x", "&x ", "&#", "&#x", "&#z", "&;", "&amp", "&amp x", "&<", "a&", "ab&\n",
           "&#38;", "&#x26;", "&unknown;", "]]>", "a]]>b", "\x05", "\x01", "x", ""]
# Documents that simply stop, where the question is which position the end of the input counts as.
TRUNCATED = ["<r>", "<r>\r", "<r>\r\n", "<r>x\r", "<r>\n", "<r>\r\r", "<r", "<r ", "<r a", "<r a=", "<r a='",
             "<r a='x", "<r a='x'", "<r>text", "<r><s>", "<r><s/>", "<!--", "<?", "<?x", "<![CDATA[", "<r>&",
             "<r>&x", ""]
# Bytes that are not valid UTF-8, where expat points at the first one it cannot decode.
BAD_BYTES = [b"<r a='\xff'/>", b"<r>\xff</r>", b"\xff<r/>", b"<r a='x'>\xffy</r>", b"<r>ab\xc3</r>",
             b"<r>\xe0\xa0</r>", b"<r>\xc3\xa9\xff</r>", b"<r>\n\xff</r>", b"<\xff", b"<r/>\xff",
             b"<?xml version='1.0'?><r>\xff</r>"]

def run(data):
    p = expat.ParserCreate()
    try:
        p.Parse(data, True)
        return {"ok": True}
    except expat.ExpatError as e:
        return {"reason": expat.ErrorString(e.code), "line": e.lineno, "column": e.offset}
    except LookupError as e:
        # An encoding expat does not know is a Python-level error, not a parse error.
        return {"lookup": str(e)}

cases = []
def add(kind, data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    cases.append({"kind": kind, "bytes": data.hex(), **run(data)})

for junk in JUNK:
    add("prolog", junk + "<r/>")      # junk, then a document to tokenize after it
    add("prolog_only", junk)          # junk and nothing else
    add("epilog", "<r/>" + junk)
    add("epilog_nl", "<r/>\n" + junk)
for body in CONTENT:
    add("content", "<r>" + body + "</r>")
    add("content_attr", "<r a='" + body.replace("'", "") + "'/>")
for text in TRUNCATED:
    add("truncated", text)
for raw in BAD_BYTES:
    add("bytes", raw)
# A declaration in the wrong place, and the shapes of a malformed one.
for decl in ["<?xml?>", "<?xml version='1.0'", "<?xml version=1.0?>", "<?xml encoding='utf-8'?>",
             "<?xml version='1.0' encoding='x-unknown'?>", "<?xml version='2.0'?>", "<?xml standalone='maybe'?>"]:
    add("declaration", decl + "<r/>")
    add("declaration_late", "<r/>" + decl)
    add("declaration_mid", "<r>" + decl + "</r>")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"expat": expat.version_info, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
