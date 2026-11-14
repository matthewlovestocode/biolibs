# Biopython parity checklist

Generated from Biopython 1.88 by `reference/gen_checklist.py`. `[ ]` not started, `[~]` partial (scaffold only), `[x]` verified against Biopython output, `[-]` not applicable (inherited Python/`object`/`BaseException` boilerplate). Comparison, hash and string members that no class but `object` defines are marked `[-]` automatically, from `inventory.py`'s reading of Biopython; a golden case that pins such a member down wins over that and makes it `[x]`. Edit `reference/status.json`, then re-run the script.

**Progress: 2448 / 2448 applicable items verified against Biopython.**

Two other libraries are ported too, and counted separately: see the [pydna](../parity-pydna/README.md) and [seguid](../parity-seguid/README.md) checklists.

| Section | Verified | Applicable |
|---|---|---|
| [Bio.Seq](Bio.Seq.md) | 151 | 151 |
| [Bio.SeqRecord](Bio.SeqRecord.md) | 25 | 25 |
| [Bio.SeqFeature](Bio.SeqFeature.md) | 163 | 163 |
| [Bio.Data.CodonTable](Bio.Data.CodonTable.md) | 36 | 36 |
| [Bio.Data.IUPACData (constants)](Bio.Data.IUPACData-constants.md) | 32 | 32 |
| [Bio.SeqIO](Bio.SeqIO.md) | 81 | 81 |
| [Bio.Align](Bio.Align.md) | 14 | 14 |
| [Bio.Align file formats](Bio.Align-file-formats.md) | 39 | 39 |
| [Bio.Align.CodonAligner](Bio.Align.CodonAligner.md) | 20 | 20 |
| [Bio.Align.analysis](Bio.Align.analysis.md) | 3 | 3 |
| [Bio.Align.AlignInfo](Bio.Align.AlignInfo.md) | 3 | 3 |
| [Bio.Align.AlignmentCounts](Bio.Align.AlignmentCounts.md) | 43 | 43 |
| [Bio.Align.Alignment](Bio.Align.Alignment.md) | 27 | 27 |
| [Bio.Align.PairwiseAligner](Bio.Align.PairwiseAligner.md) | 10 | 10 |
| [Bio.Align.substitution_matrices](Bio.Align.substitution_matrices.md) | 16 | 16 |
| [Bio.Phylo.BaseTree](Bio.Phylo.BaseTree.md) | 95 | 95 |
| [Bio.Phylo.Newick](Bio.Phylo.Newick.md) | 61 | 61 |
| [Bio.Phylo.NewickIO](Bio.Phylo.NewickIO.md) | 14 | 14 |
| [Bio.Phylo._io](Bio.Phylo._io.md) | 4 | 4 |
| [Bio.Phylo.NexusIO](Bio.Phylo.NexusIO.md) | 2 | 2 |
| [Bio.Phylo.Consensus](Bio.Phylo.Consensus.md) | 4 | 4 |
| [Bio.Phylo.TreeConstruction](Bio.Phylo.TreeConstruction.md) | 43 | 43 |
| [Bio.Phylo.PhyloXML](Bio.Phylo.PhyloXML.md) | 177 | 177 |
| [Bio.Phylo.PhyloXMLIO](Bio.Phylo.PhyloXMLIO.md) | 89 | 89 |
| [Bio.SeqUtils](Bio.SeqUtils.md) | 12 | 12 |
| [Bio.SeqUtils.CheckSum](Bio.SeqUtils.CheckSum.md) | 4 | 4 |
| [Bio.SeqUtils.lcc](Bio.SeqUtils.lcc.md) | 2 | 2 |
| [Bio.SeqUtils.IsoelectricPoint](Bio.SeqUtils.IsoelectricPoint.md) | 3 | 3 |
| [Bio.SeqUtils.ProtParam](Bio.SeqUtils.ProtParam.md) | 12 | 12 |
| [Bio.SeqUtils.MeltingTemp](Bio.SeqUtils.MeltingTemp.md) | 6 | 6 |
| [Bio.Nexus.Nexus](Bio.Nexus.Nexus.md) | 21 | 21 |
| [Bio.Nexus.Trees](Bio.Nexus.Trees.md) | 39 | 39 |
| [Bio.Nexus.Nodes](Bio.Nexus.Nodes.md) | 18 | 18 |
| [Bio.Nexus.StandardData](Bio.Nexus.StandardData.md) | 6 | 6 |
| [Bio.PDB.Entity](Bio.PDB.Entity.md) | 54 | 54 |
| [Bio.PDB.Atom](Bio.PDB.Atom.md) | 68 | 68 |
| [Bio.PDB.Residue](Bio.PDB.Residue.md) | 62 | 62 |
| [Bio.PDB.Chain](Bio.PDB.Chain.md) | 34 | 34 |
| [Bio.PDB.Model](Bio.PDB.Model.md) | 34 | 34 |
| [Bio.PDB.Structure](Bio.PDB.Structure.md) | 35 | 35 |
| [Bio.PDB.StructureBuilder](Bio.PDB.StructureBuilder.md) | 14 | 14 |
| [Bio.PDB.PDBParser](Bio.PDB.PDBParser.md) | 4 | 4 |
| [Bio.PDB.MMCIF2Dict](Bio.PDB.MMCIF2Dict.md) | 3 | 3 |
| [Bio.PDB.MMCIFParser](Bio.PDB.MMCIFParser.md) | 4 | 4 |
| [Bio.PDB.PDBIO](Bio.PDB.PDBIO.md) | 11 | 11 |
| [Bio.PDB.mmcifio](Bio.PDB.mmcifio.md) | 4 | 4 |
| [Bio.PDB.vectors](Bio.PDB.vectors.md) | 36 | 36 |
| [Bio.PDB.Polypeptide](Bio.PDB.Polypeptide.md) | 16 | 16 |
| [Bio.PDB.Superimposer](Bio.PDB.Superimposer.md) | 3 | 3 |
| [Bio.SVDSuperimposer](Bio.SVDSuperimposer.md) | 7 | 7 |
| [Bio.PDB.NeighborSearch](Bio.PDB.NeighborSearch.md) | 3 | 3 |
| [Bio.PDB.kdtrees](Bio.PDB.kdtrees.md) | 8 | 8 |
| [Bio.PDB.Selection](Bio.PDB.Selection.md) | 3 | 3 |
| [Bio.PDB.SASA](Bio.PDB.SASA.md) | 2 | 2 |
| [Bio.PDB.internal_coords](Bio.PDB.internal_coords.md) | 103 | 103 |
| [Bio.Restriction](Bio.Restriction.md) | 491 | 491 |
| [Bio.motifs](Bio.motifs.md) | 19 | 19 |
| [Bio.motifs.matrix](Bio.motifs.matrix.md) | 67 | 67 |
| [Bio.motifs.thresholds](Bio.motifs.thresholds.md) | 5 | 5 |
| [Bio.motifs.jaspar](Bio.motifs.jaspar.md) | 22 | 22 |
| [Bio.motifs.transfac](Bio.motifs.transfac.md) | 18 | 18 |
| [Bio.motifs.clusterbuster](Bio.motifs.clusterbuster.md) | 2 | 2 |
| [Bio.motifs.alignace](Bio.motifs.alignace.md) | 4 | 4 |
| [Bio.motifs.meme](Bio.motifs.meme.md) | 19 | 19 |
| [Bio.motifs.minimal](Bio.motifs.minimal.md) | 4 | 4 |
| [Bio.motifs.mast](Bio.motifs.mast.md) | 4 | 4 |
| [Bio.motifs.xms](Bio.motifs.xms.md) | 4 | 4 |
| [Bio.motifs.pfm](Bio.motifs.pfm.md) | 5 | 5 |
| [Bio.PDB.parse_pdb_header](Bio.PDB.parse_pdb_header.md) | 1 | 1 |
