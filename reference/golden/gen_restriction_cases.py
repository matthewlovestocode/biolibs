"""Golden cases for Bio.Restriction -> packages/restriction/test/golden/restriction.json

Kinds: `enzyme` (every enzyme's attributes and classification methods), `digest` (search and catalyse on sequences
built to contain sites), `pair` (comparison operators between two enzymes), `lists` (isoschizomers and compatible ends),
`batch` (RestrictionBatch operations), `analysis` (Analysis filters and text layouts), `abatch` (the batch API of an
Analysis, which inherits it), `suppliers` (the supplier tables, which are printed rather than returned) and `printfmt`
(PrintFormat.print_that).
Enzymes are named by strings in the cases; mappings are recorded sorted by enzyme name.

What a method prints is part of its behaviour, so `prints` captures stdout and the captured text is recorded as the
result. `all_suppliers` is a classmethod on `AbstractCut` that every enzyme class inherits, so one case per class
records the same text; the port satisfies them all with one static method, which is what Biopython does too.
"""
import contextlib, io, json, math, os, random, re, warnings
from Bio import Restriction as R
from Bio.Restriction import RestrictionBatch, Analysis, FormattedSeq, AllEnzymes
from Bio.Restriction.PrintFormat import PrintFormat
from Bio.Restriction.Restriction import RestrictionType
import Bio.Restriction.Restriction as RR   # the mixin classes (Palindromic, Blunt, ...) are not exported by Bio.Restriction
from Bio.Restriction.Restriction_Dictionary import rest_dict, suppliers as SUPP
from Bio.Seq import Seq, MutableSeq
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "restriction", "test", "golden", "restriction.json")
rnd = random.Random(121)
cases = []
NAMES = sorted(rest_dict)
COMMON = ["EcoRI", "BamHI", "HindIII", "NotI", "SmaI", "KpnI", "PstI", "SalI", "XhoI", "EcoRV", "HaeIII", "AluI", "BsaI", "FokI", "BglI", "SfiI", "TaqI", "MboI", "DpnI", "BsmBI", "AarI", "BbvI", "Bsp1286I", "HphI", "BcgI", "BaeI"]

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def num(x):
    if x is None: return None
    if isinstance(x, float): return "nan" if math.isnan(x) else "inf" if x == math.inf else x
    return x

def E(n): return getattr(R, n)
def ename(x):
    """How a batch member is named. `add_nocheck` adds whatever it is given, so a member need not be an enzyme."""
    return x.__name__ if isinstance(x, RestrictionType) else str(x)
def enc(x):
    """Encode a result: enzymes by name, batches, sequences, mappings sorted by enzyme name."""
    if x is None or isinstance(x, (bool, int, str)): return x
    if isinstance(x, float): return num(x)
    if isinstance(x, (Seq, MutableSeq)): return {"seq": str(x), "cls": type(x).__name__}
    if isinstance(x, FormattedSeq): return {"fseq": repr(x)}
    if isinstance(x, RestrictionType): return {"enz": x.__name__}
    if isinstance(x, RestrictionBatch): return {"batch": sorted(e.__name__ for e in x)}
    if isinstance(x, dict): return {"map": sorted([k.__name__ if hasattr(k, "__name__") else str(k), enc(v)] for k, v in x.items())}
    if isinstance(x, (list, tuple)): return [enc(v) for v in x]
    raise TypeError(type(x))


def add(fn, c):
    res = run_isolated(fn, c)
    if res is not None: c.update(res); cases.append(c)

def attempt(f):
    try: return {"result": enc(f())}
    except Exception as e: return {"exc": {"type": tname(e), "msg": emsg(e)}}

def prints(f):
    """Run `f` and return what it wrote to stdout, which is where these methods put their answer."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): f()
    return buf.getvalue()

# ---------------- enzyme ----------------
METHODS = ["is_blunt", "is_5overhang", "is_3overhang", "overhang", "is_palindromic", "is_defined", "is_ambiguous", "is_unknown", "is_methylable", "is_comm", "cut_once",
           "cut_twice", "characteristic", "elucidate", "frequency", "supplier_list", "__str__", "__repr__", "__len__"]
def run_enzyme(case):
    e = E(case["name"])
    out = {"attrs": {a: enc(getattr(e, a, "<none>")) if not isinstance(getattr(e, a, None), (type(None),)) else None for a in ("site", "size", "fst5", "fst3", "scd5", "scd3", "ovhg", "ovhgseq", "freq", "id", "inact_temp", "opt_temp", "substrat", "uri")}}
    out["attrs"]["charac"] = list(e.charac); out["attrs"]["suppl"] = list(e.suppl)
    out["methods"] = {m: attempt(lambda m=m: getattr(e, m)() if m not in ("__str__", "__repr__", "__len__") else {"__str__": str, "__repr__": repr, "__len__": len}[m](e)) for m in METHODS}
    out["methods"]["buffers"] = attempt(lambda: e.buffers("B"))
    out["warnings"] = []
    return out
for n in NAMES: add(run_enzyme, {"kind": "enzyme", "name": n})

# ---------------- digest ----------------
IUPAC = {"A": "A", "C": "C", "G": "G", "T": "T", "R": "AG", "Y": "CT", "W": "AT", "S": "CG", "M": "AC", "K": "GT", "H": "ACT", "B": "CGT", "V": "ACG", "D": "AGT", "N": "ACGT"}
COMP = str.maketrans("ACGT", "TGCA")
def concrete(site): return "".join(rnd.choice(IUPAC.get(c, "ACGT")) for c in site)   # one enzyme's site has a "|"
def revcomp(s): return s.translate(COMP)[::-1]

def make_seq(names, n):
    body = [rnd.choice("ACGT") for _ in range(n)]
    for name in names:
        site = concrete(rest_dict[name]["site"])
        if rnd.random() < 0.5: site = revcomp(site)
        for _ in range(rnd.choice([0, 1, 1, 2, 3])):
            if len(site) < n:
                pos = rnd.randrange(0, n - len(site) + 1)
                body[pos:pos + len(site)] = list(site)
        if rnd.random() < 0.15 and 1 < len(site) < n:   # across the origin of a circular sequence
            k = rnd.randrange(1, len(site))
            body[-k:] = list(site[:k]); body[:len(site) - k] = list(site[k:])
    return "".join(body)

def build_seq(spec):
    kind, text = spec["cls"], spec["text"]
    if kind == "Seq": return Seq(text)
    if kind == "MutableSeq": return MutableSeq(text)
    return FormattedSeq(Seq(text), spec["linear"])

def run_digest(case):
    out = {}
    e = E(case["name"])
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            s = build_seq(case["seq"])
        except Exception as ex:
            out["exc"] = {"type": tname(ex), "msg": emsg(ex)}; out["warnings"] = []; return out
        out["search"] = attempt(lambda: list(e.search(s, case["linear"])))
        out["state"] = {"results": enc(e.results), "on_minus": enc(getattr(e, "on_minus", None)), "dna": repr(e.dna) if e.dna is not None else None}
        out["catalyse"] = attempt(lambda: e.catalyse(s, case["linear"]))
        out["div"] = attempt(lambda: e / s if False else e.search(s))
        out["floordiv"] = attempt(lambda: e // s)
        out["warnings"] = [str(x.message) for x in w]
    return out

for _ in range(1400):
    names = rnd.sample(COMMON, 2) + rnd.sample(NAMES, 2)
    name = rnd.choice(names)
    text = make_seq(names, rnd.choice([8, 20, 50, 100, 300, 800]))
    if rnd.random() < 0.3: text = text.lower()
    r = rnd.random()
    if r < 0.05: text = text[: len(text) // 2] + rnd.choice([" ", "\n", "1", "5 "]) + text[len(text) // 2:]
    elif r < 0.08: text = text[:5] + rnd.choice(["#", "-", "*", "~"]) + text[5:]
    elif r < 0.1: text = ""
    cls = rnd.choice(["Seq", "Seq", "Seq", "MutableSeq", "Formatted"])
    linear = rnd.random() < 0.6
    add(run_digest, {"kind": "digest", "name": name, "seq": {"cls": cls, "text": text, "linear": linear}, "linear": linear})

# ---------------- pair ----------------
def run_pair(case):
    a, b = E(case["a"]), E(case["b"])
    out = {"ops": {}}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        ops = {"ne": lambda: a != b, "eq": lambda: a == b, "rshift": lambda: a >> b, "mod": lambda: a % b, "lt": lambda: a < b, "le": lambda: a <= b, "gt": lambda: a > b, "ge": lambda: a >= b,
               "equi": lambda: a.is_equischizomer(b), "neo": lambda: a.is_neoschizomer(b), "iso": lambda: a.is_isoschizomer(b), "plus": lambda: a + b, "ne_str": lambda: a != "x", "mod_str": lambda: a % "x", "lt_str": lambda: a < 3}
        for k, f in ops.items(): out["ops"][k] = attempt(f)
        out["warnings"] = [str(x.message) for x in w]
    return out
for _ in range(900):
    a = rnd.choice(COMMON + NAMES[:50]) if rnd.random() < 0.5 else rnd.choice(NAMES)
    pool = [n for n in NAMES if rest_dict[n]["site"] == rest_dict[a]["site"]]
    b = rnd.choice(pool) if rnd.random() < 0.5 and len(pool) > 1 else rnd.choice(NAMES)
    add(run_pair, {"kind": "pair", "a": a, "b": b})

# ---------------- lists ----------------
def run_lists(case):
    e = E(case["name"])
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        for k in ("equischizomers", "neoschizomers", "isoschizomers", "compatible_end"):
            out[k] = attempt(lambda k=k: getattr(e, k)())
            if case["batch"] is not None:
                out[k + "_batch"] = attempt(lambda k=k: getattr(e, k)(RestrictionBatch(case["batch"])))
        out["warnings"] = [str(x.message) for x in w]
    return out
for _ in range(500):
    name = rnd.choice(COMMON) if rnd.random() < 0.5 else rnd.choice(NAMES)
    pool = [n for n in NAMES if rest_dict[n]["site"] == rest_dict[name]["site"]]
    batch = None if rnd.random() < 0.4 else rnd.sample(pool, min(len(pool), rnd.randint(1, 3))) + rnd.sample(NAMES, rnd.randint(0, 5))
    add(run_lists, {"kind": "lists", "name": name, "batch": batch})

# ---------------- batch ----------------
def tok(x):
    """A JSON token as a Python value: ["e", name] is an enzyme, anything else is itself."""
    if isinstance(x, list) and len(x) == 2 and x[0] == "e": return E(x[1])
    return x

def run_batch(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        b = None
        for op in case["ops"]:
            try:
                k = op[0]
                if b is None and k != "new":   # an earlier `new` failed: Python would be calling methods of None
                    out["ops_out"].append({"exc": {"type": "TypeError", "msg": None}}); continue
                if k == "new": b = RestrictionBatch([tok(x) for x in op[1]], op[2]); r = None
                elif k == "str": r = str(b)
                elif k == "repr": r = repr(b)
                elif k == "elements": r = b.elements()
                elif k == "len": r = len(b)
                elif k == "has": r = tok(op[1]) in b
                elif k == "get": r = b.get(tok(op[1]), op[2])
                elif k == "add": b.add(tok(op[1])); r = None
                elif k == "plus": r = b + tok(op[1])
                elif k == "iadd": b += tok(op[1]); r = None
                elif k == "add_nocheck": b.add_nocheck(tok(op[1])); r = None
                elif k == "remove": b.remove(tok(op[1])); r = None
                elif k == "split": r = b.split(*[getattr(RR, c) for c in op[1]], **op[2]); r = [len(r), sorted(ename(x) for x in r._data)]
                elif k == "lambdasplit": r = b.lambdasplit(lambda e: e.size >= op[1]); r = [len(r), sorted(ename(x) for x in r._data)]
                elif k == "add_supplier": b.add_supplier(op[1]); r = None
                elif k == "current_suppliers": r = b.current_suppliers()
                elif k == "suppliers": r = list(b.suppliers)
                elif k == "search": r = b.search(Seq(op[1]) if op[3] == "Seq" else MutableSeq(op[1]) if op[3] == "MutableSeq" else FormattedSeq(Seq(op[1]), op[2]), op[2])
                elif k == "is_restriction": r = b.is_restriction(tok(op[1]))
                elif k == "as_string": r = sorted(b.as_string())
                else: raise ValueError(k)
                out["ops_out"].append({"result": enc(r)})
            except Exception as ex:
                out["ops_out"].append({"exc": {"type": tname(ex), "msg": emsg(ex)}})
        # `add_nocheck` adds whatever it is given, so the set can hold a string or a number as well as an enzyme.
        out["final"] = sorted(ename(e) for e in b) if b is not None else None
        out["warnings"] = [str(x.message) for x in w]
    return out

KINDS = ["Palindromic", "NonPalindromic", "OneCut", "TwoCuts", "NoCut", "Blunt", "Ov5", "Ov3", "Unknown", "Defined", "Ambiguous", "NotDefined", "Meth_Dep", "Meth_Undep", "Commercially_available", "Not_available"]
SCODES = sorted(SUPP)
for _ in range(500):
    names = rnd.sample(COMMON, rnd.randint(0, 6)) + rnd.sample(NAMES, rnd.randint(0, 3))
    first = [["e", n] if rnd.random() < 0.6 else n for n in names]
    if rnd.random() < 0.05: first.append(rnd.choice(["NotAnEnzyme", 5, "FormattedSeq"]))
    ops = [["new", first, rnd.sample(SCODES, rnd.choice([0, 0, 0, 1, 2])) + (["ZZ"] if rnd.random() < 0.03 else [])]]
    dna = "".join(rnd.choice("ACGT") for _ in range(rnd.choice([10, 60, 200])))
    for _ in range(rnd.randint(2, 7)):
        k = rnd.choice(["str", "repr", "elements", "len", "has", "get", "add", "plus", "iadd", "add_nocheck", "remove", "split", "lambdasplit", "add_supplier", "current_suppliers", "suppliers", "search", "is_restriction", "as_string"])
        x = rnd.choice([["e", rnd.choice(COMMON)], rnd.choice(COMMON), rnd.choice(NAMES), "Nope", 3, ["e", rnd.choice(NAMES)]])
        if k in ("has", "add", "plus", "iadd", "add_nocheck", "remove", "is_restriction"): ops.append([k, x])
        elif k == "get": ops.append(["get", x, rnd.random() < 0.5])
        elif k == "split": ops.append(["split", rnd.sample(KINDS, rnd.randint(0, 3)), {rnd.choice(KINDS): rnd.random() < 0.5} if rnd.random() < 0.4 else {}])
        elif k == "lambdasplit": ops.append(["lambdasplit", rnd.choice([4, 5, 6, 8])])
        elif k == "add_supplier": ops.append(["add_supplier", rnd.choice(SCODES + ["ZZ"])])
        elif k == "search": ops.append(["search", dna, rnd.random() < 0.7, rnd.choice(["Seq", "Seq", "MutableSeq", "Formatted"])])
        else: ops.append([k])
    add(run_batch, {"kind": "batch", "ops": ops})

# ---------------- FormattedSeq ----------------
def run_fseq(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            base = Seq(case["text"]) if case["cls"] == "Seq" else MutableSeq(case["text"])
            f = FormattedSeq(base, case["linear"])
        except Exception as ex:
            out["exc"] = {"type": tname(ex), "msg": emsg(ex)}; out["warnings"] = []; return out
        other = FormattedSeq(Seq(case["text"]), case["linear"])
        for op in case["ops"]:
            try:
                k = op[0]
                if k == "len": r = len(f)
                elif k == "repr": r = repr(f)
                elif k == "eq": r = f == other
                elif k == "eq_other": r = f == "x"
                elif k == "circ": f.circularise(); r = repr(f)
                elif k == "lin": f.linearise(); r = repr(f)
                elif k == "to_lin": r = repr(f.to_linear())
                elif k == "to_circ": r = repr(f.to_circular())
                elif k == "is_linear": r = f.is_linear()
                elif k == "slice": r = f[op[1]:op[2]]
                elif k == "at": r = f[op[1]]
                elif k == "finditer": r = [[s, g(0)] for s, g in f.finditer(op[1], op[2])]
                else: raise ValueError(k)
                out["ops_out"].append({"result": enc(r)})
            except Exception as ex:
                out["ops_out"].append({"exc": {"type": tname(ex), "msg": emsg(ex)}})
        out["warnings"] = [str(x.message) for x in w]
    return out

for _ in range(300):
    n = rnd.choice([0, 1, 5, 20, 60])
    text = "".join(rnd.choice("ACGTRYN") for _ in range(n))
    if rnd.random() < 0.3: text = text.lower()
    if rnd.random() < 0.1: text = text[:2] + rnd.choice([" ", "1", "\n", "#"]) + text[2:]
    ops = []
    for _ in range(rnd.randint(2, 8)):
        k = rnd.choice(["len", "repr", "eq", "eq_other", "circ", "lin", "to_lin", "to_circ", "is_linear", "slice", "at", "finditer"])
        if k == "slice": ops.append([k, rnd.choice([None, 0, 1, 2, -1, -3, 50]), rnd.choice([None, 0, 3, -1, 70])])
        elif k == "at": ops.append([k, rnd.choice([0, 1, 2, -1, -2, 30, -30, 100])])
        elif k == "finditer": ops.append([k, rnd.choice(["A", "CG", "(?=(?P<x>AC))", "[AG]T", "N", "(?=(AG))"]), rnd.choice([2, 3, 6])])
        else: ops.append([k])
    add(run_fseq, {"kind": "fseq", "text": text, "cls": rnd.choice(["Seq", "MutableSeq"]), "linear": rnd.random() < 0.5, "ops": ops})

# ---------------- analysis ----------------
def run_analysis(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            a = Analysis(RestrictionBatch(case["batch"]), Seq(case["seq"]), case["linear"])
        except Exception as ex:
            out["exc"] = {"type": tname(ex), "msg": emsg(ex)}; out["warnings"] = []; return out
        out["mapping"] = enc(a.mapping)
        for op in case["ops"]:
            try:
                k = op[0]
                if k in ("full", "blunt", "overhang5", "overhang3", "defined", "with_sites", "without_site"): r = getattr(a, k)()
                elif k == "with_N_sites": r = a.with_N_sites(op[1])
                elif k == "with_number_list": r = a.with_number_list(op[1])
                elif k == "with_name": names = list(op[1]); r = [a.with_name(names), names]
                elif k == "with_site_size": r = a.with_site_size(op[1])
                elif k in ("only_between", "between", "show_only_between", "only_outside", "outside", "do_not_cut"): r = getattr(a, k)(op[1], op[2])
                elif k == "format":
                    a.print_as(op[1])
                    dct = None
                    if op[1] == "map":
                        pos = [p for v in a.mapping.values() for p in v]
                        if len(pos) != len(set(pos)): raise RuntimeError("skip")   # enzymes sharing a cut: set order is arbitrary
                    r = a.format_output(dct, op[2], op[3])
                elif k == "change": a.change(**op[1]); r = [a.mapping, str(a.sequence), a.linear, a.NameWidth, a.ConsoleWidth, a.Cmodulo, a.PrefWidth]
                elif k == "repr": r = repr(a)
                else: raise ValueError(k)
                out["ops_out"].append({"result": enc(r)})
            except RuntimeError as ex:
                if str(ex) == "skip": out["ops_out"].append({"skip": True})
                else: raise
            except Exception as ex:
                out["ops_out"].append({"exc": {"type": tname(ex), "msg": emsg(ex)}})
        out["warnings"] = [str(x.message) for x in w]
    return out

for _ in range(500):
    names = rnd.sample(COMMON, rnd.randint(1, 8)) + rnd.sample(NAMES, rnd.randint(0, 6))
    seq = make_seq(names, rnd.choice([30, 100, 200, 400, 1000]))
    n = len(seq)
    ops = []
    for _ in range(rnd.randint(3, 8)):
        k = rnd.choice(["full", "blunt", "overhang5", "overhang3", "defined", "with_sites", "without_site", "with_N_sites", "with_number_list", "with_name", "with_site_size", "only_between", "between", "show_only_between",
                        "only_outside", "outside", "do_not_cut", "format", "format", "change", "repr"])
        a, b = rnd.choice([1, n // 4, n // 2, -n // 3, 0, n]), rnd.choice([n // 3, n - 5, 5, -2, n + 5])
        if k == "with_N_sites": ops.append([k, rnd.choice([0, 1, 2, 3])])
        elif k == "with_number_list": ops.append([k, rnd.sample([0, 1, 2, 3, 4], rnd.randint(0, 3))])
        elif k == "with_name": ops.append([k, rnd.sample(names, min(len(names), 3)) + rnd.sample(["NotAnEnzyme", "Foo"], rnd.randint(0, 1))])
        elif k == "with_site_size": ops.append([k, rnd.choice([4, 5, 6, 8])])
        elif k in ("only_between", "between", "show_only_between", "only_outside", "outside", "do_not_cut"): ops.append([k, a, b])
        elif k == "format": ops.append([k, rnd.choice(["list", "number", "map"]), rnd.choice(["", "TITLE\n"]), rnd.choice(["", "NOCUT\n"])])
        elif k == "change": ops.append([k, rnd.choice([{"NameWidth": 12}, {"ConsoleWidth": 100}, {"linear": rnd.random() < 0.5}, {"Indent": 2}, {"Maxsize": 4}, {"Cmodulo": 1}, {"Foo": 1}, {"sequence": make_seq(names, 150)}, {"NameWidth": 7, "ConsoleWidth": 60}])])
        else: ops.append([k])
    add(run_analysis, {"kind": "analysis", "batch": names, "seq": seq, "linear": rnd.random() < 0.6, "ops": ops})

# ---------------- suppliers ----------------
# Every enzyme class inherits `all_suppliers` from AbstractCut; `suppliers` is a classmethod on
# Commercially_available that prints the enzyme's own sellers, and a staticmethod on Not_available that prints nothing.
MIXINS = ["AbstractCut", "NoCut", "OneCut", "TwoCuts", "Meth_Dep", "Meth_Undep", "Palindromic", "NonPalindromic",
          "Unknown", "Blunt", "Ov5", "Ov3", "Defined", "Ambiguous", "NotDefined", "Commercially_available", "Not_available"]

def run_suppliers(case):
    cls = getattr(RR, case["cls"])
    out = {"all_suppliers": attempt(lambda: prints(lambda: cls.all_suppliers()))}
    if case["enzyme"] is not None:
        e = E(case["enzyme"])
        out["suppliers"] = attempt(lambda: prints(lambda: e.suppliers()))
        out["supplier_list"] = attempt(lambda: e.supplier_list())
        out["is_comm"] = attempt(lambda: e.is_comm())
    out["warnings"] = []
    return out

for cls in MIXINS:
    # Commercially_available and Not_available get the enzyme-level `suppliers` too, on an enzyme of that kind.
    enzyme = {"Commercially_available": "EcoRI", "Not_available": "AbaCIII"}.get(cls)
    add(run_suppliers, {"kind": "suppliers", "cls": cls, "enzyme": enzyme, "name": cls})

def run_codes(case):
    cls = {"RestrictionBatch": RestrictionBatch, "Analysis": Analysis}[case["cls"]]
    return {"suppl_codes": attempt(lambda: cls.suppl_codes()),
            "show_codes": attempt(lambda: prints(lambda: cls.show_codes())), "warnings": []}

for cls in ("RestrictionBatch", "Analysis"):
    add(run_codes, {"kind": "codes", "cls": cls, "name": cls})

# ---------------- abatch: the RestrictionBatch API on an Analysis ----------------
# Analysis subclasses RestrictionBatch, so it inherits the whole batch API. `__add__` builds `self.__class__(self)`,
# which makes an Analysis rather than a plain batch, so the class of the result is recorded as well as its contents.
def run_abatch(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            a = Analysis(RestrictionBatch(case["batch"]), Seq(case["seq"]), case["linear"])
        except Exception as ex:
            out["exc"] = {"type": tname(ex), "msg": emsg(ex)}; out["warnings"] = []; return out
        for op in case["ops"]:
            try:
                k, arg = op[0], op[1] if len(op) > 1 else None
                if k == "str": r = str(a)
                elif k == "repr": r = repr(a)
                elif k == "elements": r = a.elements()
                elif k == "as_string": r = sorted(a.as_string())
                elif k == "len": r = len(a)
                elif k == "has": r = arg in a
                elif k == "has_enz": r = E(arg) in a
                elif k == "get": r = a.get(arg, op[2])
                elif k == "format": r = a.format(arg)
                elif k == "is_restriction": r = a.is_restriction(arg)
                elif k == "add": a.add(arg); r = a.elements()
                elif k == "add_nocheck": a.add_nocheck(E(arg)); r = a.elements()
                elif k == "remove": a.remove(arg); r = a.elements()
                elif k == "plus": n = a + E(arg); r = [type(n).__name__, n.elements()]
                elif k == "iadd": a += E(arg); r = [type(a).__name__, a.elements()]
                elif k == "split": n = a.split(*[getattr(RR, c) for c in arg]); r = [type(n).__name__, len(n), sorted(x.__name__ for x in n._data)]
                elif k == "lambdasplit": n = a.lambdasplit(lambda x: x.size >= arg); r = [type(n).__name__, len(n), sorted(x.__name__ for x in n._data)]
                elif k == "add_supplier": a.add_supplier(arg); r = [len(a), a.current_suppliers()]
                elif k == "current_suppliers": r = a.current_suppliers()
                elif k == "search": r = a.search(Seq(arg), op[2])
                elif k == "print_that": r = prints(lambda: a.print_that(None, op[1], op[2]))
                else: raise ValueError(k)
                out["ops_out"].append({"result": enc(r)})
            except Exception as ex:
                out["ops_out"].append({"exc": {"type": tname(ex), "msg": emsg(ex)}})
        out["warnings"] = [str(x.message) for x in w]
    return out

ABATCH_OPS = ["str", "repr", "elements", "as_string", "len", "has", "has_enz", "get", "format", "is_restriction",
              "add", "add_nocheck", "remove", "plus", "iadd", "split", "lambdasplit", "add_supplier",
              "current_suppliers", "search", "print_that"]
for _ in range(120):
    names = rnd.sample(COMMON, rnd.randint(1, 5))
    seq = make_seq(names, rnd.choice([40, 120, 300]))
    ops = []
    for _ in range(rnd.randint(3, 8)):
        k = rnd.choice(ABATCH_OPS)
        if k in ("has", "is_restriction", "format"): ops.append([k, rnd.choice(names + ["HindIII", "NotAnEnzyme", "3"])])
        elif k == "has_enz": ops.append([k, rnd.choice(names)])
        elif k == "get": ops.append([k, rnd.choice(names + ["XhoI", "Foo"]), rnd.random() < 0.5])
        elif k in ("add", "remove"): ops.append([k, rnd.choice(names + ["HindIII", "NotAnEnzyme"])])
        elif k in ("add_nocheck", "plus", "iadd"): ops.append([k, rnd.choice(["HindIII", "NotI", "SmaI"])])
        elif k == "split": ops.append([k, rnd.sample(["Palindromic", "Blunt", "OneCut", "Ov5", "Defined"], rnd.randint(1, 2))])
        elif k == "lambdasplit": ops.append([k, rnd.choice([4, 6, 8])])
        elif k == "add_supplier": ops.append([k, rnd.choice(["C", "B", "N", "Z"])])
        elif k == "search": ops.append([k, make_seq(names, 80), rnd.random() < 0.5])
        elif k == "print_that": ops.append([k, rnd.choice(["", "TITLE\n"]), rnd.choice(["", "NOCUT\n"])])
        else: ops.append([k])
    add(run_abatch, {"kind": "abatch", "batch": names, "seq": seq, "linear": rnd.random() < 0.6, "ops": ops})

# ---------------- printfmt ----------------
# PrintFormat.print_that is the obsolete printing entry point Analysis overrides; `dct` is required here.
def run_printfmt(case):
    out = {"ops_out": []}
    a = Analysis(RestrictionBatch(case["batch"]), Seq(case["seq"]), case["linear"])
    pos = [p for v in a.mapping.values() for p in v]
    for op in case["ops"]:
        pf = PrintFormat()
        pf.sequence = Seq(case["seq"])
        pf.print_as(op[0])
        if op[0] == "map" and len(pos) != len(set(pos)):
            out["ops_out"].append({"skip": True}); continue      # enzymes sharing a cut: set order is arbitrary
        out["ops_out"].append(attempt(lambda: prints(lambda: pf.print_that(a.mapping, op[1], op[2]))))
    out["warnings"] = []
    return out

for _ in range(60):
    names = rnd.sample(COMMON, rnd.randint(1, 4))
    seq = make_seq(names, rnd.choice([40, 120, 300]))
    ops = [[rnd.choice(["list", "number", "map"]), rnd.choice(["", "TITLE\n"]), rnd.choice(["", "NOCUT\n"])] for _ in range(rnd.randint(1, 3))]
    add(run_printfmt, {"kind": "printfmt", "batch": names, "seq": seq, "linear": rnd.random() < 0.6, "ops": ops})

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
