#!/bin/bash
# Deploy Live Ad Detection to Cluster Node

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
    echo "  --head-ip <ip>        Head device IP address"
    echo "  --node-name <name>    Node name (default: auto-generated)"
    echo "  --with-display        Enable small display support"
    echo "  --display-type <type> Display type: oled, lcd, e-ink (default: oled)"
    echo "  --ap-ssid <ssid>      Access Point SSID for setup (default: LiveAdNode)"
    echo ""
    echo "Examples:"
    echo "  $0 192.168.1.101 --head-ip 192.168.1.100"
    echo "  $0 192.168.1.101 --head-ip 192.168.1.100 --with-display --display-type oled"
    exit 1
fi

# Parse arguments
HEAD_IP=""
NODE_NAME="node-$(date +%s)"
WITH_DISPLAY="false"
DISPLAY_TYPE="oled"
AP_SSID="LiveAdNode"

shift # Remove device IP from args

while [[ $# -gt 0 ]]; do
    case $1 in
        --user)
            DEPLOY_USER="$2"
            shift 2
            ;;
        --head-ip)
            HEAD_IP="$2"
            shift 2
            ;;
        --node-name)
            NODE_NAME="$2"
            shift 2
            ;;
        --with-display)
            WITH_DISPLAY="true"
            shift
            ;;
        --display-type)
            DISPLAY_TYPE="$2"
            shift 2
            ;;
        --ap-ssid)
            AP_SSID="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}=== Deploying Cluster Node ===${NC}"
echo "Device IP: $DEVICE_IP"
echo "User: $DEPLOY_USER"
echo "Node Name: $NODE_NAME"
echo "Head IP: ${HEAD_IP:-Not set}"
echo "Display: $WITH_DISPLAY ($DISPLAY_TYPE)"
echo ""

# Check SSH access
echo -e "${YELLOW}Checking SSH access...${NC}"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${DEPLOY_USER}@${DEVICE_IP} exit 2>/dev/null; then
    echo -e "${RED}Cannot connect to ${DEVICE_IP}${NC}"
    echo "Make sure SSH is enabled and keys are set up"
    exit 1
fi
echo -e "${GREEN}✓ SSH access confirmed${NC}"

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy project files
echo -e "${YELLOW}Preparing deployment package...${NC}"
rsync -av --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
    "${PROJECT_DIR}/" "${TEMP_DIR}/live-ad-detection/"

# Create custom configuration for cluster node
cat > "${TEMP_DIR}/live-ad-detection/config/device_config.yaml" << EOF
# Live Ad Detection Device Configuration - Cluster Node
device_role: "node"

wifi:
  primary_interface: "wlan0"
  ap_interface: "wlan1"
  ap_ssid: "${AP_SSID}"
  ap_password: ""
  auto_start_ap: true

web_interface:
  enabled: true
  host: "0.0.0.0"
  port: 5000
  auto_start: true

touchscreen:
  enabled: false
  auto_start: false

display:
  enabled: ${WITH_DISPLAY}
  type: "${DISPLAY_TYPE}"
  show_info:
    - "hostname"
    - "ip_address"
    - "cpu_usage"
    - "memory_usage"
    - "network_status"

ad_detection:
  enabled: false
  confidence_threshold: 0.8

cluster:
  enabled: true
  head_node_ip: "${HEAD_IP}"
  node_name: "${NODE_NAME}"
  sync_interval: 10

logging:
  level: "INFO"
  file: "/var/log/live-ad-detection.log"
  max_size_mb: 10
  backup_count: 5

system:
  auto_update: false
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

# Install systemd service
echo "Installing systemd service..."
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

# Create log directory
mkdir -p /var/log
touch /var/log/live-ad-detection.log
chmod 644 /var/log/live-ad-detection.log

# Reload systemd
systemctl daemon-reload
systemctl enable live-ad-web.service
systemctl restart live-ad-web.service

# Clean up
rm -rf /tmp/live-ad-detection-deploy

echo "Installation complete!"

ENDROOT
ENDSSH

# Check service status
echo -e "${YELLOW}Checking service status...${NC}"
ssh ${DEPLOY_USER}@${DEVICE_IP} "sudo systemctl status live-ad-web.service --no-pager" || true

# Display completion info
echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Cluster Node Details:"
echo "  Node Name: $NODE_NAME"
echo "  IP Address: $DEVICE_IP"
echo "  Web Interface: http://${DEVICE_IP}:5000"
echo "  Head Device: ${HEAD_IP:-Not configured}"
echo "  AP SSID: ${AP_SSID} (for initial setup)"
echo ""
echo "To check logs:"
echo "  ssh ${DEPLOY_USER}@${DEVICE_IP} sudo journalctl -u live-ad-web -f"
echo ""
