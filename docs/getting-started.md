# Getting Started with Live Ad Detection

This guide will help you set up your development environment and start contributing to the Live Ad Detection system.

## Prerequisites

### Required
- **Python 3.11+**: Main development language
- **Git**: Version control
- **Docker**: For running local services
- **Docker Compose**: For orchestrating local services

### Optional
- **Node.js 18+**: For frontend development
- **Raspberry Pi 4/5**: For edge device testing
- **Make**: For using Makefile commands (usually pre-installed on Unix systems)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/live-ad-detection.git
cd live-ad-detection
```

### 2. Run Bootstrap Script

This will set up your development environment:

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

Or using Make:

```bash
make setup
```

### 3. Start Local Services

Start PostgreSQL, Redis, MinIO, and monitoring services:

```bash
make docker-compose-up
```

This will start:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (port 9000, console 9001)
- Prometheus (port 9090)
- Grafana (port 3001)

### 4. Install Python Dependencies

For all packages:

```bash
make install
```

Or for individual packages:

```bash
cd packages/edge-device
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e ".[dev]"
```

### 5. Run Tests

```bash
# All tests
make test-all

# Specific package
make test PKG=edge-device

# With coverage
cd packages/edge-device
pytest --cov=src --cov-report=html
```

## Development Workflow

### Working on Edge Device

```bash
cd packages/edge-device

# Activate virtual environment
source venv/bin/activate

# Run in development mode with sample video
python src/main.py --config config/default.yaml --video-file test.mp4

# Run tests
pytest -v

# Run specific test
pytest tests/unit/test_inference.py -v
```

### Working on Cloud API

```bash
cd packages/cloud-api

# Activate virtual environment
source venv/bin/activate

# Run in development mode
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Or use Make
make dev-api

# Run tests
pytest -v
```

### Working on ML Training

```bash
cd packages/ml-training

# Activate virtual environment
source venv/bin/activate

# Train a model
python src/pipelines/general_ad.py --config configs/base_model.yaml

# Run tests
pytest -v
```

### Working on Frontend

```bash
cd packages/frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Or use Make
make dev-frontend

# Build for production
npm run build
```

## Project Structure

```
live-ad-detection/
├── packages/          # All major components
│   ├── edge-device/   # Raspberry Pi application
│   ├── cloud-api/     # Cloud services
│   ├── ml-training/   # Model training
│   ├── frontend/      # Dashboard
│   └── shared/        # Shared libraries
├── infra/             # Infrastructure as Code
├── scripts/           # Utility scripts
├── docs/              # Documentation
└── data/              # Sample data (gitignored)
```

## Common Tasks

### Create a New Feature

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Write tests first (TDD):
   ```bash
   cd packages/edge-device
   # Create test file
   touch tests/unit/test_your_feature.py
   # Write tests
   ```

3. Implement the feature:
   ```bash
   # Create implementation file
   touch src/your_module.py
   # Write code
   ```

4. Run tests:
   ```bash
   pytest tests/unit/test_your_feature.py
   ```

5. Lint and format:
   ```bash
   make lint
   make format
   ```

6. Commit and push:
   ```bash
   git add .
   git commit -m "Add your feature"
   git push origin feature/your-feature-name
   ```

### Add a New Package

1. Create package directory:
   ```bash
   mkdir -p packages/new-package/src/tests
   ```

2. Create pyproject.toml:
   ```bash
   # Copy from existing package and modify
   cp packages/edge-device/pyproject.toml packages/new-package/
   ```

3. Add to CI/CD:
   ```bash
   # Edit .github/workflows/ci.yml
   ```

### Run Linting and Type Checking

```bash
# Lint all code
make lint

# Format all code
make format

# Type checking
make typecheck

# Run all checks
make check
```

### Build Docker Images

```bash
# Build all images
make docker-build

# Build specific image
docker build -t ad-detection-edge:latest -f packages/edge-device/Dockerfile packages/edge-device
```

### Database Migrations

```bash
cd packages/cloud-api

# Create new migration
make migration-create MSG="add new table"

# Apply migrations
make migration-upgrade

# Rollback migration
make migration-downgrade
```

## Testing on Raspberry Pi

### Setup

1. Flash Raspberry Pi OS (64-bit) to SD card
2. Enable SSH
3. Copy your SSH key:
   ```bash
   ssh-copy-id pi@raspberrypi.local
   ```

### Deploy to Raspberry Pi

```bash
# From your development machine
cd packages/edge-device

# Create deployment package
python -m build

# Copy to Raspberry Pi
scp dist/*.whl pi@raspberrypi.local:~

# SSH to Raspberry Pi
ssh pi@raspberrypi.local

# Install on Raspberry Pi
pip install ~/ad_detection_edge-*.whl

# Run
ad-detector --config config.yaml
```

## Useful Commands

### Makefile Commands

```bash
make help              # Show all commands
make setup             # Initial setup
make install           # Install dependencies
make test-all          # Run all tests
make lint              # Lint code
make format            # Format code
make build-all         # Build all packages
make docker-build      # Build Docker images
make docker-compose-up # Start local services
make dev-edge          # Run edge device
make dev-api           # Run cloud API
make dev-frontend      # Run frontend
```

### Docker Compose Commands

```bash
# Start services
docker-compose -f infra/docker-compose/docker-compose.dev.yml up -d

# View logs
docker-compose -f infra/docker-compose/docker-compose.dev.yml logs -f

# Stop services
docker-compose -f infra/docker-compose/docker-compose.dev.yml down

# Remove volumes
docker-compose -f infra/docker-compose/docker-compose.dev.yml down -v
```

## Accessing Local Services

- **PostgreSQL**: `postgresql://postgres:postgres@localhost:5432/ad_detection`
- **Redis**: `redis://localhost:6379`
- **MinIO Console**: http://localhost:9001 (admin/admin)
- **MinIO API**: http://localhost:9000
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Cloud API**: http://localhost:8000 (when running)
- **Frontend**: http://localhost:3000 (when running)

## Troubleshooting

### Python Version Issues

Make sure you're using Python 3.11+:
```bash
python --version
# If not 3.11+, install it:
sudo apt install python3.11
```

### Virtual Environment Issues

```bash
# Delete and recreate
rm -rf venv
python3.11 -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
```

### Docker Issues

```bash
# Clean up all containers and volumes
docker-compose -f infra/docker-compose/docker-compose.dev.yml down -v
docker system prune -a

# Restart Docker daemon
sudo systemctl restart docker
```

### Import Errors

Make sure you installed the package in editable mode:
```bash
pip install -e .
```

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :8000

# Kill process
kill -9 <PID>
```

## Next Steps

1. Read the [Architecture Documentation](../ARCHITECTURE.md)
2. Review the [Roadmap](../ROADMAP.md)
3. Check out the [Contributing Guidelines](development/contributing.md)
4. Join our discussions on GitHub

## Need Help?

- Check the [Troubleshooting Guide](troubleshooting.md)
- Open an issue on GitHub
- Join our Discord community

Happy coding!
