## Bio.Phylo.PhyloXML


### Bio.Phylo.PhyloXML.Phyloxml

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, index)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, attributes, phylogenies=None, other=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Other

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, tag, namespace=None, attributes=None, value=None, children=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Phylogeny

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, root=None, rooted=True, rerootable=None, branch_length_unit=None, type=None, name=None, id=None, description=None, date=None, confidences=None, clade_relations=None, sequence_relations=None, properties=None, other=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `alignment`
- [x] `as_phyloxml(self)`
- [x] `clade`
- [x] `collapse(self, target=None, **kwargs)`
- [x] `collapse_all(self, target=None, **kwargs)`
- [x] `common_ancestor(self, targets, *more_targets)`
- [x] `confidence`
- [x] `count_terminals(self)`
- [x] `depths(self, unit_branch_lengths=False)`
- [x] `distance(self, target1, target2=None)`
- [x] `find_any(self, *args, **kwargs)`
- [x] `find_clades(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `find_elements(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `format(self, fmt=None)`
- [x] `from_clade(clade, **kwargs)`
- [x] `from_tree(tree, **kwargs)`
- [x] `get_nonterminals(self, order='preorder')`
- [x] `get_path(self, target=None, **kwargs)`
- [x] `get_terminals(self, order='preorder')`
- [x] `is_bifurcating(self)`
- [x] `is_monophyletic(self, terminals, *more_terminals)`
- [x] `is_parent_of(self, target=None, **kwargs)`
- [x] `is_preterminal(self)`
- [x] `is_terminal(self)`
- [x] `ladderize(self, reverse=False)`
- [x] `prune(self, target=None, **kwargs)`
- [-] `randomized(taxa, branch_length=1.0, branch_stdev=None)`
- [x] `root_at_midpoint(self)`
- [x] `root_with_outgroup(self, outgroup_targets, *more_targets, outgroup_branch_length=None)`
- [x] `split(self, n=2, branch_length=1.0)`
- [x] `to_alignment(self)`
- [x] `to_phyloxml_container(self, **kwargs)`
- [x] `total_branch_length(self)`
- [x] `trace(self, start, finish)`

### Bio.Phylo.PhyloXML.Clade

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, index)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, branch_length=None, id_source=None, name=None, width=None, color=None, node_id=None, events=None, binary_characters=None, date=None, confidences=None, taxonomies=None, sequences=None, distributions=None, references=None, properties=None, clades=None, other=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `collapse(self, target=None, **kwargs)`
- [x] `collapse_all(self, target=None, **kwargs)`
- [x] `color`
- [x] `common_ancestor(self, targets, *more_targets)`
- [x] `confidence`
- [x] `count_terminals(self)`
- [x] `depths(self, unit_branch_lengths=False)`
- [x] `distance(self, target1, target2=None)`
- [x] `find_any(self, *args, **kwargs)`
- [x] `find_clades(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `find_elements(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `from_clade(clade, **kwargs)`
- [x] `get_nonterminals(self, order='preorder')`
- [x] `get_path(self, target=None, **kwargs)`
- [x] `get_terminals(self, order='preorder')`
- [x] `is_bifurcating(self)`
- [x] `is_monophyletic(self, terminals, *more_terminals)`
- [x] `is_parent_of(self, target=None, **kwargs)`
- [x] `is_preterminal(self)`
- [x] `is_terminal(self)`
- [x] `ladderize(self, reverse=False)`
- [x] `prune(self, target=None, **kwargs)`
- [x] `root`
- [x] `split(self, n=2, branch_length=1.0)`
- [x] `taxonomy`
- [x] `to_phylogeny(self, **kwargs)`
- [x] `total_branch_length(self)`
- [x] `trace(self, start, finish)`

### Bio.Phylo.PhyloXML.BranchColor

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `from_hex(hexstr)`
- [x] `from_name(colorname)`
- [x] `to_hex(self)`
- [x] `to_rgb(self)`

### Bio.Phylo.PhyloXML.Accession

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, source)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Annotation

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, ref=None, source=None, evidence=None, type=None, desc=None, confidence=None, uri=None, properties=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.BinaryCharacters

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, type=None, gained_count=None, lost_count=None, present_count=None, absent_count=None, gained=None, lost=None, present=None, absent=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.CladeRelation

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, type, id_ref_0, id_ref_1, distance=None, confidence=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Confidence

- [x] `__add__(self, value, /)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__mod__(self, value, /)`
- [x] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__rmul__(self, value, /)`
- [x] `__str__(self) -> str`
- [x] `as_integer_ratio(self, /)`
- [x] `conjugate(self, /)`
- [x] `from_number(number, /)`
- [x] `fromhex(string, /)`
- [x] `hex(self, /)`
- [x] `is_integer(self, /)`
- [x] `value`

### Bio.Phylo.PhyloXML.Date

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value=None, unit=None, desc=None, minimum=None, maximum=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Distribution

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, desc=None, points=None, polygons=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.DomainArchitecture

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, length=None, domains=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Events

- [x] `__contains__(self, key)`
- [x] `__delitem__(self, key)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, key)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, type=None, duplications=None, speciations=None, losses=None, confidence=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__setitem__(self, key, val)`
- [x] `__str__(self) -> str`
- [x] `items(self)`
- [x] `keys(self)`
- [x] `values(self)`

### Bio.Phylo.PhyloXML.Id

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, provider=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.MolSeq

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, is_aligned=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Point

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, geodetic_datum, lat, long, alt=None, alt_unit=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Polygon

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, points=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Property

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, ref, applies_to, datatype, unit=None, id_ref=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.ProteinDomain

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, start, end, confidence=None, id=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `from_seqfeature(feat)`
- [x] `to_seqfeature(self)`

### Bio.Phylo.PhyloXML.Reference

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, doi=None, desc=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Sequence

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, type=None, id_ref=None, id_source=None, symbol=None, accession=None, name=None, location=None, mol_seq=None, uri=None, domain_architecture=None, annotations=None, other=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `from_seqrecord(record, is_aligned=None)`
- [x] `to_seqrecord(self)`

### Bio.Phylo.PhyloXML.SequenceRelation

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, type, id_ref_0, id_ref_1, distance=None, confidence=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.PhyloXML.Taxonomy

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id_source=None, id=None, code=None, scientific_name=None, authority=None, rank=None, uri=None, common_names=None, synonyms=None, other=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.Uri

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, value, desc=None, type=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self)`

### Bio.Phylo.PhyloXML.PhyloXMLWarning

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `add_note(self, note, /)`
- [x] `with_traceback(self, tb, /)`
