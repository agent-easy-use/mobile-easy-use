"""Strip only variable tables; retain bytecode and line tables in a test fixture."""
import pathlib
import struct
import sys

class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0
    def take(self, n):
        value = self.data[self.pos:self.pos+n]
        assert len(value) == n
        self.pos += n
        return value
    def number(self, n):
        return int.from_bytes(self.take(n), 'big')

path = pathlib.Path(sys.argv[1])
r = Reader(path.read_bytes())
header = r.take(8)
count = r.number(2)
names, i = {}, 1
while i < count:
    tag = r.number(1)
    if tag == 1:
        names[i] = r.take(r.number(2)).decode('utf-8')
    elif tag in (5, 6):
        r.take(8)
        i += 1
    else:
        r.take({3: 4, 4: 4, 7: 2, 8: 2, 9: 4, 10: 4, 11: 4, 12: 4,
                15: 3, 16: 2, 17: 4, 18: 4, 19: 2, 20: 2}[tag])
    i += 1

def attributes(reader):
    items = []
    for _ in range(reader.number(2)):
        name = reader.number(2)
        content = reader.take(reader.number(4))
        if names[name] in ('LocalVariableTable', 'LocalVariableTypeTable'):
            continue
        if names[name] == 'Code':
            code = Reader(content)
            prefix = code.take(4)
            size = code.number(4)
            prefix += struct.pack('>I', size) + code.take(size)
            exceptions = code.number(2)
            prefix += struct.pack('>H', exceptions) + code.take(exceptions * 8)
            content = prefix + attributes(code)
            assert code.pos == len(code.data)
        items.append(struct.pack('>HI', name, len(content)) + content)
    return struct.pack('>H', len(items)) + b''.join(items)

out = r.data[:r.pos] + r.take(6)
interfaces = r.number(2)
out += struct.pack('>H', interfaces) + r.take(interfaces * 2)
for _ in range(2):  # fields, methods
    count = r.number(2)
    out += struct.pack('>H', count)
    for _ in range(count):
        out += r.take(6) + attributes(r)
out += attributes(r)
assert r.pos == len(r.data)
path.write_bytes(out)
