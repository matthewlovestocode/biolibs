"""Golden cases for Bio.Phylo.Consensus -> packages/phylo/test/golden/consensus.json

Set iteration order inside Biopython's Adam consensus depends on hashing, so every case is evaluated in two processes with different
PYTHONHASHSEED values and kept only when the results agree.
"""
import io, json, os, random, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from Bio import Phylo
from Bio.Phylo import Consensus, BaseTree
from phylo_codec import enc_tree, tname, emsg

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "phylo", "test", "golden", "consensus.json")

def tree(text): return Phylo.read(io.StringIO(text), "newick")

def run(case):
    fn = case["fn"]
    try:
        if fn in ("strict", "majority", "adam"):
            trees = [tree(t) for t in case["trees"]]
            if case.get("iterator"): trees = iter(trees)
            if fn == "strict": r = Consensus.strict_consensus(trees)
            elif fn == "majority": r = Consensus.majority_consensus(trees, **case.get("kwargs", {}))
            else: r = Consensus.adam_consensus(trees)
            return {"result": enc_tree(r)}
        if fn == "support":
            target = tree(case["target"])
            reps = [tree(t) for t in case["trees"]]
            if not case.get("as_list"): reps = iter(reps)
            r = Consensus.get_support(target, reps, case.get("len_trees"))
            return {"result": enc_tree(r)}
        if fn == "equal":
            return {"result": Consensus._equal_topology(tree(case["a"]), tree(case["b"]))}
        if fn == "bit":
            B = Consensus._BitString
            a = B(case["a"]) if "a" in case else None
            b = B(case["b"]) if "b" in case else None
            op = case["op"]
            if op in ("and", "or", "xor"): r = {"and": a & b, "or": a | b, "xor": a ^ b}[op]; return {"result": [str(r), repr(r)]}
            if op in ("contains", "independent", "iscompatible"): return {"result": getattr(a, op)(b)}
            if op in ("index_one", "index_zero"): return {"result": getattr(a, op)()}
            if op == "from_bool": return {"result": str(B.from_bool(case["bools"]))}
            if op == "repr": return {"result": repr(a)}
    except BaseException as e:
        return {"exc": {"type": tname(e), "msg": emsg(e)}}

if os.environ.get("EVAL_CASES"):
    cases = json.load(sys.stdin)
    json.dump([run(c) for c in cases], sys.stdout)
    sys.exit(0)

rnd = random.Random(404)
def rand_tree(names, bl=True, conf=False):
    names = list(names); rnd.shuffle(names)
    def build(ids):
        if len(ids) == 1: return ids[0] + (":%s" % round(rnd.random() + 0.1, 3) if bl else "")
        cut = rnd.randint(1, len(ids) - 1)
        s = "(" + build(ids[:cut]) + "," + build(ids[cut:]) + ")"
        if conf and rnd.random() < 0.5: s += str(rnd.choice([50, 90, 100]))
        return s + (":%s" % round(rnd.random() + 0.1, 3) if bl else "")
    return build(names) + ";"

cases = []
for n in (4, 5, 6, 7, 8):
    names = ["T%d" % i for i in range(1, n + 1)]
    for k in (1, 2, 3, 5, 7):
        for rep in range(3):
            trees = [rand_tree(names) for _ in range(k)]
            cases.append({"fn": "strict", "trees": trees})
            for cutoff in (0, 0.5, 0.9, 1):
                cases.append({"fn": "majority", "trees": trees, "kwargs": {"cutoff": cutoff}})
            cases.append({"fn": "majority", "trees": trees})
            cases.append({"fn": "adam", "trees": trees})
            if k > 1: cases.append({"fn": "strict", "trees": trees, "iterator": True})
    t0 = rand_tree(names)
    reps = [rand_tree(names) for _ in range(6)]
    cases.append({"fn": "support", "target": t0, "trees": reps, "as_list": True})
    cases.append({"fn": "support", "target": t0, "trees": reps, "as_list": False})
    cases.append({"fn": "support", "target": t0, "trees": reps, "as_list": False, "len_trees": 6})
    cases.append({"fn": "support", "target": t0, "trees": reps, "as_list": True, "len_trees": 12})
    cases.append({"fn": "equal", "a": t0, "b": t0})
    cases.append({"fn": "equal", "a": t0, "b": rand_tree(names)})
    cases.append({"fn": "equal", "a": t0, "b": rand_tree(names[:-1])})
# same topology as an unrooted rotation, trees with polytomies, unequal taxa, singletons
cases += [{"fn": "strict", "trees": ["((A,B),(C,D));", "((A,C),(B,D));"]}, {"fn": "strict", "trees": ["(A,B,C);", "(A,B,C);"]}, {"fn": "strict", "trees": []}, {"fn": "majority", "trees": []}, {"fn": "adam", "trees": []},
          {"fn": "strict", "trees": ["((A,B),C);", "((A,B),D);"]}, {"fn": "majority", "trees": ["((A,B),C);", "((A,B),D);"]}, {"fn": "adam", "trees": ["((A,B),C);", "((A,B),D);"]},
          {"fn": "strict", "trees": ["A;"]}, {"fn": "majority", "trees": ["A;"]}, {"fn": "adam", "trees": ["A;"]}, {"fn": "adam", "trees": ["(A,B);", "(A,B);"]},
          {"fn": "majority", "trees": ["(((A,B),C),(D,E));", "((A,(B,C)),(D,E));"], "kwargs": {"cutoff": 0.5}}, {"fn": "adam", "trees": ["(((A,B),C),(D,E));", "((A,(B,C)),(D,E));"]},
          {"fn": "strict", "trees": ["(((A,B),C),(D,E));", "((A,(B,C)),(D,E));"]}, {"fn": "adam", "trees": ["(((A,B),C),(D,E));", "((A,(B,C)),(D,E));", "((A,B),(C,(D,E)));"]},
          {"fn": "adam", "trees": ["((A,B,C),(D,E,F));", "((A,B),(C,D),(E,F));"]}, {"fn": "adam", "trees": ["(A,B,C,D);", "((A,B),C,D);"]}]
B = ["11111", "11100", "01101", "00000", "10", "1", ""]
for a in B:
    cases.append({"fn": "bit", "op": "index_one", "a": a}); cases.append({"fn": "bit", "op": "index_zero", "a": a}); cases.append({"fn": "bit", "op": "repr", "a": a})
    for b in B:
        for op in ("and", "or", "xor", "contains", "independent", "iscompatible"):
            cases.append({"fn": "bit", "op": op, "a": a, "b": b})
cases += [{"fn": "bit", "op": "repr", "a": "12"}, {"fn": "bit", "op": "from_bool", "bools": [True, False, True]}, {"fn": "bit", "op": "from_bool", "bools": []}]

def evaluate(seed):
    env = dict(os.environ, PYTHONHASHSEED=str(seed), EVAL_CASES="1")
    p = subprocess.run([sys.executable, __file__], input=json.dumps(cases), env=env, capture_output=True, text=True, check=True)
    return json.loads(p.stdout)

r1, r2 = evaluate(1), evaluate(2)
kept = [dict(c, **a) for c, a, b in zip(cases, r1, r2) if a == b]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(kept, open(OUT, "w"), indent=0)
print(len(kept), "cases of", len(cases), "(the rest depend on set iteration order)")
