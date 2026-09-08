# herbatka-analysis

The catalogue and the ledger, treated as data. First question: **are teas usefully similar
to each other in ingredient space?**

Separate from `api/` for the same reason `vision/` is — a notebook stack does not belong in
the API's image or its lockfile. This is the cheap sibling of the two: no torch, no opencv,
nothing that takes a coffee break to install.

## What is here, and what is deliberately not

`herbatka_analysis/db.py` is written. Connecting to Postgres is not data science, and
fighting a driver name for an hour teaches nothing about tea.

Notebook 01 is a **plan with stubs**. Sections 1 and 7 run; sections 2–6 raise
`NotImplementedError` and carry hints. That is on purpose: the notebook contains exactly
four decisions worth making by hand —

1. what a cell of the matrix means (presence? percentage? what does a null percentage mean?)
2. how to weight a common ingredient against a rare one, at N = 23 where IDF is noisy
3. why cosine rather than Euclidean
4. how you would know the result was bad, given that nobody has labelled which teas are similar

— and `sklearn.feature_extraction.text.TfidfVectorizer` would make all four of them for you,
silently, in one line.

There is no scikit-learn dependency yet for that reason. Add it when something needs
cross-validation, not before.

## Layout

```
herbatka_analysis/
  paths.py      where things live, anchored on the package rather than on cwd
  db.py         a read-only sync engine + the three tables notebook 01 needs
notebooks/
  01-teas-as-ingredient-vectors.ipynb
outputs/        figures and exported CSVs (gitignored)
```

## Running it

```bash
make db && make seed        # from the repository root, if not already done
cd analysis
uv sync
uv run jupyter lab          # or `make analysis` from the repository root
```

### In VS Code

This repository now has **three** virtualenvs — `api/.venv`, `vision/.venv` and
`analysis/.venv` — and the kernel picker will not guess between them. Kernel picker →
*Select Another Kernel* → *Python Environments* → `analysis/.venv`. A first cell raising
`ModuleNotFoundError: herbatka_analysis` is always this.

## The database connection

`api/` uses `postgresql+asyncpg` because FastAPI wants an async engine. A notebook does not:
every cell would need `await`, and `pandas.read_sql` cannot take an async connection at all.
So `db.py` keeps its own sync engine over `psycopg`, built from the same `DATABASE_URL` in the
repository-root `.env` with the driver swapped. One connection string, no duplicated
credentials.

The engine sets `default_transaction_read_only` on the connection. A notebook is a place where
`df.to_sql(...)` is one tab-completion away from overwriting a table you spent an evening
seeding, and this makes Postgres refuse rather than rely on your discipline.

## How a result gets into the app

Whatever ships must leave numpy behind at the boundary. For tea similarity that is easy: 23
teas × 5 neighbours is 115 rows, so it precomputes into a `tea_similarity` table and
`GET /teas/{slug}/similar` becomes an indexed select in `app/services/catalog.py`. No model at
request time, no CV stack in the API image — the same constraint `vision/README.md` states,
honoured the cheap way.

The rule, for anything later: a model reaches production either as a **precomputed table** or
as **plain float coefficients** read by a pure function in `app/services/`. Never as an import.

## The plan, in order

1. **Similar teas** — the tea × ingredient matrix, weighting, cosine, and an honest
   evaluation with no labels. *Notebook 01. The answer is allowed to be "not enough
   catalogue yet".*
2. **The flavour map** — the same vectors projected to 2-D with `np.linalg.svd`, as a page.
3. **Days-to-empty** — once `stock_event` holds real rows rather than seed fixtures.
   Rate estimation from 3–5 events, so it wants a prior and an interval rather than a mean.
4. **Taste from ingredient ratings** — predicting a review score from `ingredient_rating`.
   The schema was designed for this (see the comment at `api/app/seed/people.py:115`), but
   14 reviews cannot validate anything. Build the leave-one-out harness now, let it print
   "no better than baseline", and let it start earning its keep as reviews arrive.
