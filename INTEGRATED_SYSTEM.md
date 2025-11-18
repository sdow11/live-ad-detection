# Integrated Live Ad Detection System

## Overview

This document describes the complete integrated system that combines video processing, ML-based ad detection, picture-in-picture composition, and TV control into a production-ready solution for bars and restaurants.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTEGRATED PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │ Video        │────▶│  ML Ad       │────▶│   Video      │   │
│  │ Capture      │     │  Detection   │     │   Compositor │   │
│  │ (HDMI/V4L2)  │     │  (TFLite)    │     │   (PiP)      │   │
│  └──────────────┘     └──────────────┘     └──────┬───────┘   │
│                              │                     │            │
│                              │                     │            │
│                              ▼                     ▼            │
│                       ┌──────────────┐     ┌──────────────┐   │
│                       │  TV Control  │     │    HDMI      │   │
│                       │  (IR/CEC)    │     │   Output     │   │
│                       └──────────────┘     └──────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Video Capture (Phase 1)

**Input Sources**:
- HDMI capture via V4L2 (Auvidea B101 or USB capture card)
- Mock capture for testing

**Features**:
- 720p/1080p at 30/60fps
- Low latency (<30ms)
- Async frame acquisition
- Buffer management

### 2. ML Ad Detection (Phase 2)

**Inference Engine**:
- TensorFlow Lite for edge inference
- Mock model for testing
- 224x224 input preprocessing
- ~20-40ms inference time

**Detection Features**:
- Temporal smoothing (5-frame window)
- Confidence scoring
- False positive reduction
- Real-time statistics

### 3. Video Composition (Phase 3)

**PiP Compositor**:
- Configurable position and size
- Border rendering
- Opacity/transparency
- Swap mode (alternate content full screen)

**Alternate Content Sources**:
- Color bars (default)
- Static images (logos, promos)
- Video files (highlights, ads)
- Extensible protocol

### 4. TV Control (Phase 1)

**Control Methods**:
- IR Blaster (LIRC) - primary method
- HDMI CEC - power/volume
- HTTP API - smart TVs
- Bluetooth - newer TVs

**Capabilities**:
- Channel changing
- Volume control
- Mute/unmute
- Power on/off

## Ad Response Strategies

The system supports multiple strategies for responding to detected ads:

### Strategy 1: PiP Only (Default)

**Behavior**:
- Normal: TV feed full screen
- Ad detected: Alternate content full screen, TV in small PiP window
- Content resumes: Return to full screen TV

**Use Case**: Minimal intrusion, customers can still see original feed

**Configuration**:
```python
strategy=AdResponseStrategy.PIP_ONLY
```

### Strategy 2: Channel Change

**Behavior**:
- Normal: Original channel (e.g., "5-1")
- Ad detected: Change to alternate channel (e.g., "5-2")
- Content resumes: Restore original channel

**Use Case**: Complete replacement of content during ads

**Configuration**:
```python
strategy=AdResponseStrategy.CHANNEL_CHANGE
original_channel="5-1"
alternate_channel="5-2"
```

### Strategy 3: Input Switch

**Behavior**:
- Normal: HDMI Input 1 (cable box)
- Ad detected: Switch to HDMI Input 2 (media player)
- Content resumes: Restore Input 1

**Use Case**: Dedicated alternate content source

**Configuration**:
```python
strategy=AdResponseStrategy.INPUT_SWITCH
```

### Strategy 4: PiP with Mute

**Behavior**:
- Normal: TV feed full screen with audio
- Ad detected: Show PiP + mute TV audio
- Content resumes: Unmute and return to full screen

**Use Case**: Visual monitoring with audio suppression

**Configuration**:
```python
strategy=AdResponseStrategy.PIP_WITH_MUTE
```

## Hardware Requirements

### Minimum Configuration

- **Raspberry Pi 5 (8GB RAM)**: $80
  - VideoCore VII GPU for H.264 encode/decode
  - Dual CSI-2 interfaces
  - 8GB RAM for video buffering + ML models

- **HDMI Capture**: $40-100
  - Option A: Auvidea B101 (CSI-2, low latency)
  - Option B: USB 3.0 capture card (easier integration)

- **IR Blaster Module**: $15
  - GPIO-based IR transmitter
  - LIRC compatible

- **Power Supply (27W USB-C PD)**: $12

- **MicroSD Card (64GB)**: $12

- **Case with Cooling**: $15

**Total**: ~$175-235 per device

### Optional Enhancements

- **AI HAT+** (Hailo-8L): $70
  - 13 TOPS acceleration
  - Not required, just speeds up inference

- **Second HDMI Capture**: $50
  - For alternate content from second source

### Coordinator Node Additional Requirements

- **WiFi Adapter (USB)**: $25-40
  - Dual-band (2.4GHz + 5GHz)
  - AP mode support
  - Example: TP-Link Archer T3U

**Purpose**: Create local network while maintaining internet connectivity
- Built-in WiFi → Connect to internet
- USB WiFi → Create AP for local fleet network

## Network Architecture

### Coordinator Node Setup

```
Internet
   │
   │ (via ethernet or built-in WiFi)
   │
   ▼
┌─────────────────────────────┐
│  Coordinator Raspberry Pi   │
│                             │
│  ┌─────────┐  ┌──────────┐ │
│  │Built-in │  │USB WiFi  │ │
│  │WiFi/Eth │  │Adapter   │ │
│  └────┬────┘  └────┬─────┘ │
└───────┼────────────┼────────┘
        │            │
        │            └──▶ 192.168.50.1/24 (Access Point)
        │                "LiveTV-Fleet"
        │
        └──▶ Internet access
             DHCP from router


         ┌─────────────────┐
         │  Worker Node 1  │
         │  192.168.50.11  │
         └─────────────────┘
         ┌─────────────────┐
         │  Worker Node 2  │
         │  192.168.50.12  │
         └─────────────────┘
         ┌─────────────────┐
         │  Worker Node 3  │
         │  192.168.50.13  │
         └─────────────────┘
```

### Network Services

- **mDNS/Avahi**: Zero-configuration device discovery
- **Raft Consensus**: Leader election for coordinator
- **REST API**: Local fleet management (port 8080)
- **SSE**: Real-time updates to web dashboard

## Installation and Setup

### 1. Raspberry Pi OS Installation

```bash
# Flash Raspberry Pi OS (64-bit) to SD card
# Use Raspberry Pi Imager

# SSH and basic config
sudo raspi-config
# Enable: SSH, I2C, Camera
# Set hostname: livetv-coordinator or livetv-worker-01
```

### 2. Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install video dependencies
sudo apt install -y v4l-utils ffmpeg

# Install IR blaster (LIRC)
sudo apt install -y lirc

# Install HDMI CEC
sudo apt install -y cec-utils

# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install OpenCV dependencies
sudo apt install -y libopencv-dev python3-opencv

# Install network tools
sudo apt install -y avahi-daemon avahi-utils hostapd dnsmasq
```

### 3. Clone Repository

```bash
git clone https://github.com/yourusername/live-ad-detection.git
cd live-ad-detection
```

### 4. Install Python Packages

```bash
# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install packages
pip install -e packages/shared/python-common
pip install -e packages/edge-device
```

### 5. Configure Hardware

**HDMI Capture**:
```bash
# Test capture device
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats

# Set capture mode
v4l2-ctl -d /dev/video0 --set-fmt-video=width=1920,height=1080,pixelformat=MJPG
```

**IR Blaster**:
```bash
# Configure LIRC
sudo nano /etc/lirc/lirc_options.conf
# Set driver and device

# Test IR
irsend LIST "" ""
irsend SEND_ONCE samsung_tv KEY_POWER
```

**WiFi AP (Coordinator Only)**:
```bash
# Configure hostapd
sudo nano /etc/hostapd/hostapd.conf
```

```conf
interface=wlan1  # USB WiFi adapter
driver=nl80211
ssid=LiveTV-Fleet
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
wpa=2
wpa_passphrase=YourSecurePassword
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

```bash
# Configure dnsmasq
sudo nano /etc/dnsmasq.conf
```

```conf
interface=wlan1
dhcp-range=192.168.50.10,192.168.50.100,255.255.255.0,24h
```

### 6. Run System

**Test Components Individually**:
```bash
# Test video passthrough
python packages/edge-device/examples/demo_passthrough.py

# Test ML detection
python packages/edge-device/examples/demo_ml_detection.py

# Test PiP
python packages/edge-device/examples/demo_pip_complete.py
```

**Run Production System**:
```bash
# Basic (PiP only)
python packages/edge-device/examples/demo_production.py

# Channel change strategy
python packages/edge-device/examples/demo_production.py \
    --strategy channel_change \
    --original-channel "5-1" \
    --alternate-channel "5-2" \
    --enable-tv-control \
    --tv-brand samsung
```

## Configuration Files

### Device Configuration

Create `/etc/livetv/device.yaml`:

```yaml
device:
  device_id: "livetv-001"
  role: "coordinator"  # or "worker"
  hostname: "livetv-coordinator"

capture:
  device: "/dev/video0"
  mode: "1920x1080@60"
  format: "h264"

ml:
  model_path: "/opt/livetv/models/ad_detector.tflite"
  confidence_threshold: 0.7
  temporal_window: 5

tv_control:
  enabled: true
  brand: "samsung"
  methods: ["ir_blaster", "hdmi_cec"]
  ir_remote_name: "samsung_tv"

strategy:
  type: "channel_change"
  original_channel: "5-1"
  alternate_channel: "5-2"

alternate_content:
  type: "video"
  path: "/opt/livetv/content/highlights.mp4"
  loop: true
```

### Systemd Service

Create `/etc/systemd/system/livetv.service`:

```ini
[Unit]
Description=Live TV Ad Detection Service
After=network.target

[Service]
Type=simple
User=livetv
WorkingDirectory=/opt/livetv
ExecStart=/opt/livetv/venv/bin/python /opt/livetv/production_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable livetv
sudo systemctl start livetv
sudo systemctl status livetv
```

## Performance Benchmarks

### Latency Breakdown (1080p60)

| Component | Latency | Notes |
|-----------|---------|-------|
| HDMI Capture | 20-30ms | Auvidea B101 CSI-2 |
| ML Inference | 25-40ms | TFLite on RPi 5 CPU |
| Composition | 10-15ms | PiP overlay |
| HDMI Output | 16ms | VSync at 60fps |
| **Total** | **71-101ms** | Acceptable for live TV |

### With AI HAT+ (Optional)

| Component | Latency | Notes |
|-----------|---------|-------|
| HDMI Capture | 20-30ms | Same |
| ML Inference | 8-15ms | Hailo-8L acceleration |
| Composition | 10-15ms | Same |
| HDMI Output | 16ms | Same |
| **Total** | **54-76ms** | Improved responsiveness |

### Resource Usage

- **CPU**: 40-60% (with ML on CPU)
- **CPU**: 20-30% (with AI HAT+)
- **RAM**: 1.5-2.5GB used
- **Power**: 12-15W typical, 20W peak

## Troubleshooting

### Video Capture Issues

```bash
# Check devices
v4l2-ctl --list-devices

# Test capture
ffmpeg -f v4l2 -i /dev/video0 -frames 1 test.jpg

# Check permissions
sudo usermod -a -G video $USER
```

### IR Blaster Not Working

```bash
# Test LIRC daemon
sudo systemctl status lircd

# List remotes
irsend LIST "" ""

# Check GPIO
gpio readall
```

### High Latency

- Reduce ML inference frequency (analyze every 2-3 frames)
- Use AI HAT+ for faster inference
- Reduce video resolution (720p vs 1080p)
- Disable vsync if acceptable

### ML Model Not Loading

```bash
# Install TensorFlow Lite
pip install tensorflow-lite

# Or use interpreter-only
pip install tflite-runtime
```

## Production Deployment Checklist

- [ ] Hardware assembled and tested
- [ ] Raspberry Pi OS installed and updated
- [ ] All dependencies installed
- [ ] HDMI capture device configured
- [ ] IR blaster configured and tested
- [ ] ML model downloaded or trained
- [ ] Alternate content prepared
- [ ] Configuration file created
- [ ] Systemd service configured
- [ ] Network (WiFi AP for coordinator) configured
- [ ] Testing completed (24+ hour stress test)
- [ ] Physical installation (behind TV, cable management)
- [ ] Documentation for staff

## Future Enhancements

1. **Phase 4**: Hardware optimization
   - DRM/KMS direct rendering
   - Hardware video encode/decode
   - Zero-copy buffers

2. **Remote Fleet Management**
   - Cloud dashboard
   - Firmware updates
   - Analytics and reporting

3. **Advanced Features**
   - EPG integration for scheduling
   - Sports detection (keep ads during sports)
   - Custom content per location/time
   - Multiple TV support per location

## Support and Contact

For issues, questions, or contributions:
- GitHub Issues: https://github.com/yourusername/live-ad-detection/issues
- Documentation: https://docs.example.com/livetv
- Email: support@example.com

## License

[Your chosen license]
