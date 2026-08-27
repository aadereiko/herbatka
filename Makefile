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

migrate: ## Apply migrations
	cd api && uv run alembic upgrade head

revision: ## Autogenerate a migration: make revision m="add teas"
	cd api && uv run alembic revision --autogenerate -m "$(m)"

downgrade: ## Roll back one migration
	cd api && uv run alembic downgrade -1

admin: ## Promote a user to admin: make admin e=ada@example.com
	cd api && uv run python -m app.cli promote-admin "$(e)"

people: ## Dev only: create some friends for you. make people e=you@example.com
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

.PHONY: help db db-down db-reset adminer api web install migrate revision downgrade admin people seed test-db-drop test lint dev
