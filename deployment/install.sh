#!/bin/bash

#
# Live TV Ad Detection System - Installation Script
# For Raspberry Pi 4/5 running Raspberry Pi OS (Debian Bullseye/Bookworm)
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installation paths
INSTALL_DIR="/opt/ad-detection"
DATA_DIR="/var/lib/ad-detection"
LOG_DIR="/var/log/ad-detection"
VENV_DIR="${INSTALL_DIR}/venv"

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_raspberry_pi() {
    if [ ! -f /proc/device-tree/model ]; then
        print_error "This doesn't appear to be a Raspberry Pi"
        exit 1
    fi

    model=$(cat /proc/device-tree/model)
    print_info "Detected: $model"

    if [[ ! "$model" =~ "Raspberry Pi 4" ]] && [[ ! "$model" =~ "Raspberry Pi 5" ]]; then
        print_error "This script is designed for Raspberry Pi 4 or 5"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

update_system() {
    print_header "Updating System Packages"

    apt-get update
    apt-get upgrade -y

    print_success "System updated"
}

install_dependencies() {
    print_header "Installing System Dependencies"

    # System packages
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        build-essential \
        git \
        curl \
        wget \
        rsync \
        sqlite3 \
        postgresql-client \
        redis-tools \
        avahi-daemon \
        avahi-utils \
        libnss-mdns

    print_success "System packages installed"

    print_header "Installing Multimedia Dependencies"

    # Multimedia packages
    apt-get install -y \
        gstreamer1.0-tools \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-ugly \
        gstreamer1.0-libav \
        v4l-utils \
        ffmpeg \
        vlc \
        python3-opencv \
        libopencv-dev

    print_success "Multimedia packages installed"

    print_header "Installing Audio Dependencies"

    # Audio packages
    apt-get install -y \
        alsa-utils \
        pulseaudio \
        pulseaudio-module-bluetooth \
        bluez \
        bluez-tools

    print_success "Audio packages installed"

    print_header "Installing Display/Graphics Dependencies"

    # Graphics and UI packages
    apt-get install -y \
        xserver-xorg \
        xinit \
        x11-xserver-utils \
        matchbox-window-manager \
        unclutter \
        chromium-browser \
        firefox-esr \
        python3-pygame \
        fonts-dejavu \
        fonts-liberation

    print_success "Display/graphics packages installed"

    print_header "Installing IR Remote Support"

    # IR remote packages
    apt-get install -y \
        lirc \
        ir-keytable

    print_success "IR remote packages installed"

    print_header "Installing CEC Support"

    # HDMI-CEC packages
    apt-get install -y \
        cec-utils \
        libcec6 \
        python3-cec

    print_success "CEC packages installed"
}

create_directories() {
    print_header "Creating Directory Structure"

    mkdir -p ${INSTALL_DIR}
    mkdir -p ${DATA_DIR}/{models,content,karaoke,video-channels,browser,config,cluster}
    mkdir -p ${LOG_DIR}

    print_success "Directories created"
}

create_user() {
    print_header "Creating Service User"

    if id "pi" &>/dev/null; then
        print_info "User 'pi' already exists"
    else:
        useradd -r -s /bin/bash -d /home/pi -m pi
        print_success "User 'pi' created"
    fi

    # Add user to required groups
    usermod -aG video pi
    usermod -aG audio pi
    usermod -aG input pi
    usermod -aG bluetooth pi
    usermod -aG netdev pi

    # Set permissions
    chown -R pi:pi ${INSTALL_DIR}
    chown -R pi:pi ${DATA_DIR}
    chown -R pi:pi ${LOG_DIR}

    print_success "User configured"
}

install_python_packages() {
    print_header "Installing Python Packages"

    # Create virtual environment
    sudo -u pi python3 -m venv ${VENV_DIR}

    # Upgrade pip
    sudo -u pi ${VENV_DIR}/bin/pip install --upgrade pip setuptools wheel

    # Install core packages
    sudo -u pi ${VENV_DIR}/bin/pip install \
        fastapi \
        uvicorn[standard] \
        sqlalchemy \
        alembic \
        redis \
        python-multipart \
        jinja2 \
        pydantic \
        pydantic-settings \
        httpx \
        aiofiles \
        python-jose[cryptography] \
        passlib[bcrypt] \
        python-dotenv

    # Install ML packages
    sudo -u pi ${VENV_DIR}/bin/pip install \
        tensorflow-lite \
        numpy \
        pillow \
        opencv-python-headless

    # Install pygame
    sudo -u pi ${VENV_DIR}/bin/pip install pygame

    # Install monitoring packages
    sudo -u pi ${VENV_DIR}/bin/pip install \
        psutil \
        prometheus-client

    print_success "Python packages installed"
}

copy_application_files() {
    print_header "Copying Application Files"

    # Copy package files
    if [ -d "packages/edge-device/src" ]; then
        rsync -av packages/edge-device/src/ ${INSTALL_DIR}/packages/edge-device/src/
        chown -R pi:pi ${INSTALL_DIR}
        print_success "Application files copied"
    else
        print_error "Application source files not found"
        print_info "Please run this script from the repository root"
        exit 1
    fi
}

install_systemd_services() {
    print_header "Installing Systemd Services"

    # Copy service files
    if [ -d "deployment/systemd" ]; then
        cp deployment/systemd/*.service /etc/systemd/system/
        systemctl daemon-reload
        print_success "Systemd services installed"
    else
        print_error "Systemd service files not found"
        exit 1
    fi
}

configure_boot() {
    print_header "Configuring Boot Settings"

    # Enable autologin for pi user
    systemctl set-default graphical.target

    # Create autologin configuration
    mkdir -p /etc/systemd/system/getty@tty1.service.d
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I \$TERM
EOF

    # Configure X11 to start automatically
    sudo -u pi mkdir -p /home/pi/.config/autostart
    cat > /home/pi/.config/autostart/homescreen.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Home Screen
Exec=/usr/bin/startx
EOF

    # Create .xinitrc for auto-starting home screen
    cat > /home/pi/.xinitrc <<EOF
#!/bin/sh
# Disable screen saver and power management
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 0.1 &

# Start matchbox window manager
matchbox-window-manager &

# Wait for window manager
sleep 2

# Start home screen
cd ${INSTALL_DIR}
${VENV_DIR}/bin/python -m home_screen.launcher
EOF

    chmod +x /home/pi/.xinitrc
    chown pi:pi /home/pi/.xinitrc

    print_success "Boot configuration complete"
}

configure_audio() {
    print_header "Configuring Audio"

    # Set default audio output to auto
    sudo -u pi amixer cset numid=3 0

    # Set default volume to 80%
    sudo -u pi amixer set PCM 80%

    print_success "Audio configured"
}

configure_network() {
    print_header "Configuring Network"

    # Enable mDNS
    systemctl enable avahi-daemon
    systemctl start avahi-daemon

    # Set hostname
    hostnamectl set-hostname ad-detection

    print_success "Network configured"
}

enable_services() {
    print_header "Enabling Services"

    # Enable and start cluster coordinator
    systemctl enable ad-detection-cluster.service
    systemctl start ad-detection-cluster.service

    # Enable (but don't start) web interface (only runs on leader)
    systemctl enable ad-detection-web.service

    # Enable (but don't start until after boot) homescreen
    # We'll let the .xinitrc handle starting it
    # systemctl enable ad-detection-homescreen.service

    print_success "Services enabled"
}

create_default_configs() {
    print_header "Creating Default Configurations"

    # Create default boot config
    cat > ${DATA_DIR}/boot_config.json <<EOF
{
  "auto_start": true,
  "default_app": null,
  "boot_delay_seconds": 5,
  "enable_splash_screen": true,
  "auto_launch_delay": 3,
  "restore_last_app": false,
  "last_app": null,
  "kiosk_mode": false
}
EOF

    chown pi:pi ${DATA_DIR}/boot_config.json

    print_success "Default configurations created"
}

print_summary() {
    print_header "Installation Complete!"

    echo ""
    echo -e "${GREEN}Installation successful!${NC}"
    echo ""
    echo "Installation directory: ${INSTALL_DIR}"
    echo "Data directory: ${DATA_DIR}"
    echo "Log directory: ${LOG_DIR}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Reboot the system: sudo reboot"
    echo "2. The home screen will start automatically after boot"
    echo "3. Access the web interface at: http://$(hostname).local:8080"
    echo "4. Configure your organization and location IDs"
    echo ""
    echo -e "${YELLOW}Service Management:${NC}"
    echo "  - View logs: journalctl -u ad-detection-homescreen -f"
    echo "  - Check status: systemctl status ad-detection-cluster"
    echo "  - Stop home screen: sudo systemctl stop ad-detection-homescreen"
    echo ""
}

# Main installation flow
main() {
    print_header "Live TV Ad Detection System - Installation"

    check_root
    check_raspberry_pi

    print_info "This will install the Ad Detection system and all dependencies"
    read -p "Continue with installation? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled"
        exit 0
    fi

    update_system
    install_dependencies
    create_directories
    create_user
    install_python_packages
    copy_application_files
    install_systemd_services
    configure_boot
    configure_audio
    configure_network
    create_default_configs
    enable_services

    print_summary
}

# Run main installation
main "$@"
