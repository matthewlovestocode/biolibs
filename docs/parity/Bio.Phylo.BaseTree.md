## Bio.Phylo.BaseTree


### Bio.Phylo.BaseTree.TreeElement

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`

### Bio.Phylo.BaseTree.TreeMixin

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `collapse(self, target=None, **kwargs)`
- [x] `collapse_all(self, target=None, **kwargs)`
- [x] `common_ancestor(self, targets, *more_targets)`
- [x] `count_terminals(self)`
- [x] `depths(self, unit_branch_lengths=False)`
- [x] `distance(self, target1, target2=None)`
- [x] `find_any(self, *args, **kwargs)`
- [x] `find_clades(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `find_elements(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `get_nonterminals(self, order='preorder')`
- [x] `get_path(self, target=None, **kwargs)`
- [x] `get_terminals(self, order='preorder')`
- [x] `is_bifurcating(self)`
- [x] `is_monophyletic(self, terminals, *more_terminals)`
- [x] `is_parent_of(self, target=None, **kwargs)`
- [x] `is_preterminal(self)`
- [x] `ladderize(self, reverse=False)`
- [x] `prune(self, target=None, **kwargs)`
- [x] `split(self, n=2, branch_length=1.0)`
- [x] `total_branch_length(self)`
- [x] `trace(self, start, finish)`

### Bio.Phylo.BaseTree.Tree

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, root=None, rooted=True, id=None, name=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `as_phyloxml(self, **kwargs)`
- [x] `clade`
- [x] `collapse(self, target=None, **kwargs)`
- [x] `collapse_all(self, target=None, **kwargs)`
- [x] `common_ancestor(self, targets, *more_targets)`
- [x] `count_terminals(self)`
- [x] `depths(self, unit_branch_lengths=False)`
- [x] `distance(self, target1, target2=None)`
- [x] `find_any(self, *args, **kwargs)`
- [x] `find_clades(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `find_elements(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `format(self, fmt=None)`
- [x] `from_clade(clade, **kwargs)`
- [x] `get_nonterminals(self, order='preorder')`
- [x] `get_path(self, target=None, **kwargs)`
- [x] `get_terminals(self, order='preorder')`
- [x] `is_bifurcating(self)`
- [x] `is_monophyletic(self, terminals, *more_terminals)`
- [x] `is_parent_of(self, target=None, **kwargs)`
- [x] `is_preterminal(self)`
- [x] `is_terminal(self)`
- [x] `ladderize(self, reverse=False)`
- [x] `prune(self, target=None, **kwargs)`
- [-] `randomized(taxa, branch_length=1.0, branch_stdev=None)`
- [x] `root_at_midpoint(self)`
- [x] `root_with_outgroup(self, outgroup_targets, *more_targets, outgroup_branch_length=None)`
- [x] `split(self, n=2, branch_length=1.0)`
- [x] `total_branch_length(self)`
- [x] `trace(self, start, finish)`

### Bio.Phylo.BaseTree.Clade

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, index)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, branch_length=None, name=None, clades=None, confidence=None, color=None, width=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `collapse(self, target=None, **kwargs)`
- [x] `collapse_all(self, target=None, **kwargs)`
- [x] `color`
- [x] `common_ancestor(self, targets, *more_targets)`
- [x] `count_terminals(self)`
- [x] `depths(self, unit_branch_lengths=False)`
- [x] `distance(self, target1, target2=None)`
- [x] `find_any(self, *args, **kwargs)`
- [x] `find_clades(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `find_elements(self, target=None, terminal=None, order='preorder', **kwargs)`
- [x] `get_nonterminals(self, order='preorder')`
- [x] `get_path(self, target=None, **kwargs)`
- [x] `get_terminals(self, order='preorder')`
- [x] `is_bifurcating(self)`
- [x] `is_monophyletic(self, terminals, *more_terminals)`
- [x] `is_parent_of(self, target=None, **kwargs)`
- [x] `is_preterminal(self)`
- [x] `is_terminal(self)`
- [x] `ladderize(self, reverse=False)`
- [x] `prune(self, target=None, **kwargs)`
- [x] `root`
- [x] `split(self, n=2, branch_length=1.0)`
- [x] `total_branch_length(self)`
- [x] `trace(self, start, finish)`

### Bio.Phylo.BaseTree.BranchColor

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, red, green, blue)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `from_hex(hexstr)`
- [x] `from_name(colorname)`
- [x] `to_hex(self)`
- [x] `to_rgb(self)`
