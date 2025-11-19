#!/bin/bash
# Installation script for Live TV Ad Detection Edge Device
# Run on Raspberry Pi with sudo

set -e

echo "======================================"
echo "Installing Ad Detection Edge Device"
echo "======================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root (sudo ./install-edge-device.sh)"
    exit 1
fi

# Get actual user (when running with sudo)
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

echo "Installing for user: $ACTUAL_USER"

# Configuration
INSTALL_DIR="/opt/ad-detection"
CONFIG_DIR="/etc/ad-detection"
LOG_DIR="/var/log/ad-detection"
REPO_URL="${REPO_URL:-https://github.com/your-org/live-ad-detection.git}"

# Step 1: Install system dependencies
echo ""
echo "Step 1: Installing system dependencies..."
apt-get update
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    avahi-daemon \
    lirc \
    cec-utils \
    libatlas-base-dev \
    libopencv-dev \
    ffmpeg \
    v4l-utils

# Step 2: Clone repository
echo ""
echo "Step 2: Cloning repository..."
if [ ! -d "$INSTALL_DIR" ]; then
    git clone "$REPO_URL" "$INSTALL_DIR"
    chown -R $ACTUAL_USER:$ACTUAL_USER "$INSTALL_DIR"
else
    echo "Directory $INSTALL_DIR already exists, pulling latest..."
    cd "$INSTALL_DIR"
    sudo -u $ACTUAL_USER git pull
fi

cd "$INSTALL_DIR"

# Step 3: Set up Python virtual environment
echo ""
echo "Step 3: Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    sudo -u $ACTUAL_USER python3 -m venv venv
fi

source venv/bin/activate

# Step 4: Install Python packages
echo ""
echo "Step 4: Installing Python packages..."
pip install --upgrade pip setuptools wheel

# Install packages in dependency order
pip install -e packages/shared/python-common
pip install -e packages/edge-device

# Step 5: Create directories
echo ""
echo "Step 5: Creating directories..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
chown -R $ACTUAL_USER:$ACTUAL_USER "$LOG_DIR"

# Step 6: Copy configuration files
echo ""
echo "Step 6: Setting up configuration..."
if [ ! -f "$CONFIG_DIR/edge-device.env" ]; then
    cp deployment/config/edge-device.env.example "$CONFIG_DIR/edge-device.env"
    echo "Created $CONFIG_DIR/edge-device.env - PLEASE EDIT THIS FILE!"
else
    echo "Configuration file already exists at $CONFIG_DIR/edge-device.env"
fi

# Step 7: Install systemd service
echo ""
echo "Step 7: Installing systemd service..."

# Ask user for device role
echo ""
read -p "Is this device a coordinator? (y/N): " is_coordinator

if [[ "$is_coordinator" =~ ^[Yy]$ ]]; then
    cp deployment/systemd/ad-detection-coordinator.service /etc/systemd/system/
    SERVICE_NAME="ad-detection-coordinator"
else
    cp deployment/systemd/ad-detection-edge.service /etc/systemd/system/
    SERVICE_NAME="ad-detection-edge"
fi

systemctl daemon-reload

# Step 8: Configure mDNS
echo ""
echo "Step 8: Configuring mDNS (Avahi)..."
systemctl enable avahi-daemon
systemctl start avahi-daemon

# Step 9: Configure IR blaster (if present)
echo ""
echo "Step 9: Checking for IR blaster..."
if [ -e "/dev/lirc0" ]; then
    echo "IR blaster detected at /dev/lirc0"
    # Add user to lirc group
    usermod -a -G lirc $ACTUAL_USER
else
    echo "No IR blaster detected (this is optional)"
fi

# Step 10: Configure video capture
echo ""
echo "Step 10: Configuring video capture..."
# Add user to video group
usermod -a -G video $ACTUAL_USER

# Check for video devices
if ls /dev/video* 1> /dev/null 2>&1; then
    echo "Video devices found:"
    ls -l /dev/video*
else
    echo "No video devices found (will use mock capture for testing)"
fi

# Step 11: Set up log rotation
echo ""
echo "Step 11: Setting up log rotation..."
cat > /etc/logrotate.d/ad-detection <<EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $ACTUAL_USER $ACTUAL_USER
    sharedscripts
    postrotate
        systemctl reload $SERVICE_NAME > /dev/null 2>&1 || true
    endscript
}
EOF

# Step 12: Final instructions
echo ""
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Edit configuration file: sudo nano $CONFIG_DIR/edge-device.env"
echo "   - Set DEVICE_ID (unique identifier)"
echo "   - Set LOCATION_ID (from cloud API)"
echo "   - Set CLOUD_API_URL (cloud API endpoint)"
echo "   - Configure other settings as needed"
echo ""
echo "2. Enable service: sudo systemctl enable $SERVICE_NAME"
echo ""
echo "3. Start service: sudo systemctl start $SERVICE_NAME"
echo ""
echo "4. Check status: sudo systemctl status $SERVICE_NAME"
echo ""
echo "5. View logs: sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "For manual testing:"
echo "  cd $INSTALL_DIR"
echo "  source venv/bin/activate"
echo "  cd packages/edge-device/examples"
echo "  python demo_complete_system.py --help"
echo ""
echo "======================================"
