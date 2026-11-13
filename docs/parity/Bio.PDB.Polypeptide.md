## Bio.PDB.Polypeptide

- [x] `index_to_one(index)`
- [x] `index_to_three(i)`
- [x] `is_aa(residue, standard=False)`
- [x] `is_nucleic(residue, standard=False)`
- [x] `one_to_index(s)`
- [x] `three_to_index(s)`

### Bio.PDB.Polypeptide.Polypeptide

- [-] `__add__(self, value, /)`
- [-] `__contains__(self, key, /)`
- [-] `__delitem__(self, key, /)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__getitem__(self, index, /)`
- [-] `__gt__(self, value, /)`
- [-] `__iadd__(self, value, /)`
- [-] `__imul__(self, value, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [-] `__iter__(self, /)`
- [-] `__le__(self, value, /)`
- [-] `__len__(self, /)`
- [-] `__lt__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [-] `__setitem__(self, key, value, /)`
- [-] `__str__(self, /)`
- [-] `append(self, object, /)`
- [-] `clear(self, /)`
- [-] `copy(self, /)`
- [-] `count(self, value, /)`
- [-] `extend(self, iterable, /)`
- [x] `get_ca_list(self)`
- [x] `get_phi_psi_list(self)`
- [x] `get_sequence(self)`
- [x] `get_tau_list(self)`
- [x] `get_theta_list(self)`
- [-] `index(self, value, start=0, stop=9223372036854775807, /)`
- [-] `insert(self, index, object, /)`
- [-] `pop(self, index=-1, /)`
- [-] `remove(self, value, /)`
- [-] `reverse(self, /)`
- [-] `sort(self, /, *, key=None, reverse=False)`

### Bio.PDB.Polypeptide.CaPPBuilder

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [ ] `__hash__(self, /)`
- [x] `__init__(self, radius=4.3)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [ ] `__str__(self, /)`
- [x] `build_peptides(self, entity, aa_only=1)`

### Bio.PDB.Polypeptide.PPBuilder

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [ ] `__hash__(self, /)`
- [x] `__init__(self, radius=1.8)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [ ] `__str__(self, /)`
- [x] `build_peptides(self, entity, aa_only=1)`
