"""Where things live, derived from the package rather than from the working directory.

``Path.cwd()`` is not a reliable anchor for a notebook. JupyterLab, VS Code, a plain
``python -m`` and a pytest run each set it differently, and a notebook that resolves its
data directory relative to cwd works in whichever one it was written in and silently reads
an empty directory in the others.

``__file__`` is stable under all of them, and ``uv sync`` installs this package editable,
so these point at the real source tree rather than at a copy in site-packages.
"""

from pathlib import Path

#: vision/herbatka_vision/paths.py -> vision/
ROOT = Path(__file__).resolve().parent.parent

DATA = ROOT / "data"
RAW = DATA / "raw"
OUTPUTS = ROOT / "outputs"

#: Hand-written ground truth: {"filename.jpg": "text as printed on the tin"}.
TRANSCRIPTS = DATA / "transcripts.json"


def ensure() -> None:
    """Create the directories a notebook writes into. Safe to call repeatedly."""
    RAW.mkdir(parents=True, exist_ok=True)
    OUTPUTS.mkdir(parents=True, exist_ok=True)
