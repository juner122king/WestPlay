"""Exercise staging and explicit deployment with fake files; never build or touch installed games."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("build_plugin", Path(__file__).parents[1] / "build_plugin.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class PluginResourcesTests(unittest.TestCase):
    def run_build(self, root, deploy=False, probe=True):
        dll = root / "target/x86_64-pc-windows-gnullvm/release/westplay.dll"
        dll.parent.mkdir(parents=True)
        dll.write_bytes(b"test plugin")
        if probe:
            helper = root / "target/release/westplay-probe.exe"
            helper.parent.mkdir(parents=True)
            helper.write_bytes(b"test probe")
        ats, ets = root / "ats/plugins", root / "ets/plugins"
        ats.mkdir(parents=True)
        ets.mkdir(parents=True)
        with patch.object(builder, "REPO_ROOT", str(root)), patch.object(builder, "ATS_PLUGINS", str(ats)), \
                patch.object(builder, "ETS2_PLUGINS", str(ets)), patch.object(builder.subprocess, "run") as run:
            run.return_value.returncode = 0
            builder.build(deploy=deploy)
        return ats, ets

    def test_default_build_only_stages_and_does_not_deploy(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            ats, ets = self.run_build(root)
            self.assertEqual((root / "target/release/westplay.dll").read_bytes(), b"test plugin")
            self.assertEqual(list(ats.iterdir()) + list(ets.iterdir()), [])

    def test_explicit_deployment_places_the_probe_before_each_plugin(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            copied = []
            copy = builder.safe_copy
            def record(src, dest):
                copied.append(Path(dest).name)
                copy(src, dest)
            with patch.object(builder, "safe_copy", side_effect=record):
                ats, ets = self.run_build(root, deploy=True)
            self.assertEqual(copied, ["westplay-probe.exe", "westplay.dll"] * 2)
            for plugins in (ats, ets):
                self.assertEqual((plugins / "westplay-probe.exe").read_bytes(), b"test probe")
                self.assertEqual((plugins / "westplay.dll").read_bytes(), b"test plugin")

    def test_missing_probe_stops_deployment_without_writing_either_game(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaises(FileNotFoundError):
                self.run_build(root, deploy=True, probe=False)
            self.assertEqual(list((root / "ats/plugins").iterdir()), [])
            self.assertEqual(list((root / "ets/plugins").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
