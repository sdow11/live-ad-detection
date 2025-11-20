# Live Ad Detection System

A distributed cluster system for live advertisement detection with touchscreen and web-based WiFi configuration interfaces.

## Features

### Dual Setup Interface
- **Touchscreen UI**: Full-featured touch interface for head devices
- **Web Interface**: Browser-based setup accessible from any device
- **QR Code Connection**: Easily connect to the device's web interface via QR code

### Device Types
- **Head Device**: Main cluster node with touchscreen for setup and monitoring
- **Cluster Nodes**: Additional nodes with optional small displays or headless operation

### WiFi Management
- Scan and connect to WiFi networks
- Start WiFi Access Point for initial configuration
- Support for dual WiFi adapters (one for internet, one for AP mode)
- Both touchscreen and web-based configuration

### Device Monitoring
- Real-time CPU, memory, and disk usage
- Network status and statistics
- System uptime and temperature monitoring
- Accessible via touchscreen or web interface

### AI-Powered Ad Detection
- **Raspberry Pi AI HAT** support (Hailo-8L accelerator)
- **13 TOPS** of AI inference performance
- **Dual video stream** processing with passthrough
- Real-time ad detection on multiple HDMI streams
- Hardware-accelerated inference with low latency
- Support for custom trained models

## Architecture

```
live-ad-detection/
├── src/live_ad_detection/
│   ├── wifi_manager/          # WiFi scanning and connection management
│   ├── web_interface/         # Flask web application
│   ├── touchscreen_ui/        # Kivy touchscreen application
│   ├── device_info/           # System monitoring
│   ├── ai_hat/                # AI HAT integration and video processing
│   │   ├── hailo_inference.py  # Hailo-8L AI accelerator interface
│   │   ├── video_processor.py  # Video capture and passthrough
│   │   └── ad_detector.py      # Ad detection engine
│   └── config/                # Configuration management
├── services/                   # Centralized backend services
│   ├── api-server/            # REST API for cluster management
│   ├── data-collector/        # Data aggregation service
│   └── docker-compose.yml     # Service orchestration
├── config/
│   └── device_config.yaml     # Device configuration
├── scripts/
│   ├── deploy_head.sh         # Deploy head device
│   ├── deploy_node.sh         # Deploy cluster node
│   ├── deploy_all.sh          # Deploy entire cluster
│   └── health_check.sh        # Health monitoring
├── examples/
│   ├── run_ad_detection.py    # Run ad detection
│   └── test_video_streams.py  # Test video capture
├── docs/
│   └── AI_HAT_SETUP.md        # AI HAT setup guide
└── requirements.txt           # Python dependencies
```

## Installation

### Prerequisites

**Basic Setup:**
- Linux system (Raspberry Pi, Ubuntu, Debian, etc.)
- Python 3.8 or higher
- WiFi adapter(s)
- Optional: Touchscreen display for head device

**For Ad Detection:**
- Raspberry Pi 5 (required for AI HAT)
- Raspberry Pi AI HAT with Hailo-8L accelerator
- USB HDMI capture cards (1-2, depending on streams)
- HDMI sources to monitor (cable box, streaming device, etc.)

### Quick Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd live-ad-detection
```

2. Run the setup script (requires root):
```bash
sudo bash scripts/setup.sh
```

3. Follow the prompts to configure your device as:
   - Head device (with touchscreen)
   - Cluster node (with small display)
   - Cluster node (headless)

The setup script will:
- Install system dependencies
- Install Python packages
- Configure the device role
- Install and enable systemd services
- Set up configuration files

### Manual Installation

If you prefer to install manually:

```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip network-manager wireless-tools

# Install Python dependencies
pip3 install -r requirements.txt

# Install the package
pip3 install -e .

# Copy configuration
sudo mkdir -p /etc/live-ad-detection
sudo cp config/device_config.yaml /etc/live-ad-detection/
```

## Usage

### Starting Services

**Web Interface:**
```bash
sudo systemctl start live-ad-web
```

**Touchscreen UI (head device only):**
```bash
sudo systemctl start live-ad-touch
```

**Enable services to start on boot:**
```bash
sudo systemctl enable live-ad-web
sudo systemctl enable live-ad-touch
```

### Manual Startup

**Web Interface:**
```bash
python3 -m live_ad_detection.web_interface.app
```

**Touchscreen UI:**
```bash
python3 -m live_ad_detection.touchscreen_ui.app
```

### WiFi Access Point

**Start AP for configuration:**
```bash
sudo bash scripts/start_ap.sh [SSID] [password]
```

Example:
```bash
# Open AP (no password)
sudo bash scripts/start_ap.sh MyDevice

# Secured AP
sudo bash scripts/start_ap.sh MyDevice MyPassword123
```

**Stop AP:**
```bash
sudo bash scripts/stop_ap.sh
```

### Accessing the Web Interface

1. **Via WiFi AP Mode:**
   - Start the AP on the device
   - Connect to the AP SSID from your phone/computer
   - Navigate to `http://192.168.4.1:5000`
   - Scan the QR code on the page for easy access

2. **Via Network:**
   - Ensure device is connected to your network
   - Find device IP: `hostname -I`
   - Navigate to `http://<device-ip>:5000`

3. **Via Touchscreen:**
   - Use the built-in touchscreen interface
   - Navigate to the QR Code tab
   - Scan with your phone to access web interface

## Configuration

The main configuration file is located at:
- `/etc/live-ad-detection/device_config.yaml` (production)
- `./config/device_config.yaml` (development)

### Key Configuration Options

```yaml
# Device role
device_role: "head"  # or "node"

# WiFi interfaces
wifi:
  primary_interface: "wlan0"
  ap_interface: "wlan1"
  ap_ssid: "LiveAdDetection"
  auto_start_ap: true

# Web interface
web_interface:
  enabled: true
  port: 5000
  auto_start: true

# Touchscreen
touchscreen:
  enabled: true  # false for cluster nodes
  fullscreen: true

# Display (for non-touch cluster nodes)
display:
  enabled: false
  type: "oled"
```

## Features by Interface

### Touchscreen UI

The touchscreen interface provides:
- **WiFi Setup Tab**: Scan networks, connect to WiFi
- **Device Info Tab**: System monitoring and statistics
- **QR Code Tab**: Generate QR codes for web access

### Web Interface

The web interface provides:
- Network scanning and connection
- Device information dashboard
- QR code generation for:
  - Web interface access
  - WiFi network credentials
- Real-time status updates

## Cluster Setup

### Head Device

1. Set `device_role: "head"` in configuration
2. Enable touchscreen: `touchscreen.enabled: true`
3. Configure dual WiFi if available
4. The head device can run the web interface and touchscreen UI

### Cluster Nodes

1. Set `device_role: "node"` in configuration
2. Disable touchscreen: `touchscreen.enabled: false`
3. Optionally enable small display: `display.enabled: true`
4. Configure to connect to head device

## Troubleshooting

### Web Interface Not Accessible

```bash
# Check service status
sudo systemctl status live-ad-web

# Check logs
sudo journalctl -u live-ad-web -f

# Check firewall
sudo ufw allow 5000
```

### Touchscreen Not Working

```bash
# Check service status
sudo systemctl status live-ad-touch

# Check display environment
echo $DISPLAY

# Check Xorg access
xhost +local:
```

### WiFi Scanning Issues

```bash
# Check NetworkManager
sudo systemctl status NetworkManager

# Check WiFi interfaces
ip link show
nmcli device status

# Restart NetworkManager
sudo systemctl restart NetworkManager
```

### Access Point Not Starting

```bash
# Check if interface supports AP mode
iw list | grep -A 10 "Supported interface modes"

# Check if another process is using the interface
sudo nmcli connection show --active

# Ensure hostapd and dnsmasq are installed
sudo apt-get install hostapd dnsmasq
```

## Development

### Running in Development Mode

```bash
# Install in editable mode
pip3 install -e .

# Run web interface with debug
cd src
python3 -m flask --app live_ad_detection.web_interface.app run --debug

# Run touchscreen UI
python3 -m live_ad_detection.touchscreen_ui.app
```

### Running Tests

```bash
pytest tests/
```

### Code Formatting

```bash
black src/
flake8 src/
```

## System Requirements

### Minimum Requirements
- CPU: 1GHz single-core
- RAM: 512MB
- Storage: 2GB
- WiFi: 1 adapter

### Recommended (Head Device)
- CPU: 1.5GHz quad-core
- RAM: 2GB
- Storage: 8GB
- WiFi: 2 adapters (for dual-mode operation)
- Display: 7" touchscreen (800x480 or higher)

### Recommended (Cluster Node)
- CPU: 1GHz dual-core
- RAM: 1GB
- Storage: 4GB
- WiFi: 1-2 adapters
- Display: Small OLED/LCD (optional)

## Hardware Compatibility

### Tested Devices
- Raspberry Pi 4 (recommended for head device)
- Raspberry Pi 3B+
- Raspberry Pi Zero W (cluster nodes)
- Generic Linux SBCs with WiFi

### Touchscreen Displays
- Official Raspberry Pi 7" Touchscreen
- Waveshare touchscreen displays
- Any display supported by Kivy

### WiFi Adapters
- Built-in Raspberry Pi WiFi
- USB WiFi adapters (RTL8188, MT7601U, etc.)
- Dual-band adapters supported

## API Reference

### Web API Endpoints

- `GET /api/scan` - Scan for WiFi networks
- `POST /api/connect` - Connect to a network
- `GET /api/current` - Get current network
- `GET /api/device/info` - Get device information
- `GET /api/qr/connection` - Generate QR for web access
- `GET /api/qr/wifi` - Generate QR for WiFi credentials
- `POST /api/ap/start` - Start access point
- `POST /api/ap/stop` - Stop access point

### Python API

```python
from live_ad_detection.wifi_manager import WiFiManager
from live_ad_detection.device_info import DeviceMonitor

# WiFi management
wifi = WiFiManager()
networks = wifi.scan_networks()
wifi.connect_to_network("MySSID", "password")

# Device monitoring
monitor = DeviceMonitor()
info = monitor.get_all_info()
```

## License

[Your License Here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the troubleshooting section
- Review system logs: `sudo journalctl -u live-ad-web -f`
