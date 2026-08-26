# Herbatka 🍵

Track your teas: what's in them, what you thought of them, and how much is left in
the tin. Households share a shelf; friends share opinions.

**React + TypeScript + Tailwind · FastAPI + SQLAlchemy · PostgreSQL**

> Status: planning. See **[PLAN.md](./PLAN.md)** for the data model, milestones, and
> port allocation. Milestone 0 (walking skeleton) is the next thing to build.

## Ports

Herbatka owns the `1731x` block so it can run alongside Opik and other pet projects:

| | |
|---|---|
| Web | http://localhost:17310 |
| API | http://localhost:17311 (docs at `/docs`) |
| Postgres | `localhost:17312` |
| Adminer | http://localhost:17313 |

## Getting started

```bash
cp .env.example .env
make dev          # postgres + api + web
```

_(`make dev` arrives with M0.)_
