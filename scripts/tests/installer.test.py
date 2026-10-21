#!/usr/bin/env python3
"""Safe offline tests: no apt, systemd, real credentials or database mutations."""
from pathlib import Path
import importlib.util
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "deployment/install.sh"


def function(name, value):
    return subprocess.run(
        ["bash", "-c", 'source "$1"; "$2" "$3"', "_", str(SCRIPT), name, value],
        text=True, capture_output=True,
    )


class InstallerTests(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["bash", "-n", str(SCRIPT)], check=True)
        subprocess.run(["bash", "-n", str(ROOT / "install.sh")], check=True)

    def test_help_does_not_install(self):
        result = subprocess.run(["bash", str(SCRIPT), "--help"],
                                text=True, capture_output=True, check=True)
        self.assertIn("Ubuntu", result.stdout)
        self.assertNotIn("==>", result.stdout)
        wrapper = subprocess.run(["bash", str(ROOT / "install.sh"), "--help"],
                                 text=True, capture_output=True, check=True)
        self.assertIn("скачивания", wrapper.stdout)

    def test_source_detection(self):
        self.assertEqual(function("project_sources_present", str(ROOT)).returncode, 0)
        with tempfile.TemporaryDirectory() as folder:
            self.assertNotEqual(function("project_sources_present", folder).returncode, 0)

    def test_ssl_email(self):
        for email in ["owner@example.com", "site+ssl@example.co.uk"]:
            self.assertEqual(function("validate_email", email).returncode, 0)
        for email in ["", "bad", "x@@example.com", "x@example.com\n}", "x@localhost",
                      'x"@example.com', "x@example.com;id"]:
            self.assertNotEqual(function("validate_email", email).returncode, 0)

    def test_source_copy_keeps_dependencies_out_and_does_not_touch_origin(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source, target = base / "origin", base / "target"
            source.mkdir()
            target.mkdir()
            for file in ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
                         "tsconfig.json", "tsconfig.base.json"]:
                (source / file).write_text("test fixture")
            for directory in ["artifacts/broker-check", "artifacts/api-server",
                              "lib", "scripts", "deployment"]:
                (source / directory).mkdir(parents=True, exist_ok=True)
            (source / "artifacts/broker-check/source.ts").write_text("fixture source")
            for filename in [".env", "runtime.env", "test.dump", "test.backup"]:
                (source / "lib" / filename).write_text("invented sensitive fixture")
            for directory in ["node_modules", "dist", ".git"]:
                (source / "lib" / directory).mkdir()
                (source / "lib" / directory / "excluded.txt").write_text("excluded")
            subprocess.run(
                ["bash", "-c", 'source "$1"; as_app() { "$@"; }; copy_project_sources "$2" "$3"',
                 "_", str(SCRIPT), str(source), str(target)],
                check=True, capture_output=True, text=True,
            )
            self.assertTrue((target / "artifacts/broker-check/source.ts").is_file())
            self.assertEqual(list((target / "lib").iterdir()), [])
            self.assertTrue((source / "lib/.env").is_file())

    def test_configuration_with_and_without_ssl_email(self):
        for email in ["", "ssl@example.com"]:
            with tempfile.TemporaryDirectory() as folder:
                config = Path(folder) / "config"
                subprocess.run(
                    ["bash", "-c",
                     'source "$1"; CONFIG="$2"; DOMAIN=check.example.com; SSL_EMAIL="$3"; '
                     'ADMIN_LOGIN=testadmin; ADMIN_PASS=\'invented "$test" password\'; '
                     'ADMIN_PASS_CONFIRM="$ADMIN_PASS"; write_config',
                     "_", str(SCRIPT), str(config), email],
                    check=True, text=True, capture_output=True,
                )
                public = (config / "Caddyfile").read_text()
                self.assertIn("check.example.com", public)
                self.assertIn("127.0.0.1:3100", public)
                self.assertNotIn("ADMIN_PASSWORD", public)
                self.assertEqual("email ssl@example.com" in public, bool(email))
                private = config / "runtime.env"
                self.assertEqual(private.stat().st_mode & 0o777, 0o600)
                self.assertTrue('HOST="127.0.0.1"' in private.read_text())

    def test_valid_domains(self):
        for value in ["example.com", "check.example.com", "xn--e1afmkfd.xn--p1ai", "a-b.example"]:
            with self.subTest(value=value):
                self.assertEqual(function("validate_domain", value).returncode, 0)

    def test_reject_bad_domains_and_injection(self):
        for value in ["", "localhost", "127.0.0.1", "https://example.com",
                      "example.com/path", "x..com", "-bad.com", "bad-.com",
                      "example.com.", "x.com;touch /tmp/should-never-exist",
                      "$(id).com", "пример.рф", "a" * 64 + ".com", "x.com\nid"]:
            with self.subTest(value=value):
                self.assertNotEqual(function("validate_domain", value).returncode, 0)

    def test_valid_repos(self):
        for value in ["https://github.com/owner/repo", "https://github.com/owner/repo.git",
                      "https://github.com/my-team/broker_check/"]:
            self.assertEqual(function("validate_repo", value).returncode, 0)

    def test_reject_unsafe_repos(self):
        for value in ["git@github.com:owner/repo", "https://token@github.com/o/r",
                      "https://github.com/o/r/tree/main", "https://github.com/o/r?token=test",
                      "https://evil.example/o/r", "https://github.com/o/../r",
                      "file:///tmp/repo", "https://github.com/o/r;id"]:
            self.assertNotEqual(function("validate_repo", value).returncode, 0)

    def test_environment_escaping(self):
        # All values below are invented test fixtures, never live credentials.
        for value in ['plain-test-value', 'test "quoted" value', r'test\backslash',
                      "test$literal#%value", "  test spaces  ", "тестовая строка"]:
            result = subprocess.run(
                ["bash", "-c", 'source "$1"; env_line FIXTURE "$2"', "_", str(SCRIPT), value],
                text=True, capture_output=True, check=True,
            )
            expected = 'FIXTURE="' + value.replace("\\", "\\\\").replace('"', '\\"') + '"\n'
            self.assertEqual(result.stdout, expected)

    def test_archive_exclusions(self):
        spec = importlib.util.spec_from_file_location("export_source", ROOT / "scripts/export-source.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertIn(".dump", module.EXCLUDED_SUFFIXES)
        self.assertIn(".key", module.EXCLUDED_SUFFIXES)
        for folder in ["attached_assets", ".agents", "node_modules", ".git"]:
            self.assertIn(folder, module.EXCLUDED_DIRS)
        self.assertNotIn("artifacts/mockup-sandbox", module.TREES)
        self.assertTrue(module.eligible(ROOT / "artifacts/broker-check/src/App.tsx"))
        self.assertIn("install.sh", module.ROOT_FILES)


if __name__ == "__main__":
    unittest.main(verbosity=2)
