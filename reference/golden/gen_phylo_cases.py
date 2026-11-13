"""Golden cases for Bio.Phylo (BaseTree, Newick, NexusIO, _io) -> packages/phylo/test/golden/phylo.json

A case is {"kind": "ops", "newick": text, "parse": {...}, "ops": [...]}: the tree is read from the Newick text, each op is a method call
({"m": name, "args": [...], "kwargs": {...}}) whose result (clades as paths from the root) and the state of the tree afterwards are recorded,
or {"kind": "io", ...} for parse/read/write/convert over text.
"""
import io, json, os, random, warnings
from Bio import Phylo
from Bio.Phylo import BaseTree, Newick, NewickIO

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "phylo", "test", "golden", "phylo.json")
rnd = random.Random(77)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

# ---- encoding of trees and results ----
import math
def fx(x):
    """JSON cannot hold inf or nan: they become {"f": "inf"}."""
    if isinstance(x, float) and not math.isfinite(x): return {"f": repr(x)}
    return x

def conf(c):
    if c is None: return None
    return ["int", c] if isinstance(c, int) else ["float", fx(c)]

def enc_clade(c):
    d = {"name": c.name, "bl": fx(c.branch_length), "conf": conf(c.confidence), "width": fx(c.width), "color": None if c.color is None else list(c.color.to_rgb()),
         "clades": [enc_clade(x) for x in c.clades]}
    if hasattr(c, "comment"): d["comment"] = c.comment
    return d

def enc_tree(t):
    d = {"rooted": t.rooted, "id": t.id, "name": t.name, "root": enc_clade(t.root)}
    if hasattr(t, "weight"): d["weight"] = fx(t.weight)
    return d

def path_of(tree, target):
    def walk(c, p):
        if c is target: return p
        for i, ch in enumerate(c.clades):
            r = walk(ch, p + [i])
            if r is not None: return r
        return None
    return walk(tree.root, [])

class Raw:
    def __init__(self, v): self.v = v

def enc_result(tree, r):
    if isinstance(r, Raw): return r.v
    if isinstance(r, (BaseTree.Clade, BaseTree.Tree)):
        p = path_of(tree, r) if isinstance(r, BaseTree.Clade) else None
        return {"path": p} if p is not None else {"clade": enc_clade(r.root)}
    if isinstance(r, dict): return {"map": [[enc_result(tree, k), fx(v)] for k, v in r.items()]}
    if isinstance(r, (list, tuple)): return [enc_result(tree, x) for x in r]
    if hasattr(r, "__next__") or hasattr(r, "send"): return [enc_result(tree, x) for x in r]
    if r is None or isinstance(r, (bool, int, float, str)): return fx(r)
    return {"repr": repr(r)}

FUNCS = {
    "short": lambda c: c.branch_length is not None and c.branch_length < 0.2,
    "named": lambda c: bool(c.name),
    "always": lambda c: True,
    "never": lambda c: False,
    "boom": lambda c: c.nothing,
    "typeerr": lambda c: c.branch_length < "a",
}
CLASSES = {"Clade": Newick.Clade, "BaseClade": BaseTree.Clade, "Tree": Newick.Tree}

def dec(tree, x):
    if isinstance(x, dict):
        if "path" in x:
            c = tree.root
            for i in x["path"]: c = c.clades[i]
            return c
        if "fn" in x: return FUNCS[x["fn"]]
        if "cls" in x: return CLASSES[x["cls"]]
        if "list" in x: return [dec(tree, i) for i in x["list"]]
        if "tuple" in x: return tuple(dec(tree, i) for i in x["tuple"])
        if "dict" in x: return {k: dec(tree, v) for k, v in x["dict"].items()}
        if "float" in x: return float(x["float"])
        raise ValueError(x)
    return x

def run_op(tree, op):
    m = op["m"]
    args = [dec(tree, a) for a in op.get("args", [])]
    kwargs = {k: dec(tree, v) for k, v in op.get("kwargs", {}).items()}
    if m == "str": return str(tree)
    if m == "repr": return repr(tree)
    if m == "root_repr": return repr(tree.root)
    if m == "clade_str": return [str(c) for c in tree.get_terminals() + tree.get_nonterminals()]
    if m == "clade_repr": return [repr(c) for c in tree.get_terminals() + tree.get_nonterminals()]
    if m == "format": return tree.format(*args)
    if m == "getitem": return tree.root[args[0]] if not isinstance(args[0], list) else tree.root[tuple(args[0])]
    if m == "getslice": return tree.root[slice(*args)]
    if m == "len": return len(tree.root)
    if m == "set_color": tree.root.clades[args[0]].color = args[1]; return tree.root.clades[args[0]].color.to_rgb()
    if m == "color_repr": return [repr(tree.root.clades[args[0]].color), str(tree.root.clades[args[0]].color)]
    if m == "color_hex": return [tree.root.clades[args[0]].color.to_hex(), list(tree.root.clades[args[0]].color.to_rgb())]
    if m == "is_terminal": return tree.is_terminal()
    if m == "clade": return tree.clade
    if m == "from_clade":
        t = type(tree).from_clade(args[0], **kwargs)
        return Raw(enc_tree(t))
    if m == "find_any": return tree.find_any(*args, **kwargs)
    if m in ("find_elements", "find_clades"): return list(getattr(tree, m)(*args, **kwargs))
    if m == "depths": return tree.depths(*args, **kwargs)
    if m == "root_with_outgroup": return tree.root_with_outgroup(*args, **kwargs)
    return getattr(tree, m)(*args, **kwargs)

def run_ops(case):
    out = []
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tree = Phylo.read(io.StringIO(case["newick"]), "newick", **case.get("parse", {}))
    except Exception as e:
        return {"exc": {"type": tname(e), "msg": emsg(e)}}
    res = {"tree": enc_tree(tree), "results": []}
    for op in case["ops"]:
        o = {}
        try:
            o["result"] = enc_result(tree, run_op(tree, op))
        except Exception as e:
            o["exc"] = {"type": tname(e), "msg": emsg(e)}
        if not op.get("final"): o["after"] = enc_tree(tree)
        res["results"].append(o)
        if op.get("final"): break
    return res

# ---- IO cases ----
def run_io(case):
    k = case["op"]
    fmt = case.get("fmt", "newick")
    try:
        if k == "parse":
            return {"result": [enc_tree(t) for t in Phylo.parse(io.StringIO(case["text"]), fmt, **case.get("kwargs", {}))]}
        if k == "read":
            return {"result": enc_tree(Phylo.read(io.StringIO(case["text"]), fmt, **case.get("kwargs", {})))}
        if k in ("write", "convert"):
            trees = list(Phylo.parse(io.StringIO(case["text"]), case.get("in", "newick")))
            buf = io.StringIO()
            n = Phylo.write(trees, buf, fmt, **case.get("kwargs", {}))
            return {"result": {"text": buf.getvalue(), "n": n}}
        if k == "write_single":
            t = Phylo.read(io.StringIO(case["text"]), "newick")
            buf = io.StringIO()
            n = Phylo.write(t if not case.get("clade") else t.root, buf, fmt, **case.get("kwargs", {}))
            return {"result": {"text": buf.getvalue(), "n": n}}
        if k == "format":
            t = Phylo.read(io.StringIO(case["text"]), "newick")
            return {"result": t.format(case.get("spec"))}
    except Exception as e:
        return {"exc": {"type": tname(e), "msg": emsg(e)}}

def run_isolated(case):
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(w, json.dumps((run_ops if case["kind"] == "ops" else run_io)(case)).encode())
        finally: os._exit(0)
    os.close(w)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, st = os.waitpid(pid, 0)
    return json.loads(b"".join(chunks)) if st == 0 and chunks else None

def add(c):
    res = run_isolated(c)
    if res is not None: cases.append(dict(c, **res))

# ---- tree text generation ----
def rand_newick(r, nleaves, names=True, conf=True, comments=False, quote=False):
    labels = []
    def leaf(i):
        n = f"T{i}"
        if quote and r.random() < 0.3: n = r.choice(["a b", "it's", "x:y", "(p)"])
        labels.append(n)
        nm = ("'" + n.replace("'", "''") + "'") if any(ch in n for ch in " ':()") else n
        s = nm + (":" + repr(round(r.random() * 2, 3)) if r.random() < 0.9 else "")
        if comments and r.random() < 0.3: s += "[&c=%d]" % r.randint(1, 9)
        return s
    def build(ids):
        if len(ids) == 1: return leaf(ids[0])
        cut = r.randint(1, len(ids) - 1) if len(ids) > 2 or r.random() < 0.5 else 1
        parts = [ids[:cut], ids[cut:]]
        if len(ids) > 3 and r.random() < 0.2:
            c2 = r.randint(1, len(ids) - 2); parts = [ids[:c2], ids[c2:c2 + 1], ids[c2 + 1:]]
        inner = ",".join(build(p) for p in parts)
        lab = ""
        if conf and r.random() < 0.6: lab = r.choice(["90", "75", "0.95", "100", "1.0"])
        elif names and r.random() < 0.3: lab = r.choice(["N1", "inner", "clade_x"])
        return "(" + inner + ")" + lab + (":" + repr(round(r.random() * 2, 3)) if r.random() < 0.8 else "")
    return build(list(range(1, nleaves + 1))) + ";"

TEXTS = [rand_newick(rnd, n, quote=(n % 3 == 0), comments=(n % 4 == 0)) for n in [2, 3, 4, 5, 6, 7, 8, 10, 12, 5, 6, 7, 9, 11]]
TEXTS += ["((A:0.1,B:0.2)90:0.3,(C:0.4,D:0.5):0.6);", "(A,B,(C,D));", "((A:1,B:1):1,C:2);", "(A:1,B:1,C:1,D:1);", "A;", "(A);", "((A));", "(,);", "(A,B);", "((A,B)x,(C,D)y)z;", "(A:0.1,(B:0.2,(C:0.3,D:0.4):0.1):0.1):0.0;"]

def pick_names(text):
    t = Phylo.read(io.StringIO(text), "newick")
    return [c.name for c in t.get_terminals() if c.name]

def pathspec(i): return {"path": i}

def gen_ops(text):
    t = Phylo.read(io.StringIO(text), "newick")
    terms = t.get_terminals(); nonterms = t.get_nonterminals()
    names = [c.name for c in terms if c.name]
    ops = [{"m": "clade"}, {"m": "format"}, {"m": "format", "args": ["newick"]}, {"m": "format", "args": ["nexus"]}, {"m": "str"}, {"m": "repr"}, {"m": "root_repr"}, {"m": "clade_str"}, {"m": "clade_repr"}, {"m": "len"}, {"m": "is_terminal"}, {"m": "count_terminals"}, {"m": "total_branch_length"}, {"m": "is_bifurcating"}, {"m": "is_preterminal"},
           {"m": "get_terminals"}, {"m": "get_terminals", "args": ["postorder"]}, {"m": "get_nonterminals", "args": ["level"]}, {"m": "depths"}, {"m": "depths", "kwargs": {"unit_branch_lengths": True}},
           {"m": "find_clades"}, {"m": "find_clades", "kwargs": {"terminal": True, "order": "level"}}, {"m": "find_clades", "kwargs": {"terminal": False, "order": "postorder"}}, {"m": "find_elements", "kwargs": {"order": "bogus"}},
           {"m": "find_clades", "args": [{"fn": "short"}]}, {"m": "find_clades", "args": [{"fn": "named"}]}, {"m": "find_clades", "args": [{"fn": "boom"}]}, {"m": "find_clades", "args": [{"fn": "typeerr"}]},
           {"m": "find_clades", "args": [{"cls": "Clade"}]}, {"m": "find_clades", "args": [{"cls": "Tree"}]}, {"m": "find_any"}, {"m": "find_any", "args": [{"fn": "never"}]},
           {"m": "find_clades", "kwargs": {"branch_length": True}}, {"m": "find_clades", "kwargs": {"confidence": True}}, {"m": "find_clades", "kwargs": {"name": "T.*"}}, {"m": "find_clades", "kwargs": {"name": None}}, {"m": "find_clades", "kwargs": {"bogus": 1}},
           {"m": "find_clades", "kwargs": {"confidence": 90}}, {"m": "find_clades", "kwargs": {"width": None}}, {"m": "find_elements", "args": [{"dict": {"name": "T1"}}]},
           {"m": "get_path"}, {"m": "ladderize"}, {"m": "ladderize", "kwargs": {"reverse": True}}]
    for nm in names[:4]:
        ops += [{"m": "find_any", "args": [nm]}, {"m": "find_clades", "args": [nm]}, {"m": "get_path", "args": [nm]}, {"m": "distance", "args": [nm]}, {"m": "is_parent_of", "args": [nm]}, {"m": "common_ancestor", "args": [nm]}]
    if len(names) >= 2:
        a, b = names[0], names[-1]
        ops += [{"m": "common_ancestor", "args": [a, b]}, {"m": "common_ancestor", "args": [{"list": [a, b]}]}, {"m": "common_ancestor", "args": [{"list": [a]}, b]}, {"m": "common_ancestor"}, {"m": "common_ancestor", "args": ["nosuch"]},
                {"m": "trace", "args": [a, b]}, {"m": "distance", "args": [a, b]}, {"m": "distance", "args": ["nosuch"]}, {"m": "is_monophyletic", "args": [a, b]}, {"m": "is_monophyletic", "args": [{"list": names[:2]}]},
                {"m": "is_monophyletic", "args": [{"list": names}]}, {"m": "is_monophyletic", "args": [{"list": [a]}]}]
    if nonterms:
        ops += [{"m": "get_path", "args": [pathspec([0])]}, {"m": "is_parent_of", "args": [pathspec([0])]}, {"m": "distance", "args": [pathspec([0])]}]
    ops += [{"m": "getitem", "args": [0]}, {"m": "getitem", "args": [-1]}, {"m": "getitem", "args": [9]}, {"m": "getitem", "args": [[0, 0]]}, {"m": "getslice", "args": [0, 1]}, {"m": "getslice", "args": [None, None, -1]},
            {"m": "set_color", "args": [0, "red"]}, {"m": "set_color", "args": [0, "#10ff20"]}, {"m": "set_color", "args": [0, {"list": [1, 2, 3]}]}, {"m": "color_repr", "args": [0]}, {"m": "set_color", "args": [0, "nocolor"]}, {"m": "set_color", "args": [0, "#12"]},
            {"m": "color_hex", "args": [0]}, {"m": "set_color", "args": [0, "#0cc864"]}, {"m": "color_hex", "args": [0]},
            {"m": "from_clade", "args": [{"path": [0]}]}, {"m": "from_clade", "args": [{"path": [0]}], "kwargs": {"rooted": True, "id": "x", "name": "y"}},
            {"m": "set_color", "args": [0, {"list": [1, 2]}]}, {"m": "set_color", "args": [0, {"list": [1, 2, 300]}]}, {"m": "set_color", "args": [0, 5]}, {"m": "set_color", "args": [0, "k"]}]
    # editing operations last
    if names:
        ops += [{"m": "collapse", "args": [names[0]]}, {"m": "collapse", "args": ["nosuch"]}, {"m": "collapse", "kwargs": {"name": "N1"}}, {"m": "collapse"}, {"m": "collapse_all", "args": [{"fn": "short"}]},
                {"m": "split"}, {"m": "split", "args": [3, 0.5]}, {"m": "prune", "args": [names[-1]]}, {"m": "prune", "args": ["nosuch"]}, {"m": "prune", "kwargs": {"terminal": True}}, {"m": "total_branch_length"}, {"m": "str"}]
    return ops

for text in TEXTS:
    add({"kind": "ops", "newick": text, "ops": gen_ops(text)})
# destructive operations on fresh copies of each tree, one per case
for text in TEXTS[:14]:
    names = pick_names(text)
    if len(names) < 2: continue
    for op in ([{"m": "root_with_outgroup", "args": [names[0]]}, {"m": "str"}], [{"m": "root_with_outgroup", "args": [names[-1]]}, {"m": "total_branch_length"}], [{"m": "root_with_outgroup", "args": [names[0], names[1]]}],
               [{"m": "root_with_outgroup", "args": [{"list": names[:2]}]}], [{"m": "root_with_outgroup", "args": [names[0]], "kwargs": {"outgroup_branch_length": 0.5}}],
               [{"m": "root_with_outgroup", "args": [names[0], names[1]], "kwargs": {"outgroup_branch_length": 0.25}}], [{"m": "root_with_outgroup", "args": ["nosuch"]}], [{"m": "root_at_midpoint"}, {"m": "str"}],
               [{"m": "collapse_all"}], [{"m": "collapse_all", "args": [{"fn": "named"}]}], [{"m": "collapse_all", "kwargs": {"confidence": True}}], [{"m": "prune", "args": [n]} for n in names[:3]],
               [{"m": "split", "args": [2]}, {"m": "split", "args": [1]}, {"m": "str"}], [{"m": "ladderize"}, {"m": "ladderize", "kwargs": {"reverse": True}}],
               [{"m": "root_with_outgroup", "args": [names[0]]}, {"m": "root_with_outgroup", "args": [names[1]]}, {"m": "root_at_midpoint"}]):
        add({"kind": "ops", "newick": text, "ops": op})
for text in ["(A:1,B:1,C:1,D:1);", "(A,B);", "A;", "((A:1,B:1):1,(C:1,D:1):1);", "(A:0,B:0);", "((A,B),C);", "(A:1,B:2,C:3);"]:
    for op in ([{"m": "root_at_midpoint"}, {"m": "str"}], [{"m": "root_with_outgroup", "args": ["A"]}], [{"m": "prune", "args": ["A"]}, {"m": "prune", "args": ["B"]}, {"m": "prune", "args": ["C"]}]):
        add({"kind": "ops", "newick": text, "ops": op})

# a float pattern raises inside find_clades and leaves the clade without its `clades` attribute (a Biopython bug): final op only
for text in TEXTS[:4]:
    add({"kind": "ops", "newick": text, "ops": [{"m": "find_clades", "kwargs": {"branch_length": 1.5}, "final": True}]})
    add({"kind": "ops", "newick": text, "ops": [{"m": "find_elements", "kwargs": {"branch_length": 1.5}, "final": True}]})
    add({"kind": "ops", "newick": text, "ops": [{"m": "get_path", "kwargs": {"branch_length": 1.5}, "final": True}]})

# parse options
for kw in ({"values_are_confidence": True}, {"comments_are_confidence": True}, {"rooted": True}, {"values_are_confidence": True, "rooted": True}):
    for text in TEXTS[:8]:
        add({"kind": "ops", "newick": text, "parse": kw, "ops": [{"m": "str"}, {"m": "total_branch_length"}]})
        add({"kind": "io", "op": "parse", "text": text, "kwargs": kw})

# newick parse edge cases
BAD = ["", "\n", ";", "(;", "(A,B", "A,B);", "(A,B));", "((A,B);", "(A:x,B);", "(A,B);(C,D);", "(A,B); extra", "(A,B)'q", "(A:1e5,B:-1);", "(A: 0.5,B:.5);", "(A:+1,B:1.);", "(A,B)[comment];", "(A[x],B[y\\]z])[w];", "('a''b',\"c\");",
       "(A,B):0.5;", "((A:0.1,B:0.2):0.3,C:0.4):0.0;\n(D,E);\n", "(A,B);\n\n(C,D)", "((A,B)nan,(C,D)1e3)inf;", "((A,B)007,(C,D)1.50);", "(A\n,B\n);", "( A , B ) ;", "(A,B)\t;", "(A:1:2,B);", "(A B,C);"]
for t in BAD:
    add({"kind": "io", "op": "parse", "text": t})
    add({"kind": "io", "op": "read", "text": t})
    add({"kind": "ops", "newick": t, "ops": [{"m": "str"}]})

# writing
WOPTS = [{}, {"plain": True}, {"confidence_as_branch_length": True}, {"branch_length_only": True}, {"plain": True, "confidence_as_branch_length": True}, {"format_confidence": "%1.1f"}, {"format_branch_length": "%.3f"},
         {"format_confidence": "%d", "format_branch_length": "%e"}, {"max_confidence": 0.5, "confidence_as_branch_length": True}, {"ladderize": "left"}, {"ladderize": "RIGHT"}, {"ladderize": "up"}, {"format_branch_length": "%s"},
         {"format_confidence": "%5.1f|", "format_branch_length": "%+.2g"}, {"format_branch_length": "%z"}, {"format_confidence": "%1.2f %f"}, {"format_branch_length": "x"}, {"plain_newick": False}]
for t in TEXTS[:10] + ["((A,B)x,(C,D)y)z;", "('a b',c)'it''s';", "(A[c1],B)[c2];", "((A,B)90,(C,D)0.5)1.0;"]:
    for kw in WOPTS:
        add({"kind": "io", "op": "write", "text": t, "fmt": "newick", "kwargs": kw})
    add({"kind": "io", "op": "write", "text": t, "fmt": "nexus"})
    add({"kind": "io", "op": "write", "text": t, "fmt": "nexus", "kwargs": {"branch_length_only": True}})
    add({"kind": "io", "op": "write", "text": t, "fmt": "bogus"})
    add({"kind": "io", "op": "write_single", "text": t, "fmt": "newick"})
    add({"kind": "io", "op": "write_single", "text": t, "fmt": "newick", "clade": True})
    add({"kind": "io", "op": "format", "text": t, "spec": "newick"})
    add({"kind": "io", "op": "format", "text": t, "spec": ""})
    add({"kind": "io", "op": "format", "text": t, "spec": "bogus"})
add({"kind": "io", "op": "write", "text": "".join(TEXTS[:3]).replace(";", ";\n"), "fmt": "newick"})
add({"kind": "io", "op": "write", "text": "", "fmt": "newick"})
add({"kind": "io", "op": "convert", "text": "(A,B);(C,D);", "in": "newick", "fmt": "nexus"})

NEX = ["#NEXUS\nBegin Taxa;\n Dimensions NTax=4;\n TaxLabels A B C D;\nEnd;\nBegin Trees;\n Tree t1=((A:0.1,B:0.2):0.3,(C:0.4,D:0.5):0.6);\n Tree t2=[&R] (A,(B,(C,D)));\nEnd;\n",
       "#NEXUS\nBegin Trees;\n Tree one = [&U] (A:1,B:2);\nEnd;\n", "#NEXUS\nBegin Trees;\nEnd;\n", "#NEXUS\n", "",
       "#NEXUS\nBegin Taxa;\n Dimensions NTax=3;\n TaxLabels A B C;\nEnd;\nBegin Trees;\n Translate 1 A, 2 B, 3 C;\n Tree t = [&W0.5] ((1:1,2:2)90:1,3:3);\nEnd;\n",
       "#NEXUS\nBegin Trees;\n Tree t = (A,B)[comment];\nEnd;\n"]
for t in NEX:
    add({"kind": "io", "op": "parse", "text": t, "fmt": "nexus"})
    add({"kind": "io", "op": "read", "text": t, "fmt": "nexus"})
    add({"kind": "io", "op": "convert", "text": t, "in": "nexus", "fmt": "newick"})
add({"kind": "io", "op": "parse", "text": "(A,B);", "fmt": "bogus"})
add({"kind": "io", "op": "read", "text": "(A,B);", "fmt": "bogus"})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
