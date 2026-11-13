## Bio.Phylo.NewickIO

- [x] `parse(handle, **kwargs)`
- [x] `write(trees, handle, plain=False, **kwargs)`

### Bio.Phylo.NewickIO.Parser

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, handle)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `from_string(treetext)`
- [x] `new_clade(self, parent=None)`
- [x] `parse(self, values_are_confidence=False, comments_are_confidence=False, rooted=False)`
- [x] `process_clade(self, clade)`

### Bio.Phylo.NewickIO.Writer

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, trees)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `to_strings(self, confidence_as_branch_length=False, branch_length_only=False, plain=False, plain_newick=True, ladderize=None, max_confidence=1.0, format_confidence='%1.2f', format_branch_length='%1.8g')`
- [x] `write(self, handle, **kwargs)`
