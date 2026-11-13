## Bio.PDB.Residue


### Bio.PDB.Residue.Residue

- [x] `__contains__(self, id)`
- [x] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id, resname, segid)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, atom)`
- [x] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `flag_disordered(self)`
- [x] `get_atoms(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [x] `get_iterator(self)`
- [x] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_parent(self)`
- [x] `get_resname(self)`
- [x] `get_segid(self)`
- [x] `get_unpacked_list(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_ResidueT, other: ~_ResidueT, compare_coordinates: bool = False) -> bool`
- [x] `transform(self, rot, tran)`

### Bio.PDB.Residue.DisorderedResidue

- [x] `__contains__(self, id)`
- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [ ] `__gt__(self, other)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [ ] `__le__(self, other)`
- [x] `__len__(self)`
- [ ] `__lt__(self, other)`
- [x] `__repr__(self)`
- [x] `__setitem__(self, id, child)`
- [-] `__str__(self, /)`
- [x] `add(self, atom)`
- [x] `copy(self)`
- [x] `detach_parent(self)`
- [x] `disordered_add(self, residue)`
- [x] `disordered_get(self, id=None)`
- [x] `disordered_get_id_list(self)`
- [x] `disordered_get_list(self)`
- [x] `disordered_has_id(self, id)`
- [x] `disordered_remove(self, resname)`
- [x] `disordered_select(self, id)`
- [x] `get_id(self)`
- [x] `get_parent(self)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, parent)`
- [x] `sort(self)`
- [x] `strictly_equals(self, other: 'DisorderedEntityWrapper', compare_coordinates: bool = False) -> bool`
