## Bio.PDB.vectors

- [x] `calc_angle(v1, v2, v3)`
- [x] `calc_dihedral(v1, v2, v3, v4)`
- [x] `coord_space(a0: numpy.ndarray, a1: numpy.ndarray, a2: numpy.ndarray, rev: bool = False) -> tuple[numpy.ndarray, numpy.ndarray | None]`
- [x] `get_spherical_coordinates(xyz: numpy.ndarray) -> tuple[float, float, float]`
- [x] `homog_rot_mtx(angle_rads: float, axis: str) -> numpy.ndarray`
- [x] `homog_scale_mtx(scale: float) -> numpy.ndarray`
- [x] `homog_trans_mtx(x: float, y: float, z: float) -> numpy.ndarray`
- [x] `m2rotaxis(m)`
- [x] `multi_coord_space(a3: numpy.ndarray, dLen: int, rev: bool = False) -> numpy.ndarray`
- [x] `multi_rot_Y(angle_rads: numpy.ndarray) -> numpy.ndarray`
- [x] `multi_rot_Z(angle_rads: numpy.ndarray) -> numpy.ndarray`
- [x] `refmat(p, q)`
- [x] `rotaxis(theta, vector)`
- [x] `rotaxis2m(theta, vector)`
- [x] `rotmat(p, q)`
- [x] `set_X_homog_rot_mtx(angle_rads: float, mtx: numpy.ndarray)`
- [x] `set_Y_homog_rot_mtx(angle_rads: float, mtx: numpy.ndarray)`
- [x] `set_Z_homog_rot_mtx(angle_rads: float, mtx: numpy.ndarray)`
- [x] `set_homog_trans_mtx(x: float, y: float, z: float, mtx: numpy.ndarray)`
- [x] `vector_to_axis(line, point)`

### Bio.PDB.vectors.Vector

- [x] `__add__(self, other)`
- [x] `__contains__(self, i)`
- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [x] `__getitem__(self, i)`
- [ ] `__gt__(self, value, /)`
- [ ] `__hash__(self, /)`
- [x] `__init__(self, x, y=None, z=None)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [x] `__mul__(self, other)`
- [x] `__repr__(self)`
- [x] `__setitem__(self, i, value)`
- [ ] `__str__(self, /)`
- [x] `angle(self, other)`
- [x] `copy(self)`
- [x] `get_array(self)`
- [x] `left_multiply(self, matrix)`
- [x] `norm(self)`
- [x] `normalize(self)`
- [x] `normalized(self)`
- [x] `normsq(self)`
- [x] `right_multiply(self, matrix)`
