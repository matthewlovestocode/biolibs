"""Dump the public API of the Biopython modules we are porting."""
import inspect, json
import Bio
from Bio import Seq, SeqRecord, SeqIO, SeqFeature, Align
from Bio.Data import CodonTable, IUPACData
from Bio.SeqUtils import (gc_fraction, GC123, GC_skew, seq3, seq1, molecular_weight,
                          six_frame_translations, CodonAdaptationIndex)
import Bio.SeqUtils as SU
from Bio.SeqUtils import CheckSum, lcc, IsoelectricPoint, ProtParam, MeltingTemp
from Bio.SeqIO import _FormatToIterator, _FormatToWriter

def members(cls):
    out = {}
    for n, m in inspect.getmembers(cls):
        if n.startswith("_") and n not in ("__add__","__radd__","__mul__","__rmul__","__getitem__","__len__","__contains__","__eq__","__lt__","__le__","__gt__","__ge__","__hash__","__iter__","__mod__","__setitem__","__delitem__","__iadd__","__imul__","__str__","__bytes__","__repr__","__init__"):
            continue
        if callable(m) or isinstance(m, property):
            try: sig = str(inspect.signature(m)) if callable(m) else "property"
            except (TypeError, ValueError): sig = "?"
            out[n] = sig
    return out

def funcs(mod, names=None):
    out = {}
    for n, m in inspect.getmembers(mod, inspect.isfunction):
        if n.startswith("_") or m.__module__ != mod.__name__: continue
        out[n] = str(inspect.signature(m))
    return out

inv = {
  "version": Bio.__version__,
  "Bio.Seq": {
    "classes": {c: members(getattr(Seq, c)) for c in ("SequenceDataAbstractBaseClass","_SeqAbstractBaseClass","Seq","MutableSeq","UndefinedSequenceError","_PartiallyDefinedSequenceData","_UndefinedSequenceData") if hasattr(Seq, c)},
    "functions": funcs(Seq),
  },
  "Bio.SeqRecord": {"classes": {"SeqRecord": members(SeqRecord.SeqRecord)}, "functions": funcs(SeqRecord)},
  "Bio.SeqFeature": {
    "classes": {c: members(getattr(SeqFeature, c)) for c in ("SeqFeature","Location","SimpleLocation","CompoundLocation","Position","ExactPosition","BeforePosition","AfterPosition","UncertainPosition","WithinPosition","BetweenPosition","OneOfPosition","UnknownPosition","Reference","ReferenceLocation") if hasattr(SeqFeature, c)},
    "functions": funcs(SeqFeature)},
  "Bio.SeqIO": {"functions": funcs(SeqIO), "parse_formats": sorted(_FormatToIterator), "write_formats": sorted(_FormatToWriter)},
  "Bio.Data.CodonTable": {"functions": funcs(CodonTable), "classes": {"CodonTable": members(CodonTable.CodonTable), "NCBICodonTable": members(CodonTable.NCBICodonTable)},
                          "table_ids": sorted(CodonTable.generic_by_id)},
  "Bio.Data.IUPACData": sorted(n for n in dir(IUPACData) if not n.startswith("_")),
  "Bio.SeqUtils": {"functions": funcs(SU), "classes": {"CodonAdaptationIndex": members(SU.CodonAdaptationIndex)}},
  "Bio.SeqUtils.CheckSum": {"functions": funcs(CheckSum)},
  "Bio.SeqUtils.lcc": {"functions": funcs(lcc)},
  "Bio.SeqUtils.IsoelectricPoint": {"classes": {"IsoelectricPoint": members(IsoelectricPoint.IsoelectricPoint)}},
  "Bio.SeqUtils.ProtParam": {"classes": {"ProteinAnalysis": members(ProtParam.ProteinAnalysis)}},
  "Bio.SeqUtils.MeltingTemp": {"functions": funcs(MeltingTemp)},
}
print(json.dumps(inv, indent=1))
