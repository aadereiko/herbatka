# herbatka-vision

Recognising a tea from a photograph of its tin, and turning it into a `Tea` row.

Separate from `api/` on purpose: the CV stack is hundreds of megabytes that have no
business in the API image or its lockfile. The two share a schema by copying enum values
(see `herbatka_vision/schema.py`), not by importing each other.

## Constraints this is built under

- **Free.** Everything here is open weights and permissively licensed — no per-call cost,
  no API key, no vendor. Note that Ultralytics YOLO is **AGPL-3.0**; if a detector is ever
  needed, prefer YOLOX, MMDetection or torchvision (Apache-2.0 / BSD).
- **Deployable anywhere.** ONNX/CPU, offline, in a container or on a phone.
- **The user can be asked to centre the tin.** This is a bigger simplification than it
  looks, and notebook 01 exists to find out how big.

## Layout

```
herbatka_vision/
  schema.py     what a model may say it saw, pinned to the api/ catalogue enums
  crops.py      three ways to get the tin out of the frame, cheapest first
notebooks/
  01-does-the-tin-need-finding.ipynb
data/raw/       your photographs (gitignored)
outputs/        figures (gitignored)
```

## Running it

```bash
cd vision
uv sync                 # core + dev + ocr (~90 MB of onnxruntime; --no-default-groups to skip)
uv run jupyter lab      # or `make vision` from the repository root
```

### In VS Code

Install the **Python** and **Jupyter** extensions, open
`notebooks/01-does-the-tin-need-finding.ipynb`, then use the kernel picker in the top
right → *Select Another Kernel* → *Python Environments* → `vision/.venv`.

That last step matters because this repository has two virtualenvs — `api/.venv` and
`vision/.venv` — and VS Code will not guess correctly between them. If the first cell
raises `ModuleNotFoundError: herbatka_vision`, the wrong one is selected.

Notebook paths are anchored on `herbatka_vision.paths`, not on the working directory, so
it behaves the same under VS Code, JupyterLab and a plain shell.

## The plan, in order

1. **Crop** — is a learned segmenter worth it at all, given centred photographs?
   *Notebook 01. The answer is allowed to be no.*
2. **Read** — OCR → a small local LLM with grammar-constrained decoding → `TinReading`.
3. **Resolve** — `TinReading` → an existing `Brand`/`Tea`, or a new unapproved one.
   Entity resolution: `"TWININGS of London"`, `"Twinings"` and `"Twinings Earl Grey Tea"`
   are one brand and one tea.
4. **Cache** — embed each photograph so a tin that has been seen before skips steps 2–3
   entirely. The embedder is a cache key, not a classifier: the catalogue is open-ended,
   so recognition has to be *reading*, and matching is only ever an optimisation.

Step 3 is where the real errors will live. Step 1 is where it is tempting to spend a month.

## The bit that was already built

`api/app/models/catalog.py` has `Tea.is_approved` and `Tea.created_by_id` — user-submitted
teas that an admin promotes. That is exactly the human-in-the-loop step an uncertain
reading needs, so a low-confidence extraction is not a new feature: it is an unapproved
`Tea` with `created_by_id` set, going through the moderation queue that already exists.

`TinReading.is_confident()` is the gate.
