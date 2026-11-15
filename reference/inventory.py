"""Dump the public API of the Biopython modules we are porting."""
import inspect, json
import Bio
from Bio import Seq, SeqRecord, SeqIO, SeqFeature, Align
from Bio import Entrez
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
AIMod = importlib.import_module('Bio.Align.AlignInfo')
PBT = importlib.import_module('Bio.Phylo.BaseTree')
PNW = importlib.import_module('Bio.Phylo.Newick')
PNIO = importlib.import_module('Bio.Phylo.NewickIO')
PIO2 = importlib.import_module('Bio.Phylo._io')
PNEX = importlib.import_module('Bio.Phylo.NexusIO')
PCON = importlib.import_module('Bio.Phylo.Consensus')
PTC = importlib.import_module('Bio.Phylo.TreeConstruction')
PAN = importlib.import_module('Bio.Align.analysis')
PX = importlib.import_module('Bio.Phylo.PhyloXML')
PXIO = importlib.import_module('Bio.Phylo.PhyloXMLIO')
BM = importlib.import_module('Bio.motifs')
BMM = importlib.import_module('Bio.motifs.matrix')
BMT = importlib.import_module('Bio.motifs.thresholds')
BMJ = importlib.import_module('Bio.motifs.jaspar')
BMF = importlib.import_module('Bio.motifs.transfac')
BMC = importlib.import_module('Bio.motifs.clusterbuster')
BMX = {n: importlib.import_module('Bio.motifs.' + n) for n in ('alignace', 'meme', 'minimal', 'mast', 'xms', 'pfm')}
RR = importlib.import_module('Bio.Restriction.Restriction')
RPF = importlib.import_module('Bio.Restriction.PrintFormat')
PPoly = importlib.import_module('Bio.PDB.Polypeptide')
PVec = importlib.import_module('Bio.PDB.vectors')
PHeader = importlib.import_module('Bio.PDB.parse_pdb_header')  # `import ... as` would give the shadowing function
PICo = importlib.import_module('Bio.PDB.internal_coords')
PList = importlib.import_module('Bio.PDB.PDBList')  # the module, not the shadowing class
from Bio.Nexus import Nexus as NexusMod, Trees as TreesMod, Nodes as NodesMod, StandardData as StandardDataMod

# Dunders that carry no Biopython meaning unless a class overrides them. `inspect.getmembers`
# reports them on every class, so without this they look like unported API; when no class in the
# MRO but `object` defines one, the "member" is Python's own default and the checklist marks it
# not-applicable instead of counting it as outstanding work.
BOILERPLATE = ("__eq__", "__ne__", "__lt__", "__le__", "__gt__", "__ge__", "__hash__", "__str__", "__repr__")

# Which class each member dict came from, keyed by the dict's identity. Recorded here, where the
# class object is in hand, because resolving a checklist key back to a class is unreliable: several
# Biopython modules are shadowed by a class of the same name (`Bio.PDB.PDBIO`, `Bio.Restriction.PrintFormat`).
# The dict is kept alive in the value so its id cannot be reused by a later object.
OWNERS = {}

def members(cls):
    out = {}
    OWNERS[id(out)] = (cls, out)
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
  "Bio.Align.formats": {"functions": {n: str(inspect.signature(getattr(Align, n))) for n in ("parse", "read", "write")}, "formats": sorted(Align.formats) if hasattr(Align, "formats") else sorted(__import__("Bio.Align", fromlist=["x"]).__dict__.get("formats", []))},
  "Bio.Align.CodonAligner": {"classes": {"CodonAligner": {n: "property" for n in dir(Align.CodonAligner) if not n.startswith("_") or n in ("__init__", "__str__", "__repr__")}}},
  "Bio.Phylo.BaseTree": {"classes": {n: members(getattr(PBT, n)) for n in ("TreeElement", "TreeMixin", "Tree", "Clade", "BranchColor")}},
  "Bio.Phylo.Newick": {"classes": {n: members(getattr(PNW, n)) for n in ("Tree", "Clade")}},
  "Bio.Phylo.NewickIO": {"functions": funcs(PNIO), "classes": {n: members(getattr(PNIO, n)) for n in ("Parser", "Writer")}},
  "Bio.Phylo._io": {"functions": funcs(PIO2)},
  "Bio.Phylo.NexusIO": {"functions": funcs(PNEX)},
  "Bio.Phylo.Consensus": {"functions": funcs(PCON), "classes": {"_BitString": members(PCON._BitString)}},
  "Bio.Phylo.TreeConstruction": {"classes": {n: members(getattr(PTC, n)) for n in ("_Matrix", "DistanceMatrix", "DistanceCalculator", "TreeConstructor", "DistanceTreeConstructor", "Scorer", "TreeSearcher", "NNITreeSearcher", "ParsimonyScorer", "ParsimonyTreeConstructor")}},
  "Bio.Align.analysis": {"functions": funcs(PAN)},
  "Bio.Phylo.PhyloXML": {"classes": {n: members(getattr(PX, n)) for n in ("Phyloxml", "Other", "Phylogeny", "Clade", "BranchColor", "Accession", "Annotation", "BinaryCharacters", "CladeRelation", "Confidence", "Date", "Distribution", "DomainArchitecture", "Events", "Id", "MolSeq", "Point", "Polygon", "Property", "ProteinDomain", "Reference", "Sequence", "SequenceRelation", "Taxonomy", "Uri", "PhyloXMLWarning")}},
  "Bio.Phylo.PhyloXMLIO": {"functions": funcs(PXIO), "classes": {n: members(getattr(PXIO, n)) for n in ("Parser", "Writer", "PhyloXMLError")}},
  "Bio.Align.AlignInfo": {"classes": {"SummaryInfo": members(AIMod.SummaryInfo)}},
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
  # The requests only: `read` and `parse` are listed because Biopython defines them, and stay unticked
  # until Bio.Entrez.Parser is ported.
  "Bio.Entrez": {"functions": funcs(Entrez)},
  # Downloads from the Protein Data Bank. The methods that keep a copy of the archive on disk are listed
  # because Biopython defines them, and are marked not applicable: there is no disk to keep it on.
  "Bio.PDB.PDBList": {"classes": {"PDBList": members(PList.PDBList)}},
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
  **{f"Bio.motifs.{n}": {"functions": funcs(mod), "classes": {c: members(getattr(mod, c)) for c in ("Motif", "Record") if hasattr(mod, c) and getattr(mod, c).__module__ == mod.__name__}} for n, mod in BMX.items()},
  "Bio.PDB.vectors": {"functions": funcs(PVec), "classes": {"Vector": members(PVec.Vector)}},
  "Bio.PDB.parse_pdb_header": {"functions": funcs(PHeader)},
  # The two exception classes carry nothing but `BaseException`'s own members, which the checklist marks
  # not-applicable on its own, so listing them costs nothing and keeps the module's surface complete.
  "Bio.PDB.internal_coords": {"functions": funcs(PICo),
                              "classes": {n: members(getattr(PICo, n)) for n in
                                          ("AtomKey", "Edron", "Hedron", "Dihedron", "IC_Residue",
                                           "IC_Chain", "HedronMatchError", "MissingAtomError")}},
}

def object_defaults(label, cls_name, ms):
    """Checklist keys for the BOILERPLATE members of one class that no class but `object` defines.

    `label` and `cls_name` are the inventory's names for the module and class, which is how a
    checklist key is spelled; `ms` is the member dict `members` built, used to find the class behind
    it. A class built without `members` has nothing to introspect, so nothing is claimed for it.
    """
    owner = OWNERS.get(id(ms))
    if owner is None:
        return []
    cls = owner[0]
    return [f"{label}.{cls_name}.{n}" for n in ms
            if n in BOILERPLATE and not any(n in k.__dict__ for k in cls.__mro__ if k is not object)]

inherited = []
for label, d in inv.items():
    if not isinstance(d, dict):
        continue
    for cls_name, ms in d.get("classes", {}).items():
        if cls_name.startswith("_"):      # the checklist leaves private classes out
            continue
        inherited.extend(object_defaults(label, cls_name, ms))
inv["inherited"] = sorted(inherited)

print(json.dumps(inv, indent=1))
