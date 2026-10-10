"""Validate LLDB-discovered main-module debug information and create source breakpoints."""

import json
import os

import lldb


def command(debugger, text):
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(text, result)
    if not result.Succeeded():
        raise RuntimeError((result.GetError() or result.GetOutput()).strip())


class Sources:
    def __init__(self, debugger, build):
        self.target = debugger.GetSelectedTarget()
        executable = self.target.GetExecutable()
        module = self.target.FindModule(executable)
        if not module.IsValid():
            raise RuntimeError(f"Main executable module is unavailable: {executable}")

        # Read line tables first, allowing LLDB to discover/load symbols before trying path hints.
        if self.has_line_tables(module):
            self.symbol_source = "lldb"
            return
        failures = []
        for key in ("dsymPath", "executable"):
            path = build.get(key)
            if not path:
                continue
            if not os.path.exists(path):
                failures.append(f"{key} is unavailable on Host: {path}")
                continue
            try:
                # LLDB checks UUID compatibility; command success still requires usable main-module line tables.
                command(debugger, "target symbols add " + json.dumps(path))
                if self.has_line_tables(module):
                    self.symbol_source = key
                    return
                failures.append(f"{key}: no usable main executable line tables after loading {path}")
            except RuntimeError as error:
                failures.append(f"{key}: {error}")
        raise RuntimeError(
            f"Main executable debug information is unavailable: {executable}; "
            f"UUID: {module.GetUUIDString() or 'unknown'}. "
            "No usable compile-unit line tables were found. Make a matching dSYM "
            "discoverable by LLDB on the Host (e.g. through Spotlight)."
            + (" Configured paths: " + "; ".join(failures) if failures else ""))

    @staticmethod
    def has_line_tables(module):
        return any(unit.GetNumLineEntries() for unit in module.compile_units)

    def breakpoint(self, file, line):
        if not os.path.isabs(file) or not os.path.isfile(file):
            raise ValueError("Source file must be an existing absolute Host path")
        return self.target.BreakpointCreateByLocation(
            lldb.SBFileSpec(file), line, 0, 0, lldb.SBFileSpecList(), False)
