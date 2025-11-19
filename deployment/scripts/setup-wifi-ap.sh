#!/bin/bash
# WiFi Access Point setup for Coordinator devices
# Creates a local network for worker devices while maintaining internet connectivity

set -e

echo "================================================"
echo "Setting up WiFi Access Point for Coordinator"
echo "================================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root (sudo ./setup-wifi-ap.sh)"
    exit 1
fi

# Configuration
AP_SSID="AdDetection-Fleet"
AP_PASSWORD="livetv2025"
AP_CHANNEL=6
AP_IP="192.168.50.1"
AP_NETMASK="255.255.255.0"
AP_DHCP_START="192.168.50.10"
AP_DHCP_END="192.168.50.50"

# Network interfaces
# Built-in WiFi/Ethernet → Internet
# USB WiFi adapter (wlan1) → Access Point
INTERNET_INTERFACE="eth0"  # or wlan0 for built-in WiFi
AP_INTERFACE="wlan1"  # USB WiFi adapter

echo ""
echo "Configuration:"
echo "  AP SSID: $AP_SSID"
echo "  AP Channel: $AP_CHANNEL"
echo "  AP IP: $AP_IP"
echo "  DHCP Range: $AP_DHCP_START - $AP_DHCP_END"
echo "  Internet Interface: $INTERNET_INTERFACE"
echo "  AP Interface: $AP_INTERFACE"
echo ""

read -p "Continue with these settings? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Step 1: Install required packages
echo ""
echo "Step 1: Installing required packages..."
apt-get update
apt-get install -y \
    hostapd \
    dnsmasq \
    iptables \
    iptables-persistent

# Step 2: Stop services while configuring
echo ""
echo "Step 2: Stopping services..."
systemctl stop hostapd || true
systemctl stop dnsmasq || true

# Step 3: Configure static IP for AP interface
echo ""
echo "Step 3: Configuring static IP for AP interface..."

cat > /etc/network/interfaces.d/$AP_INTERFACE <<EOF
# AP Interface Configuration
allow-hotplug $AP_INTERFACE
iface $AP_INTERFACE inet static
    address $AP_IP
    netmask $AP_NETMASK
EOF

# Step 4: Configure hostapd
echo ""
echo "Step 4: Configuring hostapd (WiFi AP)..."

cat > /etc/hostapd/hostapd.conf <<EOF
# WiFi AP Configuration for Ad Detection Fleet
interface=$AP_INTERFACE
driver=nl80211
ssid=$AP_SSID
hw_mode=g
channel=$AP_CHANNEL
wmm_enabled=1
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$AP_PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP

# Country code (adjust for your region)
country_code=US

# Enable 802.11n
ieee80211n=1
ht_capab=[HT40][SHORT-GI-20][DSSS_CCK-40]

# Logging
logger_syslog=-1
logger_syslog_level=2
logger_stdout=-1
logger_stdout_level=2
EOF

# Point hostapd to config file
sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd || true
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

# Step 5: Configure dnsmasq (DHCP + DNS)
echo ""
echo "Step 5: Configuring dnsmasq (DHCP and DNS)..."

# Backup original
cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup 2>/dev/null || true

cat > /etc/dnsmasq.conf <<EOF
# Ad Detection Fleet DHCP/DNS Configuration

# Interface to listen on
interface=$AP_INTERFACE

# Don't listen on internet interface
except-interface=$INTERNET_INTERFACE

# DHCP range
dhcp-range=$AP_DHCP_START,$AP_DHCP_END,255.255.255.0,24h

# Gateway (this device)
dhcp-option=3,$AP_IP

# DNS servers
dhcp-option=6,8.8.8.8,8.8.4.4

# Domain
domain=addetection.local

# Authoritative
dhcp-authoritative

# Log DHCP
log-dhcp

# No hosts file
no-hosts

# Static leases for known devices (optional)
# dhcp-host=aa:bb:cc:dd:ee:ff,192.168.50.20,worker1,infinite

# Enable mDNS relay for .local domains
domain-needed
bogus-priv

# Cache size
cache-size=1000
EOF

# Step 6: Enable IP forwarding
echo ""
echo "Step 6: Enabling IP forwarding..."

# Enable now
echo 1 > /proc/sys/net/ipv4/ip_forward

# Enable on boot
sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf
sysctl -p

# Step 7: Configure NAT (Network Address Translation)
echo ""
echo "Step 7: Configuring NAT..."

# Flush existing rules
iptables -t nat -F
iptables -F

# NAT rules
iptables -t nat -A POSTROUTING -o $INTERNET_INTERFACE -j MASQUERADE
iptables -A FORWARD -i $AP_INTERFACE -o $INTERNET_INTERFACE -j ACCEPT
iptables -A FORWARD -i $INTERNET_INTERFACE -o $AP_INTERFACE -m state --state RELATED,ESTABLISHED -j ACCEPT

# Allow mDNS (Avahi) across interfaces
iptables -A INPUT -p udp --dport 5353 -j ACCEPT
iptables -A OUTPUT -p udp --dport 5353 -j ACCEPT

# Save iptables rules
netfilter-persistent save

# Step 8: Enable and start services
echo ""
echo "Step 8: Enabling and starting services..."

systemctl unmask hostapd
systemctl enable hostapd
systemctl enable dnsmasq

# Bring up AP interface
ifdown $AP_INTERFACE 2>/dev/null || true
ifup $AP_INTERFACE

# Start services
systemctl start hostapd
systemctl start dnsmasq

# Step 9: Verify setup
echo ""
echo "Step 9: Verifying setup..."

sleep 3

echo ""
echo "hostapd status:"
systemctl status hostapd --no-pager -l || true

echo ""
echo "dnsmasq status:"
systemctl status dnsmasq --no-pager -l || true

echo ""
echo "AP interface status:"
ip addr show $AP_INTERFACE

echo ""
echo "DHCP leases:"
cat /var/lib/misc/dnsmasq.leases 2>/dev/null || echo "No leases yet"

# Step 10: Final instructions
echo ""
echo "================================================"
echo "WiFi Access Point Setup Complete!"
echo "================================================"
echo ""
echo "AP Configuration:"
echo "  SSID: $AP_SSID"
echo "  Password: $AP_PASSWORD"
echo "  IP Address: $AP_IP"
echo "  DHCP Range: $AP_DHCP_START - $AP_DHCP_END"
echo ""
echo "Network Architecture:"
echo "  Internet ←→ $INTERNET_INTERFACE (Coordinator) $AP_INTERFACE ←→ Workers"
echo "             (DHCP/Internet)                              (192.168.50.0/24)"
echo ""
echo "Worker devices should:"
echo "1. Connect to WiFi network: $AP_SSID"
echo "2. Use password: $AP_PASSWORD"
echo "3. They will automatically get an IP via DHCP"
echo "4. They can reach the internet through this coordinator"
echo "5. They can discover each other via mDNS (.local)"
echo ""
echo "To test:"
echo "1. Connect a device to the $AP_SSID network"
echo "2. Check it received an IP: cat /var/lib/misc/dnsmasq.leases"
echo "3. Test internet: ping 8.8.8.8"
echo "4. Test mDNS: avahi-browse -a"
echo ""
echo "Troubleshooting:"
echo "  Check hostapd: sudo systemctl status hostapd"
echo "  Check dnsmasq: sudo systemctl status dnsmasq"
echo "  View hostapd logs: sudo journalctl -u hostapd -f"
echo "  View dnsmasq logs: sudo journalctl -u dnsmasq -f"
echo "  Restart services: sudo systemctl restart hostapd dnsmasq"
echo ""
echo "================================================"
