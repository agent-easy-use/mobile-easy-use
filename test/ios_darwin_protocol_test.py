import importlib.util
from pathlib import Path
import struct
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / 'src/ios/load'))
from darwin_loader_protocol import export_layout, regular_export_offset, page_plan_writes, uleb


class ProtocolTest(unittest.TestCase):
    def test_page_plan_pair_and_odd_tail_across_multiple_blocks(self):
        plan = struct.pack('<I', 2)
        plan += struct.pack('<QI', 0x40000, 3) + b'abc'
        plan += struct.pack('<QI', 0x80000, 2) + b'de'
        self.assertEqual(page_plan_writes(plan), [
            (0x43fff, b'ab'), (0x4bfff, b'c'), (0x83fff, b'de')])

    def test_empty_page_plan(self):
        self.assertEqual(page_plan_writes(struct.pack('<I', 0)), [])

    def test_page_plan_rejects_truncation_alignment_overflow_and_trailing_data(self):
        for plan in [
            b'', struct.pack('<I', 1),
            struct.pack('<IQI', 1, 0x40000, 2) + b'a',
            struct.pack('<IQI', 1, 0x40001, 1) + b'a',
            struct.pack('<IQI', 1, 0xffffffffffffc000, 2) + b'ab',
            struct.pack('<I', 0) + b'ignored',
        ]:
            with self.subTest(plan=plan), self.assertRaises(ValueError):
                page_plan_writes(plan)

    def test_export_trie_symbol_and_missing_symbol(self):
        trie = b'\x00\x01_dlopen\x00\x0b\x02\x00\x40\x00'
        self.assertEqual(regular_export_offset(trie, b'_dlopen'), 0x40)
        with self.assertRaisesRegex(ValueError, 'not found'):
            regular_export_offset(trie, b'_dlsym')

    def test_export_trie_rejects_cycle_reexport_and_truncation(self):
        for trie in [b'\x00\x01x\x00\x00', b'\x02\x08\x01\x00', b'\x80']:
            with self.subTest(trie=trie), self.assertRaises(ValueError):
                regular_export_offset(trie, b'x' if trie[0] == 0 else b'')
        with self.assertRaisesRegex(ValueError, 'overflow'):
            uleb(b'\xff' * 10, 0)

    def test_export_file_offset_maps_through_linkedit_with_slide(self):
        def segment(name, vmaddr, vmsize, offset, size, protection):
            return struct.pack('<II16sQQQQiiII', 0x19, 72, name, vmaddr, vmsize, offset, size, protection, protection, 0, 0)
        commands = segment(b'__TEXT', 0x1000, 0x4000, 0x5000, 0x4000, 5)
        commands += segment(b'__LINKEDIT', 0x20000, 0x8000, 0x9000, 0x8000, 1)
        commands += struct.pack('<IIII', 0x80000033, 16, 0x9400, 64)
        header = struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 6, 3, len(commands), 0, 0)
        self.assertEqual(export_layout(header, commands, 0x101000), (0x120400, 64, [(0x101000, 0x105000)]))


class ContinuationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fake = sys.modules.setdefault('lldb', types.SimpleNamespace())
        for name, value in {'eStateCrashed': 8, 'eStateDetached': 9, 'eStateExited': 10,
                            'eStopReasonNone': 0, 'eStopReasonInvalid': 1, 'eStopReasonPlanComplete': 2,
                            'eStopReasonException': 3, 'eStopReasonSignal': 4,
                            'eStopReasonBreakpoint': 5,
                            'ePermissionsReadable': 1, 'ePermissionsWritable': 2,
                            'LLDB_INVALID_ADDRESS': (1 << 64) - 1}.items():
            setattr(fake, name, value)
        spec = importlib.util.spec_from_file_location('meu_protocol_loader', ROOT / 'src/ios/load/load_mobile_easy_use.py')
        cls.loader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.loader)

    def test_abort_is_not_accepted_as_completion(self):
        process, thread = MagicMock(), MagicMock()
        process.__iter__.return_value = iter([thread])
        thread.GetStopReason.return_value = self.loader.lldb.eStopReasonSignal
        thread.GetStopDescription.return_value = 'signal SIGABRT'
        thread.GetFrameAtIndex.return_value.GetPC.return_value = 0x1000
        thread.GetFrameAtIndex.return_value.GetSP.return_value = 0x2000
        thread.GetFrameAtIndex.return_value.GetModule.return_value.GetFileSpec.return_value.GetFilename.return_value = 'libsystem_kernel.dylib'
        with self.assertRaisesRegex(self.loader.LoaderError, 'SIGABRT'):
            self.loader.page_plan_thread(process)

    def test_handler_failure_does_not_replay_expression(self):
        target, options, error = MagicMock(), MagicMock(), MagicMock()
        error.Fail.return_value = False
        process = target.GetProcess.return_value
        process.AllocateMemory.return_value = 0x40000
        process.WriteMemory.return_value = 8
        target.EvaluateExpression.return_value.GetError.return_value.Success.return_value = False
        with patch.object(self.loader.lldb, 'SBError', return_value=error, create=True), \
                patch.object(self.loader, 'page_plan_thread', return_value=MagicMock()), \
                patch.object(self.loader, 'service_page_plan', side_effect=self.loader.LoaderError('bad plan')):
            with self.assertRaisesRegex(self.loader.LoaderError, 'bad plan'):
                self.loader.evaluate_dlopen(target, 'dlopen-expression', options, 10, True)
        target.EvaluateExpression.assert_called_once()
        process.Continue.assert_not_called()
        process.DeallocateMemory.assert_not_called()

    def test_unexpected_breakpoint_is_not_accepted(self):
        loader = self.loader
        process, thread = MagicMock(), MagicMock()
        process.__iter__.side_effect = lambda: iter([thread])
        thread.GetStopReason.return_value = loader.lldb.eStopReasonBreakpoint
        thread.GetStopReasonDataCount.return_value = 2
        thread.GetStopReasonDataAtIndex.return_value = (1 << 64) - 6
        thread.GetThreadID.return_value = 100
        frame = thread.GetFrameAtIndex.return_value
        frame.GetPC.return_value = 0x1000
        frame.GetSP.return_value = 0x2000
        with self.assertRaises(loader.LoaderError):
            loader.page_plan_thread(process)
        thread.GetStopReasonDataAtIndex.return_value = 1
        with self.assertRaises(loader.LoaderError):
            loader.page_plan_thread(process)

    def test_page_plan_requires_real_debugger_writes_before_acknowledgement(self):
        loader = self.loader
        frame, thread, process, error = MagicMock(), MagicMock(), MagicMock(), MagicMock()
        error.Fail.return_value = False
        frame.GetPC.return_value = 0x50000
        frame.SetPC.return_value = True
        frame.FindRegister.return_value.SetValueFromCString.return_value = True
        thread.GetFrameAtIndex.return_value = frame
        thread.GetProcess.return_value = process
        plan = struct.pack('<IQI', 1, 0x40000, 2) + b'ab'
        registers = dict(x1=1337, x2=1337, x3=3, x4=len(plan), x5=0x60000)
        def register(name):
            value = MagicMock()
            value.IsValid.return_value = True
            value.GetValueAsUnsigned.return_value = registers.get(name, 0)
            value.SetValueFromCString.return_value = True
            return value
        frame.FindRegister.side_effect = register
        memory = {(0x60000, len(plan)): plan, (0x43fff, 2): b'ab'}
        process.WriteMemory.return_value = 1  # A short write is not success.
        with patch.object(loader.lldb, 'SBError', return_value=error, create=True), \
                patch.object(loader, 'read_memory', side_effect=lambda p, a, n: memory[a, n]):
            with self.assertRaisesRegex(loader.LoaderError, 'write failed'):
                loader.service_page_plan(thread)
        frame.SetPC.assert_not_called()

    def test_continuation_uses_one_call_and_reads_real_handle(self):
        loader = self.loader
        target, options, error = MagicMock(), MagicMock(), MagicMock()
        error.Fail.return_value = False
        process = target.GetProcess.return_value
        process.AllocateMemory.return_value = 0x40000
        process.WriteMemory.return_value = 8
        target.EvaluateExpression.return_value.GetError.return_value.Success.return_value = False
        with patch.object(loader.lldb, 'SBError', return_value=error, create=True), \
                patch.object(loader.lldb, 'SBData', create=True), \
                patch.object(loader.lldb, 'eByteOrderLittle', 4, create=True), \
                patch.object(loader.lldb, 'eBasicTypeVoid', 1, create=True), \
                patch.object(loader, 'page_plan_thread', side_effect=[MagicMock(), None]), \
                patch.object(loader, 'service_page_plan'), \
                patch.object(loader, 'continue_process'), \
                patch.object(loader, 'wait_for_inferior_call_stop'), \
                patch.object(loader, 'read_memory', return_value=struct.pack('<Q', 0x1234)):
            result = loader.evaluate_dlopen(target, 'dlopen-expression', options, 10, True)
            loader.lldb.SBData.CreateDataFromUInt64Array.assert_called_once_with(4, 8, [0x1234])
        target.EvaluateExpression.assert_called_once()
        self.assertEqual(result, target.CreateValueFromData.return_value)
        process.DeallocateMemory.assert_called_once_with(0x40000)
        target.GetDebugger.return_value.SetAsync.assert_any_call(False)

    def test_continuation_timeout_does_not_replay_or_free_pending_result(self):
        loader = self.loader
        target, options, error = MagicMock(), MagicMock(), MagicMock()
        error.Fail.return_value = False
        process = target.GetProcess.return_value
        process.AllocateMemory.return_value = 0x40000
        process.WriteMemory.return_value = 8
        target.EvaluateExpression.return_value.GetError.return_value.Success.return_value = False
        timer = MagicMock()
        def expired_timer(seconds, interrupt):
            timer.start.side_effect = interrupt
            return timer
        with patch.object(loader.lldb, 'SBError', return_value=error, create=True), \
                patch.object(loader, 'page_plan_thread', return_value=MagicMock()), \
                patch.object(loader, 'service_page_plan'), \
                patch.object(loader, 'continue_process'), \
                patch.object(loader.threading, 'Timer', side_effect=expired_timer):
            with self.assertRaisesRegex(loader.LoaderError, 'timed out'):
                loader.evaluate_dlopen(target, 'dlopen-expression', options, 10, True)
        target.EvaluateExpression.assert_called_once()
        process.DeallocateMemory.assert_not_called()
        process.SendAsyncInterrupt.assert_called_once()
        timer.cancel.assert_called_once()
        timer.join.assert_called_once()


if __name__ == '__main__':
    unittest.main()
