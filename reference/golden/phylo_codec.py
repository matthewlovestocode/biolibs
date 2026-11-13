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



# ---- generic encoding of phyloXML object graphs ----
def enc_px(o):
    """Encode any phyloXML object (or primitive) by walking __dict__ sorted by key (searches move `clades` to the end, so order is not stable); floats keep their repr, so int/float differences show."""
    from Bio.Phylo import PhyloXML as PX
    if o is None or isinstance(o, (bool, str)): return o
    if isinstance(o, PX.Confidence):
        return {"c": "Confidence", "f": repr(float(o)), "a": [[k, enc_px(v)] for k, v in sorted(o.__dict__.items(), key=lambda kv: kv[0])], "r": repr(o), "s": str(o)}
    from Bio.SeqRecord import SeqRecord
    from Bio.SeqFeature import SeqFeature
    from Bio.Seq import Seq
    from Bio.Align import Alignment, MultipleSeqAlignment
    if isinstance(o, SeqRecord):
        return {"rec": {"id": o.id, "name": o.name, "description": o.description, "dbxrefs": o.dbxrefs, "seq": None if o.seq is None else str(o.seq),
                        "annotations": enc_px(o.annotations), "features": [enc_px(f) for f in o.features], "letter": enc_px(dict(o.letter_annotations))}}
    if isinstance(o, SeqFeature):
        return {"feat": {"type": o.type, "id": o.id, "loc": repr(o.location), "qualifiers": enc_px(o.qualifiers)}}
    if isinstance(o, Seq): return str(o)
    if isinstance(o, MultipleSeqAlignment): return {"msa": [[r.id, str(r.seq)] for r in o]}
    if isinstance(o, Alignment):
        return {"aln": {"seqs": [enc_px(r) for r in o.sequences], "coords": None if o.coordinates is None else o.coordinates.tolist()}}
    if isinstance(o, int): return o
    if isinstance(o, float): return {"f": repr(o)}
    if isinstance(o, (list, tuple)): return [enc_px(x) for x in o]
    if isinstance(o, dict): return {"d": [[k, enc_px(v)] for k, v in o.items()]}
    if hasattr(o, "__next__"): return [enc_px(x) for x in o]
    if hasattr(o, "__dict__"):
        return {"c": type(o).__name__, "a": [[k, enc_px(v)] for k, v in sorted(o.__dict__.items(), key=lambda kv: kv[0])], "r": repr(o), "s": str(o)}
    return {"repr": repr(o)}
