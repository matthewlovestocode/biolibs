"""Builders and mutators for binary test files (nib, twoBit, GCK, ...). The files are built here from the
format specifications and then fed to Biopython; nothing is hand-copied from the expected results."""
import random, struct

def twobit_file(seqs, little=True, version=0, reserved=0, seq_reserved=0, with_masks=True):
    """Build a twoBit file from {name: dna}; N/n become N blocks and lower case becomes mask blocks."""
    e = "<" if little else ">"
    def u(n): return struct.pack(e + "I", n)
    def runs(flags):
        out, start = [], None
        for i, f in enumerate(flags + [False]):
            if f and start is None: start = i
            if not f and start is not None: out.append((start, i - start)); start = None
        return out
    records = []
    for name, dna in seqs.items():
        nb = runs([c in "Nn" for c in dna]); mb = runs([c.islower() for c in dna]) if with_masks else []
        code = {"T": 0, "C": 1, "A": 2, "G": 3}
        bases = [code.get(c.upper(), 0) for c in dna]
        packed = bytearray()
        for i in range(0, len(bases), 4):
            chunk = bases[i:i + 4] + [0] * (4 - len(bases[i:i + 4]))
            packed.append(chunk[0] << 6 | chunk[1] << 4 | chunk[2] << 2 | chunk[3])
        body = u(len(dna)) + u(len(nb)) + b"".join(u(s) for s, _ in nb) + b"".join(u(l) for _, l in nb)
        body += u(len(mb)) + b"".join(u(s) for s, _ in mb) + b"".join(u(l) for _, l in mb) + u(seq_reserved) + bytes(packed)
        records.append((name, body))
    header = u(0x1A412743) + u(version) + u(len(records)) + u(reserved)
    index_size = sum(1 + len(n.encode()) + 4 for n, _ in records)
    offset = len(header) + index_size
    index = b""
    for name, body in records:
        index += bytes([len(name.encode())]) + name.encode() + u(offset)
        offset += len(body)
    return header + index + b"".join(b for _, b in records)

def pstring(s): return bytes([len(s)]) + s.encode("ascii")
def p4string(s): return struct.pack(">I", len(s)) + s.encode("ascii")

def gck_file(seq, features=(), name="construct 1", circular=False, sites=0, versions=(), seq_len_override=None, trailer=706):
    """Build a Gene Construction Kit file. features: (start, end, kind, reverse, name, comment, version)."""
    out = bytearray(b"\x00" * 24)
    def packet(b): return struct.pack(">I", len(b)) + b
    sl = len(seq) if seq_len_override is None else seq_len_override
    out += packet(struct.pack(">I", sl) + seq.encode("ascii"))
    out += packet(b"\x00" * 8)
    fp = struct.pack(">IH", len(seq), len(features))
    extra = b""
    for start, end, kind, rev, fname, comment, version in features:
        fp += struct.pack(">II6xH14xB17xII35xB", start, end, kind, 1 if rev else 0, 1 if fname else 0, 1 if comment else 0, version)
        if fname: extra += pstring(fname)
        if comment: extra += p4string(comment)
    out += packet(fp) + extra
    sp = struct.pack(">IH", len(seq), sites) + b"\x00" * (88 * sites)
    out += packet(sp)
    out += packet(b"\x00" * 4)
    out += struct.pack(">H", len(versions))
    vb = b""
    for c in versions: vb += b"\x00" * 256 + struct.pack(">I", 1 if c else 0)
    out += vb
    for c in versions:
        if c: out += p4string(c)
    out += b"\x00" * trailer + pstring(name) + b"\x00" * 16 + bytes([1 if circular else 0])
    return bytes(out)

def mutate_bytes(b, rnd):
    """Damage a binary file: flip/overwrite/insert/delete bytes or cut it short."""
    b = bytearray(b)
    if not b: return bytes(b)
    k = rnd.choice(["flip", "flip", "trunc", "insert", "delete", "word", "zero", "tail"])
    i = rnd.randrange(len(b))
    if k == "flip": b[i] ^= 1 << rnd.randrange(8)
    elif k == "trunc": return bytes(b[:rnd.randrange(len(b) + 1)])
    elif k == "insert": b.insert(i, rnd.randrange(256))
    elif k == "delete": del b[i]
    elif k == "word":
        for j in range(4):
            if i + j < len(b): b[i + j] = rnd.choice([0, 255, rnd.randrange(256)])
    elif k == "zero": b[i] = 0
    elif k == "tail": b += bytes(rnd.randrange(256) for _ in range(rnd.randint(1, 6)))
    return bytes(b)

def lat(b): return b.decode("latin-1")
