#!/bin/bash
# Deploy Live Ad Detection to Head Device

set -e

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_USER="${DEPLOY_USER:-pi}"
DEVICE_IP="${1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$DEVICE_IP" ]; then
    echo -e "${RED}Error: Device IP address required${NC}"
    echo "Usage: $0 <device-ip> [options]"
    echo ""
    echo "Options:"
    echo "  --user <username>     SSH username (default: pi)"
    echo "  --ap-ssid <ssid>      Access Point SSID (default: LiveAdDetection)"
    echo "  --ap-password <pass>  Access Point password (optional)"
    echo "  --no-touchscreen      Disable touchscreen UI"
    echo ""
    echo "Examples:"
    echo "  $0 192.168.1.100"
    echo "  $0 192.168.1.100 --user ubuntu --ap-ssid MyCluster"
    exit 1
fi

# Parse arguments
AP_SSID="LiveAdDetection"
AP_PASSWORD=""
ENABLE_TOUCHSCREEN="true"

shift # Remove device IP from args

while [[ $# -gt 0 ]]; do
    case $1 in
        --user)
            DEPLOY_USER="$2"
            shift 2
            ;;
        --ap-ssid)
            AP_SSID="$2"
            shift 2
            ;;
        --ap-password)
            AP_PASSWORD="$2"
            shift 2
            ;;
        --no-touchscreen)
            ENABLE_TOUCHSCREEN="false"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}=== Deploying Head Device ===${NC}"
echo "Device IP: $DEVICE_IP"
echo "User: $DEPLOY_USER"
echo "AP SSID: $AP_SSID"
echo "Touchscreen: $ENABLE_TOUCHSCREEN"
echo ""

# Check SSH access
echo -e "${YELLOW}Checking SSH access...${NC}"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${DEPLOY_USER}@${DEVICE_IP} exit 2>/dev/null; then
    echo -e "${RED}Cannot connect to ${DEVICE_IP}${NC}"
    echo "Make sure:"
    echo "  1. Device is powered on and connected"
    echo "  2. SSH is enabled"
    echo "  3. SSH keys are set up or use: ssh-copy-id ${DEPLOY_USER}@${DEVICE_IP}"
    exit 1
fi
echo -e "${GREEN}✓ SSH access confirmed${NC}"

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy project files to temp directory
echo -e "${YELLOW}Preparing deployment package...${NC}"
rsync -av --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
    "${PROJECT_DIR}/" "${TEMP_DIR}/live-ad-detection/"

# Create custom configuration for head device
cat > "${TEMP_DIR}/live-ad-detection/config/device_config.yaml" << EOF
# Live Ad Detection Device Configuration - Head Device
device_role: "head"

wifi:
  primary_interface: "wlan0"
  ap_interface: "wlan1"
  ap_ssid: "${AP_SSID}"
  ap_password: "${AP_PASSWORD}"
  auto_start_ap: true
  ap_channel: 6
  ap_ip: "192.168.4.1"
  ap_netmask: "255.255.255.0"

web_interface:
  enabled: true
  host: "0.0.0.0"
  port: 5000
  auto_start: true

touchscreen:
  enabled: ${ENABLE_TOUCHSCREEN}
  auto_start: ${ENABLE_TOUCHSCREEN}
  fullscreen: true
  resolution:
    width: 800
    height: 480

display:
  enabled: false

ad_detection:
  enabled: false
  model_path: "/opt/live-ad-detection/models/ad_detector.h5"
  confidence_threshold: 0.8

cluster:
  enabled: true
  head_node_ip: ""
  sync_interval: 10

logging:
  level: "INFO"
  file: "/var/log/live-ad-detection.log"
  max_size_mb: 10
  backup_count: 5

system:
  auto_update: false
  update_check_interval: 86400
EOF

# Transfer files to device
echo -e "${YELLOW}Transferring files to device...${NC}"
ssh ${DEPLOY_USER}@${DEVICE_IP} "mkdir -p /tmp/live-ad-detection-deploy"
rsync -avz --progress "${TEMP_DIR}/live-ad-detection/" \
    ${DEPLOY_USER}@${DEVICE_IP}:/tmp/live-ad-detection-deploy/

# Run installation on device
echo -e "${YELLOW}Installing on device...${NC}"
ssh ${DEPLOY_USER}@${DEVICE_IP} << 'ENDSSH'
set -e

echo "Switching to root for installation..."
sudo bash << 'ENDROOT'
set -e

# Update system
echo "Updating system packages..."
apt-get update

# Install dependencies
echo "Installing system dependencies..."
apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    network-manager \
    wireless-tools \
    iw \
    hostapd \
    dnsmasq \
    git \
    rsync

# Install touchscreen dependencies
if grep -q "enabled: true" /tmp/live-ad-detection-deploy/config/device_config.yaml; then
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

# Copy to permanent location
echo "Installing to /opt/live-ad-detection..."
mkdir -p /opt/live-ad-detection
rsync -av /tmp/live-ad-detection-deploy/ /opt/live-ad-detection/

# Install Python dependencies
echo "Installing Python packages..."
cd /opt/live-ad-detection
pip3 install -r requirements.txt

# Create configuration directory
echo "Setting up configuration..."
mkdir -p /etc/live-ad-detection
cp /opt/live-ad-detection/config/device_config.yaml /etc/live-ad-detection/

# Install systemd services
echo "Installing systemd services..."

# Web interface service
cat > /etc/systemd/system/live-ad-web.service << 'EOF'
[Unit]
Description=Live Ad Detection Web Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/live-ad-detection
Environment="PYTHONPATH=/opt/live-ad-detection/src"
ExecStart=/usr/bin/python3 -m live_ad_detection.web_interface.app
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Touchscreen UI service
if grep -q "enabled: true" /etc/live-ad-detection/device_config.yaml; then
    cat > /etc/systemd/system/live-ad-touch.service << 'EOF'
[Unit]
Description=Live Ad Detection Touchscreen UI
After=graphical.target
Requires=graphical.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/live-ad-detection
Environment="PYTHONPATH=/opt/live-ad-detection/src"
Environment="DISPLAY=:0"
ExecStart=/usr/bin/python3 -m live_ad_detection.touchscreen_ui.app
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
EOF
fi

# Create log directory
mkdir -p /var/log
touch /var/log/live-ad-detection.log
chmod 644 /var/log/live-ad-detection.log

# Reload systemd
systemctl daemon-reload

# Enable services
systemctl enable live-ad-web.service
if [ -f /etc/systemd/system/live-ad-touch.service ]; then
    systemctl enable live-ad-touch.service
fi

# Start services
echo "Starting services..."
systemctl restart live-ad-web.service
if [ -f /etc/systemd/system/live-ad-touch.service ]; then
    systemctl restart live-ad-touch.service
fi

# Clean up
rm -rf /tmp/live-ad-detection-deploy

echo "Installation complete!"

ENDROOT
ENDSSH

# Check service status
echo -e "${YELLOW}Checking service status...${NC}"
ssh ${DEPLOY_USER}@${DEVICE_IP} "sudo systemctl status live-ad-web.service --no-pager" || true

# Get device info
echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Head Device Details:"
echo "  IP Address: $DEVICE_IP"
echo "  Web Interface: http://${DEVICE_IP}:5000"
echo "  AP SSID: ${AP_SSID}"
if [ -n "$AP_PASSWORD" ]; then
    echo "  AP Password: ${AP_PASSWORD}"
else
    echo "  AP Password: (open network)"
fi
echo ""
echo "To check logs:"
echo "  ssh ${DEPLOY_USER}@${DEVICE_IP} sudo journalctl -u live-ad-web -f"
echo ""
echo "To restart services:"
echo "  ssh ${DEPLOY_USER}@${DEVICE_IP} sudo systemctl restart live-ad-web"
if [ "$ENABLE_TOUCHSCREEN" = "true" ]; then
    echo "  ssh ${DEPLOY_USER}@${DEVICE_IP} sudo systemctl restart live-ad-touch"
fi
echo ""
