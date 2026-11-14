"""Generate docs/parity-pydna/ from inventory-pydna.json.

Statuses live in reference/status-pydna.json ({"pydna.dseq.Dseq.watson": "done"}), so regenerating keeps
progress. Biopython's checklist is generated separately by gen_checklist.py and the two never share a
number: a pydna item is not Biopython parity and the other way round.
"""
import json, os

here = os.path.dirname(__file__)
inv = json.load(open(f"{here}/inventory-pydna.json"))
sp = f"{here}/status-pydna.json"
status = json.load(open(sp)) if os.path.exists(sp) else {}
out_dir = f"{here}/../docs/parity-pydna"
os.makedirs(out_dir, exist_ok=True)

mark = lambda key: {"done": "[x]", "partial": "[~]", "na": "[-]"}.get(status.get(key), "[ ]")
asked = set()
sections = []


def section(mod, data):
    """One module's checklist file. @returns Its (name, verified, applicable) row for the index."""
    lines = [f"## {mod}", ""]
    total = done = 0

    def item(key, text):
        nonlocal total, done
        asked.add(key)
        if status.get(key) != "na":
            total += 1
        if status.get(key) == "done":
            done += 1
        lines.append(f"- {mark(key)} `{text}`")

    for name, signature in data.get("functions", {}).items():
        item(f"{mod}.{name}", f"{name}{signature}")
    for cls, ms in data.get("classes", {}).items():
        lines.extend(["", f"### {mod}.{cls}", ""])
        for name, signature in ms.items():
            item(f"{mod}.{cls}.{name}", name if signature == "property" else f"{name}{signature}")
    if "codes" in data:
        lines.extend(["", f"### {mod}: the dscode encoding", ""])
        for group, pairs in data["codes"].items():
            item(f"{mod}.codes.{group}", f"{group} ({len(pairs)} pairs)")
    open(f"{out_dir}/{mod}.md", "w").write("\n".join(lines) + "\n")
    return mod, done, total


for mod, data in inv.items():
    if mod == "version":
        continue
    sections.append(section(mod, data))

verified = sum(d for _, d, _ in sections)
applicable = sum(t for _, _, t in sections)
index = ["# pydna parity checklist", "",
         f"Generated from pydna {inv['version']} by `reference/gen_checklist_pydna.py`. The marks mean what "
         "they mean in [the Biopython checklist](../parity/README.md), and the two are counted separately: "
         "this one covers a second upstream library and says nothing about Biopython parity. `Dseq` "
         "subclasses Biopython's `Seq`, so only what pydna defines itself is listed here; the inherited API "
         "is measured in [Bio.Seq](../parity/Bio.Seq.md). Edit `reference/status-pydna.json`, then re-run "
         "the script.", "",
         f"**Progress: {verified} / {applicable} applicable items verified against pydna.**", "",
         "| Section | Verified | Applicable |", "|---|---|---|"]
for mod, d, t in sections:
    index.append(f"| [{mod}]({mod}.md) | {d} | {t} |")
index.extend(["", f"**Total: {verified} / {applicable}**", ""])
open(f"{out_dir}/README.md", "w").write("\n".join(index) + "\n")

dropped = [k for k in status if k not in asked]
json.dump({k: v for k, v in status.items() if k in asked}, open(sp, "w"), indent=1, sort_keys=True)
print(f"{verified} / {applicable} pydna items verified -> {os.path.relpath(out_dir)}")
if dropped:
    print(f"{len(dropped)} status entries no checklist item asks about were dropped: {dropped[:5]}")
