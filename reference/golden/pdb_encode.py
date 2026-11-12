"""Shared encoders for the Bio.PDB golden generators: structures, atoms and exceptions as JSON-ready values."""
import json, math
from Bio.PDB.Atom import DisorderedAtom
from Bio.PDB.Residue import DisorderedResidue

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ == "AttributeError" else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))
def num(x): return None if x is None or (isinstance(x, float) and math.isnan(x)) else (float(x) if not isinstance(x, (int, bool)) else x)
def arr(a): return None if a is None else [float(v) for v in a]

def enc_atom(a):
    return {"name": a.name, "fullname": a.fullname, "coord": arr(a.coord), "bfactor": num(a.bfactor), "occupancy": num(a.occupancy), "altloc": a.altloc,
            "serial": a.serial_number, "element": a.element, "mass": num(a.mass), "dflag": a.disordered_flag, "anisou": arr(a.anisou_array), "siguij": arr(a.siguij_array),
            "sigatm": arr(a.sigatm_array), "charge": num(a.pqr_charge), "radius": num(a.radius), "full_id": json.loads(json.dumps(a.get_full_id()))}
def enc_child_atom(x):
    if isinstance(x, DisorderedAtom): return {"disordered": "atom", "id": x.id, "selected": x.selected_child.altloc, "children": [enc_atom(c) for c in x.disordered_get_list()]}
    return enc_atom(x)
def enc_res(r):
    return {"id": list(r.id), "resname": r.resname, "segid": r.segid, "disordered": r.disordered, "full_id": json.loads(json.dumps(r.get_full_id())), "atoms": [enc_child_atom(a) for a in r.child_list]}
def enc_child_res(x):
    if isinstance(x, DisorderedResidue): return {"disordered": "residue", "id": list(x.id), "selected": x.selected_child.resname, "children": [enc_res(c) for c in x.child_dict.values()]}
    return enc_res(x)
def enc_structure(s):
    return {"id": s.id, "full_id": list(s.get_full_id()), "models": [{"id": m.id, "serial": m.serial_num, "chains": [{"id": c.id, "residues": [enc_child_res(r) for r in c.child_list]} for c in m.child_list]} for m in s.child_list]}
