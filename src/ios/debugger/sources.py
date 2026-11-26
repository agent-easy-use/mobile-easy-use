"""Load optional Host symbols once and resolve source breakpoints through LLDB."""

import json
import os

import lldb


def command(debugger, text):
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(text, result)
    if not result.Succeeded():
        raise RuntimeError((result.GetError() or result.GetOutput()).strip())


class Sources:
    def __init__(self, debugger, symbols):
        self.target = debugger.GetSelectedTarget()
        self.symbol_load_errors = []
        # LLDB discovers local debug-map objects/dSYMs itself. Explicit Host paths
        # are loaded once per session, in order, even if an earlier entry fails.
        for entry in symbols:
            try:
                command(debugger, "target symbols add " + json.dumps(entry["resolvedPath"], ensure_ascii=False))
            except RuntimeError as error:
                self.symbol_load_errors.append({**entry, "message": str(error)})

    def breakpoint(self, file, line):
        if not os.path.isabs(file) or not os.path.isfile(file):
            raise ValueError("Source file must be an existing absolute Host path")
        return self.target.BreakpointCreateByLocation(
            lldb.SBFileSpec(file), line, 0, 0, lldb.SBFileSpecList(), False)
