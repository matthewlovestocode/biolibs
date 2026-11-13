## Bio.PDB.Structure


### Bio.PDB.Structure.Structure

- [x] `__contains__(self, id)`
- [x] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, entity: ~_Child)`
- [ ] `atom_to_internal_coordinates(self, verbose: bool = False) -> None`
- [x] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `get_atoms(self)`
- [x] `get_chains(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [x] `get_iterator(self)`
- [x] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_models(self)`
- [x] `get_parent(self)`
- [x] `get_residues(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [ ] `internal_to_atom_coordinates(self, verbose: bool = False) -> None`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_Self, other: ~_Self, compare_coordinates: bool = False) -> bool`
- [x] `transform(self, rot, tran)`
