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
from isolate import eval_entrypoint, run_isolated, report_skipped   # one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "motifs", "test", "golden", "motifs.json")
rnd = random.Random(202)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ in ("AttributeError", "ExpatError"): return None   # expat's wording for malformed XML is not reproduced exactly
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


#: Set when this process was started by `isolate` to evaluate one case in a fresh interpreter. Everything below
#: still runs -- building the cases is cheap and the runners are defined on the way down -- but nothing is
#: measured, so the forks that are the whole problem never happen. `eval_entrypoint` at the foot of the file
#: answers the one case it was given and exits before the golden file is written.
EVALUATING = bool(os.environ.get("ISOLATE_EVAL"))

def add(fn, c):
    if EVALUATING: return
    # `fresh_eval` names the runner for `eval_entrypoint`, so a case whose every forked child dies gets one last
    # attempt somewhere that has inherited nothing. One case here needs it in about a third of runs.
    res = run_isolated(fn, c, fresh_eval=fn.__name__)
    if res is None: return          # unreachable: `isolate` raises instead, rather than write a shorter file
    c.update(res); cases.append(c)

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
def enc_extra(m):
    ex = {}
    for k in ("score", "number", "evalue", "num_occurrences", "id", "alt_id"):
        if hasattr(m, k): ex[k] = getattr(m, k) if not isinstance(getattr(m, k), float) else num(getattr(m, k))
    if m.alignment is not None:
        ex["instances"] = [{k: (num(v) if isinstance(v, float) else v) for k, v in vars(s).items() if k in ("motif_name", "sequence_id", "sequence_name", "start", "pvalue", "strand", "length")} for s in m.alignment.sequences]
    return ex

def enc_record(ms):
    rec = {}
    for k in ("version", "command", "parameters", "sequences", "datafile", "alphabet", "background", "diagrams", "database", "strand_handling"):
        if hasattr(ms, k):
            v = getattr(ms, k)
            rec[k] = {kk: (num(vv) if isinstance(vv, float) else vv) for kk, vv in v.items()} if isinstance(v, dict) else v
    return rec

def run_io(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["op"] == "parse":
                ms = motifs.parse(io.StringIO(case["text"]), case["fmt"], case.get("strict", True))
                out["result"] = [enc_motif(m) for m in ms]
                if case["fmt"] in ("alignace", "meme", "minimal", "mast", "xms", "pfm-four-columns", "pfm-four-rows"):
                    out["extras"] = [enc_extra(m) for m in ms]; out["record"] = enc_record(ms)
                out["version"] = getattr(ms, "version", None) if case["fmt"] not in ("meme", "minimal", "mast", "alignace") else None
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
                from Bio.motifs import pfm as _pfm
                out["written"]["pfm-four-columns"] = attempt(lambda: _pfm.write(list(ms)))
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

def alignace_text(n):
    lines = ["AlignACE 4.0 (compiled Nov  1 2001)", "./AlignACE -i seqs.fa -numcols 6", "", "Input Sequences:", "#1\tseq1", "#2\tseq2", "", "Parameter values:", "expect=10", "gcback=0.38", ""]
    for k in range(n):
        lines.append(f"Motif {k + 1}")
        width = rnd.randint(2, 6)
        for _ in range(rnd.randint(1, 5)):
            lines.append("".join(rnd.choice("ACGT") for _ in range(width)) + f"\t{rnd.randint(1, 2)}\t{rnd.choice('+-')}\t{rnd.randint(1, 50)}")
        lines.append("*" * width if rnd.random() < 0.8 else " " * 1 + "*" * (width - 1))
        lines.append(f"MAP Score: {rnd.uniform(1, 20):.3f}")
        lines.append("")
    return "\n".join(lines) + "\n"

def minimal_text(n):
    lines = ["********************************************************************************", "MEME - Motif discovery tool", "********************************************************************************", "MEME version 4.12.0 (Release date: Thu Aug 31 14:23:12 2017 +1000)", "",
             "ALPHABET= " + rnd.choice(["ACGT", "ACGT", "ACGU"]), "", "strands: + -", "", "Background letter frequencies (from file `db'):", "A 0.250 C 0.250 G 0.250 T 0.250", ""]
    for k in range(n):
        w = rnd.randint(2, 6)
        lines.append(f"MOTIF {rnd.choice(['GCTA', 'TTGA', 'ACGT'])}{k} MEME-{k + 1}")
        lines.append("")
        lines.append(f"letter-probability matrix: alength= 4 w= {w} nsites= {rnd.randint(2, 30)} E= {rnd.choice(['1.2e-005', '0.5', '3.4e+002'])}")
        for _ in range(w):
            ps = [rnd.random() for _ in range(4)]
            t = sum(ps)
            lines.append(" ".join(f"{p / t:.6f}" for p in ps))
        lines.append("")
    return "\n".join(lines) + "\n"

def meme_xml(n):
    seqs = "".join(f'<sequence id="sequence_{i}" name="seq{i}" length="100" weight="1.0"/>' for i in range(3))
    motifs_xml = ""
    for k in range(n):
        width = rnd.randint(2, 5)
        sites = ""
        for s in range(rnd.randint(1, 4)):
            letters = "".join(f'<letter_ref letter_id="letter_{rnd.choice("ACGT")}"/>' for _ in range(width))
            sites += f'<contributing_site sequence_id="sequence_{rnd.randint(0, 2)}" position="{rnd.randint(0, 80)}" strand="{rnd.choice(["plus", "minus", "none"])}" pvalue="{rnd.choice(["1.2e-05", "0.001"])}"><left_flank>AA</left_flank><site>{letters}</site><right_flank>CC</right_flank></contributing_site>'
        motifs_xml += f'<motif id="motif_{k + 1}" name="MOTIF{k + 1}" alt="MEME-{k + 1}" width="{width}" sites="{rnd.randint(1, 9)}" ic="10.1" re="11" llr="50" e_value="{rnd.choice(["1.5e-010", "2.0"])}" bayes_threshold="9.5" elapsed_time="1.0"><contributing_sites>{sites}</contributing_sites></motif>'
    alpha = "".join(f'<value letter_id="letter_{c}">0.25</value>' for c in "ACGT")
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<MEME version="4.11.2" release="Sat Nov 14 12:00:00 2015 -0800"><training_set primary_sequences="/data/seqs.fa" primary_count="3" primary_positions="300" control_sequences="--none--" control_count="0" control_positions="0">'
            f'{seqs}<letter_frequencies><alphabet_array>{alpha}</alphabet_array></letter_frequencies></training_set><model><command_line>meme seqs.fa -dna -nmotifs {n}</command_line><host>localhost</host></model><motifs>{motifs_xml}</motifs></MEME>\n')

def mast_xml(n, strand):
    motifs_xml = "".join(f'<motif id="motif_{i + 1}" alt="MEME-{i + 1}" length="{rnd.randint(3, 8)}" nsites="5" evalue="1e-05" bad_ic_threshold="1.0"/>' for i in range(n))
    seqs = ""
    for i in range(rnd.randint(1, 3)):
        hits = "".join(f'<hit pos="{p}" idx="{rnd.randint(0, n - 1)}" rc="{rnd.choice("yn")}" pvalue="1e-4" match="AAAA" translation="X"/>' for p in sorted(rnd.sample(range(1, 90), rnd.randint(0, 4))))
        seqs += f'<sequence name="seq{i}" comment="" length="100" score="12.5" combined_pvalue="1e-5" db="db_1" seg_count="1"><seg start="1">{hits}</seg></sequence>'
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<mast version="4.11.2" release="Date"><model><command_line>mast meme.xml seqs.fa</command_line></model><alphabet name="DNA"/><motifs>{motifs_xml}</motifs>'
            f'<sequence_dbs><sequence_db source="/data/seqs.fa" name="seqs" type="1" last_mod_date="date" seq_count="3" residue_count="300"/></sequence_dbs><settings strand_handling="{strand}"/><sequences>{seqs}</sequences></mast>\n')

def xms_xml(n):
    out = '<?xml version="1.0" encoding="UTF-8"?>\n<motifset>\n'
    for k in range(n):
        out += f"  <motif>\n    <name>Motif{k}</name>\n    <prop><key>x</key><value>1</value></prop>\n"
        for _ in range(rnd.randint(1, 5)):
            ws = "".join(f'<weight symbol="{s}">{rnd.choice(["0.25", "1", "0.5", " 3 "])}</weight>' for s in ("adenine", "cytosine", "guanine", "thymine") if rnd.random() < 0.9)
            out += f"    <column pos=\"1\">{ws}</column>\n"
        out += "  </motif>\n"
    return out + "</motifset>\n"

def pfm_cols_text(n):
    out = []
    for k in range(n):
        style = rnd.choice(["plain", "gene", "motif", "pos", "fasta"])
        if style == "gene": out.append(f"Gene\tG{k}")
        elif style == "motif": out.append(f"Motif\tM{k}")
        elif style == "fasta": out.append(f">name {k}")
        if style == "pos": out.append("Pos\tA\tC\tG\tT")
        elif rnd.random() < 0.3: out.append(rnd.choice(["A C G T", "T G C A", "A C G"]))
        for i in range(rnd.randint(1, 5)):
            row = [str(rnd.choice([0, 1, 5, 12.5])) for _ in range(4)]
            out.append(("\t".join(([str(i + 1)] if style == "pos" else []) + row)))
        out.append("" if rnd.random() < 0.7 else "# comment")
    return "\n".join(out) + "\n"

def pfm_rows_text(n):
    out = []
    for k in range(n):
        if rnd.random() < 0.7: out.append(f">motif{k}")
        w = rnd.randint(1, 5)
        for l in "ACGT":
            vals = " ".join(str(rnd.choice([0, 1, 5, 12.5, "1e-2"])) for _ in range(w))
            out.append(rnd.choice([f"{l} [ {vals} ]", f"{l} | {vals}", vals, f"{l.lower()}  {vals}"]))
        if rnd.random() < 0.2: out.append("Ent= 1.5")
    return "\n".join(out) + "\n"

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
GEN = {"alignace": lambda: alignace_text(rnd.randint(1, 3)), "minimal": lambda: minimal_text(rnd.randint(1, 3)), "meme": lambda: meme_xml(rnd.randint(1, 3)), "mast": lambda: mast_xml(rnd.randint(1, 3), rnd.choice(["combine", "unstranded", "other"])),
       "xms": lambda: xms_xml(rnd.randint(1, 3)), "pfm-four-columns": lambda: pfm_cols_text(rnd.randint(1, 3)), "pfm-four-rows": lambda: pfm_rows_text(rnd.randint(1, 3))}
for fmt, gen in GEN.items():
    for _ in range(120):
        text = gen()
        if rnd.random() < 0.3: text = mutate(text) if fmt not in ("meme", "mast", "xms") else text.replace(rnd.choice(["<", "=", "\"", "/>"]), rnd.choice(["", "<<", "x"]), 1)
        add(run_io, {"kind": "io", "op": rnd.choice(["parse", "parse", "read"]), "fmt": fmt, "text": text})
    add(run_io, {"kind": "io", "op": "parse", "fmt": fmt, "text": ""})
for i in ("MA0001.1", "MA0001", "a.b.c", "", ".1", "x.", "A.B"):
    cases.append({"kind": "split_id", "id": i, "result": list(jaspar.split_jaspar_id(i))})
add(run_io, {"kind": "io", "op": "parse", "fmt": "bogus", "text": ""})
for f in ("meme", "alignace", "minimal"): pass

# A mask assignment that fails part-way through leaves the mask shorter than the motif, and printing the mask then
# raises instead of padding. The random ops reach this only by chance, so it is pinned down here.
add(run_motif, {"kind": "motif", "spec": {"how": "instances", "alphabet": "ACGT", "instances": ["GCTGTG", "CGTCTT"], "counts": []},
                "ops": [["str_masked"], ["mask", "*x****"], ["str_masked"], ["mask", "*  ***"], ["str_masked"], ["mask", None], ["str_masked"]]})

# ---------------- matrixcmp ----------------
# The matrices subclass `dict`, so `==` compares the stored rows (the alphabet plays no part) while the ordering
# operators raise, and the message names both operands' classes. The row container is part of equality, because
# `[1.0] == (1.0,)` is false in Python: a weight matrix stores tuples, every other matrix lists.
def operand(spec, what, left):
    """Build the right-hand operand of a comparison. `left` is the matrix itself, for the identity case."""
    if what == "same": return left
    if what in ("copy", "other"): return build_matrix(spec)   # "copy" is given the left spec, "other" the right one
    if what == "generic": return M.GenericPositionMatrix(spec["alphabet"], {k: [dec(x) for x in v] for k, v in spec["rows"]})
    if what == "dict_list": return {k: [dec(x) for x in v] for k, v in spec["rows"]}
    if what == "str": return "x"
    if what == "int": return 3
    if what == "none": return None
    if what == "list": return [1, 2]
    raise ValueError(what)

CMP_OPS = ["eq", "lt", "le", "gt", "ge"]
def run_matrixcmp(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try: m = build_matrix(case["left"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        for op in case["ops"]:
            k, what = op
            spec = case["left"] if what in ("same", "copy", "generic", "dict_list") else case["right"]
            def f():
                o = operand(spec, what, m)
                if k == "eq": return m == o
                if k == "lt": return m < o
                if k == "le": return m <= o
                if k == "gt": return m > o
                if k == "ge": return m >= o
                raise ValueError(k)
            out["ops_out"].append(attempt(f))
        out["warnings"] = [str(x.message) for x in w]
    return out

WHATS = ["same", "copy", "generic", "dict_list", "other", "str", "int", "none", "list"]
for _ in range(90):
    alphabet = rnd.choice(["ACGT"] * 5 + ["ACGU", "ABC"])
    length = rnd.choice([1, 2, 4, 7])
    cls = rnd.choice(["freq", "pwm", "pssm"])
    def spec_for(cls, rows):
        return {"cls": cls, "alphabet": alphabet,
                "rows": [[k, [("nan" if (isinstance(x, float) and math.isnan(x)) else "inf" if x == math.inf else "-inf" if x == -math.inf else x) for x in v]] for k, v in rows.items()]}
    rows = rand_counts(alphabet, length, rnd.choice(["int", "dense", "float"]))
    if cls == "pssm":
        try: rows = {k: list(v) for k, v in M.FrequencyPositionMatrix(alphabet, rows).normalize(0.5).log_odds().items()}
        except Exception: pass
    elif cls == "pwm":
        rows = {k: [v / 10 for v in vals] for k, vals in rows.items()}
    left = spec_for(cls, rows)
    # the "other" operand: another class over the same letters, so a difference in rows or in row container shows
    other_cls = rnd.choice([c for c in ("freq", "pwm", "pssm") if c != cls] + [cls])
    other_rows = rand_counts(alphabet, rnd.choice([length, length, max(1, length - 1)]), "dense")
    if other_cls == "pwm": other_rows = {k: [v / 10 for v in vals] for k, vals in other_rows.items()}
    right = spec_for(other_cls, other_rows)
    ops = [[k, w] for k in CMP_OPS for w in rnd.sample(WHATS, 4)]
    add(run_matrixcmp, {"kind": "matrixcmp", "left": left, "right": right, "ops": ops})

# every operand against every operator at least once, on one matrix of each class
for cls in ("freq", "pwm", "pssm"):
    rows = {l: [1.0, 2.0, 3.0] for l in "ACGT"}
    left = {"cls": cls, "alphabet": "ACGT", "rows": [[k, v] for k, v in rows.items()]}
    right = {"cls": "freq", "alphabet": "ACGT", "rows": [[k, [9.0, 9.0, 9.0]] for k in "ACGT"]}
    add(run_matrixcmp, {"kind": "matrixcmp", "left": left, "right": right, "ops": [[k, w] for k in CMP_OPS for w in WHATS]})

eval_entrypoint({"run_matrix": run_matrix, "run_motif": run_motif, "run_io": run_io,
                 "run_matrixcmp": run_matrixcmp})
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
report_skipped()
