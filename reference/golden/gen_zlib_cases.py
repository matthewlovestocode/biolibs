"""Golden cases for the DEFLATE decompressor -> packages/core/test/golden/zlib.json

Not a Biopython parity item: `zlib.decompress` is what `Bio.Align.bigbed` reads its data blocks with, and the
port has to do that itself. Python compresses here at every level, including the stored blocks level 0 gives and
the dynamic Huffman tables that repetitive data produces; the port must get the original bytes back.
"""
import json, os, random, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "core", "test", "golden", "zlib.json")
rnd = random.Random(4711)

def skewed(n):
    """Bytes whose frequencies grow like the Fibonacci numbers, which is what forces a Huffman tree deeper than
    fifteen levels and sends zlib's code lengths through its overflow handling."""
    out = bytearray()
    a, b = 1, 1
    for i in range(24):
        out += bytes([i]) * a
        a, b = b, a + b
        if len(out) > n: break
    return bytes(out[:n])

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
    # Longer than the 32 KiB window, so zlib slides it; the port keeps the whole input instead and has to agree.
    yield (b"the quick brown fox jumps over the lazy dog. " * 5000)
    yield bytes(rnd.getrandbits(8) for _ in range(100000))  # blocks split by symbol count, not by content
    yield bytes(200000)                                     # one match the whole way, over several windows
    yield (b"abc" * 30000)                                  # a three-byte period: every chain is long
    yield skewed(60000)                                     # a Huffman tree deep enough to need capping
    # Compressible, then not, which is what zlib's block-truncation heuristic is there for.
    yield (b"aaaaaaaaaa" * 2000) + bytes(rnd.getrandbits(8) for _ in range(40000)) + (b"bbbbbbbbbb" * 2000)
    yield bytes(range(256)) * 300                            # every byte value, evenly
    # Around the symbol-buffer boundary, where a block ends and the next one's trees are built afresh.
    for n in (16380, 16383, 16384, 16385, 32766, 32768):
        yield bytes(rnd.getrandbits(8) for _ in range(n))
    # One enormous match, then noise: this is where nice_length ends the search early and good_length shortens
    # the chain.
    yield (b"Z" * 80000) + bytes(rnd.getrandbits(8) for _ in range(5000))
    yield (b"ACGT" * 50000) + (b"N" * 1000) + (b"ACGT" * 50000)
    # A match at the very edge of the window, and one just past it.
    for gap in (32500, 32506, 32507, 32600):
        yield b"MATCHME" + bytes(rnd.getrandbits(8) for _ in range(gap)) + b"MATCHME"

cases = []
for data in payloads():
    for level in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9):
        cases.append({"level": level, "raw": data.hex(), "zlib": zlib.compress(data, level).hex(),
                      "deflate": zlib.compress(data, level)[2:-4].hex()})
# Data that is not a zlib stream at all, and a stream cut short: both must raise.
cases.append({"level": None, "raw": None, "zlib": b"\x00\x01\x02\x03".hex(), "deflate": None,
              "error": "incorrect header check"})
cases.append({"level": None, "raw": None, "zlib": zlib.compress(b"x" * 1000)[:8].hex(), "deflate": None,
              "error": "truncated"})
json.dump({"cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
