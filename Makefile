.PHONY: help setup install clean test test-all lint format typecheck build build-all docker-build deploy-staging deploy-prod

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Live Ad Detection - Makefile Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

setup: ## Initial project setup
	@echo "$(BLUE)Setting up project...$(NC)"
	@chmod +x scripts/*.sh
	@./scripts/bootstrap.sh

install: ## Install all dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	@echo "Installing Python dependencies..."
	@cd packages/edge-device && pip install -e .
	@cd packages/cloud-api && pip install -e .
	@cd packages/ml-training && pip install -e .
	@cd packages/shared/python-common && pip install -e .
	@echo "Installing frontend dependencies..."
	@cd packages/frontend && npm install
	@echo "$(GREEN)Dependencies installed!$(NC)"

clean: ## Clean build artifacts and caches
	@echo "$(BLUE)Cleaning...$(NC)"
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "build" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete
	@find . -type f -name "*.pyo" -delete
	@cd packages/frontend && rm -rf .next node_modules 2>/dev/null || true
	@echo "$(GREEN)Cleaned!$(NC)"

test: ## Run tests for a specific package (usage: make test PKG=edge-device)
	@if [ -z "$(PKG)" ]; then \
		echo "$(RED)Error: Please specify PKG=<package-name>$(NC)"; \
		echo "Example: make test PKG=edge-device"; \
		exit 1; \
	fi
	@echo "$(BLUE)Running tests for $(PKG)...$(NC)"
	@cd packages/$(PKG) && pytest -v

test-all: ## Run all tests
	@echo "$(BLUE)Running all tests...$(NC)"
	@echo "Testing edge-device..."
	@cd packages/edge-device && pytest -v || true
	@echo "Testing cloud-api..."
	@cd packages/cloud-api && pytest -v || true
	@echo "Testing ml-training..."
	@cd packages/ml-training && pytest -v || true
	@echo "Testing python-common..."
	@cd packages/shared/python-common && pytest -v || true
	@echo "$(GREEN)All tests complete!$(NC)"

lint: ## Run linters on all Python code
	@echo "$(BLUE)Running linters...$(NC)"
	@cd packages/edge-device && ruff check src/
	@cd packages/cloud-api && ruff check src/
	@cd packages/ml-training && ruff check src/
	@cd packages/shared/python-common && ruff check src/
	@echo "$(GREEN)Linting complete!$(NC)"

format: ## Format all code
	@echo "$(BLUE)Formatting code...$(NC)"
	@cd packages/edge-device && ruff format src/
	@cd packages/cloud-api && ruff format src/
	@cd packages/ml-training && ruff format src/
	@cd packages/shared/python-common && ruff format src/
	@echo "$(GREEN)Formatting complete!$(NC)"

typecheck: ## Run type checking on all Python code
	@echo "$(BLUE)Running type checks...$(NC)"
	@cd packages/edge-device && mypy src/
	@cd packages/cloud-api && mypy src/
	@cd packages/ml-training && mypy src/
	@cd packages/shared/python-common && mypy src/
	@echo "$(GREEN)Type checking complete!$(NC)"

build: ## Build a specific package (usage: make build PKG=edge-device)
	@if [ -z "$(PKG)" ]; then \
		echo "$(RED)Error: Please specify PKG=<package-name>$(NC)"; \
		echo "Example: make build PKG=edge-device"; \
		exit 1; \
	fi
	@echo "$(BLUE)Building $(PKG)...$(NC)"
	@cd packages/$(PKG) && python -m build

build-all: ## Build all packages
	@echo "$(BLUE)Building all packages...$(NC)"
	@cd packages/edge-device && python -m build
	@cd packages/cloud-api && python -m build
	@cd packages/ml-training && python -m build
	@cd packages/shared/python-common && python -m build
	@cd packages/frontend && npm run build
	@echo "$(GREEN)All packages built!$(NC)"

docker-build: ## Build Docker images for all services
	@echo "$(BLUE)Building Docker images...$(NC)"
	@docker build -t ad-detection-edge:latest -f packages/edge-device/Dockerfile packages/edge-device
	@docker build -t ad-detection-api:latest -f packages/cloud-api/Dockerfile packages/cloud-api
	@docker build -t ad-detection-ml:latest -f packages/ml-training/Dockerfile packages/ml-training
	@docker build -t ad-detection-frontend:latest -f packages/frontend/Dockerfile packages/frontend
	@echo "$(GREEN)Docker images built!$(NC)"

docker-compose-up: ## Start local development environment
	@echo "$(BLUE)Starting local services...$(NC)"
	@docker-compose -f infra/docker-compose/docker-compose.dev.yml up -d
	@echo "$(GREEN)Services started!$(NC)"

docker-compose-down: ## Stop local development environment
	@echo "$(BLUE)Stopping local services...$(NC)"
	@docker-compose -f infra/docker-compose/docker-compose.dev.yml down
	@echo "$(GREEN)Services stopped!$(NC)"

deploy-staging: ## Deploy to staging environment
	@echo "$(BLUE)Deploying to staging...$(NC)"
	@./scripts/deploy-staging.sh

deploy-prod: ## Deploy to production environment
	@echo "$(RED)Deploying to production...$(NC)"
	@read -p "Are you sure you want to deploy to production? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		./scripts/deploy-prod.sh; \
	else \
		echo "Deployment cancelled."; \
	fi

dev-edge: ## Run edge device in development mode
	@echo "$(BLUE)Starting edge device (dev mode)...$(NC)"
	@cd packages/edge-device && python src/main.py --config config/default.yaml --debug

dev-api: ## Run cloud API in development mode
	@echo "$(BLUE)Starting cloud API (dev mode)...$(NC)"
	@cd packages/cloud-api && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run frontend in development mode
	@echo "$(BLUE)Starting frontend (dev mode)...$(NC)"
	@cd packages/frontend && npm run dev

docs: ## Build documentation
	@echo "$(BLUE)Building documentation...$(NC)"
	@cd docs && make html
	@echo "$(GREEN)Documentation built! Open docs/_build/html/index.html$(NC)"

coverage: ## Generate test coverage report
	@echo "$(BLUE)Generating coverage report...$(NC)"
	@cd packages/edge-device && pytest --cov=src --cov-report=html --cov-report=term
	@echo "$(GREEN)Coverage report generated!$(NC)"

check: lint typecheck test-all ## Run all checks (lint, typecheck, test)

proto-gen: ## Generate code from Protocol Buffers
	@echo "$(BLUE)Generating protobuf code...$(NC)"
	@cd packages/shared/proto && make
	@echo "$(GREEN)Protobuf code generated!$(NC)"

migration-create: ## Create a new database migration (usage: make migration-create MSG="description")
	@if [ -z "$(MSG)" ]; then \
		echo "$(RED)Error: Please specify MSG=\"migration description\"$(NC)"; \
		exit 1; \
	fi
	@cd packages/cloud-api && alembic revision --autogenerate -m "$(MSG)"

migration-upgrade: ## Apply database migrations
	@cd packages/cloud-api && alembic upgrade head

migration-downgrade: ## Rollback database migration
	@cd packages/cloud-api && alembic downgrade -1

benchmark: ## Run performance benchmarks
	@echo "$(BLUE)Running benchmarks...$(NC)"
	@cd packages/edge-device && python scripts/benchmark.py

install-hooks: ## Install git pre-commit hooks
	@echo "$(BLUE)Installing pre-commit hooks...$(NC)"
	@pre-commit install
	@echo "$(GREEN)Pre-commit hooks installed!$(NC)"
