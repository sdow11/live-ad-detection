# ad-detection-edge

Raspberry Pi edge device application for real-time advertisement detection on live TV.

## Features

- Video capture from HDMI or network streams
- Real-time ML inference (TensorFlow Lite / ONNX)
- Multiple TV control methods (IR, Bluetooth, CEC, HTTP)
- Dynamic model loading and caching
- Telemetry and health monitoring
- Cloud synchronization

## Hardware Requirements

- Raspberry Pi 4 or 5 (4GB+ RAM recommended)
- Optional: Raspberry Pi AI HAT for hardware acceleration
- HDMI capture device OR network streaming capability
- IR blaster module (for IR control)
- Bluetooth adapter (usually built-in)

## Installation

### On Raspberry Pi

```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install -y python3.11 python3-pip python3-opencv
sudo apt-get install -y lirc bluetooth

# Install package
pip install -e .

# For hardware support
pip install -e ".[hw]"
```

### For Development (non-RPi)

```bash
pip install -e ".[dev]"
```

## Configuration

Create a configuration file at `config/device.yaml`:

```yaml
device:
  id: "rpi-001"
  name: "Main Bar TV"

video:
  source: "hdmi"  # or "stream", "file"
  resolution: [1920, 1080]
  fps: 30

inference:
  model_path: "/opt/models"
  base_model: "general_ad_detector_v1.tflite"
  confidence_threshold: 0.85
  temporal_window: 5

tv_control:
  primary_method: "ir"  # ir, bluetooth, cec, http
  fallback_methods: ["cec", "http"]
  ir_device: "/dev/lirc0"

cloud:
  api_url: "https://api.ad-detection.com"
  device_token: "your-device-token"
  heartbeat_interval: 300  # seconds
```

## Usage

### Run as service

```bash
# Install systemd service
sudo cp systemd/ad-detector.service /etc/systemd/system/
sudo systemctl enable ad-detector
sudo systemctl start ad-detector
```

### Run manually

```bash
# With default config
ad-detector

# With custom config
ad-detector --config /path/to/config.yaml

# Debug mode
ad-detector --debug
```

### Python API

```python
from ad_detection_edge import AdDetectionSystem

# Initialize system
system = AdDetectionSystem(config_path="config.yaml")

# Start detection
await system.start()

# Stop detection
await system.stop()
```

## Architecture

```
┌─────────────────────────────────────┐
│         Main Loop                   │
│  ┌──────────────────────────────┐  │
│  │   Video Capture              │  │
│  │   (OpenCV)                   │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ↓                     │
│  ┌──────────────────────────────┐  │
│  │   Frame Preprocessing        │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ↓                     │
│  ┌──────────────────────────────┐  │
│  │   ML Inference Engine        │  │
│  │   (TFLite/ONNX)              │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ↓                     │
│  ┌──────────────────────────────┐  │
│  │   Ad Detector                │  │
│  │   (Temporal Smoothing)       │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ↓ (if ad detected)   │
│  ┌──────────────────────────────┐  │
│  │   Action Controller          │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ↓                     │
│  ┌──────────────────────────────┐  │
│  │   TV Control Interface       │  │
│  │   (IR/BT/CEC/HTTP)           │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘

Background Tasks:
- Model Manager (updates, caching)
- Device Agent (cloud sync, telemetry)
- Health Monitor
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test
pytest tests/unit/test_inference.py

# Run integration tests
pytest tests/integration/
```

## Development

### Code Structure

```
src/
├── main.py              # Entry point
├── video/               # Video capture and processing
├── inference/           # ML inference engine
├── models/              # Model management
├── tv_control/          # TV control interfaces
├── actions/             # Response actions
├── device/              # Device management
└── utils/               # Utilities
```

### Adding a New TV Control Method

1. Create a new file in `src/tv_control/`
2. Implement the `TVControlProtocol` interface
3. Register in `src/tv_control/controller.py`

### Adding a New Model Type

1. Create converter in ML training package
2. Update `src/models/loader.py`
3. Add configuration in `config/default.yaml`

## Performance

Target metrics on Raspberry Pi 4:
- Inference latency: <100ms
- CPU usage: <50%
- Memory usage: <1GB
- Detection accuracy: >95% precision

## Troubleshooting

See [docs/troubleshooting.md](../../docs/troubleshooting.md) for common issues.

### Common Issues

**Video capture not working:**
- Check HDMI capture device: `ls /dev/video*`
- Test with: `v4l2-ctl --list-devices`

**IR blaster not working:**
- Check LIRC: `sudo systemctl status lircd`
- Test IR: `irsend LIST "" ""`

**Model not loading:**
- Check model path in config
- Verify model format (TFLite/ONNX)
- Check available memory

## License

MIT License - see [LICENSE](../../LICENSE) for details.
