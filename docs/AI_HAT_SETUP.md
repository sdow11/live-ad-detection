# Raspberry Pi AI HAT Setup Guide

Complete guide for setting up the Raspberry Pi AI HAT (Hailo-8L) for live ad detection.

## Table of Contents

1. [Hardware Requirements](#hardware-requirements)
2. [AI HAT Overview](#ai-hat-overview)
3. [Installation](#installation)
4. [HDMI Capture Setup](#hdmi-capture-setup)
5. [Video Passthrough](#video-passthrough)
6. [Configuration](#configuration)
7. [Model Preparation](#model-preparation)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

## Hardware Requirements

### Required Components

**Raspberry Pi AI HAT:**
- Raspberry Pi AI HAT (with Hailo-8L accelerator)
- Provides 13 TOPS of AI acceleration
- Connects via M.2 HAT+ connector

**Raspberry Pi:**
- Raspberry Pi 5 (required for AI HAT)
- 4GB or 8GB RAM recommended
- Active cooling recommended for sustained workloads

**HDMI Capture:**
- 2x USB HDMI capture cards (for dual stream support)
- Recommended: USB 3.0 capture cards with passthrough
- Examples:
  - Elgato Cam Link 4K
  - AverMedia Live Gamer Portable
  - Generic USB3.0 HDMI capture cards

**Power:**
- Official Raspberry Pi 27W USB-C Power Supply
- Or 5V 5A power supply with USB-C connector

**Storage:**
- MicroSD card (32GB+ recommended)
- Or NVMe SSD for better performance

**Optional:**
- Touchscreen display for head device
- Active cooling fan
- Case with HAT support

## AI HAT Overview

### Hailo-8L Specifications

The Raspberry Pi AI HAT uses the Hailo-8L AI processor:

- **Performance:** 13 TOPS (Tera Operations Per Second)
- **Architecture:** Hailo's proprietary neural network processor
- **Supported Frameworks:** TensorFlow, PyTorch, ONNX, Keras
- **Power Consumption:** ~2.5W typical
- **Supported Models:** Object detection, classification, segmentation

### What It Can Do

**Video Processing:**
- Real-time inference on 1080p video @ 30fps
- Dual stream processing simultaneously
- Hardware-accelerated frame preprocessing
- Low latency (<50ms per frame)

**Ad Detection:**
- Detect multiple ad types simultaneously
- High confidence scoring
- Bounding box localization
- Support for custom trained models

## Installation

### 1. Install Raspberry Pi OS

```bash
# Use Raspberry Pi Imager to flash latest Raspberry Pi OS (64-bit)
# Enable SSH and set hostname during imaging
```

### 2. Update System

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

### 3. Install Hailo Software

```bash
# Add Hailo repository
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:hailo/stable

# Update package list
sudo apt update

# Install Hailo runtime and tools
sudo apt install -y hailo-all

# Verify installation
hailo version
```

Expected output:
```
Hailo Software Suite version: X.X.X
Hailo Runtime version: X.X.X
```

### 4. Install Python Dependencies

```bash
# Navigate to project directory
cd /opt/live-ad-detection

# Install dependencies
pip3 install -r requirements.txt

# Install Hailo Python bindings
pip3 install hailo-platform
```

### 5. Verify AI HAT Detection

```bash
# Check if Hailo device is detected
hailo scan

# Should show:
# Found 1 Hailo device(s):
#   Device 0: Hailo-8L
```

## HDMI Capture Setup

### 1. Connect HDMI Capture Cards

**Physical Setup:**
1. Connect HDMI capture card #1 to USB 3.0 port (blue)
2. Connect HDMI capture card #2 to another USB 3.0 port
3. Connect HDMI sources (cable box, media player, etc.) to capture cards

### 2. Identify Video Devices

```bash
# List video devices
v4l2-ctl --list-devices

# Should show something like:
# USB Video: USB Video (usb-0000:01:00.0-1):
#     /dev/video0
#     /dev/video1
#
# USB Video: USB Video (usb-0000:01:00.0-2):
#     /dev/video2
#     /dev/video3
```

**Note the device paths** - typically:
- HDMI #1: `/dev/video0`
- HDMI #2: `/dev/video2`

### 3. Test Video Capture

```bash
# Test HDMI #1
ffplay /dev/video0

# Test HDMI #2
ffplay /dev/video2

# Or use provided test script
python3 /opt/live-ad-detection/examples/test_video_streams.py
```

### 4. Set Video Format

```bash
# Set format for HDMI #1 (1080p @ 30fps)
v4l2-ctl -d /dev/video0 --set-fmt-video=width=1920,height=1080,pixelformat=YUYV
v4l2-ctl -d /dev/video0 --set-parm=30

# Set format for HDMI #2
v4l2-ctl -d /dev/video2 --set-fmt-video=width=1920,height=1080,pixelformat=YUYV
v4l2-ctl -d /dev/video2 --set-parm=30
```

### 5. Configure Permissions

```bash
# Add user to video group
sudo usermod -a -G video $USER

# Set udev rules for consistent device naming
sudo nano /etc/udev/rules.d/99-hdmi-capture.rules
```

Add:
```
# HDMI Capture Card 1
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="XXXX", ATTRS{idProduct}=="YYYY", SYMLINK+="hdmi0"

# HDMI Capture Card 2
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="XXXX", ATTRS{idProduct}=="ZZZZ", SYMLINK+="hdmi1"
```

Replace XXXX, YYYY, ZZZZ with your device IDs from `lsusb`.

Reload udev:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

## Video Passthrough

### Hardware Passthrough

**If your capture cards support hardware passthrough:**
- HDMI input → Capture card → HDMI output
- Zero latency
- Automatic forwarding
- No configuration needed

### Software Passthrough

**For capture cards without hardware passthrough:**

The software handles passthrough in the video processing pipeline:

1. Frame captured from HDMI input
2. Copy sent to AI inference
3. Original frame sent to output device
4. Total latency: ~50-100ms

**To enable software passthrough:**
- Set `passthrough: true` in device configuration
- Specify output device (HDMI output, network stream, etc.)

## Configuration

### 1. Edit Device Configuration

```bash
sudo nano /etc/live-ad-detection/device_config.yaml
```

### 2. Enable AI HAT

```yaml
ad_detection:
  enabled: true
  confidence_threshold: 0.8

  ai_hat:
    enabled: true
    model_path: "/opt/live-ad-detection/models/ad_detector.hef"
    inference_threads: 2
    batch_size: 1
```

### 3. Configure Video Streams

```yaml
  video_streams:
    # HDMI Stream 0
    - stream_id: "hdmi0"
      enabled: true
      source_type: "hdmi"
      device_path: "/dev/video0"  # Or /dev/hdmi0 if using udev rules
      resolution:
        width: 1920
        height: 1080
      fps: 30
      passthrough: true
      passthrough_device: "/dev/video10"

    # HDMI Stream 1
    - stream_id: "hdmi1"
      enabled: true
      source_type: "hdmi"
      device_path: "/dev/video2"  # Or /dev/hdmi1
      resolution:
        width: 1920
        height: 1080
      fps: 30
      passthrough: true
      passthrough_device: "/dev/video11"
```

### 4. Configure Detection Settings

```yaml
  detection:
    min_confidence: 0.8
    frame_skip: 2  # Process every 2nd frame (15fps effective)
    detection_cooldown: 5
    save_detections: true
    save_path: "/var/lib/live-ad-detection/detections"
```

**Performance Tips:**
- `frame_skip: 1` = Process every frame (highest accuracy, most CPU)
- `frame_skip: 2` = Process every other frame (good balance)
- `frame_skip: 3` = Process every 3rd frame (best performance)

## Model Preparation

### Option 1: Use Pre-trained Model

```bash
# Download pre-trained ad detection model
mkdir -p /opt/live-ad-detection/models
cd /opt/live-ad-detection/models

# Download model (example URL - replace with actual)
wget https://example.com/models/ad_detector.hef

# Verify model
hailo parse-hef ad_detector.hef
```

### Option 2: Convert Your Own Model

**Prerequisites:**
- Trained TensorFlow, PyTorch, or ONNX model
- Hailo Model Zoo tools
- Hailo Dataflow Compiler

**Steps:**

1. **Export model to ONNX:**
```python
# For PyTorch
import torch
model = YourModel()
dummy_input = torch.randn(1, 3, 640, 640)
torch.onnx.export(model, dummy_input, "ad_detector.onnx")

# For TensorFlow
import tf2onnx
# ... conversion code
```

2. **Compile for Hailo:**
```bash
# Install Hailo Dataflow Compiler
hailo compile ad_detector.onnx \
  --output-dir ./compiled \
  --target hailo8l \
  --hw-arch hailo8l \
  --net ad-detector

# Output: ad_detector.hef
```

3. **Copy to device:**
```bash
cp compiled/ad_detector.hef /opt/live-ad-detection/models/
```

### Model Requirements

**Input Format:**
- Shape: [1, 3, 640, 640] or [1, 3, 416, 416]
- Format: RGB
- Normalization: 0-1 or ImageNet

**Output Format:**
- Object detection: [batch, num_detections, 6]
  - Where 6 = [x, y, w, h, confidence, class]
- Classification: [batch, num_classes]

## Testing

### 1. Test Video Capture

```bash
python3 /opt/live-ad-detection/examples/test_video_streams.py
```

Expected output:
```
✅ Added HDMI stream 0
✅ Added HDMI stream 1
✅ All streams started

--- Stats at 5s ---
hdmi0:
  Running: True
  FPS: 29.8
  Frames captured: 149
  Frames dropped: 0
```

### 2. Test AI HAT (Simulation Mode)

Without a model, test in simulation mode:

```bash
python3 << EOF
from live_ad_detection.ai_hat import HailoInference
hailo = HailoInference()
print(hailo.get_device_info())
EOF
```

### 3. Run Full Detection

```bash
# Run ad detection
python3 /opt/live-ad-detection/examples/run_ad_detection.py
```

Watch for:
```
✅ Ad detection running!
Frames processed: 1234
Total detections: 5
Inference time: 23.5ms
```

### 4. Verify Passthrough

Connect a monitor to your HDMI outputs and verify video is passing through correctly while detection is running.

## Troubleshooting

### AI HAT Not Detected

```bash
# Check PCIe connection
lspci | grep Hailo

# Should show: Hailo Technologies Ltd. Hailo-8 AI Processor

# If not found:
# 1. Power off
# 2. Reseat AI HAT
# 3. Check HAT is properly connected
# 4. Power on

# Check kernel module
lsmod | grep hailo

# Reload module if needed
sudo modprobe hailo_pcie
```

### Video Devices Not Found

```bash
# List USB devices
lsusb

# Should show your capture cards

# Check video devices
ls -l /dev/video*

# If not found:
# 1. Reconnect capture cards
# 2. Try different USB ports
# 3. Check USB 3.0 ports (blue)
```

### Low FPS / Dropped Frames

**Causes:**
- USB bandwidth saturation
- CPU overload
- Thermal throttling

**Solutions:**

1. **Reduce resolution:**
```yaml
resolution:
  width: 1280
  height: 720  # Use 720p instead of 1080p
```

2. **Increase frame skip:**
```yaml
detection:
  frame_skip: 3  # Process fewer frames
```

3. **Enable active cooling:**
```bash
# Monitor temperature
vcgencmd measure_temp

# If > 70°C, add cooling
```

4. **Use separate USB controllers:**
- Connect capture cards to different USB root hubs
- Check with: `lsusb -t`

### Model Loading Fails

```bash
# Verify model file
ls -lh /opt/live-ad-detection/models/ad_detector.hef

# Check model info
hailo parse-hef /opt/live-ad-detection/models/ad_detector.hef

# Verify permissions
sudo chmod 644 /opt/live-ad-detection/models/ad_detector.hef
```

### Passthrough Not Working

**Hardware passthrough:**
- Check HDMI cables are connected correctly
- Verify capture card supports passthrough

**Software passthrough:**
- Check logs: `sudo journalctl -u live-ad-detect -f`
- Verify output device exists
- Test with simple display: modify code to use cv2.imshow()

### High Latency

**Normal latency:**
- Hardware passthrough: <1ms
- Software passthrough: 50-100ms
- With AI inference: 100-150ms

**If latency is higher:**
1. Reduce video buffer:
```python
capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
```

2. Use hardware passthrough if available

3. Optimize inference:
   - Reduce input resolution
   - Use quantized model
   - Enable batch processing

## Performance Optimization

### Best Practices

1. **Use USB 3.0 ports** (blue) for capture cards
2. **Enable active cooling** for sustained workloads
3. **Use NVMe SSD** instead of SD card if possible
4. **Overclock carefully:**
```bash
# Edit config.txt
sudo nano /boot/firmware/config.txt

# Add (use with caution):
over_voltage=2
arm_freq=2400
```

5. **Monitor system:**
```bash
# CPU temperature
watch -n 1 vcgencmd measure_temp

# CPU frequency
watch -n 1 vcgencmd measure_clock arm

# Throttling status
vcgencmd get_throttled
```

### Expected Performance

**Single Stream (1080p @ 30fps):**
- Frame processing: ~30ms
- AI inference: ~20-30ms
- Total latency: ~50-60ms
- CPU usage: ~40-50%

**Dual Stream (2x 1080p @ 30fps):**
- Frame processing: ~30ms each
- AI inference: ~20-30ms each
- Total latency: ~60-80ms
- CPU usage: ~70-80%

## Next Steps

Once AI HAT is working:
1. Train custom ad detection model
2. Integrate with cluster API
3. Set up automated reporting
4. Configure alerts and notifications
5. Deploy to production

## Resources

- [Hailo Documentation](https://hailo.ai/developer-zone/)
- [Raspberry Pi AI HAT](https://www.raspberrypi.com/products/ai-hat/)
- [Model Zoo](https://github.com/hailo-ai/hailo_model_zoo)
- [Hailo Community Forum](https://community.hailo.ai/)
