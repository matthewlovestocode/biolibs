"""Golden-test JSON codec for Bio.SeqFeature objects (extends codec.py).

  Position        -> {"$":"pos","cls":..,"v":int, ["left","right"] | ["choices":[pos..]]}   (Unknown has no "v")
  SimpleLocation  -> {"$":"loc","cls":"SimpleLocation","start":pos,"end":pos,"strand":..,"ref":..,"ref_db":..}
  CompoundLocation-> {"$":"loc","cls":"CompoundLocation","parts":[loc..],"operator":..}
  SeqFeature      -> {"$":"feat","location":loc|null,"type":..,"id":..,"qualifiers":[[k,v]..]}
  Reference       -> {"$":"ref", authors.. , "location":[loc..]}
Everything else is delegated to codec.py (Seq, bytes, lists, slices, dicts).
"""
import codec
from Bio import SeqFeature as SF
from Bio.SeqRecord import SeqRecord as _SeqRecord

POS = {n: getattr(SF, n) for n in ("ExactPosition", "UncertainPosition", "UnknownPosition", "WithinPosition", "BetweenPosition", "BeforePosition", "AfterPosition", "OneOfPosition")}

def enc(x):
    if isinstance(x, SF.UnknownPosition):
        return {"$": "pos", "cls": "UnknownPosition"}
    if isinstance(x, SF.Position):
        d = {"$": "pos", "cls": type(x).__name__, "v": int(x)}
        if isinstance(x, (SF.WithinPosition, SF.BetweenPosition)):
            d["left"], d["right"] = x._left, x._right
        if isinstance(x, SF.OneOfPosition):
            d["choices"] = [enc(c) for c in x.position_choices]
        return d
    if isinstance(x, SF.SimpleLocation):
        return {"$": "loc", "cls": "SimpleLocation", "start": enc(x.start), "end": enc(x.end), "strand": x.strand, "ref": x.ref, "ref_db": x.ref_db}
    if isinstance(x, SF.CompoundLocation):
        return {"$": "loc", "cls": "CompoundLocation", "parts": [enc(p) for p in x.parts], "operator": x.operator}
    if isinstance(x, SF.SeqFeature):
        return {"$": "feat", "location": enc(x.location), "type": x.type, "id": x.id, "qualifiers": [[k, enc(v)] for k, v in x.qualifiers.items()]}
    if isinstance(x, _SeqRecord):
        pla = x._per_letter_annotations
        return {"$": "rec", "seq": enc(x._seq), "id": x.id, "name": x.name, "description": x.description, "dbxrefs": list(x.dbxrefs),
                "features": [enc(f) for f in x.features], "annotations": [[k, enc(v)] for k, v in x.annotations.items()],
                "letter": None if pla is None else [[k, enc(v)] for k, v in pla.items()]}
    if isinstance(x, SF.Reference):
        return {"$": "ref", "authors": x.authors, "consrtm": x.consrtm, "title": x.title, "journal": x.journal, "medline_id": x.medline_id,
                "pubmed_id": x.pubmed_id, "comment": x.comment, "location": [enc(l) for l in x.location]}
    if isinstance(x, (list, tuple)):
        return {"$": "list", "v": [enc(i) for i in x]}
    if isinstance(x, dict):
        return {"$": "dict", "v": [[enc(k), enc(v)] for k, v in x.items()]}
    return codec.enc(x)

def dec(x):
    if isinstance(x, dict):
        t = x.get("$")
        if t == "pos":
            cls = POS[x["cls"]]
            if cls is SF.UnknownPosition: return cls()
            if cls in (SF.WithinPosition, SF.BetweenPosition): return cls(x["v"], x["left"], x["right"])
            if cls is SF.OneOfPosition: return cls(x["v"], [dec(c) for c in x["choices"]])
            return cls(x["v"])
        if t == "loc":
            if x["cls"] == "SimpleLocation":
                return SF.SimpleLocation(dec(x["start"]), dec(x["end"]), x["strand"], x["ref"], x["ref_db"])
            return SF.CompoundLocation([dec(p) for p in x["parts"]], x["operator"])
        if t == "feat":
            return SF.SeqFeature(dec(x["location"]), x["type"], x["id"], {k: dec(v) for k, v in x["qualifiers"]})
        if t == "rec":
            r = _SeqRecord(dec(x["seq"]), x["id"], x["name"], x["description"], list(x["dbxrefs"]), [dec(f) for f in x["features"]],
                           {k: dec(v) for k, v in x["annotations"]})
            if x["letter"] is not None: r.letter_annotations = {k: dec(v) for k, v in x["letter"]}
            return r
        if t == "ref":
            r = SF.Reference()
            for f in ("authors", "consrtm", "title", "journal", "medline_id", "pubmed_id", "comment"): setattr(r, f, x[f])
            r.location = [dec(l) for l in x["location"]]
            return r
        if t == "list": return [dec(i) for i in x["v"]]
        if t == "tuple": return tuple(dec(i) for i in x["v"])
        if t == "dict": return {dec(k): dec(v) for k, v in x["v"]}
    return codec.dec(x)

# builders
def pos(cls, v=None, *rest, **kw):
    d = {"$": "pos", "cls": cls}
    if v is not None: d["v"] = v
    if cls in ("WithinPosition", "BetweenPosition"): d["left"], d["right"] = rest
    if cls == "OneOfPosition": d["choices"] = list(rest[0])
    return d
def X(v): return pos("ExactPosition", v)
def SL(a, b, strand=None, ref=None, ref_db=None): return {"$": "loc", "cls": "SimpleLocation", "start": a if isinstance(a, dict) else X(a), "end": b if isinstance(b, dict) else X(b), "strand": strand, "ref": ref, "ref_db": ref_db}
def CL(parts, op="join"): return {"$": "loc", "cls": "CompoundLocation", "parts": list(parts), "operator": op}
def FEAT(loc, typ="", id="<unknown id>", quals=()): return {"$": "feat", "location": loc, "type": typ, "id": id, "qualifiers": [list(q) for q in quals]}

def REC(seq, id="<unknown id>", name="<unknown name>", description="<unknown description>", dbxrefs=(), features=(), annotations=(), letter=None):
    return {"$": "rec", "seq": seq, "id": id, "name": name, "description": description, "dbxrefs": list(dbxrefs), "features": list(features),
            "annotations": [list(a) for a in annotations], "letter": None if letter is None else [list(l) for l in letter]}
