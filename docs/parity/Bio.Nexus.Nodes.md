## Bio.Nexus.Nodes


### Bio.Nexus.Nodes.Chain

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self) -> None`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add(self, node: 'Node', prev: int | None = None) -> int`
- [x] `all_ids(self) -> list[int]`
- [x] `collapse(self, id)`
- [x] `is_parent_of(self, parent, grandchild)`
- [x] `kill(self, id)`
- [x] `link(self, parent, child)`
- [x] `trace(self, start, finish)`
- [x] `unlink(self, id)`

### Bio.Nexus.Nodes.Node

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, data=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add_succ(self, id)`
- [-] `get_data(self)`
- [x] `get_id(self)`
- [x] `get_prev(self)`
- [x] `get_succ(self)`
- [x] `remove_succ(self, id)`
- [-] `set_data(self, data)`
- [x] `set_id(self, id)`
- [x] `set_prev(self, id)`
- [x] `set_succ(self, new_succ)`
