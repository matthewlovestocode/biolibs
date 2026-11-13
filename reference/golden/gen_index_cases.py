"""Golden cases for Bio.SeqIO.index -> packages/seqio/test/golden-index/seqio-index.json

The file texts come from the parse cases of the other SeqIO golden files (errors and all, since indexing a damaged
file may well succeed). For each, the file is written to disk, indexed, and every key's record and raw bytes recorded.
"""
import json, os, random, tempfile, warnings
from Bio import SeqIO
from codec_feature import enc
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

GOLD = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqio", "test", "golden")
OUT = os.path.join(GOLD, "..", "golden-index", "seqio-index.json")   # not in golden/, which the format runner replays wholesale
rnd = random.Random(31)
cases = []

def tname(e): return "ValueError" if isinstance(e, UnicodeError) else type(e).__name__
def emsg(e):
    if isinstance(e, UnicodeError): return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

KEYFUNCS = {"none": None, "upper": lambda k: k.upper(), "first4": lambda k: k[:4], "const": lambda k: "x"}

def run(case):
    out = {}
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dat") as f:
        # SFF is binary, so its cases carry latin-1-encoded bytes rather than text
        f.write(case["text"].encode("utf-8") if "text" in case else case["bytes"].encode("latin-1")); path = f.name
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            d = SeqIO.index(path, case["format"], key_function=KEYFUNCS[case["keyfunc"]])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = [str(x.message) for x in w]; os.unlink(path); return out
        keys = list(d)
        out["keys"] = keys
        out["len"] = len(d)
        items = []
        for k in keys[:8]:
            item = {"key": k}
            try: item["raw"] = d.get_raw(k).decode("latin-1")
            except Exception as e: item["raw_exc"] = {"type": tname(e), "msg": emsg(e)}
            try:
                r = d[k]; item["record"] = enc(r); item["same"] = d[k] is r
            except Exception as e: item["exc"] = {"type": tname(e), "msg": emsg(e)}
            items.append(item)
        out["items"] = items
        probes = []
        for k in ("__missing__", ""):
            for fn in (lambda: d[k], lambda: d.get_raw(k), lambda: k in d):
                try:
                    # Called once, not twice: `d[k]` is a lookup. An empty key can exist (a `tab` line with no id),
                    # so a probe may come back with a record, which is recorded as such rather than serialised.
                    value = fn()
                    probes.append({"result": "bytes" if isinstance(value, bytes) else value if isinstance(value, bool) else "record"})
                except Exception as e: probes.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["probes"] = probes
        out["str"] = str(d)
        d.close()
    out["warnings"] = [str(x.message) for x in w]
    os.unlink(path)
    return out


SOURCES = {"fasta": ["fasta"], "fastq": ["fastq", "fastq-sanger", "fastq-solexa", "fastq-illumina"], "genbank": ["genbank", "gb"], "embl": ["embl"], "imgt": ["imgt"], "swiss": ["swiss"],
           "tab": ["tab"], "ig": ["ig"], "pir": ["pir"], "phd": ["phd"], "ace": ["ace"], "uniprot-xml": ["uniprot-xml"]}
for fname, formats in SOURCES.items():
    cs = json.load(open(os.path.join(GOLD, f"seqio-{fname}.json")))["cases"]
    texts = [(c["format"], c["text"]) for c in cs if c["kind"] == "parse" and c.get("format") in formats and "text" in c]
    rnd.shuffle(texts)
    for fmt, text in texts[:140]:
        try: text.encode("utf-8")
        except UnicodeEncodeError: continue
        case = {"format": fmt, "text": text, "keyfunc": rnd.choice(["none", "none", "none", "upper", "first4", "const"])}
        res = run_isolated(run, case)
        if res is not None: case.update(res); cases.append(case)
    if fname == "fasta":   # QUAL files share the FASTA layout
        for fmt, text in texts[:40]:
            case = {"format": "qual", "text": text, "keyfunc": "none"}
            res = run_isolated(run, case)
            if res is not None: case.update(res); cases.append(case)
# SFF: binary, and the only format with an index block of its own, which `index` reads when the file has one and
# falls back to scanning the reads when it does not.
sff = json.load(open(os.path.join(GOLD, "seqio-sff.json")))["cases"]
# Only files that parse cleanly: indexing a file whose Roche index block is damaged goes through Biopython's
# warn-then-fall-back path, which this port does not reproduce yet (see docs/seqio.md), so those are left out
# and `Bio.SeqIO.index` stays partial.
sff_bytes = [(c["format"], c["bytes"]) for c in sff
             if c["kind"] == "parse" and "bytes" in c and "exc" not in c and not c.get("warnings")]
rnd.shuffle(sff_bytes)
for fmt, data in sff_bytes[:120]:
    case = {"format": fmt, "bytes": data, "keyfunc": rnd.choice(["none", "none", "none", "upper", "first4", "const"])}
    res = run_isolated(run, case)
    if res is not None: case.update(res); cases.append(case)

# argument errors
for fmt in ("", "FASTA", "clustal", "fastq-x"):
    case = {"format": fmt, "text": ">a\nAC\n", "keyfunc": "none"}
    res = run_isolated(run, case)
    if res is not None: case.update(res); cases.append(case)

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "fail to index ->", OUT)
