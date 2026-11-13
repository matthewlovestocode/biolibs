## Bio.PDB.StructureBuilder


### Bio.PDB.StructureBuilder.StructureBuilder

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [ ] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `get_structure(self)`
- [x] `init_atom(self, name: str, coord: numpy.ndarray, b_factor: float | None, occupancy: float | None, altloc: str, fullname: str, serial_number=None, element: str | None = None, pqr_charge: float | None = None, radius: float | None = None, is_pqr: bool = False)`
- [x] `init_chain(self, chain_id: str)`
- [x] `init_model(self, model_id: int, serial_num: int | None = None)`
- [x] `init_residue(self, resname: str, field: str, resseq: int, icode: str)`
- [x] `init_seg(self, segid: str)`
- [x] `init_structure(self, structure_id: str)`
- [x] `set_anisou(self, anisou_array)`
- [x] `set_header(self, header)`
- [x] `set_line_counter(self, line_counter: int)`
- [x] `set_sigatm(self, sigatm_array)`
- [x] `set_siguij(self, siguij_array)`
- [x] `set_symmetry(self, spacegroup, cell)`
