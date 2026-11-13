"""Golden cases for Bio.motifs (matrices, Motif, thresholds, JASPAR and TRANSFAC) -> packages/motifs/test/golden/motifs.json

Kinds: `matrix` (operations on count/weight/score matrices), `motif` (Motif built from instances or counts),
`io` (reading and writing JASPAR/TRANSFAC text). Numbers are encoded with "nan"/"inf"/"-inf" strings.
"""
import io, json, math, os, random, warnings
import numpy as np
from Bio import motifs
from Bio.motifs import jaspar, transfac, matrix as M
from Bio.motifs.thresholds import ScoreDistribution
from Bio.Seq import Seq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "motifs", "test", "golden", "motifs.json")
rnd = random.Random(202)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def num(x):
    x = float(x)
    return "nan" if math.isnan(x) else "inf" if x == math.inf else "-inf" if x == -math.inf else x

def enc(x):
    if x is None or isinstance(x, (bool, str)): return x
    if isinstance(x, (int, np.integer)): return int(x)
    if isinstance(x, (float, np.floating)): return num(x)
    if isinstance(x, Seq): return {"seq": str(x)}
    if isinstance(x, M.GenericPositionMatrix): return {"matrix": type(x).__name__, "alphabet": x.alphabet, "length": x.length, "rows": [[k, [num(v) for v in dict.__getitem__(x, k)]] for k in dict.keys(x)]}
    if isinstance(x, motifs.Motif): return enc_motif(x)
    if isinstance(x, np.ndarray): return {"arr": [num(v) for v in x]}
    if isinstance(x, dict): return {"dict": [[str(k), enc(v)] for k, v in x.items()]}
    if isinstance(x, (list, tuple)): return [enc(v) for v in x]
    if isinstance(x, ScoreDistribution): return {"dist": {"min_score": num(x.min_score), "interval": num(x.interval), "n_points": x.n_points, "ic": num(x.ic), "step": num(x.step)}}
    raise TypeError(type(x))

def enc_motif(m):
    out = {"cls": type(m).__module__.split(".")[-1] + "." + type(m).__name__, "name": m.name, "length": m.length, "alphabet": m.alphabet, "mask": list(m.mask),
           "pseudocounts": [[k, num(v)] for k, v in m.pseudocounts.items()], "background": [[k, num(v)] for k, v in m.background.items()],
           "counts": enc(m.counts) if m.counts is not None else None, "alignment": str(m) if m.alignment is not None else None}
    if hasattr(m, "matrix_id"):
        out["jaspar"] = {k: getattr(m, k) for k in ("matrix_id", "collection", "tf_class", "tf_family", "species", "tax_group", "acc", "data_type", "medline", "pazar_id", "comment")}
    if hasattr(m, "gap"): out["gap_weight"] = [m.gap, m.weight]
    if isinstance(m, transfac.Motif):
        out["annotations"] = [[k, v] for k, v in dict.items(m)]
        out["references"] = getattr(m, "references", None)
    return out

def run_isolated(fn, case):
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(w, json.dumps(fn(case)).encode())
        finally: os._exit(0)
    os.close(w)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, status = os.waitpid(pid, 0)
    return None if status != 0 or not chunks else json.loads(b"".join(chunks))

def add(fn, c):
    res = run_isolated(fn, c)
    if res is not None: c.update(res); cases.append(c)

def attempt(f):
    try: return {"result": enc(f())}
    except Exception as e: return {"exc": {"type": tname(e), "msg": emsg(e)}}

def dec(v):
    if v == "nan": return float("nan")
    if v == "inf": return float("inf")
    if v == "-inf": return float("-inf")
    return v

def sl(a): return slice(*a)
def key(k):
    """A JSON key as Python: ["s", a, b, c] is a slice, ["t", ...] a tuple, anything else itself."""
    if isinstance(k, list) and k and k[0] == "s": return slice(*k[1:])
    if isinstance(k, list) and k and k[0] == "t": return tuple(k[1:])
    return k

# ---------------- matrix ----------------
def build_matrix(spec):
    alphabet, rows = spec["alphabet"], {k: v for k, v in spec["rows"]}
    cls = {"freq": M.FrequencyPositionMatrix, "pwm": M.PositionWeightMatrix, "pssm": M.PositionSpecificScoringMatrix}[spec["cls"]]
    return cls(alphabet, {k: [dec(x) for x in v] for k, v in rows.items()})

def run_matrix(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try: m = build_matrix(case["matrix"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        out["matrix_enc"] = enc(m)
        other = build_matrix(case["other"]) if case.get("other") else None
        for op in case["ops"]:
            k = op[0]
            def f():
                if k == "str": return str(m)
                if k == "get": return m[key(op[1])] if len(op) == 2 else m[key(op[1]), key(op[2])]
                if k == "consensus": return m.consensus
                if k == "anticonsensus": return m.anticonsensus
                if k == "degenerate": return m.degenerate_consensus
                if k == "calc_consensus": return m.calculate_consensus(**op[1])
                if k == "gc": return m.gc_content
                if k == "rc": return m.reverse_complement()
                if k == "normalize": return m.normalize(op[1] if not isinstance(op[1], list) else dict(op[1]))
                if k == "log_odds": return m.log_odds(dict(op[1]) if op[1] is not None else None)
                if k == "calculate": return m.calculate(Seq(op[1]) if op[2] == "Seq" else op[1] if op[2] == "str" else op[1].encode("latin-1", "replace") if op[2] == "bytes" else op[1])
                if k == "search": return list(m.search(Seq(op[1]), threshold=dec(op[2]), both=op[3], chunksize=op[4]))
                if k == "max": return m.max
                if k == "min": return m.min
                if k == "mean": return m.mean(dict(op[1]) if op[1] is not None else None)
                if k == "std": return m.std(dict(op[1]) if op[1] is not None else None)
                if k == "pearson": return m.dist_pearson(other)
                if k == "pearson_at": return m.dist_pearson_at(other, op[1])
                if k == "distribution":
                    d = m.distribution(background=dict(op[1]) if op[1] is not None else None, precision=op[2])
                    r = [d]
                    for t in op[3]:
                        if t == "fpr": r.append(d.threshold_fpr(op[4]))
                        elif t == "fnr": r.append(d.threshold_fnr(op[4]))
                        elif t == "balanced": r.append(d.threshold_balanced(op[4], op[5]))
                        elif t == "patser": r.append(d.threshold_patser())
                    return r
                raise ValueError(k)
            out["ops_out"].append(attempt(f))
        out["warnings"] = [str(x.message) for x in w]
    return out

def rand_counts(alphabet, length, kind):
    rows = {}
    for l in alphabet:
        rows[l] = [(rnd.choice([0, 0, 1, 2, 5, 10, 20]) if kind == "int" else rnd.choice([0.0, 0.5, 1.25, 3.0, 7.5])) for _ in range(length)]
    if kind == "dense":
        rows = {l: [rnd.randint(1, 30) for _ in range(length)] for l in alphabet}
    return rows

def seq_text(n):
    return "".join(rnd.choice("ACGT") for _ in range(n))

BG = [[("A", 0.3), ("C", 0.2), ("G", 0.2), ("T", 0.3)], [("A", 1), ("C", 1), ("G", 1), ("T", 1)], [("A", 0.5), ("C", 0.1), ("G", 0.1), ("T", 0.3)]]

for _ in range(500):
    alphabet = rnd.choice(["ACGT"] * 6 + ["ACGU", "ACDE", "ABC", "TGCA"])
    length = rnd.choice([1, 2, 3, 5, 8, 12])
    kind = rnd.choice(["int", "dense", "dense", "float"])
    rows = rand_counts(alphabet, length, kind)
    cls = rnd.choice(["freq", "pwm", "pssm", "pssm", "pssm"])
    if cls == "pssm":   # build a real PSSM through log-odds so the numbers are plausible
        try:
            pwm = M.FrequencyPositionMatrix(alphabet, rows).normalize(rnd.choice([0.5, 1.0, 0.0]))
            rows = {k: list(v) for k, v in pwm.log_odds().items()}
        except Exception: pass
    elif cls == "pwm":
        rows = {k: [v / 10 for v in vals] for k, vals in rows.items()}
    spec = {"cls": cls, "alphabet": alphabet, "rows": [[k, [("nan" if (isinstance(x, float) and math.isnan(x)) else "inf" if x == math.inf else "-inf" if x == -math.inf else x) for x in v]] for k, v in rows.items()]}
    other = None
    if cls == "pssm" and rnd.random() < 0.8: other = spec
    ops = [["str"], ["consensus"], ["anticonsensus"], ["degenerate"], ["gc"], ["rc"]]
    for _ in range(rnd.randint(4, 9)):
        pool = {"freq": ["get", "get", "calc_consensus", "calc_consensus", "normalize", "normalize"], "pwm": ["get", "get", "log_odds", "log_odds", "calc_consensus"],
                "pssm": ["get", "calculate", "calculate", "search", "search", "max", "min", "mean", "std", "pearson", "pearson_at", "distribution", "distribution"]}[cls]
        k = rnd.choice(pool)
        if k == "get":
            ks = rnd.choice([["A"], [0], [-1], ["Z"], ["AC"], [["s", None, None, 2]], [["t", 0, 1]], [3.5], [["s", 1, None, None]]])
            if rnd.random() < 0.5: ops.append(["get", ks[0], rnd.choice([0, 1, -1, 99, ["s", None, None, None], ["s", 0, 2, None], ["s", None, None, -1], 1.5])])
            else: ops.append(["get", ks[0]])
        elif k == "calc_consensus": ops.append([k, rnd.choice([{}, {"identity": 0.5}, {"setcase": 0.7}, {"identity": 0.3, "setcase": 0.9}, {"plurality": 1}, {"substitution_matrix": "x"}])])
        elif k == "normalize": ops.append([k, rnd.choice([None, 0.5, 1, {"A": 1.0, "C": 0.5, "G": 0.1, "T": 0.0, "U": 0.2, "D": 1.0, "E": 1.0, "B": 0.0}, {"A": 1}])])
        elif k == "log_odds": ops.append([k, rnd.choice([None] + BG + [[("A", 1), ("C", 1)]])])
        elif k == "calculate": ops.append([k, seq_text(rnd.choice([1, 3, 6, 15, 40])) if rnd.random() < 0.85 else rnd.choice(["ACGN", "acgtacgt", "", "A"]), rnd.choice(["Seq", "str", "bytes"])])
        elif k == "search": ops.append([k, rnd.choice([seq_text(rnd.choice([5, 12, 30])), "ACGTNACGT"]), rnd.choice([0.0, -1.0, 2.0, "-inf", 5.5]), rnd.random() < 0.6, rnd.choice([10 ** 6, 4, 7])])
        elif k in ("mean", "std"): ops.append([k, rnd.choice([None] + BG)])
        elif k == "pearson_at": ops.append([k, rnd.choice([0, 1, 2])])
        elif k == "distribution": ops.append([k, rnd.choice([None] + BG), rnd.choice([20, 50, 100]), rnd.sample(["fpr", "fnr", "balanced", "patser"], 2), rnd.choice([0.1, 0.01, 0.5]), rnd.random() < 0.5])
        else: ops.append([k])
    add(run_matrix, {"kind": "matrix", "matrix": spec, "other": other, "ops": ops})
# structural errors
add(run_matrix, {"kind": "matrix", "matrix": {"cls": "freq", "alphabet": "ACGT", "rows": [["A", [1, 2]], ["C", [1]], ["G", [1, 2]], ["T", [1, 2]]]}, "other": None, "ops": []})
add(run_matrix, {"kind": "matrix", "matrix": {"cls": "freq", "alphabet": "ACGT", "rows": [["A", [1, 2]], ["C", [1, 2]], ["G", [1, 2]]]}, "other": None, "ops": []})
add(run_matrix, {"kind": "matrix", "matrix": {"cls": "pwm", "alphabet": "ACGT", "rows": [["A", [0, 1]], ["C", [0, 1]], ["G", [0, 1]], ["T", [0, 1]]]}, "other": None, "ops": []})

# ---------------- motif ----------------
def build_motif(spec):
    if spec["how"] == "instances":
        return motifs.create([Seq(s) for s in spec["instances"]], spec["alphabet"])
    if spec["how"] == "counts":
        return motifs.Motif(alphabet=spec["alphabet"], counts={k: v for k, v in spec["counts"]})
    if spec["how"] == "both":
        return motifs.Motif(alphabet=spec["alphabet"], alignment=motifs.create([Seq(s) for s in spec["instances"]]).alignment, counts={k: v for k, v in spec["counts"]})
    return motifs.Motif()

def run_motif(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try: m = build_motif(case["spec"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        out["motif"] = enc(m)
        for op in case["ops"]:
            k = op[0]
            def f():
                nonlocal m
                if k == "str": return str(m)
                if k == "str_masked": return m.__str__(masked=True)
                if k == "len": return len(m)
                if k == "mask": m.mask = op[1] if not isinstance(op[1], list) else [bool(x) if isinstance(x, (bool, int)) else x for x in op[1]]; return list(m.mask)
                if k == "pseudocounts": m.pseudocounts = dict(op[1]) if isinstance(op[1], list) else op[1]; return [[a, num(b)] for a, b in m.pseudocounts.items()]
                if k == "background": m.background = dict(op[1]) if isinstance(op[1], list) else op[1]; return [[a, num(b)] for a, b in m.background.items()]
                if k == "slice": return m[sl(op[1])]
                if k == "item": return m[op[1]]
                if k == "pwm": return m.pwm
                if k == "pssm": return m.pssm
                if k == "rc": return m.reverse_complement()
                if k == "consensus": return m.consensus
                if k == "anticonsensus": return m.anticonsensus
                if k == "degenerate": return m.degenerate_consensus
                if k == "entropy": return m.relative_entropy
                if k == "format": return m.format(op[1])
                if k == "fmt": return format(m, op[1])
                if k == "write": return motifs.write([m], op[1])
                if k == "name": m.name = op[1]; return m.name
                raise ValueError(k)
            out["ops_out"].append(attempt(f))
        out["warnings"] = [str(x.message) for x in w]
    return out

def rand_instances(alphabet, n, length):
    return ["".join(rnd.choice(alphabet) for _ in range(length)) for _ in range(n)]

for _ in range(450):
    alphabet = rnd.choice(["ACGT"] * 5 + ["ACGU"])
    length = rnd.choice([1, 2, 4, 6, 10])
    how = rnd.choice(["instances", "instances", "counts", "counts", "both", "empty"])
    inst = rand_instances(alphabet, rnd.randint(1, 8), length)
    spec = {"how": how, "alphabet": alphabet, "instances": inst, "counts": [[l, [rnd.choice([0, 1, 2, 5, 9]) for _ in range(length)]] for l in alphabet]}
    ops = []
    for _ in range(rnd.randint(4, 10)):
        k = rnd.choice(["str", "str_masked", "len", "mask", "pseudocounts", "background", "slice", "item", "pwm", "pssm", "rc", "consensus", "anticonsensus", "degenerate", "entropy", "format", "fmt", "write", "name"])
        if k == "mask": ops.append([k, rnd.choice([None, "*" * length, " " * length, "*" + " " * (length - 1), "*x" + "*" * max(0, length - 2), [True, False] * (length // 2) if length % 2 == 0 else [1] * length, "**", [0] * (length + 1)])])
        elif k == "pseudocounts": ops.append([k, rnd.choice([None, 0.5, 1, [[l, 0.25 * i] for i, l in enumerate(alphabet)], [[alphabet[0], 1.0]]])])
        elif k == "background": ops.append([k, rnd.choice([None, 0.3, 0.5, [[l, 1.0 + i] for i, l in enumerate(alphabet)], [[alphabet[0], 1.0]]])])
        elif k == "slice": ops.append([k, rnd.choice([[None, None, None], [0, 2, None], [1, None, None], [None, -1, None], [None, None, -1], [0, None, 2], [5, 2, None], [0, 100, None]])])
        elif k == "item": ops.append([k, rnd.choice([0, 1, -1])])
        elif k in ("format", "fmt", "write"): ops.append([k, rnd.choice(["", "pfm", "jaspar", "transfac", "clusterbuster", "bogus", "JASPAR"])])
        elif k == "name": ops.append([k, rnd.choice(["MyMotif", "", "x y"])])
        else: ops.append([k])
    add(run_motif, {"kind": "motif", "spec": spec, "ops": ops})
add(run_motif, {"kind": "motif", "spec": {"how": "both", "alphabet": "ACGT", "instances": ["ACGT"], "counts": [[l, [1, 1, 1, 1]] for l in "ACGT"]}, "ops": []})

# ---------------- io ----------------
def run_io(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["op"] == "parse":
                ms = motifs.parse(io.StringIO(case["text"]), case["fmt"], case.get("strict", True))
                out["result"] = [enc_motif(m) for m in ms]
                out["version"] = getattr(ms, "version", None)
                if case["fmt"] == "jaspar" and len(ms):
                    ex = {"ids": [[m.base_id, m.version] for m in ms], "dict": sorted(ms.to_dict().keys()), "eq": [ms[0] == m for m in ms], "str": str(ms)}
                    ex["pseudo"] = attempt(lambda: jaspar.calculate_pseudocounts(ms[0]))
                    ms[0].background = {"A": 0.4, "C": 0.1, "G": 0.1, "T": 0.4}
                    ex["pseudo_bg"] = attempt(lambda: jaspar.calculate_pseudocounts(ms[0]))
                    out["extra"] = ex
                out["str"] = str(ms) if hasattr(ms, "version") and case["fmt"] == "transfac" else None
            elif case["op"] == "read":
                out["result"] = [enc_motif(motifs.read(io.StringIO(case["text"]), case["fmt"], case.get("strict", True)))]
            else:   # write: parse as jaspar/transfac then write in another format
                ms = motifs.parse(io.StringIO(case["text"]), case["fmt"])
                out["written"] = {f: attempt(lambda f=f: motifs.write(list(ms), f)) for f in case["to"]}
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
        out["warnings"] = [str(x.message) for x in w]
    return out

def jaspar_text(n, style):
    parts = []
    for k in range(n):
        length = rnd.randint(1, 8)
        rows = {l: [rnd.choice([0, 1, 2, 5, 12, 30]) for _ in range(length)] for l in "ACGT"}
        if style == "jaspar":
            parts.append(f">MA{rnd.randint(1, 999):04d}.{rnd.randint(1, 3)} {rnd.choice(['Gata1', 'Sp1', 'T', 'Foo_bar'])}\n" + "".join(f"{l} [ " + "  ".join(str(v) for v in rows[l]) + " ]\n" for l in "ACGT"))
        elif style == "jaspar_short":
            parts.append(f">MA{rnd.randint(1, 999):04d}\n" + "".join("  ".join(str(v) for v in rows[l]) + "\n" for l in "ACGT"))
        elif style == "pfm":
            parts.append("".join((l + " " if rnd.random() < 0.5 else "") + " ".join(f"{v:.1f}" for v in rows[l]) + "\n" for l in "ACGT"))
            break
        else:
            parts.append("".join(f">seq{i}\n" + "".join(rnd.choice("ACGTacgt") if rnd.random() < 0.7 else rnd.choice("ACGT") for _ in range(length)) + "\n" for i in range(rnd.randint(1, 5))))
            break
    return "".join(parts)

def transfac_text(n, strict_ok=True):
    out = ["VV  TRANSFAC MATRIX TABLE, Rel.3.2 26-06-1997\nXX\n//\n"] if rnd.random() < 0.4 else []
    for k in range(n):
        length = rnd.randint(1, 6)
        block = [f"AC  M{rnd.randint(1, 99999):05d}", "XX", f"ID  V$TEST_{k}", "XX", "DT  19.10.92 (created); ewi.", "DT  16.10.95 (updated); ewi.", "XX", f"NA  TEST{k}", "XX", "DE  A test factor", "XX", "BF  T00001; GATA-1; Species: human, Homo sapiens.", "BF  T00002; SP1; Species: mouse.", "XX"]
        block.append("P0      A      C      G      T")
        for i in range(length):
            vals = [rnd.choice([0, 1, 2, 5, 10, 12]) for _ in range(4)]
            block.append(("%02d" % (i + 1)) + " " + "     ".join(f"{v:2d}" for v in vals) + "      N")
        block += ["XX", "CC  Some comment", "XX", "RN  [1]; RE0000001.", "RX  PUBMED: 12345.", "RA  Author A, Author B.", "RT  A title.", "RL  J. Mol. Biol. 1:2-3 (1990).", "XX", "//"]
        out.append("\n".join(block) + "\n")
    return "".join(out)

def clusterbuster_text(n):
    out = []
    for k in range(n):
        out.append(f">motif{k}\n")
        if rnd.random() < 0.5: out.append(f"# GAP: {rnd.choice([0, 1, 2.5, 10])}\n")
        if rnd.random() < 0.5: out.append(f"# WEIGHT: {rnd.choice([0, 1, 0.5, 4])}\n")
        if rnd.random() < 0.2: out.append("# a comment\n")
        for _ in range(rnd.randint(0, 5)): out.append("\t".join(str(rnd.choice([0, 1, 2, 7, 12.5])) for _ in range(4)) + "\n")
    return "".join(out)

def mutate(text):
    lines = text.split("\n")
    r = rnd.random()
    if r < 0.2 and len(lines) > 3: del lines[rnd.randrange(len(lines) - 1)]
    elif r < 0.4: lines.insert(rnd.randrange(len(lines)), rnd.choice(["", "XX", "P0 A C G T", "01 1 2 3 4", "ZZ", "AC", "RN [3]; x", "RX  y", "BF  v", "  indented  x", "A [ 1 2 x ]", "// ", "VV"]))
    elif r < 0.6: i = rnd.randrange(len(lines)); lines[i] = lines[i].replace("  ", " ", 1)
    elif r < 0.75: lines = lines[: rnd.randrange(1, len(lines))]
    elif r < 0.9: i = rnd.randrange(len(lines)); lines[i] = lines[i].replace("1", "x", 1)
    return "\n".join(lines)

for _ in range(350):
    style = rnd.choice(["jaspar", "jaspar_short", "pfm", "sites"])
    text = jaspar_text(rnd.randint(1, 3), style)
    if rnd.random() < 0.3: text = mutate(text)
    fmt = {"jaspar_short": "jaspar"}.get(style, style)
    add(run_io, {"kind": "io", "op": rnd.choice(["parse", "parse", "read"]), "fmt": fmt, "text": text})
for _ in range(500):
    text = transfac_text(rnd.randint(1, 3))
    if rnd.random() < 0.35: text = mutate(text)
    add(run_io, {"kind": "io", "op": rnd.choice(["parse", "parse", "read"]), "fmt": "transfac", "text": text, "strict": rnd.random() < 0.7})
for _ in range(250):
    style = rnd.choice(["jaspar", "pfm", "transfac", "sites"])
    text = transfac_text(rnd.randint(1, 2)) if style == "transfac" else jaspar_text(rnd.randint(1, 3), style)
    add(run_io, {"kind": "io", "op": "write", "fmt": style, "text": text, "to": ["pfm", "jaspar", "transfac", "PFM", "bogus", "clusterbuster"]})
for _ in range(150):
    text = clusterbuster_text(rnd.randint(1, 3))
    if rnd.random() < 0.3: text = mutate(text)
    add(run_io, {"kind": "io", "op": rnd.choice(["parse", "parse", "read"]), "fmt": "clusterbuster", "text": text})
add(run_io, {"kind": "io", "op": "parse", "fmt": "clusterbuster", "text": ""})
for i in ("MA0001.1", "MA0001", "a.b.c", "", ".1", "x.", "A.B"):
    cases.append({"kind": "split_id", "id": i, "result": list(jaspar.split_jaspar_id(i))})
add(run_io, {"kind": "io", "op": "parse", "fmt": "bogus", "text": ""})
for f in ("meme", "alignace", "minimal"): pass

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
