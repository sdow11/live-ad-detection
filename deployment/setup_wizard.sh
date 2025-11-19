#!/bin/bash

#
# First-Time Setup Wizard
# Interactive configuration for new installations
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CONFIG_DIR="/var/lib/ad-detection/config"
mkdir -p $CONFIG_DIR

print_header() {
    clear
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     Live TV Ad Detection System - Setup Wizard          ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

prompt_device_name() {
    print_header
    echo -e "${YELLOW}Device Configuration${NC}"
    echo ""
    echo "Enter a name for this device (e.g., 'Living Room TV', 'Bar TV'):"
    read -p "> " device_name
    echo ""
    echo "Device name: $device_name"
}

prompt_network_config() {
    print_header
    echo -e "${YELLOW}Network Configuration${NC}"
    echo ""
    echo "Configure Wi-Fi? (y/n)"
    read -p "> " configure_wifi

    if [[ $configure_wifi =~ ^[Yy]$ ]]; then
        echo ""
        echo "Wi-Fi SSID:"
        read -p "> " wifi_ssid
        echo "Wi-Fi Password:"
        read -sp "> " wifi_password
        echo ""
    fi
}

prompt_display_config() {
    print_header
    echo -e "${YELLOW}Display Configuration${NC}"
    echo ""
    echo "Select resolution:"
    echo "  1) Auto (recommended)"
    echo "  2) 1920x1080 (1080p)"
    echo "  3) 1280x720 (720p)"
    echo "  4) 3840x2160 (4K)"
    read -p "> " resolution_choice

    case $resolution_choice in
        1) resolution="auto" ;;
        2) resolution="1920x1080" ;;
        3) resolution="1280x720" ;;
        4) resolution="3840x2160" ;;
        *) resolution="auto" ;;
    esac

    echo ""
    echo "Display rotation (0, 90, 180, 270):"
    read -p "> " rotation
    rotation=${rotation:-0}
}

prompt_audio_config() {
    print_header
    echo -e "${YELLOW}Audio Configuration${NC}"
    echo ""
    echo "Select default audio output:"
    echo "  1) Auto (recommended)"
    echo "  2) HDMI"
    echo "  3) 3.5mm jack"
    read -p "> " audio_choice

    case $audio_choice in
        1) audio_output="auto" ;;
        2) audio_output="hdmi" ;;
        3) audio_output="analog" ;;
        *) audio_output="auto" ;;
    esac

    echo ""
    echo "Default volume (0-100) [80]:"
    read -p "> " default_volume
    default_volume=${default_volume:-80}
}

prompt_remote_config() {
    print_header
    echo -e "${YELLOW}Remote Control Configuration${NC}"
    echo ""
    echo "Do you have an IR remote? (y/n)"
    read -p "> " has_ir_remote

    echo ""
    echo "Do you want to use Bluetooth remote? (y/n)"
    read -p "> " use_bt_remote

    echo ""
    echo "Enable HDMI-CEC control? (y/n)"
    read -p "> " enable_cec
}

prompt_organization() {
    print_header
    echo -e "${YELLOW}Organization Configuration${NC}"
    echo ""
    echo "This device belongs to an organization."
    echo ""
    echo "Organization Name:"
    read -p "> " org_name

    echo ""
    echo "Location Name (e.g., 'Main Bar', 'Restaurant Floor 2'):"
    read -p "> " location_name
}

prompt_cloud_api() {
    print_header
    echo -e "${YELLOW}Cloud API Configuration${NC}"
    echo ""
    echo "Enable cloud management? (y/n)"
    read -p "> " enable_cloud

    if [[ $enable_cloud =~ ^[Yy]$ ]]; then
        echo ""
        echo "API Endpoint [https://api.example.com]:"
        read -p "> " api_endpoint
        api_endpoint=${api_endpoint:-https://api.example.com}

        echo ""
        echo "API Key:"
        read -sp "> " api_key
        echo ""
    fi
}

save_configuration() {
    print_header
    echo -e "${YELLOW}Saving Configuration...${NC}"
    echo ""

    # Generate device ID
    device_id=$(cat /proc/sys/kernel/random/uuid)

    # Create system configuration
    cat > $CONFIG_DIR/system.json <<EOF
{
  "device_id": "$device_id",
  "device_name": "$device_name",
  "organization_name": "$org_name",
  "location_name": "$location_name",
  "timezone": "$(timedatectl | grep 'Time zone' | awk '{print $3}')",
  "language": "en_US",
  "display": {
    "resolution": "$resolution",
    "refresh_rate": 60,
    "overscan": false,
    "rotation": $rotation
  },
  "network": {
    "hostname": "ad-detection-$(echo $device_id | cut -d'-' -f1)",
    "enable_wifi": true,
    "enable_ethernet": true,
    "enable_mdns": true
  },
  "cluster": {
    "enable_clustering": true,
    "heartbeat_interval": 5,
    "election_timeout": 15
  },
  "remote_management": {
    "enable_cloud_api": $([ "$enable_cloud" == "y" ] && echo "true" || echo "false"),
    "api_endpoint": "$api_endpoint",
    "api_key": "$api_key"
  },
  "performance": {
    "enable_gpu": true,
    "max_cpu_percent": 80,
    "max_memory_mb": 512
  }
}
EOF

    # Create audio configuration
    cat > /var/lib/ad-detection/audio_config.json <<EOF
{
  "system_volume": $default_volume,
  "system_muted": false,
  "current_output": "$audio_output",
  "app_settings": {}
}
EOF

    # Configure Wi-Fi if requested
    if [[ $configure_wifi =~ ^[Yy]$ ]]; then
        nmcli dev wifi connect "$wifi_ssid" password "$wifi_password" || true
    fi

    # Set hostname
    new_hostname="ad-detection-$(echo $device_id | cut -d'-' -f1)"
    hostnamectl set-hostname $new_hostname

    chown -R pi:pi $CONFIG_DIR
    chown pi:pi /var/lib/ad-detection/audio_config.json

    echo -e "${GREEN}✓ Configuration saved${NC}"
    sleep 2
}

show_summary() {
    print_header
    echo -e "${GREEN}Setup Complete!${NC}"
    echo ""
    echo "Device Configuration:"
    echo "  - Name: $device_name"
    echo "  - Organization: $org_name"
    echo "  - Location: $location_name"
    echo "  - Resolution: $resolution"
    echo "  - Audio: $audio_output at $default_volume%"
    echo ""
    echo "The system will restart in 10 seconds..."
    echo ""
    echo "After restart, access the web interface at:"
    echo "  http://$(hostname).local:8080"
    echo ""
    echo "Press Ctrl+C to cancel restart"
    sleep 10
}

main() {
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        echo "Please run as root (use sudo)"
        exit 1
    fi

    # Run setup steps
    prompt_device_name
    prompt_organization
    prompt_network_config
    prompt_display_config
    prompt_audio_config
    prompt_remote_config
    prompt_cloud_api

    save_configuration
    show_summary

    # Reboot
    reboot
}

main "$@"
