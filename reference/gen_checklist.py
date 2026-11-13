"""Generate PARITY.md from inventory.json. Statuses live in reference/status.json
({"Bio.Seq.Seq.complement": "partial" | "done"}), so regenerating keeps progress."""
import json, os
here = os.path.dirname(__file__)
inv = json.load(open(f"{here}/inventory.json"))
sp = f"{here}/status.json"
status = json.load(open(sp)) if os.path.exists(sp) else {}
# Seed: things the first scaffold covers partially.
seed = {k: "partial" for k in [
  "Bio.Seq.complement","Bio.Seq.reverse_complement","Bio.Seq.transcribe","Bio.Seq.back_transcribe","Bio.Seq.translate"]}
for k, v in seed.items(): status.setdefault(k, v)
json.dump(status, open(sp, "w"), indent=1, sort_keys=True)

mark = lambda k: {"done": "[x]", "partial": "[~]", "na": "[-]"}.get(status.get(k), "[ ]")
L = ["# Biopython parity checklist", "",
     f"Generated from Biopython {inv['version']} by `reference/gen_checklist.py`. "
     "`[ ]` not started, `[~]` partial (scaffold only), `[x]` verified against Biopython output, `[-]` not applicable (inherited Python/`object`/`BaseException` boilerplate). "
     "Comparison, hash and string members that no class but `object` defines are marked `[-]` automatically, "
     "from `inventory.py`'s reading of Biopython; a golden case that pins such a member down wins over that and "
     "makes it `[x]`. Edit `reference/status.json`, then re-run the script.", ""]
tot = [0, 0]
#: Every key the checklist asks about, so that a status entry nobody asks about can be dropped.
asked = set()
def item(key, text):
    asked.add(key)
    tot[0] += status.get(key) != "na"; tot[1] += status.get(key) == "done"
    L.append(f"- {mark(key)} `{text}`")
def section(title, mod, d):
    L.extend(["", f"## {title}", ""])
    for fn, sig in d.get("functions", {}).items(): item(f"{mod}.{fn}", f"{fn}{sig}")
    for cls, ms in d.get("classes", {}).items():
        if cls.startswith("_"): continue
        L.extend(["", f"### {mod}.{cls}", ""])
        for m, sig in ms.items(): item(f"{mod}.{cls}.{m}", m if sig == "property" else f"{m}{sig}")
section("Bio.Seq", "Bio.Seq", inv["Bio.Seq"])
section("Bio.SeqRecord", "Bio.SeqRecord", inv["Bio.SeqRecord"])
section("Bio.SeqFeature", "Bio.SeqFeature", inv["Bio.SeqFeature"])
section("Bio.Data.CodonTable", "Bio.Data.CodonTable", inv["Bio.Data.CodonTable"])
L.extend(["", "### Genetic code tables (NCBI ids)", ""])
for i in inv["Bio.Data.CodonTable"]["table_ids"]: item(f"CodonTable.id.{i}", f"table {i}")
L.extend(["", "## Bio.Data.IUPACData (constants)", ""])
for n in inv["Bio.Data.IUPACData"]: item(f"IUPACData.{n}", n)
L.extend(["", "## Bio.SeqIO", ""])
for fn, sig in inv["Bio.SeqIO"]["functions"].items(): item(f"Bio.SeqIO.{fn}", f"{fn}{sig}")
L.extend(["", "### Parse formats", ""])
for f in inv["Bio.SeqIO"]["parse_formats"]: item(f"Bio.SeqIO.parse:{f}", f"parse: {f}")
L.extend(["", "### Write formats", ""])
for f in inv["Bio.SeqIO"]["write_formats"]: item(f"Bio.SeqIO.write:{f}", f"write: {f}")
section("Bio.Align", "Bio.Align", inv["Bio.Align"])
L.extend(["", "## Bio.Align file formats", ""])
for fn, sig in inv["Bio.Align.formats"]["functions"].items(): item(f"Bio.Align.{fn}", f"{fn}{sig}")
for f in inv["Bio.Align.formats"]["formats"]:
    item(f"Bio.Align.parse:{f}", f"parse: {f}")
    item(f"Bio.Align.write:{f}", f"write: {f}")
section("Bio.Align.CodonAligner", "Bio.Align.CodonAligner", inv["Bio.Align.CodonAligner"])
section("Bio.Align.analysis", "Bio.Align.analysis", inv["Bio.Align.analysis"])
section("Bio.Align.AlignInfo", "Bio.Align.AlignInfo", inv["Bio.Align.AlignInfo"])
section("Bio.Align.AlignmentCounts", "Bio.Align.AlignmentCounts", inv["Bio.Align.AlignmentCounts"])
section("Bio.Align.Alignment", "Bio.Align.Alignment", inv["Bio.Align.Alignment"])
section("Bio.Align.PairwiseAligner", "Bio.Align.PairwiseAligner", inv["Bio.Align.PairwiseAligner"])
section("Bio.Align.substitution_matrices", "Bio.Align.substitution_matrices", inv["Bio.Align.substitution_matrices"])
for mod in ("Bio.Phylo.BaseTree", "Bio.Phylo.Newick", "Bio.Phylo.NewickIO", "Bio.Phylo._io", "Bio.Phylo.NexusIO", "Bio.Phylo.Consensus", "Bio.Phylo.TreeConstruction", "Bio.Phylo.PhyloXML", "Bio.Phylo.PhyloXMLIO"):
    section(mod, mod, inv[mod])
for mod in ("Bio.SeqUtils", "Bio.SeqUtils.CheckSum", "Bio.SeqUtils.lcc", "Bio.SeqUtils.IsoelectricPoint", "Bio.SeqUtils.ProtParam", "Bio.SeqUtils.MeltingTemp"):
    section(mod, mod, inv[mod])
for mod in ("Bio.Nexus.Nexus", "Bio.Nexus.Trees", "Bio.Nexus.Nodes", "Bio.Nexus.StandardData", "Bio.PDB.Entity", "Bio.PDB.Atom", "Bio.PDB.Residue", "Bio.PDB.Chain", "Bio.PDB.Model", "Bio.PDB.Structure", "Bio.PDB.StructureBuilder", "Bio.PDB.PDBParser", "Bio.PDB.MMCIF2Dict", "Bio.PDB.MMCIFParser", "Bio.PDB.PDBIO", "Bio.PDB.mmcifio", "Bio.PDB.vectors", "Bio.PDB.Polypeptide", "Bio.PDB.Superimposer", "Bio.SVDSuperimposer", "Bio.PDB.NeighborSearch", "Bio.PDB.kdtrees", "Bio.PDB.Selection", "Bio.PDB.SASA", "Bio.Restriction", "Bio.motifs", "Bio.motifs.matrix", "Bio.motifs.thresholds", "Bio.motifs.jaspar", "Bio.motifs.transfac", "Bio.motifs.clusterbuster", "Bio.motifs.alignace", "Bio.motifs.meme", "Bio.motifs.minimal", "Bio.motifs.mast", "Bio.motifs.xms", "Bio.motifs.pfm", "Bio.PDB.parse_pdb_header"):
    section(mod, mod, inv[mod])
L[3:3] = ["", f"**Progress: {tot[1]} / {tot[0]} applicable items verified against Biopython.**", ""]
# Split into docs/parity/: one file per "## " section plus an index with per-section counts.
import re, shutil
out = f"{here}/../docs/parity"
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
legend = L[2]
secs, cur = [], None
for line in L[3:]:
    if line.startswith("## "): cur = [line[3:], []]; secs.append(cur)
    if cur is not None: cur[1].append(line)
index = ["# Biopython parity checklist", "", legend, "", f"**Progress: {tot[1]} / {tot[0]} applicable items verified against Biopython.**", "",
         "| Section | Verified | Applicable |", "|---|---|---|"]
for title, body in secs:
    slug = re.sub(r"[^A-Za-z0-9._]+", "-", title).strip("-")
    items = [l for l in body if l.startswith("- [")]
    done = sum(l.startswith("- [x]") for l in items); app = sum(not l.startswith("- [-]") for l in items)
    open(f"{out}/{slug}.md", "w").write("\n".join(body).strip("\n") + "\n")
    index.append(f"| [{title}]({slug}.md) | {done} | {app} |")
open(f"{out}/README.md", "w").write("\n".join(index) + "\n")
open(f"{here}/../PARITY.md", "w").write("# Biopython parity checklist\n\nThe checklist is generated and split by module in [docs/parity/](docs/parity/README.md) (start with its index).\n")

# Keep only the entries the checklist asks about. An entry under a key nobody asks about is inert today but would
# start counting the day that spelling came back -- an item verified by nobody, which is how six of them came to be
# marked done with no golden case behind them. Dropping one costs nothing, because `update_status.py` derives every
# mark from the golden cases on each run: a real item is marked again, and a rule aiming at the wrong key now leaves
# its item visibly not started instead of quietly passing.
unasked = sorted(k for k in status if k not in asked)
for k in unasked: del status[k]
json.dump(status, open(sp, "w"), indent=1, sort_keys=True)
if unasked: print(f"{len(unasked)} mark(s) landed on keys no checklist item asks about and were dropped (rules aiming at nothing; harmless, but each is a rule worth checking)")
print(tot)
