"""Run with python3 -m unittest discover -s test -p '*_test.py'."""
import importlib.util
from pathlib import Path
import struct
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

sys.modules.setdefault("lldb", types.SimpleNamespace(
    eStateCrashed=8, eStateDetached=9, eStateExited=10))
spec = importlib.util.spec_from_file_location(
    "meu_loader", Path(__file__).parents[1] / "src/ios/load/load_mobile_easy_use.py")
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)


def segment(name, vmaddr, vmsize, fileoff, filesize, prot):
    return struct.pack("<II16sQQQQiiII", 0x19, 72, name, vmaddr, vmsize,
                       fileoff, filesize, prot, prot, 0, 0)


def image(commands):
    data = b"".join(commands)
    return struct.pack("<8I", 0xFEEDFACF, 0x0100000C, 0, 2,
                       len(commands), len(data), 0, 0), data


class MainEntryTest(unittest.TestCase):
    def test_stripped_image_with_slide_and_nontrivial_segment_mapping(self):
        # Deliberately no symbol commands; file offsets and VM offsets differ.
        header, commands = image([
            segment(b"__TEXT", 0x100000000, 0x4000, 0, 0x4000, 5),
            segment(b"__CODE", 0x100010000, 0x4000, 0x4000, 0x4000, 5),
            struct.pack("<IIQQ", 0x80000028, 24, 0x4100, 0),
        ])
        entry = loader.parse_main_entry(header, commands, 0x105000000)
        self.assertEqual(entry["address"], 0x105010100)
        self.assertEqual(entry["slide"], 0x5000000)

    def test_missing_main_is_rejected(self):
        header, commands = image([segment(b"__TEXT", 0x100000000, 0x4000, 0, 0x4000, 5)])
        with self.assertRaisesRegex(loader.LoaderError, "exactly one LC_MAIN"):
            loader.parse_main_entry(header, commands, 0x105000000)
    def test_nonexecutable_entry_is_rejected(self):
        header, commands = image([
            segment(b"__TEXT", 0x100000000, 0x4000, 0, 0x4000, 1),
            struct.pack("<IIQQ", 0x80000028, 24, 0x100, 0),
        ])
        with self.assertRaisesRegex(loader.LoaderError, "executable"):
            loader.parse_main_entry(header, commands, 0x105000000)

    def test_corrupt_command_cannot_overread(self):
        header, commands = image([struct.pack("<II", 0x19, 4096)])
        with self.assertRaisesRegex(loader.LoaderError, "command size"):
            loader.parse_main_entry(header, commands, 0x105000000)


class DlopenCompletionTest(unittest.TestCase):
    def test_image_timeouts_respect_caller_limit(self):
        for image_name, requested, expected in [
            ("MobileEasyUseRuntime.dylib", 90, 60),
            ("MobileEasyUseRuntime.dylib", 30, 30),
            ("MobileEasyUse.dylib", 90, 10),
            ("MobileEasyUse.dylib", 5, 5),
        ]:
            with self.subTest(image=image_name, requested=requested):
                target = MagicMock()
                target.GetTriple.return_value = 'x86_64-apple-ios'
                value = target.EvaluateExpression.return_value
                value.GetError.return_value.Fail.return_value = False
                value.GetError.return_value.GetCString.return_value = None
                value.GetValue.return_value = "0x1234"
                value.GetValueAsUnsigned.return_value = 0x1234
                with patch.object(loader, "expression_options") as options, \
                        patch.object(loader, "loaded_function_address", return_value=0x1234), \
                        patch.object(loader, "wait_for_inferior_call_stop") as wait:
                    loader.load_image_with_sbtarget(target, "/App/" + image_name, requested)
                    options.assert_called_once_with(expected, False)
                    wait.assert_called_once_with(
                        target.GetProcess(), target.GetProcess().GetStopID(True),
                        expected, "direct dlopen")

    def test_expression_failure_is_not_masked_by_mapped_images(self):
        target = MagicMock()
        target.GetTriple.return_value = 'x86_64-apple-ios'
        value = target.EvaluateExpression.return_value
        value.GetError.return_value.Fail.return_value = True
        value.GetError.return_value.GetCString.return_value = "interrupted: SIGSTOP"
        value.GetValue.return_value = None
        with patch.object(loader, "expression_options"), \
                patch.object(loader, "loaded_function_address", return_value=0x1234), \
                patch.object(loader, "loaded_image_state", return_value=("already-loaded", {})):
            with self.assertRaisesRegex(loader.LoaderError, "interrupted: SIGSTOP"):
                loader.load_image_with_sbtarget(target, "/App/Runtime.dylib", 10, True)


if __name__ == "__main__":
    unittest.main()
