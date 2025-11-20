#!/bin/bash
# Live Ad Detection - Setup Script
# This script sets up the Live Ad Detection system on a device

set -e

echo "=== Live Ad Detection Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Project directory: $PROJECT_DIR"
echo ""

# Detect device role
echo "Device Configuration:"
echo "1) Head device (with touchscreen)"
echo "2) Cluster node (with small display)"
echo "3) Cluster node (headless)"
read -p "Select device type [1-3]: " DEVICE_TYPE

case $DEVICE_TYPE in
    1)
        DEVICE_ROLE="head"
        ENABLE_TOUCHSCREEN=true
        ENABLE_DISPLAY=false
        ;;
    2)
        DEVICE_ROLE="node"
        ENABLE_TOUCHSCREEN=false
        ENABLE_DISPLAY=true
        ;;
    3)
        DEVICE_ROLE="node"
        ENABLE_TOUCHSCREEN=false
        ENABLE_DISPLAY=false
        ;;
    *)
        echo "Invalid selection"
        exit 1
        ;;
esac

echo ""
echo "Selected: $DEVICE_ROLE device"
echo ""

# Install system dependencies
echo "Installing system dependencies..."
apt-get update
apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    network-manager \
    wireless-tools \
    iw \
    hostapd \
    dnsmasq \
    git

# Install touchscreen dependencies if needed
if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    echo "Installing touchscreen dependencies..."
    apt-get install -y \
        libsdl2-dev \
        libsdl2-image-dev \
        libsdl2-mixer-dev \
        libsdl2-ttf-dev \
        libportmidi-dev \
        libswscale-dev \
        libavformat-dev \
        libavcodec-dev \
        zlib1g-dev \
        libgstreamer1.0-dev \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good
fi

# Install Python dependencies
echo "Installing Python dependencies..."
cd "$PROJECT_DIR"
pip3 install -r requirements.txt

# Install the package
echo "Installing Live Ad Detection package..."
pip3 install -e .

# Create configuration directory
echo "Creating configuration directory..."
mkdir -p /etc/live-ad-detection

# Copy and update configuration
echo "Setting up configuration..."
if [ -f /etc/live-ad-detection/device_config.yaml ]; then
    echo "Configuration file already exists, backing up..."
    cp /etc/live-ad-detection/device_config.yaml /etc/live-ad-detection/device_config.yaml.backup
fi

cp "$PROJECT_DIR/config/device_config.yaml" /etc/live-ad-detection/device_config.yaml

# Update configuration based on device type
sed -i "s/device_role: .*/device_role: \"$DEVICE_ROLE\"/" /etc/live-ad-detection/device_config.yaml
sed -i "s/enabled: true  # Set to false for cluster nodes/enabled: $ENABLE_TOUCHSCREEN/" /etc/live-ad-detection/device_config.yaml
sed -i "s/enabled: false  # Enable for cluster nodes/enabled: $ENABLE_DISPLAY/" /etc/live-ad-detection/device_config.yaml

# Install systemd services
echo "Installing systemd services..."

# Web interface service
cat > /etc/systemd/system/live-ad-web.service << EOF
[Unit]
Description=Live Ad Detection Web Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
Environment="PYTHONPATH=$PROJECT_DIR/src"
ExecStart=/usr/bin/python3 -m live_ad_detection.web_interface.app
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Touchscreen UI service (only for head device)
if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    cat > /etc/systemd/system/live-ad-touch.service << EOF
[Unit]
Description=Live Ad Detection Touchscreen UI
After=graphical.target
Requires=graphical.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
Environment="PYTHONPATH=$PROJECT_DIR/src"
Environment="DISPLAY=:0"
ExecStart=/usr/bin/python3 -m live_ad_detection.touchscreen_ui.app
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
EOF
fi

# Reload systemd
systemctl daemon-reload

# Enable and start services
echo "Enabling services..."
systemctl enable live-ad-web.service

if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    systemctl enable live-ad-touch.service
fi

# Ask to start services now
read -p "Start services now? [Y/n]: " START_NOW
if [ "$START_NOW" != "n" ] && [ "$START_NOW" != "N" ]; then
    echo "Starting services..."
    systemctl start live-ad-web.service

    if [ "$ENABLE_TOUCHSCREEN" = true ]; then
        systemctl start live-ad-touch.service
    fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services installed:"
echo "  - live-ad-web.service (Web Interface)"
if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    echo "  - live-ad-touch.service (Touchscreen UI)"
fi
echo ""
echo "Configuration file: /etc/live-ad-detection/device_config.yaml"
echo ""
echo "To check service status:"
echo "  sudo systemctl status live-ad-web"
if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    echo "  sudo systemctl status live-ad-touch"
fi
echo ""
echo "To view logs:"
echo "  sudo journalctl -u live-ad-web -f"
if [ "$ENABLE_TOUCHSCREEN" = true ]; then
    echo "  sudo journalctl -u live-ad-touch -f"
fi
echo ""
echo "Web interface will be available at: http://$(hostname -I | awk '{print $1}'):5000"
echo ""
