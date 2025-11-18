# Live Ad Detection System

An intelligent, distributed edge ML system for real-time advertisement detection on live TV, deployed on Raspberry Pi devices with enterprise management capabilities.

## Overview

This system automatically detects advertisements on live TV and triggers appropriate actions such as:
- Channel switching
- Picture-in-picture mode
- Custom content insertion

Designed for bars, restaurants, and commercial venues to minimize ad interruptions.

## Key Features

- **Real-time Ad Detection**: ML models detect ads with >95% precision
- **Edge Processing**: All inference on-device (Raspberry Pi) for low latency
- **Multi-Model Architecture**: General, show-specific, and sports-specific models
- **Dynamic Model Loading**: Automatic model switching based on channel/schedule
- **Multiple TV Control Methods**: IR blaster, Bluetooth, HDMI CEC, HTTP APIs
- **Enterprise Dashboard**: Fleet management and analytics
- **Distributed System**: Manage hundreds of devices from centralized platform
- **Model Delivery**: Automatic model updates via CDN

## System Architecture

```
┌─────────────────────────────────────────┐
│         Cloud Platform (AWS/GCP)        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │   API   │  │ Registry│  │Dashboard│ │
│  └────┬────┘  └────┬────┘  └─────────┘ │
└───────┼───────────┼────────────────────┘
        │           │
        ↓           ↓
┌───────────────────────────────────┐
│   Raspberry Pi Edge Device        │
│  ┌──────────┐  ┌──────────────┐  │
│  │  Video   │→ │ ML Inference │  │
│  │ Capture  │  │   Engine     │  │
│  └──────────┘  └──────┬───────┘  │
│                       ↓           │
│  ┌────────────────────────────┐  │
│  │   TV Control (IR/BT/CEC)   │  │
│  └────────────────────────────┘  │
└───────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Repository Structure

This is a monorepo containing all components:

```
live-ad-detection/
├── packages/
│   ├── edge-device/       # Raspberry Pi application
│   ├── cloud-api/         # Cloud API services
│   ├── ml-training/       # Model training pipeline
│   ├── model-registry/    # Model storage and delivery
│   ├── frontend/          # Enterprise dashboard
│   ├── orchestrator/      # Fleet management
│   └── shared/            # Shared libraries
├── infra/                 # Infrastructure as Code
├── scripts/               # Build and deployment scripts
├── docs/                  # Documentation
└── data/                  # Sample data (gitignored)
```

See [MONOREPO_STRUCTURE.md](./MONOREPO_STRUCTURE.md) for complete structure.

## Quick Start

### Prerequisites

- **For Edge Development**:
  - Raspberry Pi 4/5 (4GB+ RAM)
  - Python 3.11+
  - OpenCV, TensorFlow Lite
  - IR blaster hardware (optional)

- **For Cloud Development**:
  - Python 3.11+
  - Docker and Docker Compose
  - Node.js 18+ (for frontend)
  - PostgreSQL, Redis

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/live-ad-detection.git
   cd live-ad-detection
   ```

2. **Run setup script**:
   ```bash
   make setup
   ```

3. **Start local services** (PostgreSQL, Redis, etc.):
   ```bash
   docker-compose -f infra/docker-compose/docker-compose.dev.yml up -d
   ```

4. **Install dependencies**:
   ```bash
   make install
   ```

5. **Run tests**:
   ```bash
   make test-all
   ```

### Running Individual Components

**Edge Device** (simulated):
```bash
cd packages/edge-device
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python src/main.py --config config/default.yaml
```

**Cloud API**:
```bash
cd packages/cloud-api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload
```

**Frontend Dashboard**:
```bash
cd packages/frontend
npm install
npm run dev
```

## Development

### Testing

We follow Test-Driven Development (TDD):

```bash
# Run all tests
make test-all

# Test specific package
cd packages/edge-device
pytest

# With coverage
pytest --cov=src --cov-report=html
```

### Code Quality

```bash
# Lint all Python code
make lint

# Format code
make format

# Type checking
make typecheck
```

### Building

```bash
# Build all packages
make build-all

# Build Docker images
make docker-build
```

## Deployment

### Edge Device Setup

1. **Flash Raspberry Pi OS**:
   ```bash
   # Use Raspberry Pi Imager
   # OS: Raspberry Pi OS Lite (64-bit)
   ```

2. **Run provisioning script**:
   ```bash
   curl -sSL https://install.ad-detection.com/setup.sh | bash
   ```

3. **Configure device**:
   ```bash
   sudo ad-detection-config
   ```

### Cloud Deployment

See [docs/deployment/cloud.md](./docs/deployment/cloud.md) for detailed instructions.

```bash
# Deploy to staging
make deploy-staging

# Deploy to production
make deploy-prod
```

## Documentation

- [Architecture](./ARCHITECTURE.md) - System architecture and design
- [Monorepo Structure](./MONOREPO_STRUCTURE.md) - Code organization
- [Roadmap](./ROADMAP.md) - Implementation timeline
- [Getting Started](./docs/getting-started.md) - Detailed setup guide
- [API Documentation](./docs/api/) - API reference
- [Deployment Guides](./docs/deployment/) - Deployment instructions
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions

## Technology Stack

### Edge (Raspberry Pi)
- Python 3.11+, TensorFlow Lite, OpenCV
- LIRC (IR control), BlueZ (Bluetooth), python-cec (HDMI CEC)
- systemd, SQLite, gRPC

### Cloud
- Python/FastAPI, PostgreSQL, Redis
- S3/MinIO, CloudFront CDN
- Kubernetes, Prometheus, Grafana

### ML Training
- PyTorch, TensorFlow, MLflow
- Model optimization, quantization, pruning
- DVC (data version control)

### Frontend
- Next.js 14, TypeScript, TailwindCSS
- Recharts, real-time updates

## Project Roadmap

We're following a phased approach:

- **Phase 0**: Foundation (Weeks 1-2) - ✅ CURRENT
- **Phase 1**: MVP (Weeks 3-6) - Single device proof of concept
- **Phase 2**: Cloud Infrastructure (Weeks 7-10)
- **Phase 3**: Advanced ML Models (Weeks 11-14)
- **Phase 4**: Advanced TV Control (Weeks 15-16)
- **Phase 5**: Enterprise Features (Weeks 17-20)
- **Phase 6**: Optimization & Scale (Weeks 21-24)
- **Phase 7**: Advanced Features (Weeks 25-28)
- **Phase 8**: Production Hardening (Weeks 29-32)
- **Phase 9**: Launch (Week 33-36)

See [ROADMAP.md](./ROADMAP.md) for detailed timeline.

## Contributing

We follow strict development practices:

- **TDD**: Write tests first
- **SOLID Principles**: Clean, maintainable code
- **DRY**: Don't repeat yourself
- **Type Hints**: All Python code is typed
- **Documentation**: Comprehensive docs for all features
- **Code Review**: All changes require review

See [docs/development/contributing.md](./docs/development/contributing.md) for guidelines.

## Architecture Principles

1. **Edge-First**: All inference happens on-device for privacy and latency
2. **Model Optimization**: Compressed models (<10MB) for edge deployment
3. **Fail Gracefully**: Fallback mechanisms for all critical features
4. **Observable**: Comprehensive logging and metrics
5. **Secure**: End-to-end encryption, secure boot, mutual TLS

## Performance Targets

- **Inference Latency**: <100ms
- **Model Accuracy**: >95% precision, >90% recall
- **Device Uptime**: >99.5%
- **CPU Usage**: <50% on Raspberry Pi 4
- **Memory Usage**: <1GB RAM
- **Model Size**: Base <5MB, Context <15MB

## Security & Privacy

- **No Video Upload**: All processing on-device
- **Encrypted Communication**: TLS for all cloud communication
- **Secure Boot**: Verified boot chain on Raspberry Pi
- **Anonymized Telemetry**: No PII in metrics
- **Regular Updates**: Automated security patches

## License

[MIT License](./LICENSE) - see LICENSE file for details.

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/live-ad-detection/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/live-ad-detection/discussions)
- **Email**: support@ad-detection.com

## Acknowledgments

Built with:
- TensorFlow Lite
- OpenCV
- FastAPI
- Next.js
- And many other open-source projects

## Project Status

🚧 **In Active Development** - Phase 0 (Foundation)

Current focus: Setting up monorepo infrastructure and development environment.

---

**Made with ❤️ for bars and restaurants who want uninterrupted TV viewing**
