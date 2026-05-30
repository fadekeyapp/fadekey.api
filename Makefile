.PHONY: help dev dev-api dev-web build docker-up docker-down db-migrate db-studio clean

# Default target
help:
	@echo ""
	@echo "  FadeKey — available targets"
	@echo ""
	@echo "  Development"
	@echo "    make dev          Start API + Web in parallel"
	@echo "    make dev-api      Start API only"
	@echo "    make dev-web      Start Web only"
	@echo ""
	@echo "  Build"
	@echo "    make build        Build both apps"
	@echo ""
	@echo "  Docker"
	@echo "    make docker-up    Start full stack (postgres + redis + api + web)"
	@echo "    make docker-down  Stop and remove containers"
	@echo "    make docker-logs  Tail container logs"
	@echo ""
	@echo "  Database"
	@echo "    make db-migrate   Run Prisma migrations"
	@echo "    make db-studio    Open Prisma Studio"
	@echo ""
	@echo "  Misc"
	@echo "    make install      npm install in all workspaces"
	@echo "    make clean        Remove all node_modules and dist dirs"
	@echo ""

install:
	npm install

dev:
	@echo "Starting API and Web..."
	@npm run dev:api & npm run dev:web

dev-api:
	npm run dev:api

dev-web:
	npm run dev:web

build:
	npm run build

# ── Docker ────────────────────────────────────────────────────────────────────

docker-up:
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example — please set JWT secrets before continuing." && exit 1)
	docker compose up --build -d
	@echo "✓  Stack running"
	@echo "   Frontend → http://localhost:3000"
	@echo "   API      → http://localhost:3001"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# ── Database ──────────────────────────────────────────────────────────────────

db-migrate:
	cd apps/api && npx prisma migrate dev

db-studio:
	cd apps/api && npx prisma studio

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	rm -rf apps/api/node_modules apps/api/dist
	rm -rf apps/web/node_modules apps/web/.nuxt apps/web/.output
	rm -rf node_modules
