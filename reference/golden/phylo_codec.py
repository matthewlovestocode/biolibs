"""Shared encoding of Bio.Phylo trees and results for the phylo golden generators."""
import math
from Bio.Phylo import BaseTree, Newick

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

# ---- encoding of trees and results ----
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

