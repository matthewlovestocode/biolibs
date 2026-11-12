"""Golden data for Bio.Data.CodonTable and Bio.Data.IUPACData.

Output: packages/seq/test/golden/codon-table.json
"""
import json, os, random, itertools
import Bio
from Bio.Data import CodonTable, IUPACData

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seq", "test", "golden", "codon-table.json")
rnd = random.Random(7)
FULL_IDS = {1, 2, 6, 11, 23, 29}

def outcome(f):
    try:
        return f()
    except KeyError as e:
        return "!K"
    except CodonTable.TranslationError as e:
        return "!T"
    except ValueError as e:      # wrong-length codons: uncaught inside AmbiguousForwardTable
        return "!V:" + str(e)

REGS = {
    "unambiguous_dna": (CodonTable.unambiguous_dna_by_id, CodonTable.unambiguous_dna_by_name),
    "unambiguous_rna": (CodonTable.unambiguous_rna_by_id, CodonTable.unambiguous_rna_by_name),
    "generic": (CodonTable.generic_by_id, CodonTable.generic_by_name),
    "ambiguous_dna": (CodonTable.ambiguous_dna_by_id, CodonTable.ambiguous_dna_by_name),
    "ambiguous_rna": (CodonTable.ambiguous_rna_by_id, CodonTable.ambiguous_rna_by_name),
    "ambiguous_generic": (CodonTable.ambiguous_generic_by_id, CodonTable.ambiguous_generic_by_name),
}
out = {"biopython": Bio.__version__, "registries": {}, "functions": {}, "iupac": {}}

for kind, (by_id, by_name) in REGS.items():
    reg = {"id_order": list(by_id), "name_order": list(by_name), "tables": {}}
    for tid, t in by_id.items():
        ambiguous = kind.startswith("ambiguous")
        d = {
            "id": t.id, "names": t.names, "class": type(t).__name__,
            "nucleotide_alphabet": t.nucleotide_alphabet, "protein_alphabet": t.protein_alphabet,
            "start_codons": t.start_codons, "stop_codons": t.stop_codons,
            "back_table": [["$none" if k is None else k, v] for k, v in t.back_table.items()],
            "str": str(t),
        }
        if hasattr(t, "__repr__") and type(t).__repr__ is not object.__repr__:
            d["repr"] = repr(t)
        if not ambiguous:
            d["forward_table"] = [[k, v] for k, v in t.forward_table.items()]
        else:
            letters = t.nucleotide_alphabet or (IUPACData.ambiguous_dna_letters + "U")
            if tid in FULL_IDS:
                codons = ["".join(c) for c in itertools.product(letters, repeat=3)]
            else:
                codons = rnd.sample(["".join(c) for c in itertools.product(letters, repeat=3)], 300)
            codons += ["", "AC", "ACGT", "XXX", "acg"]
            ft = t.forward_table
            d["lookups"] = {}
            for c in codons:
                a = outcome(lambda: ft[c])
                b = outcome(lambda: int(c in ft))
                g = outcome(lambda: ft.get(c, "?"))
                d["lookups"][c] = f"{a}|{b}|{g}"
        reg["tables"][tid] = d
    out["registries"][kind] = reg

# helper functions
fn = {"make_back_table": [], "list_ambiguous_codons": [], "list_possible_proteins": []}
for tid in (1, 2, 4, 5, 6, 9, 14, 22, 23, 33):
    tb = CodonTable.unambiguous_dna_by_id[tid].forward_table
    fn["make_back_table"].append({"table": tb, "stop": "TAA", "result": [[("$none" if k is None else k), v] for k, v in CodonTable.make_back_table(tb, "TAA").items()]})
STOPS = ["TAA", "TAG", "TGA", "AGA", "AGG", "TCA", "TTA", "AAA", "ATG"]
for _ in range(120):
    codons = rnd.sample(STOPS, rnd.randint(1, 4))
    for vals_name in ("ambiguous_dna_values", "ambiguous_rna_values"):
        vals = getattr(IUPACData, vals_name)
        cs = [c.replace("T", "U") for c in codons] if "rna" in vals_name else codons
        fn["list_ambiguous_codons"].append({"codons": cs, "values": vals_name, "result": CodonTable.list_ambiguous_codons(cs, vals)})
for tid in (1, 2, 6, 11, 23):
    tb = CodonTable.unambiguous_dna_by_id[tid].forward_table
    for c in rnd.sample(["".join(c) for c in itertools.product(IUPACData.ambiguous_dna_letters, repeat=3)], 120) + ["AC", "ACGT", "XYZ"]:
        try:
            r = CodonTable.list_possible_proteins(c, tb, IUPACData.ambiguous_dna_values)
        except KeyError as e: r = "!K:" + str(e.args[0])
        except CodonTable.TranslationError as e: r = "!T:" + str(e)
        except ValueError as e: r = "!V:" + str(e)
        fn["list_possible_proteins"].append({"table": tid, "codon": c, "result": r})
out["functions"] = fn

# custom tables built directly (not via the registry)
custom = []
for args in [(99, ["Custom", None], {"TTT": "F", "TTC": "F", "ATG": "M"}, ["ATG"], ["TAA"]),
             (98, ["Tiny", "T1"], {"GCT": "A"}, ["GCT", "ATG"], ["TAA", "TAG"])]:
    for cls in (CodonTable.NCBICodonTableDNA, CodonTable.NCBICodonTableRNA, CodonTable.NCBICodonTable):
        t = cls(*args)
        custom.append({"cls": cls.__name__, "args": list(args), "str": str(t), "repr": repr(t),
                       "back": [["$none" if k is None else k, v] for k, v in t.back_table.items()],
                       "alphabet": t.nucleotide_alphabet})
out["custom"] = custom

# IUPACData constants
for n in dir(IUPACData):
    if n.startswith("_"): continue
    v = getattr(IUPACData, n)
    if callable(v) or type(v).__name__ == "module": continue
    def norm(x):
        if isinstance(x, tuple): return [norm(i) for i in x]
        if isinstance(x, dict): return {k: norm(v) for k, v in x.items()}
        return x
    out["iupac"][n] = norm(v)

json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(f"-> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
