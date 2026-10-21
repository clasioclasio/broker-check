#!/usr/bin/env python3
"""Create a source-only delivery, never copying secrets or customer data."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated-artifacts" / "downloads"
ROOT_FILES = (
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "tsconfig.json", "tsconfig.base.json", ".npmrc", ".gitignore", "install.sh",
)
TREES = (
    "artifacts/broker-check", "artifacts/api-server", "lib", "scripts", "deployment",
)
EXCLUDED_DIRS = {
    "node_modules", "dist", ".git", ".cache", ".local", "__pycache__",
    "coverage", "generated-artifacts", ".agents", "attached_assets",
}
EXCLUDED_SUFFIXES = {".dump", ".backup", ".log", ".tsbuildinfo", ".pyc", ".pem", ".key"}


def eligible(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return (
        path.is_file() and not path.is_symlink()
        and not (set(rel.parts) & EXCLUDED_DIRS)
        and not path.name.startswith(".env")
        and path.suffix not in EXCLUDED_SUFFIXES
        and path.name not in {"runtime.env", "credentials.json"}
    )


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = OUT / "broker-check-autoinstall.zip"
    files = [ROOT / name for name in ROOT_FILES]
    for tree in TREES:
        # Prune directories rather than walking node_modules.
        import os
        for folder, dirs, names in os.walk(ROOT / tree, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS
                              and not (Path(folder) / d).is_symlink())
            files.extend(Path(folder) / name for name in sorted(names))
    with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(set(files)):
            if eligible(path):
                archive.write(path, path.relative_to(ROOT))
        archive.write(ROOT / "deployment/README.ru.md", "README.ru.md")
    print(f"{source.relative_to(ROOT)}  {source.stat().st_size} bytes  sha256={hashlib.sha256(source.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    build()
