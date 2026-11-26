"""Newline JSON over the LLDB child's stdin/stdout; all other output is diagnostic."""

import json
import os
import select


class Transport:
    def __init__(self):
        # Keep the original stdout pipe exclusively for protocol messages. Native
        # writes to fd 1 (including LLDB/Python prints) now go to Node's stderr.
        self.output = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
        os.dup2(2, 1)
        self.buffer = b""
        self.closed = False

    def send(self, message):
        self.output.write(json.dumps(message, allow_nan=False) + "\n")
        self.output.flush()

    def receive(self):
        if not select.select([0], [], [], 0.02)[0]:
            return []
        chunk = os.read(0, 65536)
        if not chunk:
            self.closed = True
            return []
        self.buffer += chunk
        messages = []
        while b"\n" in self.buffer:
            line, self.buffer = self.buffer.split(b"\n", 1)
            messages.append(json.loads(line))
        if len(self.buffer) > 16 * 1024 * 1024:
            raise ValueError("Debugger request too large")
        return messages

    def close(self):
        self.output.close()
