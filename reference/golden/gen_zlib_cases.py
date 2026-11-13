"""Golden cases for the DEFLATE decompressor -> packages/core/test/golden/zlib.json

Not a Biopython parity item: `zlib.decompress` is what `Bio.Align.bigbed` reads its data blocks with, and the
port has to do that itself. Python compresses here at every level, including the stored blocks level 0 gives and
the dynamic Huffman tables that repetitive data produces; the port must get the original bytes back.
"""
import json, os, random, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "core", "test", "golden", "zlib.json")
rnd = random.Random(4711)

def payloads():
    yield b""
    yield b"A"
    yield b"hello, world"
    yield b"ab" * 5000                                    # long runs: back references at the maximum length
    yield bytes(rnd.getrandbits(8) for _ in range(5000))   # incompressible: stored or near-stored blocks
    yield ("chr1\t100\t200\tname\t0\t+\n" * 400).encode()  # the shape of a bigBed data block
    yield bytes(70000)                                     # longer than one window
    yield "αβγ δεζ".encode() * 300                         # multi-byte text
    for n in (1, 2, 3, 255, 256, 257, 258, 259, 32768, 32769):
        yield bytes(rnd.randrange(3) for _ in range(n))     # small alphabet, every length near a boundary

cases = []
for data in payloads():
    for level in (0, 1, 6, 9):
        cases.append({"level": level, "raw": data.hex(), "zlib": zlib.compress(data, level).hex(),
                      "deflate": zlib.compress(data, level)[2:-4].hex()})
# Data that is not a zlib stream at all, and a stream cut short: both must raise.
cases.append({"level": None, "raw": None, "zlib": b"\x00\x01\x02\x03".hex(), "deflate": None,
              "error": "incorrect header check"})
cases.append({"level": None, "raw": None, "zlib": zlib.compress(b"x" * 1000)[:8].hex(), "deflate": None,
              "error": "truncated"})
json.dump({"cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
