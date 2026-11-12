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
     "Edit `reference/status.json`, then re-run the script.", ""]
tot = [0, 0]
def item(key, text):
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
for mod in ("Bio.SeqUtils", "Bio.SeqUtils.CheckSum", "Bio.SeqUtils.lcc", "Bio.SeqUtils.IsoelectricPoint", "Bio.SeqUtils.ProtParam", "Bio.SeqUtils.MeltingTemp"):
    section(mod, mod, inv[mod])
L[3:3] = ["", f"**Progress: {tot[1]} / {tot[0]} applicable items verified against Biopython.**", ""]
open(f"{here}/../PARITY.md", "w").write("\n".join(L) + "\n")
print(tot)
