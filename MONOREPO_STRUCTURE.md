# Monorepo Structure

## Overview

This monorepo contains all components for the Live Ad Detection system, organized for maximum code reuse and maintainability.

## Directory Structure

```
live-ad-detection/
├── .github/                          # GitHub Actions CI/CD
│   ├── workflows/
│   │   ├── edge-device.yml          # Edge device builds and tests
│   │   ├── cloud-services.yml       # Cloud service deployments
│   │   ├── ml-training.yml          # ML pipeline tests
│   │   └── frontend.yml             # Frontend builds
│   └── dependabot.yml
│
├── packages/                         # All major components
│   ├── edge-device/                 # Raspberry Pi application
│   │   ├── src/
│   │   │   ├── main.py             # Entry point
│   │   │   ├── video/              # Video capture and processing
│   │   │   │   ├── __init__.py
│   │   │   │   ├── capture.py      # HDMI capture / stream capture
│   │   │   │   ├── preprocessor.py  # Frame preprocessing
│   │   │   │   └── buffer.py       # Frame buffering
│   │   │   ├── inference/          # ML inference engine
│   │   │   │   ├── __init__.py
│   │   │   │   ├── engine.py       # Inference orchestration
│   │   │   │   ├── tflite_runner.py
│   │   │   │   ├── onnx_runner.py
│   │   │   │   └── detector.py     # Ad detection logic
│   │   │   ├── models/             # Model management
│   │   │   │   ├── __init__.py
│   │   │   │   ├── manager.py      # Model lifecycle
│   │   │   │   ├── loader.py       # Dynamic loading
│   │   │   │   ├── cache.py        # Local caching
│   │   │   │   └── updater.py      # Download updates
│   │   │   ├── tv_control/         # TV interface
│   │   │   │   ├── __init__.py
│   │   │   │   ├── controller.py   # Main controller
│   │   │   │   ├── ir_blaster.py   # LIRC integration
│   │   │   │   ├── bluetooth.py    # Bluetooth control
│   │   │   │   ├── cec.py          # HDMI CEC
│   │   │   │   └── http_api.py     # Smart TV APIs
│   │   │   ├── actions/            # Response actions
│   │   │   │   ├── __init__.py
│   │   │   │   ├── channel_change.py
│   │   │   │   ├── pip_mode.py
│   │   │   │   └── content_switch.py
│   │   │   ├── device/             # Device management
│   │   │   │   ├── __init__.py
│   │   │   │   ├── agent.py        # Cloud communication
│   │   │   │   ├── telemetry.py    # Metrics collection
│   │   │   │   ├── health.py       # Health checks
│   │   │   │   └── config.py       # Configuration management
│   │   │   ├── utils/              # Utilities
│   │   │   │   ├── __init__.py
│   │   │   │   ├── logger.py
│   │   │   │   ├── metrics.py
│   │   │   │   └── scheduler.py    # EPG-based scheduling
│   │   │   └── config/             # Configuration
│   │   │       ├── default.yaml
│   │   │       └── schema.py
│   │   ├── tests/                  # Tests
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── scripts/                # Utility scripts
│   │   │   ├── setup.sh            # Device setup
│   │   │   ├── install.sh          # Installation
│   │   │   └── benchmark.py        # Performance testing
│   │   ├── systemd/                # System service files
│   │   │   └── ad-detector.service
│   │   ├── Dockerfile              # Container build
│   │   ├── requirements.txt        # Python dependencies
│   │   ├── pyproject.toml          # Package configuration
│   │   └── README.md
│   │
│   ├── cloud-api/                   # Cloud API services
│   │   ├── src/
│   │   │   ├── main.py             # FastAPI application
│   │   │   ├── api/                # API endpoints
│   │   │   │   ├── v1/
│   │   │   │   │   ├── devices.py  # Device management
│   │   │   │   │   ├── models.py   # Model delivery
│   │   │   │   │   ├── telemetry.py
│   │   │   │   │   ├── customers.py
│   │   │   │   │   └── analytics.py
│   │   │   ├── models/             # Database models
│   │   │   │   ├── device.py
│   │   │   │   ├── customer.py
│   │   │   │   ├── model_version.py
│   │   │   │   └── telemetry.py
│   │   │   ├── services/           # Business logic
│   │   │   │   ├── device_service.py
│   │   │   │   ├── model_service.py
│   │   │   │   ├── deployment_service.py
│   │   │   │   └── analytics_service.py
│   │   │   ├── db/                 # Database
│   │   │   │   ├── session.py
│   │   │   │   └── migrations/
│   │   │   ├── auth/               # Authentication
│   │   │   │   ├── jwt.py
│   │   │   │   └── middleware.py
│   │   │   └── config/
│   │   │       └── settings.py
│   │   ├── tests/
│   │   ├── alembic/                # DB migrations
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   ├── ml-training/                 # ML training pipeline
│   │   ├── src/
│   │   │   ├── data/               # Data processing
│   │   │   │   ├── __init__.py
│   │   │   │   ├── loaders.py      # Dataset loaders
│   │   │   │   ├── augmentation.py
│   │   │   │   ├── preprocessing.py
│   │   │   │   └── generators.py   # Data generators
│   │   │   ├── models/             # Model architectures
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base_detector.py
│   │   │   │   ├── show_detector.py
│   │   │   │   ├── sports_detector.py
│   │   │   │   └── channel_detector.py
│   │   │   ├── training/           # Training logic
│   │   │   │   ├── __init__.py
│   │   │   │   ├── trainer.py
│   │   │   │   ├── callbacks.py
│   │   │   │   ├── metrics.py
│   │   │   │   └── validators.py
│   │   │   ├── optimization/       # Model optimization
│   │   │   │   ├── __init__.py
│   │   │   │   ├── quantization.py
│   │   │   │   ├── pruning.py
│   │   │   │   ├── distillation.py
│   │   │   │   └── converter.py    # TFLite/ONNX conversion
│   │   │   ├── evaluation/         # Model evaluation
│   │   │   │   ├── __init__.py
│   │   │   │   ├── evaluator.py
│   │   │   │   └── benchmarks.py
│   │   │   └── pipelines/          # End-to-end pipelines
│   │   │       ├── __init__.py
│   │   │       ├── general_ad.py
│   │   │       ├── show_specific.py
│   │   │       └── sports_specific.py
│   │   ├── configs/                # Training configurations
│   │   │   ├── base_model.yaml
│   │   │   ├── show_model.yaml
│   │   │   └── sports_model.yaml
│   │   ├── notebooks/              # Jupyter notebooks
│   │   │   ├── exploration.ipynb
│   │   │   └── analysis.ipynb
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   ├── model-registry/              # Model versioning & storage
│   │   ├── src/
│   │   │   ├── main.py
│   │   │   ├── api/
│   │   │   │   ├── upload.py       # Model upload
│   │   │   │   ├── download.py     # Model download
│   │   │   │   └── versions.py     # Version management
│   │   │   ├── storage/
│   │   │   │   ├── s3.py
│   │   │   │   └── cdn.py
│   │   │   └── models/
│   │   │       └── model_metadata.py
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   ├── frontend/                    # Enterprise dashboard
│   │   ├── src/
│   │   │   ├── app/                # Next.js app directory
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── devices/
│   │   │   │   ├── analytics/
│   │   │   │   ├── models/
│   │   │   │   └── settings/
│   │   │   ├── components/         # React components
│   │   │   │   ├── ui/             # Base UI components
│   │   │   │   ├── charts/         # Analytics charts
│   │   │   │   ├── DeviceCard.tsx
│   │   │   │   ├── ModelTable.tsx
│   │   │   │   └── ...
│   │   │   ├── lib/                # Utilities
│   │   │   │   ├── api.ts          # API client
│   │   │   │   └── utils.ts
│   │   │   └── types/              # TypeScript types
│   │   ├── public/
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── README.md
│   │
│   ├── orchestrator/                # Fleet management service
│   │   ├── src/
│   │   │   ├── main.py
│   │   │   ├── fleet/              # Fleet management
│   │   │   │   ├── manager.py
│   │   │   │   ├── provisioning.py
│   │   │   │   └── updates.py
│   │   │   ├── deployment/         # Deployment logic
│   │   │   │   ├── deployer.py
│   │   │   │   └── rollback.py
│   │   │   ├── monitoring/         # Device monitoring
│   │   │   │   ├── health_check.py
│   │   │   │   └── alerts.py
│   │   │   └── scheduler/          # Job scheduling
│   │   │       └── scheduler.py
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── shared/                      # Shared libraries
│       ├── python-common/           # Shared Python code
│       │   ├── src/
│       │   │   └── ad_detection_common/
│       │   │       ├── __init__.py
│       │   │       ├── config/     # Configuration utilities
│       │   │       ├── logging/    # Logging setup
│       │   │       ├── metrics/    # Metrics collection
│       │   │       ├── models/     # Shared data models
│       │   │       ├── grpc/       # gRPC definitions
│       │   │       │   ├── proto/
│       │   │       │   └── generated/
│       │   │       └── utils/      # Common utilities
│       │   ├── tests/
│       │   ├── pyproject.toml
│       │   └── README.md
│       │
│       └── proto/                   # Protocol Buffers
│           ├── device.proto
│           ├── model.proto
│           ├── telemetry.proto
│           └── Makefile            # Generate code
│
├── infra/                           # Infrastructure as Code
│   ├── terraform/                   # Terraform configs
│   │   ├── aws/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   ├── outputs.tf
│   │   │   ├── vpc.tf
│   │   │   ├── eks.tf              # Kubernetes cluster
│   │   │   ├── rds.tf              # Database
│   │   │   ├── s3.tf               # Storage
│   │   │   └── cloudfront.tf       # CDN
│   │   └── gcp/                    # Alternative: GCP
│   │
│   ├── kubernetes/                  # K8s manifests
│   │   ├── base/
│   │   │   ├── cloud-api/
│   │   │   ├── model-registry/
│   │   │   ├── orchestrator/
│   │   │   └── frontend/
│   │   ├── overlays/
│   │   │   ├── dev/
│   │   │   ├── staging/
│   │   │   └── prod/
│   │   └── kustomization.yaml
│   │
│   ├── docker-compose/              # Local development
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.dev.yml
│   │   └── .env.example
│   │
│   └── ansible/                     # Device provisioning
│       ├── playbooks/
│       │   ├── provision.yml
│       │   └── update.yml
│       └── inventory/
│
├── scripts/                         # Utility scripts
│   ├── bootstrap.sh                 # Initial setup
│   ├── build-all.sh                 # Build all packages
│   ├── test-all.sh                  # Run all tests
│   ├── deploy-dev.sh                # Deploy to dev
│   └── setup-device.sh              # Setup Raspberry Pi
│
├── data/                            # Sample data (gitignored)
│   ├── raw/                         # Raw video files
│   ├── processed/                   # Processed datasets
│   ├── models/                      # Trained models
│   └── annotations/                 # Labeled data
│
├── docs/                            # Documentation
│   ├── getting-started.md
│   ├── architecture.md
│   ├── api/                         # API documentation
│   ├── deployment/                  # Deployment guides
│   ├── development/                 # Dev guides
│   │   ├── setup.md
│   │   ├── testing.md
│   │   └── contributing.md
│   └── troubleshooting.md
│
├── .gitignore
├── .editorconfig
├── .pre-commit-config.yaml          # Pre-commit hooks
├── pyproject.toml                   # Root Python config
├── package.json                     # Root npm config
├── Makefile                         # Common tasks
├── README.md
├── LICENSE
├── ARCHITECTURE.md
├── MONOREPO_STRUCTURE.md
└── ROADMAP.md
```

## Package Dependencies

```
┌─────────────────┐
│  edge-device    │ ─────────┐
└─────────────────┘          │
                             ├──→ ┌──────────────────┐
┌─────────────────┐          │    │  python-common   │
│  cloud-api      │ ─────────┤    └──────────────────┘
└─────────────────┘          │
                             │
┌─────────────────┐          │
│  ml-training    │ ─────────┤
└─────────────────┘          │
                             │
┌─────────────────┐          │
│  orchestrator   │ ─────────┘
└─────────────────┘

┌─────────────────┐
│  frontend       │ ──────→ cloud-api (API calls)
└─────────────────┘
```

## Build System

- **Python packages**: Poetry or pip-tools for dependency management
- **Frontend**: npm/pnpm with Turborepo for builds
- **Monorepo tooling**: Nx or Turborepo (optional)
- **CI/CD**: GitHub Actions with matrix builds

## Package Versioning

- Independent versioning per package
- Semantic versioning (MAJOR.MINOR.PATCH)
- Shared version for python-common
- Git tags for releases: `edge-device-v1.2.3`, `cloud-api-v2.1.0`

## Development Workflow

1. **Local Development**:
   ```bash
   # Install dependencies
   make install

   # Start local services
   docker-compose -f infra/docker-compose/docker-compose.dev.yml up

   # Run edge device
   cd packages/edge-device
   python src/main.py
   ```

2. **Testing**:
   ```bash
   # Test all packages
   make test-all

   # Test specific package
   cd packages/edge-device
   pytest
   ```

3. **Building**:
   ```bash
   # Build all packages
   make build-all

   # Build edge device image
   cd packages/edge-device
   docker build -t ad-detection-edge:latest .
   ```

## Design Principles

### Code Sharing
- Extract common code to `shared/python-common`
- Use dependency injection for testability
- Define clear interfaces between packages

### Independence
- Each package can be developed independently
- Minimal coupling between packages
- Well-defined APIs and contracts

### Consistency
- Shared linting/formatting configs
- Common testing patterns
- Unified logging and metrics

## Next Steps

See ROADMAP.md for implementation phases and timeline.
