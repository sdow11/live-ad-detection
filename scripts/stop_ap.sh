#!/bin/bash
# Stop WiFi Access Point

echo "Stopping WiFi Access Point..."

# Find and stop hotspot connections
nmcli connection show --active | grep -i hotspot | awk '{print $1}' | while read conn; do
    nmcli connection down "$conn"
    echo "Stopped: $conn"
done

echo "Access Point stopped"
