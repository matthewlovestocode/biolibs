## Bio.motifs

- [x] `create(instances, alphabet='ACGT')`
- [x] `parse(handle, fmt, strict=True)`
- [x] `read(handle, fmt, strict=True)`
- [x] `write(motifs, fmt, **kwargs)`

### Bio.motifs.Motif

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, key)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, alphabet='ACGT', alignment=None, counts=None)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self, masked=False)`
- [x] `anticonsensus`
- [x] `background`
- [x] `consensus`
- [x] `degenerate_consensus`
- [x] `format(self, format_spec)`
- [x] `mask`
- [x] `pseudocounts`
- [x] `pssm`
- [x] `pwm`
- [x] `relative_entropy`
- [x] `reverse_complement(self)`
- [-] `weblogo(self, fname, fmt='PNG', **kwds)`
