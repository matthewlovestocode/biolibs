## Bio.motifs.jaspar

- [x] `calculate_pseudocounts(motif)`
- [x] `read(handle, format)`
- [x] `split_jaspar_id(id)`
- [x] `write(motifs, format)`

### Bio.motifs.jaspar.Motif

- [-] `__eq__(self, other)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, key)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self)`
- [x] `__init__(self, matrix_id, name, alphabet='ACGT', alignment=None, counts=None, collection=None, tf_class=None, tf_family=None, species=None, tax_group=None, acc=None, data_type=None, medline=None, pazar_id=None, comment=None)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self)`
- [x] `anticonsensus`
- [x] `background`
- [x] `base_id`
- [x] `consensus`
- [x] `degenerate_consensus`
- [x] `format(self, format_spec)`
- [x] `mask`
- [x] `pseudocounts`
- [x] `pssm`
- [x] `pwm`
- [x] `relative_entropy`
- [x] `reverse_complement(self)`
- [x] `version`
- [-] `weblogo(self, fname, fmt='PNG', **kwds)`

### Bio.motifs.jaspar.Record

- [-] `__add__(self, value, /)`
- [-] `__contains__(self, key, /)`
- [-] `__delitem__(self, key, /)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__getitem__(self, index, /)`
- [-] `__gt__(self, value, /)`
- [-] `__iadd__(self, value, /)`
- [-] `__imul__(self, value, /)`
- [-] `__init__(self)`
- [-] `__iter__(self, /)`
- [-] `__le__(self, value, /)`
- [-] `__len__(self, /)`
- [-] `__lt__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__rmul__(self, value, /)`
- [-] `__setitem__(self, key, value, /)`
- [-] `__str__(self)`
- [-] `append(self, object, /)`
- [-] `clear(self, /)`
- [-] `copy(self, /)`
- [-] `count(self, value, /)`
- [-] `extend(self, iterable, /)`
- [-] `index(self, value, start=0, stop=9223372036854775807, /)`
- [-] `insert(self, index, object, /)`
- [-] `pop(self, index=-1, /)`
- [-] `remove(self, value, /)`
- [-] `reverse(self, /)`
- [-] `sort(self, /, *, key=None, reverse=False)`
- [x] `to_dict(self)`
