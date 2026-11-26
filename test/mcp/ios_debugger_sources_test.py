"""Device-free checks: python3 -m unittest discover -s test/mcp -p ios_debugger_sources_test.py."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('debugger_sources', Path(__file__).resolve().parents[2] / 'src/ios/debugger/sources.py')
sources = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'lldb': types.SimpleNamespace()}):
    spec.loader.exec_module(sources)


class SourcesTest(unittest.TestCase):
    def test_no_paths_needs_no_main_module_line_tables(self):
        debugger = Mock()
        with patch.object(sources, 'command') as command:
            result = sources.Sources(debugger, [])
        command.assert_not_called()
        self.assertEqual(result.symbol_load_errors, [])
        self.assertEqual(debugger.GetSelectedTarget.return_value.mock_calls, [])

    def test_failed_entries_do_not_block_later_entries_and_paths_are_quoted(self):
        debugger = Mock()
        entries = [
            {'path': './bad.dSYM', 'resolvedPath': '/config/bad.dSYM'},
            {'path': './good.dSYM', 'resolvedPath': '/config/good.dSYM'},
            {'path': './bad.dSYM', 'resolvedPath': '/config/bad.dSYM'},
            {'path': '/符号 good "two".dSYM', 'resolvedPath': '/符号 good "two".dSYM'},
        ]
        with patch.object(sources, 'command', side_effect=[RuntimeError('missing'), None, RuntimeError('missing again'), None]) as command:
            result = sources.Sources(debugger, entries)
            self.assertEqual(result.symbol_load_errors, [
                {**entries[0], 'message': 'missing'}, {**entries[2], 'message': 'missing again'},
            ])
            self.assertEqual([call.args[1] for call in command.call_args_list], [
                'target symbols add ' + sources.json.dumps(entry['resolvedPath'], ensure_ascii=False) for entry in entries
            ])



if __name__ == '__main__':
    unittest.main()
