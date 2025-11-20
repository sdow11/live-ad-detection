#!/bin/bash
# Start WiFi Access Point for initial configuration

set -e

SSID="${1:-LiveAdDetection}"
PASSWORD="${2:-}"

echo "Starting WiFi Access Point: $SSID"

if [ -n "$PASSWORD" ]; then
    nmcli dev wifi hotspot ssid "$SSID" password "$PASSWORD"
else
    nmcli dev wifi hotspot ssid "$SSID"
fi

echo "Access Point started successfully!"
echo "SSID: $SSID"

# Get IP address
IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | cut -d/ -f1 | head -n1)
echo "Web interface available at: http://$IP:5000"
echo ""
echo "Scan the QR code in the web interface to connect from your phone!"
