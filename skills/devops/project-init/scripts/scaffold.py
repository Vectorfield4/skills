#!/usr/bin/env python3
"""Deterministic FSD scaffold: dirs + .gitkeep + package.json. Init step 3."""

import sys
from pathlib import Path

TARGET = Path(sys.argv[1])
NAME = sys.argv[2]
SCRIPT_DIR = Path(__file__).resolve().parent

# Empty layers/segments carry .gitkeep so the structure commits.
GITKEEP_DIRS = [
    "src/pages",
    "src/features",
    "src/entities",
    "src/widgets",
    "src/shared/ui",
    "src/shared/design",
    "src/shared/config",
    "src/shared/data",
    "src/shared/hooks",
    "src/shared/i18n",
    "src/shared/mocks/fixtures",
    "src/shared/types",
    "src/shared/api",
    "src/shared/lib",
    "src/shared/assets/images",
    "stories",
]
PLAIN_DIRS = [
    "src/app/layouts",
    "src/app/styles",
    "test",
    "public",
]

for rel in GITKEEP_DIRS + PLAIN_DIRS:
    (TARGET / rel).mkdir(parents=True, exist_ok=True)
    if rel in GITKEEP_DIRS:
        (TARGET / rel / ".gitkeep").touch()

pkg = (SCRIPT_DIR.parent / "references/package.json").read_text()
(TARGET / "package.json").write_text(pkg.replace("<project_name>", NAME))

# .gitignore
gitignore = """node_modules/
dist/
.astro/
.env
.env.*
*.log
npm-debug.log*
coverage/
.storybook-static/
"""
(TARGET / ".gitignore").write_text(gitignore)