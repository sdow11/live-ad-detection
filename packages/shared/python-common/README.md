# ad-detection-common

Shared Python libraries for the Live Ad Detection system.

## Contents

- **config**: Configuration management utilities
- **logging**: Standardized logging setup
- **metrics**: Metrics collection and reporting
- **models**: Shared data models (Pydantic)
- **grpc**: gRPC protocol definitions and generated code
- **utils**: Common utility functions

## Installation

```bash
pip install -e .
```

## Usage

```python
from ad_detection_common.config import load_config
from ad_detection_common.logging import setup_logging

# Load configuration
config = load_config("config.yaml")

# Setup logging
logger = setup_logging("my-app")
```

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Type checking
mypy src/
```
