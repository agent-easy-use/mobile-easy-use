"""Bounded parsers for the Darwin export trie and Frida debugger page plans."""

import struct

MAX_METADATA_SIZE = 4 * 1024 * 1024
MAX_PAGE_PLAN_SIZE = 1024 * 1024
ARM64_PAGE_SIZE = 16384
PAGE_PLAN_BREAK = struct.pack('<I', 0xD4200000 | (1337 << 5))


def uleb(data, cursor, end=None):
    end = len(data) if end is None else end
    value = 0
    for shift in range(0, 70, 7):
        if cursor >= end:
            raise ValueError('truncated ULEB128')
        byte = data[cursor]
        cursor += 1
        if shift == 63 and byte > 1:
            raise ValueError('ULEB128 overflow')
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, cursor
    raise ValueError('ULEB128 overflow')


def regular_export_offset(data, name):
    """Resolve a regular export; do not guess through reexports/resolvers."""
    cursor, visited = 0, set()
    while cursor not in visited:
        visited.add(cursor)
        size, terminal = uleb(data, cursor)
        children = terminal + size
        if children >= len(data):
            raise ValueError('export node exceeds trie')
        if not name and size:
            flags, value_cursor = uleb(data, terminal, children)
            if flags & ~0x04:  # Ordinary or weak regular export only.
                raise ValueError(f'unsupported export flags {flags:#x}')
            offset, value_cursor = uleb(data, value_cursor, children)
            if value_cursor != children:
                raise ValueError('unexpected export terminal data')
            return offset
        count, edge_cursor = data[children], children + 1
        match = None
        for _ in range(count):
            edge_end = data.find(b'\0', edge_cursor)
            if edge_end < 0:
                raise ValueError('unterminated export edge')
            edge = data[edge_cursor:edge_end]
            child, edge_cursor = uleb(data, edge_end + 1)
            if not edge or child >= len(data):
                raise ValueError('invalid export edge')
            if name.startswith(edge):
                if match is not None:
                    raise ValueError('ambiguous export edge')
                match = child, name[len(edge):]
        if match is None:
            raise ValueError('export not found')
        cursor, name = match
    raise ValueError('export trie cycle')


def export_layout(header, commands, base):
    if len(header) != 32:
        raise ValueError('invalid Mach-O header size')
    magic, cpu, _, _, count, size, _, _ = struct.unpack('<8I', header)
    if magic != 0xFEEDFACF or cpu != 0x0100000C:
        raise ValueError('export fallback requires arm64 Mach-O')
    if size != len(commands) or size > MAX_METADATA_SIZE or count > size // 8:
        raise ValueError('invalid Mach-O command bounds')
    segments, exports, cursor = [], [], 0
    for _ in range(count):
        if cursor + 8 > size:
            raise ValueError('truncated load command')
        command, length = struct.unpack_from('<II', commands, cursor)
        if length < 8 or cursor + length > size:
            raise ValueError('invalid load command size')
        if command == 0x19:
            if length < 72:
                raise ValueError('truncated segment command')
            segments.append(struct.unpack_from('<II16sQQQQiiII', commands, cursor))
        elif command == 0x80000033:
            if length < 16:
                raise ValueError('truncated exports command')
            exports.append(struct.unpack_from('<II', commands, cursor + 8))
        elif command in (0x22, 0x80000022):
            if length < 48:
                raise ValueError('truncated dyld info command')
            offset, export_size = struct.unpack_from('<II', commands, cursor + 40)
            if export_size:
                exports.append((offset, export_size))
        cursor += length
    if cursor != size:
        raise ValueError('unexpected bytes after load commands')
    # A shared-cache image's __TEXT file offset is relative to the cache and
    # need not be zero. Its live Mach-O header still anchors the __TEXT slide.
    text = [s for s in segments if s[2].rstrip(b'\0') == b'__TEXT']
    if len(text) != 1 or len(exports) != 1:
        raise ValueError('expected one __TEXT and one export trie')
    slide = base - text[0][3]
    offset, export_size = exports[0]
    if not 0 < export_size <= MAX_METADATA_SIZE:
        raise ValueError('invalid export trie size')
    covering = [s for s in segments if s[5] <= offset and offset + export_size <= s[5] + s[6]]
    if len(covering) != 1:
        raise ValueError('export trie outside file-backed segments')
    segment = covering[0]
    address = slide + segment[3] + offset - segment[5]
    executable_ranges = [(s[3] + slide, s[3] + slide + s[4]) for s in segments if s[8] & 4]
    return address, export_size, executable_ranges


def page_plan_writes(data):
    """Decode Frida's packed plan before applying any debugger-side write.

    Protocol: frida-core/src/fruity/debugger-mappings.vala. Each pair of
    adjacent 16-KiB pages is touched with one boundary write of original bytes.
    """
    if not 4 <= len(data) <= MAX_PAGE_PLAN_SIZE:
        raise ValueError('invalid page plan size')
    blocks, = struct.unpack_from('<I', data)
    cursor, writes = 4, []
    if blocks > (len(data) - 4) // 13:
        raise ValueError('invalid page plan block count')
    for _ in range(blocks):
        if cursor + 12 > len(data):
            raise ValueError('truncated page plan block')
        start, pages = struct.unpack_from('<QI', data, cursor)
        cursor += 12
        if not start or start % ARM64_PAGE_SIZE or not pages or cursor + pages > len(data):
            raise ValueError('invalid page plan block')
        if start + pages * ARM64_PAGE_SIZE > 1 << 64:
            raise ValueError('page plan address overflow')
        for index in range(0, pages, 2):
            length = min(2, pages - index)
            address = start + index * ARM64_PAGE_SIZE + ARM64_PAGE_SIZE - 1
            writes.append((address, data[cursor + index:cursor + index + length]))
        cursor += pages
    if cursor != len(data):
        raise ValueError('trailing page plan bytes')
    return writes
