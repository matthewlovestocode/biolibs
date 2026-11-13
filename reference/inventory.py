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
from Bio.Align import substitution_matrices as SMMod
from Bio.PDB import Atom as PAtom, Residue as PResidue, Chain as PChain, Model as PModel, Structure as PStructure, Entity as PEntity, StructureBuilder as PBuilder, PDBParser as PParser
import importlib
PM2D = importlib.import_module('Bio.PDB.MMCIF2Dict')
PMP = importlib.import_module('Bio.PDB.MMCIFParser')
PIO = importlib.import_module('Bio.PDB.PDBIO')  # the module, not the shadowing class
PMIO = importlib.import_module('Bio.PDB.mmcifio')
PSASA = importlib.import_module('Bio.PDB.SASA')
PNS = importlib.import_module('Bio.PDB.NeighborSearch')
PKD = importlib.import_module('Bio.PDB.kdtrees')
PSel = importlib.import_module('Bio.PDB.Selection')
PSup = importlib.import_module('Bio.PDB.Superimposer')
SVDMod = importlib.import_module('Bio.SVDSuperimposer')
BM = importlib.import_module('Bio.motifs')
BMM = importlib.import_module('Bio.motifs.matrix')
BMT = importlib.import_module('Bio.motifs.thresholds')
BMJ = importlib.import_module('Bio.motifs.jaspar')
BMF = importlib.import_module('Bio.motifs.transfac')
BMC = importlib.import_module('Bio.motifs.clusterbuster')
RR = importlib.import_module('Bio.Restriction.Restriction')
RPF = importlib.import_module('Bio.Restriction.PrintFormat')
PPoly = importlib.import_module('Bio.PDB.Polypeptide')
PVec = importlib.import_module('Bio.PDB.vectors')
PHeader = importlib.import_module('Bio.PDB.parse_pdb_header')  # `import ... as` would give the shadowing function
from Bio.Nexus import Nexus as NexusMod, Trees as TreesMod, Nodes as NodesMod, StandardData as StandardDataMod

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

def _sig(m):
    try: return str(inspect.signature(m))
    except (TypeError, ValueError): return "?"

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
  "Bio.Align": {"classes": {"MultipleSeqAlignment": members(Align.MultipleSeqAlignment)}},
  "Bio.Align.AlignmentCounts": {"classes": {"AlignmentCounts": {n: "property" for n in dir(Align._alignmentcounts.AlignmentCounts) if not n.startswith("_")}}},
  "Bio.Align.Alignment": {"classes": {"Alignment": members(Align.Alignment)}},
  "Bio.Align.PairwiseAligner": {"classes": {"PairwiseAligner": members(Align.PairwiseAligner), "PairwiseAlignments": members(Align.PairwiseAlignments)}},
  # Array subclasses numpy.ndarray: list only what Biopython itself defines, not the inherited ndarray API
  "Bio.Align.substitution_matrices": {"functions": funcs(SMMod), "classes": {"Array": {n: _sig(getattr(SMMod.Array, n)) for n in vars(SMMod.Array) if not n.startswith("_") or n in ("__new__", "__getitem__", "__setitem__", "__contains__", "__str__", "__format__", "__array_ufunc__", "__array_finalize__", "__array_prepare__", "__array_wrap__", "__reduce__", "__setstate__", "__repr__")}}},
  "Bio.SeqUtils": {"functions": funcs(SU), "classes": {"CodonAdaptationIndex": members(SU.CodonAdaptationIndex)}},
  "Bio.SeqUtils.CheckSum": {"functions": funcs(CheckSum)},
  "Bio.SeqUtils.lcc": {"functions": funcs(lcc)},
  "Bio.SeqUtils.IsoelectricPoint": {"classes": {"IsoelectricPoint": members(IsoelectricPoint.IsoelectricPoint)}},
  "Bio.SeqUtils.ProtParam": {"classes": {"ProteinAnalysis": members(ProtParam.ProteinAnalysis)}},
  "Bio.SeqUtils.MeltingTemp": {"functions": funcs(MeltingTemp)},
  "Bio.Nexus.Nexus": {"functions": funcs(NexusMod), "classes": {"Nexus": members(NexusMod.Nexus)}},
  "Bio.Nexus.Trees": {"functions": funcs(TreesMod), "classes": {"Tree": members(TreesMod.Tree)}},
  "Bio.Nexus.Nodes": {"classes": {"Chain": members(NodesMod.Chain), "Node": members(NodesMod.Node)}},
  "Bio.Nexus.StandardData": {"classes": {"StandardData": members(StandardDataMod.StandardData)}},
  "Bio.PDB.Entity": {"classes": {"Entity": members(PEntity.Entity), "DisorderedEntityWrapper": members(PEntity.DisorderedEntityWrapper)}},
  "Bio.PDB.Atom": {"classes": {"Atom": members(PAtom.Atom), "DisorderedAtom": members(PAtom.DisorderedAtom)}},
  "Bio.PDB.Residue": {"classes": {"Residue": members(PResidue.Residue), "DisorderedResidue": members(PResidue.DisorderedResidue)}},
  "Bio.PDB.Chain": {"classes": {"Chain": members(PChain.Chain)}},
  "Bio.PDB.Model": {"classes": {"Model": members(PModel.Model)}},
  "Bio.PDB.Structure": {"classes": {"Structure": members(PStructure.Structure)}},
  "Bio.PDB.StructureBuilder": {"classes": {"StructureBuilder": members(PBuilder.StructureBuilder)}},
  "Bio.PDB.PDBParser": {"classes": {"PDBParser": members(PParser)}},
  "Bio.PDB.MMCIF2Dict": {"classes": {"MMCIF2Dict": {n: _sig(getattr(PM2D.MMCIF2Dict, n)) for n in vars(PM2D.MMCIF2Dict) if n == "__init__" or not n.startswith("__")}}},
  "Bio.PDB.MMCIFParser": {"classes": {c: {n: _sig(getattr(PMP, c).__dict__[n]) for n in vars(getattr(PMP, c)) if (n == "__init__" or not n.startswith("_")) and callable(getattr(PMP, c).__dict__[n])} for c in ("MMCIFParser", "FastMMCIFParser")}},
  "Bio.PDB.PDBIO": {"classes": {c: members(getattr(PIO, c)) for c in ("Select", "StructureIO", "PDBIO")}},
  "Bio.PDB.mmcifio": {"classes": {"MMCIFIO": members(PMIO.MMCIFIO)}},
  "Bio.PDB.Polypeptide": {"functions": funcs(PPoly), "classes": {c: members(getattr(PPoly, c)) for c in ("Polypeptide", "CaPPBuilder", "PPBuilder")}},
  "Bio.PDB.Superimposer": {"classes": {"Superimposer": members(PSup.Superimposer)}},
  "Bio.SVDSuperimposer": {"classes": {"SVDSuperimposer": members(SVDMod.SVDSuperimposer)}},
  "Bio.PDB.NeighborSearch": {"classes": {"NeighborSearch": members(PNS.NeighborSearch)}},
  "Bio.PDB.kdtrees": {"classes": {c: members(getattr(PKD, c)) for c in ("KDTree", "Point", "Neighbor")}},
  "Bio.PDB.Selection": {"functions": funcs(PSel)},
  "Bio.PDB.SASA": {"classes": {"ShrakeRupley": members(PSASA.ShrakeRupley)}},
  "Bio.Restriction": {"classes": {**{c: members(getattr(RR, c)) for c in ("FormattedSeq", "RestrictionType", "AbstractCut", "NoCut", "OneCut", "TwoCuts", "Meth_Dep", "Meth_Undep", "Palindromic",
                                  "NonPalindromic", "Unknown", "Blunt", "Ov5", "Ov3", "Defined", "Ambiguous", "NotDefined", "Commercially_available", "Not_available", "RestrictionBatch", "Analysis")},
                                  "PrintFormat": members(RPF.PrintFormat)}},
  "Bio.motifs": {"functions": funcs(BM), "classes": {"Motif": members(BM.Motif)}},
  "Bio.motifs.matrix": {"classes": {c: members(getattr(BMM, c)) for c in ("GenericPositionMatrix", "FrequencyPositionMatrix", "PositionWeightMatrix", "PositionSpecificScoringMatrix")}},
  "Bio.motifs.thresholds": {"classes": {"ScoreDistribution": members(BMT.ScoreDistribution)}},
  "Bio.motifs.jaspar": {"functions": funcs(BMJ), "classes": {"Motif": members(BMJ.Motif), "Record": members(BMJ.Record)}},
  "Bio.motifs.transfac": {"functions": funcs(BMF), "classes": {"Motif": members(BMF.Motif), "Record": members(BMF.Record)}},
  "Bio.motifs.clusterbuster": {"functions": funcs(BMC), "classes": {"Record": members(BMC.Record)}},
  "Bio.PDB.vectors": {"functions": funcs(PVec), "classes": {"Vector": members(PVec.Vector)}},
  "Bio.PDB.parse_pdb_header": {"functions": funcs(PHeader)},
}
print(json.dumps(inv, indent=1))
