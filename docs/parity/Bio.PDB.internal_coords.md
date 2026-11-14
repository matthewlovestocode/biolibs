## Bio.PDB.internal_coords

- [ ] `set_accuracy_95(num: float) -> float`

### Bio.PDB.internal_coords.AtomKey

- [x] `__eq__(self, other: object) -> bool`
- [x] `__ge__(self, other: object) -> bool`
- [x] `__gt__(self, other: object) -> bool`
- [x] `__hash__(self) -> int`
- [x] `__init__(self, *args: Bio.PDB.internal_coords.IC_Residue | Bio.PDB.Atom.Atom | list | dict | str, **kwargs: str) -> None`
- [x] `__le__(self, other: object) -> bool`
- [x] `__lt__(self, other: object) -> bool`
- [x] `__repr__(self) -> str`
- [x] `__str__(self, /)`
- [x] `altloc_match(self, other: 'AtomKey') -> bool`
- [x] `atm(self) -> str`
- [x] `cr_class(self) -> str | None`
- [x] `is_backbone(self) -> bool`

### Bio.PDB.internal_coords.Edron

- [x] `__contains__(self, ak: 'AtomKey') -> bool`
- [x] `__eq__(self, other: object) -> bool`
- [x] `__ge__(self, other: object) -> bool`
- [x] `__gt__(self, other: object) -> bool`
- [ ] `__hash__(self) -> int`
- [x] `__init__(self, *args: list['AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'], **kwargs: str) -> None`
- [x] `__le__(self, other: object) -> bool`
- [x] `__lt__(self, other: object) -> bool`
- [x] `__repr__(self) -> str`
- [x] `__str__(self, /)`
- [x] `gen_key(lst: list['AtomKey']) -> str`
- [x] `gen_tuple(akstr: str) -> tuple`
- [x] `is_backbone(self) -> bool`

### Bio.PDB.internal_coords.Hedron

- [x] `__contains__(self, ak: 'AtomKey') -> bool`
- [x] `__eq__(self, other: object) -> bool`
- [x] `__ge__(self, other: object) -> bool`
- [x] `__gt__(self, other: object) -> bool`
- [ ] `__hash__(self) -> int`
- [x] `__init__(self, *args: list['AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey'], **kwargs: str) -> None`
- [x] `__le__(self, other: object) -> bool`
- [x] `__lt__(self, other: object) -> bool`
- [x] `__repr__(self) -> str`
- [x] `__str__(self, /)`
- [x] `angle`
- [x] `gen_key(lst: list['AtomKey']) -> str`
- [x] `gen_tuple(akstr: str) -> tuple`
- [ ] `get_length(self, ak_tpl: tuple['AtomKey', 'AtomKey']) -> float | None`
- [x] `is_backbone(self) -> bool`
- [x] `len12`
- [x] `len23`
- [ ] `set_length(self, ak_tpl: tuple['AtomKey', 'AtomKey'], newLength: float)`

### Bio.PDB.internal_coords.Dihedron

- [x] `__contains__(self, ak: 'AtomKey') -> bool`
- [x] `__eq__(self, other: object) -> bool`
- [x] `__ge__(self, other: object) -> bool`
- [x] `__gt__(self, other: object) -> bool`
- [ ] `__hash__(self) -> int`
- [x] `__init__(self, *args: list['AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'], **kwargs: str) -> None`
- [x] `__le__(self, other: object) -> bool`
- [x] `__lt__(self, other: object) -> bool`
- [x] `__repr__(self) -> str`
- [x] `__str__(self, /)`
- [x] `angle`
- [ ] `angle_avg(alst: list, in_rads: bool = False, out_rads: bool = False)`
- [ ] `angle_dif(a1: float | numpy.ndarray, a2: float | numpy.ndarray)`
- [ ] `angle_pop_sd(alst: list, avg: float)`
- [ ] `bits(self) -> int`
- [ ] `difference(self, other: 'Dihedron') -> float`
- [x] `gen_key(lst: list['AtomKey']) -> str`
- [x] `gen_tuple(akstr: str) -> tuple`
- [x] `is_backbone(self) -> bool`

### Bio.PDB.internal_coords.IC_Residue

- [x] `__contains__(self, ak: 'AtomKey') -> bool`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, parent: 'Residue') -> None`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self, /)`
- [ ] `applyMtx(self, mtx: <built-in function array>) -> None`
- [x] `assemble(self, resetLocation: bool = False, verbose: bool = False) -> dict['AtomKey', numpy.array] | dict[tuple['AtomKey', 'AtomKey', 'AtomKey'], numpy.array] | None`
- [ ] `bond_rotate(self, angle_key: tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'] | str, delta: float)`
- [ ] `bond_set(self, angle_key: tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'] | str, val: float)`
- [ ] `clear_transforms(self)`
- [ ] `get_angle(self, angle_key: tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'] | str) -> float | None`
- [ ] `get_length(self, ak_spec: str | tuple['AtomKey', 'AtomKey']) -> float | None`
- [ ] `pdb_residue_string(self) -> str`
- [ ] `pick_angle(self, angle_key: tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'] | str) -> ForwardRef('Hedron') | ForwardRef('Dihedron') | None`
- [ ] `pick_length(self, ak_spec: str | tuple['AtomKey', 'AtomKey']) -> tuple[list['Hedron'] | None, tuple['AtomKey', 'AtomKey'] | None]`
- [x] `pretty_str(self) -> str`
- [x] `rak(self, atm: str | Bio.PDB.Atom.Atom) -> 'AtomKey'`
- [ ] `set_angle(self, angle_key: tuple['AtomKey', 'AtomKey', 'AtomKey'] | tuple['AtomKey', 'AtomKey', 'AtomKey', 'AtomKey'] | str, v: float, overlap=True)`
- [ ] `set_flexible(self) -> None`
- [ ] `set_hbond(self) -> None`
- [ ] `set_length(self, ak_spec: str | tuple['AtomKey', 'AtomKey'], val: float) -> None`
- [x] `split_akl(self, lst: tuple['AtomKey', ...] | list['AtomKey'], missingOK: bool = False) -> list[tuple['AtomKey', ...]]`

### Bio.PDB.internal_coords.IC_Chain

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, parent, verbose: bool = False) -> None`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `assemble_residues(self, verbose: bool = False) -> None`
- [x] `assemble_residues_ser(self, verbose: bool = False, start: int | None = None, fin: int | None = None) -> None`
- [x] `atom_to_internal_coordinates(self, verbose: bool = False) -> None`
- [x] `build_atomArray(self) -> None`
- [x] `build_edraArrays(self) -> None`
- [ ] `clear_ic(self)`
- [ ] `copy_initNCaCs(self, other: 'IC_Chain') -> None`
- [ ] `dihedral_signs(self) -> numpy.ndarray`
- [ ] `distance_plot(self, filter: numpy.ndarray | None = None) -> numpy.ndarray`
- [ ] `distance_to_internal_coordinates(self, resetAtoms: bool | None = True) -> None`
- [ ] `distplot_to_dh_arrays(self, distplot: numpy.ndarray, dihedra_signs: numpy.ndarray) -> None`
- [x] `init_atom_coords(self) -> None`
- [x] `init_edra(self, verbose: bool = False) -> None`
- [x] `internal_to_atom_coordinates(self, verbose: bool = False, start: int | None = None, fin: int | None = None) -> None`
- [ ] `make_extended(self)`
- [x] `propagate_changes(self) -> None`
- [x] `update_dCoordSpace(self, workSelector: numpy.ndarray | None = None) -> None`

### Bio.PDB.internal_coords.HedronMatchError

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [-] `add_note(self, note, /)`
- [-] `with_traceback(self, tb, /)`

### Bio.PDB.internal_coords.MissingAtomError

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [-] `add_note(self, note, /)`
- [-] `with_traceback(self, tb, /)`
