"""Golden cases for Bio.Nexus (the Nexus, Tree and StepMatrix classes used directly).

Output: packages/nexus/test/golden/nexus.json
Case kinds:
  nexus - parse "text" with Nexus.Nexus, run "ops" ([name, kwargs]) in order, record each result plus a final state snapshot.
  combine - Nexus.combine over the "texts"; the result's state snapshot.
  tree - build Tree(newick) and run "ops" ([name, args]); records str(tree) after each op.
The SeqIO side of Bio.Nexus (parse/write of "nexus") is covered by seqio-nexus.json.
"""
import contextlib, io, json, os, random, sys, warnings
import Bio
from Bio.Nexus import Nexus, Trees, Nodes, StandardData
from Bio.Seq import Seq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "nexus", "test", "golden", "nexus.json")
rnd = random.Random(417)
cases, seen = [], set()

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def conv(v):
    """JSON form: dicts become [[k, v], ...] pairs, sets sorted lists, Seq text."""
    if isinstance(v, dict): return {"$map": [[conv(k), conv(x)] for k, x in v.items()]}
    if isinstance(v, (set, frozenset)): return {"$set": sorted((conv(x) for x in v), key=lambda x: json.dumps(x, separators=(",", ":")))}
    if isinstance(v, (list, tuple)): return [conv(x) for x in v]
    if isinstance(v, Seq): return str(v)
    if isinstance(v, Nodes.Node): return "<Node>"
    if isinstance(v, float) and v != v: return {"$nan": 1}
    if isinstance(v, (int, float, str, bool)) or v is None: return v
    return str(v)

def snapshot(n):
    keys = ["ntax", "nchar", "taxlabels", "unaltered_taxlabels", "charlabels", "datatype", "missing", "gap", "matchchar", "symbols", "equate", "labels", "interleave",
            "charsets", "taxsets", "charpartitions", "taxpartitions", "codonposset", "options", "respectcase", "translate"]
    out = {k: conv(getattr(n, k, "<unset>")) for k in keys}
    out["matrix"] = conv(n.matrix) if n.matrix else None
    return out

def camelless(kw): return kw

def run_nexus_op(n, name, kw):
    if name == "write_nexus_data":
        h = io.StringIO()
        try: r = n.write_nexus_data(filename=h, **kw)
        finally: pass
        return {"text": h.getvalue(), "returned": r is h}
    if name == "append_sets": return n.append_sets(**kw)
    if name == "crop_matrix": return n.crop_matrix(**kw)
    if name == "adjust_charlabels": return n._adjust_charlabels(**kw)
    if name == "constant": return n.constant(**kw)
    if name == "cstatus": return n.cstatus(**kw)
    if name == "weighted_stepmatrix": return n.weighted_stepmatrix(**kw)
    if name == "add_sequence": return n.add_sequence(**kw)
    if name == "insert_gap": return n.insert_gap(**kw)
    if name == "invert": return n.invert(**kw)
    if name == "gaponly": return n.gaponly(**kw)
    if name == "terminal_gap_to_missing": return n.terminal_gap_to_missing(**kw)
    raise KeyError(name)

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["kind"] == "nexus":
                n = Nexus.Nexus(case["text"]); res = []
                out["ops_out"] = res
                for name, kw in case["ops"]:
                    try: res.append({"result": conv(run_nexus_op(n, name, kw))})
                    except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
                out["state"] = snapshot(n)
            elif case["kind"] == "combine":
                c = Nexus.combine([(nm, Nexus.Nexus(t)) for nm, t in case["texts"]])
                out["state"] = snapshot(c) if c is not None else None
            elif case["kind"] == "standard":
                sd = StandardData.StandardData(case["data"])
                out["raw"] = conv(sd.raw()); out["str"] = str(sd); out["len"] = len(sd); out["iter"] = conv(list(sd))
                items = []
                out["items"] = items
                for i in case["indices"]:
                    try: items.append({"result": conv(sd[i])})
                    except Exception as e: items.append({"exc": {"type": tname(e), "msg": emsg(e)}})
            elif case["kind"] == "func":
                fn = {"safename": Nexus.safename, "quotestrip": Nexus.quotestrip, "get_start_end": Nexus.get_start_end}[case["fn"]]
                out["result"] = conv(fn(*case["args"]))
            elif case["kind"] == "consensus":
                c = Trees.consensus([Trees.Tree(t, rooted=True) for t in case["trees"]], *case.get("args", []))
                out["result"] = str(c) if c is not None else None
            elif case["kind"] == "tree":
                t = Trees.Tree(case["newick"], **case.get("kw", {})); res = []
                out["ops_out"] = res
                out["initial"] = str(t)
                for name, args in case["ops"]:
                    try:
                        if name == "str": r = str(t)
                        elif name == "to_string": r = t.to_string(**args[0])
                        elif name == "is_compatible":
                            with contextlib.redirect_stdout(io.StringIO()): r = t.is_compatible(Trees.Tree(args[0]), *args[1:])
                        elif name == "merge_with_support":
                            r = t.merge_with_support(bstrees=[Trees.Tree(x) for x in args[0]] or None, constree=Trees.Tree(args[1]) if args[1] else None, threshold=args[2], outgroup=args[3])
                        elif name == "node_call":
                            r = getattr(t.node(args[0]), args[1])(*args[2:])
                        elif name == "is_identical": r = t.is_identical(Trees.Tree(args[0]))
                        else: r = getattr(t, name)(*args)
                        res.append({"result": conv(r), "tree": str(t)})
                    except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def add(c):
    c = json.loads(json.dumps(c))     # the methods mutate list arguments (exclude.append ...); keep the stored case pristine
    key = json.dumps(c, sort_keys=True)
    if key in seen: return
    seen.add(key)
    cases.append({**c, **run(c)})

def nexus_text(rnd, datatype="dna", n=None, L=None, sets=True, labels=True, gaps=True):
    n = n or rnd.randint(2, 5); L = L or rnd.randint(4, 24)
    alpha = {"dna": "ACGT-?RY", "protein": "ACDEFGHIKLMNPQRSTVWY-?", "rna": "ACGU-?"}[datatype] if gaps else "ACGT"
    names = ["tax%d" % i for i in range(n)]
    t = "#NEXUS\nbegin data;\ndimensions ntax=%d nchar=%d;\nformat datatype=%s missing=? gap=-;\n" % (n, L, datatype)
    if labels and rnd.random() < .5: t += "charlabels " + ", ".join("%d lab%d" % (i + 1, i) for i in range(0, L, rnd.randint(1, 3))) + ";\n"
    t += "matrix\n" + "".join("%s %s\n" % (nm, "".join(rnd.choice(alpha) for _ in range(L))) for nm in names) + ";\nend;\n"
    if sets and rnd.random() < .7:
        a = rnd.randint(1, L); b = rnd.randint(a, L)
        t += "begin sets;\ncharset cs1 = %d-%d;\ncharset cs2 = %s;\ntaxset ts1 = %s;\ncharpartition part = x: 1-%d, y: %d-%d;\ntaxpartition tp = g1: %s, g2: %s;\nend;\n" % (
            a, b, " ".join(str(rnd.randint(1, L)) for _ in range(3)), " ".join(names[:2]), max(1, L // 2), L // 2 + 1, L, names[0], " ".join(names[1:]))
    return t

def rand_ops(rnd, n, L):
    ops = []
    names = ["tax%d" % i for i in range(n)]
    for _ in range(rnd.randint(2, 6)):
        k = rnd.choice(["write", "write", "write", "append", "crop", "adj", "const", "cstatus", "step", "add", "gap", "inv", "gaponly", "tgm"])
        ex = rnd.sample(range(L), rnd.randint(0, min(3, L)))
        de = rnd.sample(names, rnd.randint(0, 1)) + (["nope"] if rnd.random() < .05 else [])
        if k == "write":
            kw = {}
            if rnd.random() < .5: kw["exclude"] = ex
            if rnd.random() < .4: kw["delete"] = de
            if rnd.random() < .4: kw["interleave"] = True
            if rnd.random() < .4: kw["blocksize"] = rnd.randint(1, 10)
            if rnd.random() < .2: kw["interleave_by_partition"] = rnd.choice(["part", "nope"])
            if rnd.random() < .3: kw["comment"] = "a comment"
            if rnd.random() < .2: kw["omit_NEXUS"] = True
            if rnd.random() < .2: kw["append_sets"] = False
            if rnd.random() < .2: kw["mrbayes"] = True
            if rnd.random() < .2: kw["codons_block"] = False
            ops.append(["write_nexus_data", kw])
        elif k == "append": ops.append(["append_sets", {"exclude": ex, "delete": de, "mrbayes": rnd.random() < .3, "include_codons": rnd.random() < .5, "codons_only": rnd.random() < .2}])
        elif k == "crop":
            kw = {"delete": de}
            if rnd.random() < .7: kw["exclude"] = ex
            ops.append(["crop_matrix", kw])
        elif k == "adj":
            ops.append(["adjust_charlabels", rnd.choice([{"exclude": ex}, {"insert": ex}, {}, {"exclude": ex, "insert": ex}])])
        elif k == "const": ops.append(["constant", {"delete": de[:1], "exclude": ex}])
        elif k == "cstatus": ops.append(["cstatus", {"site": rnd.randint(0, L), "delete": de[:1], "narrow": rnd.random() < .5}])
        elif k == "step": ops.append(["weighted_stepmatrix", {"name": "sm", "exclude": ex, "delete": de[:1]}])
        elif k == "add": ops.append(["add_sequence", {"name": rnd.choice(["new", "tax0", ""]), "sequence": "".join(rnd.choice("ACGT-?") for _ in range(rnd.randint(0, L + 4)))}])
        elif k == "gap": ops.append(["insert_gap", {"pos": rnd.randint(-1, L + 1), "n": rnd.randint(0, 3), "leftgreedy": rnd.random() < .5}])
        elif k == "inv": ops.append(["invert", {"charlist": ex}])
        elif k == "gaponly": ops.append(["gaponly", {"include_missing": rnd.random() < .5}])
        else: ops.append(["terminal_gap_to_missing", rnd.choice([{}, {"missing": "N"}, {"skip_n": False}])])
    return ops

def rand_newick(rnd, taxa, bl=True, support=False, depth=0):
    if len(taxa) == 1 or (depth > 0 and rnd.random() < .15 and len(taxa) <= 2):
        parts = taxa
    else:
        k = rnd.randint(2, min(3, len(taxa))); cuts = sorted(rnd.sample(range(1, len(taxa)), k - 1)); parts = []
        prev = 0
        for c in cuts + [len(taxa)]:
            parts.append(taxa[prev:c]); prev = c
        parts = [rand_newick(rnd, p, bl, support, depth + 1) if len(p) > 1 else p[0] for p in parts]
        s = "(" + ",".join(parts) + ")"
        if support and depth > 0: s += str(rnd.choice([50, 75, 100, 0.5, 90]))
        if bl and depth > 0: s += ":%s" % rnd.choice(["0.1", "0.25", "1", "0.5", "2.5e-2"])
        return s
    s = parts[0] if len(parts) == 1 else "(" + ",".join(parts) + ")"
    if bl: s += ":%s" % rnd.choice(["0.1", "0.25", "1", "0.5"])
    return s

def tree_cases():
    for _ in range(60):
        taxa = ["T%d" % i for i in range(rnd.randint(3, 8))]
        nw = rand_newick(rnd, taxa, bl=rnd.random() < .8, support=rnd.random() < .4)
        if not nw.startswith("("): nw = "(" + nw + ")"
        ops = [["str", []], ["get_taxa", []], ["count_terminals", []], ["is_bifurcating", []], ["has_support", []], ["sum_branchlength", []], ["get_terminals", []],
               ["to_string", [{"plain": False}]], ["to_string", [{"plain_newick": True}]], ["to_string", [{"branchlengths_only": True}]], ["to_string", [{"support_as_branchlengths": True}]], ["to_string", [{"ladderize": rnd.choice(["LEFT", "RIGHT", None])}]]]
        for _ in range(rnd.randint(1, 4)):
            a, b = rnd.sample(taxa, 2)
            ops.append(rnd.choice([["search_taxon", [a]], ["is_monophyletic", [rnd.sample(taxa, rnd.randint(1, 3))]], ["prune", [a]], ["unroot", []], ["root_with_outgroup", [[a]]], ["root_with_outgroup", []],
                                   ["branchlength2support", []], ["convert_absolute_support", [rnd.choice([10, 100])]], ["collapse_genera", []], ["split", [None, 2, 0.5]], ["split", [0, 3, 1.0]],
                                   ["distance", [rnd.randint(0, 5), rnd.randint(0, 5)]], ["common_ancestor", [rnd.randint(0, 5), rnd.randint(0, 5)]],
                                   ["is_identical", [nw]], ["is_compatible", [rand_newick(rnd, taxa if rnd.random() < .7 else taxa[:-1], bl=False, support=True), rnd.choice([0, 50, 90]), rnd.random() < .7]], ["is_compatible", [nw, 50]], ["merge_with_support", [[rand_newick(rnd, taxa, bl=False) for _ in range(rnd.randint(0, 3))], rnd.choice([None, rand_newick(rnd, taxa, bl=False, support=True)]), rnd.choice([0.5, 0.2]), rnd.choice([None, [taxa[0]]])]], ["is_identical", [rand_newick(rnd, taxa)]], ["node", [rnd.randint(0, 12)]] if False else ["is_terminal", [rnd.randint(0, 8)]], ["is_internal", [rnd.randint(0, 8)]], ["is_preterminal", [rnd.randint(0, 8)]], ["get_taxa", [rnd.randint(0, 8)]], ["all_ids", []], ["node", [rnd.randint(0, 9)]], ["node_call", [rnd.randint(0, 6), rnd.choice(["add_succ", "remove_succ"]), rnd.randint(0, 9)]], ["node_call", [rnd.randint(0, 6), "set_succ", [rnd.randint(0, 9) for _ in range(rnd.randint(0, 3))]]], ["node_call", [rnd.randint(0, 6), "add_succ", [rnd.randint(0, 9)]]], ["node_call", [rnd.randint(0, 6), "set_id", rnd.randint(0, 9)]], ["node_call", [rnd.randint(0, 6), "get_succ"]], ["node_call", [rnd.randint(0, 6), "set_prev", rnd.choice([None, 0, 3])]], ["node_call", [rnd.randint(0, 6), "get_id"]], ["node_call", [rnd.randint(0, 6), "get_prev"]], ["is_parent_of", [rnd.randint(0, 8), rnd.randint(0, 8)]], ["trace", [rnd.randint(0, 8), rnd.randint(0, 8)]], ["collapse", [rnd.randint(0, 8)]], ["kill", [rnd.randint(0, 8)]], ["unlink", [rnd.randint(0, 8)]], ["link", [rnd.randint(0, 8), rnd.randint(0, 8)]], ["count_terminals", [rnd.randint(0, 8)]], ["is_bifurcating", [rnd.randint(0, 8)]], ["has_support", [rnd.randint(0, 8)]], ["set_subtree", [rnd.randint(0, 8)]]]))
        kw = rnd.choice([{}, {"rooted": True}, {"weight": 2.0, "name": "nm"}, {"values_are_support": True}, {"values_are_support": True, "max_support": 100.0}])
        add({"kind": "tree", "newick": nw, "kw": kw, "ops": ops})
    for nw in ["(a,b);", "(a:0.1,b:0.2);", "((a,b),c);", "(a,(b,c)d);", "((a,b)90:0.1,c);", "(a[&x=1]:1,b);", "('a b',c);", "(a,b,c,d);", "((a,b),(c,d),(e,f));", "(a,b", "a,b)", "((a,b)", "()", "", "(a,b);;", "(a:x,b);", "((a,b)c:0.1[comment],d);", "(a,b)c;", "x", "(a b,c);", "(a,'b c':0.5);", "((a,b)[note],c);"]:
        add({"kind": "tree", "newick": nw, "kw": {}, "ops": [["str", []], ["get_taxa", []], ["count_terminals", []], ["is_bifurcating", []], ["has_support", []], ["unroot", []], ["to_string", [{"plain": False}]]]})

def func_cases():
    names = ["a", "a b", "it's", "x-y", "a(b)", "", "ünï", "a_b", "1", "a.b", "a;b", "'q'", '"d"', "a,b", "a=b", "[x]", "a\tb", "n:1", "*", "a/b", "{x}", "a'b c"]
    for nm in names:
        for mb in (False, True): add({"kind": "func", "fn": "safename", "args": [nm, mb]})
        add({"kind": "func", "fn": "safename", "args": [nm]})
    for q in ["'a'", "'a b'", "a", "''", "'it''s'", "'", "'a", "a'", "''''", '"a"', "'a''b'", "", "'x'y'"]: add({"kind": "func", "fn": "quotestrip", "args": [q]})
    for seq, ch in [("--AC--", "-"), ("ACGT", "-"), ("----", "-"), ("", "-"), ("?A-C?", "-?"), ("nnACnn", "nN"), ("A", "A"), ("AAA", "A")]:
        add({"kind": "func", "fn": "get_start_end", "args": [seq, list(ch)]})
        add({"kind": "func", "fn": "get_start_end", "args": [seq]})

def standard_cases():
    for d in ["", "0", "01", "01(12){34}", "(01)", "{01}", "0(1", "0{1", "0)1", "0}1", "(0)(1)", "{0}{1}", "(01{2})", "-?01", "((0))", "0(1)2{34}5", 5, None]:
        add({"kind": "standard", "data": d, "indices": [0, 1, -1, 5, -9]})

def compat_cases():
    for nw, other, thr in [("((A,B)90:1,(C,D)90:1,E)", "((A,C)90:1,(B,D)90:1,E)", 50), ("((A,B)90:1,(C,D)90:1,E)", "((A,C)40:1,(B,D)90:1,E)", 50), ("((A,B)90:1,(C,D)90:1,E)", "((A,B)90:1,(C,D)90:1,E)", 50),
                           ("((A,B)90:1,(C,D)90:1,E)", "((A,C)90:1,(B,D)90:1)", 50), ("((A,B)90:1,(C,D)90:1,E,F)", "((A,C)90:1,(B,D)90:1,E)", 0), ("((A,B,C)80:1,(D,E)70:1)", "((A,B)90:1,(C,D,E)90:1)", 60)]:
        add({"kind": "tree", "newick": nw, "kw": {}, "ops": [["is_compatible", [other, thr]], ["is_compatible", [other, thr, False]], ["is_compatible", [other, 100, False]]]})

def main():
    for _ in range(70):
        dt = rnd.choice(["dna", "dna", "protein", "rna"])
        n = rnd.randint(2, 5); L = rnd.randint(4, 24)
        t = nexus_text(rnd, dt, n, L)
        add({"kind": "nexus", "text": t, "ops": rand_ops(rnd, n, L)})
    # hand-written edge cases
    base = "#NEXUS\nbegin data;\ndimensions ntax=3 nchar=6;\nformat datatype=dna missing=? gap=-;\nmatrix\nA ACGT-C\nB AC-TAC\nC ?CGTAC\n;\nend;\n"
    for ops in ([["write_nexus_data", {}]], [["write_nexus_data", {"interleave": True, "blocksize": 4}]], [["write_nexus_data", {"exclude": [0, 1, 2, 3, 4, 5]}]], [["write_nexus_data", {"delete": ["A", "B", "C"]}]],
                [["constant", {}]], [["constant", {"delete": ["A", "B"]}]], [["constant", {"delete": ["A", "B", "C"]}]], [["gaponly", {}]], [["insert_gap", {"pos": 3, "n": 2}], ["write_nexus_data", {}]],
                [["terminal_gap_to_missing", {}]], [["add_sequence", {"name": "A", "sequence": "ACGTACGTAC"}], ["write_nexus_data", {}]]):
        add({"kind": "nexus", "text": base, "ops": ops})
    protein = "#NEXUS\nbegin data;\ndimensions ntax=3 nchar=5;\nformat datatype=protein missing=? gap=-;\nmatrix\nA MKV-L\nB MKVAL\nC MRVAL\n;\nend;\n"
    for ops in ([["constant", {}]], [["cstatus", {"site": 1}]], [["cstatus", {"site": 3, "narrow": False}]], [["weighted_stepmatrix", {}]]):
        add({"kind": "nexus", "text": protein, "ops": ops})
    # combine
    for _ in range(25):
        dt = rnd.choice(["dna", "protein"]); n1 = rnd.randint(2, 4); n2 = rnd.randint(2, 4)
        add({"kind": "combine", "texts": [["m1", nexus_text(rnd, dt, n1, rnd.randint(3, 10), sets=False)], ["m2", nexus_text(rnd, dt, n2, rnd.randint(3, 10), sets=False)]]})
    add({"kind": "combine", "texts": [["m1", nexus_text(rnd, "dna", 3, 6, sets=True)], ["m2", nexus_text(rnd, "dna", 3, 6, sets=False)]]})
    add({"kind": "combine", "texts": [["m1", nexus_text(rnd, "dna", 3, 6, sets=False)], ["m2", nexus_text(rnd, "protein", 3, 6, sets=True)], ["m3", nexus_text(rnd, "dna", 2, 4, sets=True)]]})
    add({"kind": "combine", "texts": []})
    tree_cases()
    func_cases()
    standard_cases()
    compat_cases()
    for _ in range(25):
        taxa = ["T%d" % i for i in range(rnd.randint(3, 6))]
        trees = []
        for _ in range(rnd.randint(1, 5)):
            sh = taxa[:]; rnd.shuffle(sh); trees.append(rand_newick(rnd, sh, bl=False))
        trees = ["(" + t + ")" if not t.startswith("(") else t for t in trees]
        add({"kind": "consensus", "trees": trees, "args": rnd.choice([[], [0.5], [0.3], [1.0], [0.5, ["T0"]]])})
    json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
    print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise -> {os.path.relpath(OUT)}")

main()
