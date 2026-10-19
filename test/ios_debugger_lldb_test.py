"""Separate direct-SBValue earlyReturn check; not part of the default test suite.

xcrun swiftc -g -Onone test/fixtures/ios-debugger.swift -o /tmp/meu-debugger-return
MEU_DEBUGGER_TEST_BINARY=/tmp/meu-debugger-return xcrun lldb --batch \
  -o 'command script import test/ios_debugger_lldb_test.py' -o meu-debugger-test

A failure here is the pending LLDB return verification, never a request to patch registers.
"""
import os
from pathlib import Path
import sys
import lldb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/ios/debugger'))
from values import HitContext


def run(debugger, command, result, internal_dict):
    debugger.SetAsync(False)
    target = debugger.CreateTarget(os.environ['MEU_DEBUGGER_TEST_BINARY'])
    source = ROOT / 'test/fixtures/ios-debugger.swift'
    breakpoints = []
    for marker in ['// BREAKPOINT', '// DOUBLE_BREAKPOINT', '// BOOL_BREAKPOINT', '// WIDE_BREAKPOINT']:
        line = next(i for i, text in enumerate(source.read_text().splitlines(), 1) if marker in text)
        breakpoints.append(target.BreakpointCreateByLocation(str(source), line))
    process = target.LaunchSimple(None, ['MEU_DEBUGGER_CHECK=1', 'MEU_DEBUGGER_CHECK_SCALARS=1'], str(ROOT))
    try:
        for bp, code in zip(breakpoints, ['200', '3.5', 'false', 'Int64.max']):
            assert process.GetState() == lldb.eStateStopped
            HitContext(process.GetSelectedThread()).early_return(code)
            assert target.BreakpointDelete(bp.GetID())
            assert process.Continue().Success()
        assert process.GetState() == lldb.eStateExited
        assert process.GetExitStatus() == 0, 'Caller received the wrong native return value'
        result.AppendMessage('PASS: direct Swift SBValue returns')
    finally:
        if process.GetState() != lldb.eStateExited:
            process.Kill()


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('command script add -f ios_debugger_lldb_test.run meu-debugger-test')
