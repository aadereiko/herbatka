.DEFAULT_GOAL := help
SHELL := /bin/bash

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

db: ## Start Postgres and wait for it to be healthy
	docker compose up -d --wait db

db-down: ## Stop Postgres (keeps the volume)
	docker compose down

db-reset: ## Destroy the database volume and start fresh
	docker compose down -v && $(MAKE) db && $(MAKE) migrate

adminer: ## Start Adminer alongside the DB
	docker compose --profile tools up -d --wait

api: ## Run the API with reload
	cd api && uv run uvicorn app.main:app --reload --port $${API_PORT:-17311}

web: ## Run the Vite dev server
	cd web && npm run dev

install: ## Install all dependencies
	cd api && uv sync
	cd web && npm install
	cd analysis && uv sync

migrate: ## Apply migrations
	cd api && uv run alembic upgrade head

revision: ## Autogenerate a migration: make revision m="add teas"
	cd api && uv run alembic revision --autogenerate -m "$(m)"

downgrade: ## Roll back one migration
	cd api && uv run alembic downgrade -1

admin: ## Promote a user to admin: make admin e=ada@example.com
	cd api && uv run python -m app.cli promote-admin "$(e)"

people: ## Dev only: create some friends for you. make people e=you@example.com (an id works too)
	cd api && uv run python -m app.seed.people "$(e)"

seed: ## Load starter ingredients and teas
	cd api && uv run python -m app.seed

test-db-drop: ## Drop the test database (it is recreated on the next test run)
	docker compose exec -T db psql -U $${POSTGRES_USER:-herbatka} -d postgres -c 'DROP DATABASE IF EXISTS herbatka_test'

test: ## Run backend and frontend tests
	cd api && uv run pytest -q
	cd web && npm run test -- --run

lint: ## Lint and typecheck everything
	cd api && uv run ruff check . && uv run ruff format --check .
	# tsc -b, not tsc --noEmit: this project uses solution-style tsconfig references,
	# and --noEmit against a config with no `files` silently checks nothing at all.
	cd web && npm run lint && npx tsc -b

dev: db migrate ## Start the database, migrate, then run api + web together
	@echo "→ api  http://localhost:$${API_PORT:-17311}/docs"
	@echo "→ web  http://localhost:$${WEB_PORT:-17310}"
	@trap 'kill 0' EXIT INT TERM; \
	( cd api && uv run uvicorn app.main:app --reload --port $${API_PORT:-17311} ) & \
	( cd web && npm run dev ) & \
	wait

# Everything `dev` does, plus binding both servers to every interface so a phone
# on the same Wi-Fi can open the app. Separate target rather than a flag on `dev`,
# and that is the whole point of it:
#
#   `make dev` binds 127.0.0.1. The API has no rate limiting, its dev JWT secret is
#   the one checked into .env.example, and behind it is a Postgres full of
#   hand-entered real data. On 0.0.0.0 all of that is reachable by anything on the
#   network — the hotel Wi-Fi, the coworking Wi-Fi, the neighbour's kid. That is
#   sometimes exactly what you want and it is never something you should get by
#   accident, so it is a different word you have to type on purpose.
#
# The frontend still talks to the API through Vite's proxy, so the phone only ever
# speaks to one origin and CORS never enters into it. Widening CORS_ORIGINS is only
# needed if you point the app straight at the API with VITE_API_BASE_URL — see the
# note in .env.example.
dev-lan: db migrate ## Opt-in: `make dev`, but bound to the LAN so a phone can reach it
	@ip=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null \
	      || hostname -I 2>/dev/null | awk '{print $$1}'); \
	if [ -z "$$ip" ]; then echo "Could not work out this machine's LAN address." >&2; exit 1; fi; \
	echo ""; \
	echo "  ⚠  Both servers are bound to 0.0.0.0. Every device on this network can"; \
	echo "     reach the API and the dev database behind it. Ctrl-C when you are done."; \
	echo ""; \
	echo "  → on this phone:  http://$$ip:$${WEB_PORT:-17310}"; \
	echo "  → api:            http://$$ip:$${API_PORT:-17311}/docs"; \
	echo ""; \
	echo "     No service worker and no install prompt over plain http — browsers"; \
	echo "     only allow those on https or localhost. See web/CAPACITOR.md."; \
	echo ""; \
	trap 'kill 0' EXIT INT TERM; \
	( cd api && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port $${API_PORT:-17311} ) & \
	( cd web && npm run dev -- --host ) & \
	wait

vision: ## Run JupyterLab for the tin-recognition experiments
	cd vision && uv run --group dev jupyter lab

analysis: ## Run JupyterLab for the catalogue analysis notebooks
	cd analysis && uv run --group dev jupyter lab

.PHONY: help db db-down db-reset adminer api web install migrate revision downgrade admin people seed test-db-drop test lint dev dev-lan vision analysis
