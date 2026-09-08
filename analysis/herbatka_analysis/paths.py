"""Where things live, derived from the package rather than from the working directory.

Same reasoning as ``herbatka_vision.paths``: ``Path.cwd()`` differs between JupyterLab,
VS Code, ``python -m`` and pytest, so a notebook anchored on it works in whichever one it
was written in and silently misses the file in the others. ``__file__`` is stable.
"""

from pathlib import Path

#: analysis/herbatka_analysis/paths.py -> analysis/
ROOT = Path(__file__).resolve().parent.parent

#: The repository root, where the single shared .env lives.
REPO_ROOT = ROOT.parent

OUTPUTS = ROOT / "outputs"


def ensure() -> None:
    """Create the directories a notebook writes into. Safe to call repeatedly."""
    OUTPUTS.mkdir(parents=True, exist_ok=True)
