## Bio.Nexus.Nexus

- [x] `combine(matrices)`
- [x] `get_start_end(sequence, skiplist=('-', '?'))`
- [x] `quotestrip(word)`
- [x] `safename(name, mrbayes=False)`

### Bio.Nexus.Nexus.Nexus

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, input=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add_sequence(self, name, sequence)`
- [x] `append_sets(self, exclude=(), delete=(), mrbayes=False, include_codons=True, codons_only=False)`
- [ ] `bootstrap(self, matrix=None, delete=(), exclude=())`
- [x] `constant(self, matrix=None, delete=(), exclude=())`
- [x] `crop_matrix(self, matrix=None, delete=(), exclude=())`
- [x] `cstatus(self, site, delete=(), narrow=True)`
- [x] `export_fasta(self, filename=None, width=70)`
- [x] `export_phylip(self, filename=None)`
- [x] `gaponly(self, include_missing=False)`
- [x] `insert_gap(self, pos, n=1, leftgreedy=False)`
- [x] `invert(self, charlist)`
- [x] `read(self, input)`
- [x] `terminal_gap_to_missing(self, missing=None, skip_n=True)`
- [x] `weighted_stepmatrix(self, name='your_name_here', exclude=(), delete=())`
- [x] `write_nexus_data(self, filename=None, matrix=None, exclude=(), delete=(), blocksize=None, interleave=False, interleave_by_partition=False, comment=None, omit_NEXUS=False, append_sets=True, mrbayes=False, codons_block=True)`
- [x] `write_nexus_data_partitions(self, matrix=None, filename=None, blocksize=None, interleave=False, exclude=(), delete=(), charpartition=None, comment='', mrbayes=False)`
