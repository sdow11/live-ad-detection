# Live Ad Detection - Setup Guide

This guide walks you through setting up your Live Ad Detection cluster with touchscreen support.

## Table of Contents

1. [Hardware Setup](#hardware-setup)
2. [Software Installation](#software-installation)
3. [Device Configuration](#device-configuration)
4. [First-Time Setup](#first-time-setup)
5. [Cluster Configuration](#cluster-configuration)

## Hardware Setup

### Head Device (Main Controller)

**Required:**
- Single-board computer (Raspberry Pi 4 recommended)
- Touchscreen display (7" recommended)
- WiFi adapter (built-in or USB)
- Power supply
- MicroSD card (8GB minimum)

**Optional:**
- Second WiFi adapter for simultaneous AP + client mode
- Case with touchscreen mount

### Cluster Nodes

**Required:**
- Single-board computer (Raspberry Pi 3B+, Zero W)
- WiFi adapter (built-in or USB)
- Power supply
- MicroSD card (4GB minimum)

**Optional:**
- Small OLED/LCD display for status
- Second WiFi adapter

### Recommended Configuration

**Head Device:**
- Raspberry Pi 4 (2GB+ RAM)
- Official 7" touchscreen
- 2x WiFi adapters (built-in + USB)
- This allows the head device to:
  - Connect to your WiFi network
  - Provide an AP for initial setup
  - Display touchscreen UI
  - Serve web interface

**Cluster Nodes:**
- Raspberry Pi 3B+ or Zero W
- 1-2 WiFi adapters
- Optional small display for basic info

## Software Installation

### Step 1: Prepare the OS

Install a fresh Linux OS (Raspberry Pi OS, Ubuntu, etc.):

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y
```

### Step 2: Clone Repository

```bash
cd ~
git clone <repository-url> live-ad-detection
cd live-ad-detection
```

### Step 3: Run Setup Script

```bash
sudo bash scripts/setup.sh
```

The setup script will:
1. Ask you to select device type
2. Install all dependencies
3. Configure services
4. Set up configuration files

**Device Type Selection:**
- **Option 1**: Head device with touchscreen
  - Installs touchscreen UI
  - Enables web interface
  - Configures as cluster head

- **Option 2**: Cluster node with display
  - Installs display support
  - Enables web interface
  - Configures as cluster node

- **Option 3**: Headless cluster node
  - Web interface only
  - Configures as cluster node

## Device Configuration

### Head Device Configuration

Edit `/etc/live-ad-detection/device_config.yaml`:

```yaml
device_role: "head"

wifi:
  primary_interface: "wlan0"     # Main WiFi for internet
  ap_interface: "wlan1"          # Second WiFi for AP mode
  ap_ssid: "LiveAdDetection"
  ap_password: ""                # Leave empty or set password
  auto_start_ap: true            # Start AP on boot

web_interface:
  enabled: true
  host: "0.0.0.0"
  port: 5000
  auto_start: true

touchscreen:
  enabled: true
  auto_start: true
  fullscreen: true
  resolution:
    width: 800
    height: 480
```

### Cluster Node Configuration

Edit `/etc/live-ad-detection/device_config.yaml`:

```yaml
device_role: "node"

wifi:
  primary_interface: "wlan0"

web_interface:
  enabled: true
  host: "0.0.0.0"
  port: 5000
  auto_start: true

touchscreen:
  enabled: false

display:
  enabled: true              # For nodes with small displays
  type: "oled"              # "oled", "lcd", or "e-ink"
  show_info:
    - "hostname"
    - "ip_address"
    - "cpu_usage"
    - "memory_usage"

cluster:
  enabled: true
  head_node_ip: "192.168.1.100"  # IP of head device
```

## First-Time Setup

### Scenario 1: Setup with Touchscreen Access

1. **Power on the head device**
   - Touchscreen UI will start automatically

2. **Configure WiFi from touchscreen**
   - Tap "WiFi Setup" tab
   - Tap "Scan for Networks"
   - Select your network
   - Enter password
   - Tap "Connect"

3. **Verify connection**
   - Check "Device Info" tab
   - Note the IP address

4. **Access web interface (optional)**
   - Tap "QR Code" tab
   - Scan QR code with phone
   - Access web interface from phone/computer

### Scenario 2: Setup without Screen Access

This is useful when installing the device in a location without screen access.

1. **Power on the device**
   - If configured, AP will start automatically

2. **Connect to the device's WiFi AP**
   - SSID: `LiveAdDetection` (or configured name)
   - Password: (if set in config)

3. **Access web interface**
   - Open browser
   - Navigate to: `http://192.168.4.1:5000`

4. **Configure WiFi**
   - Click "Scan for Networks"
   - Select your network
   - Enter password
   - Click "Connect"

5. **Device will connect to WiFi**
   - AP may remain active (if dual WiFi)
   - Or AP will stop (single WiFi)

6. **Find device on network**
   - Check router's DHCP list
   - Or use: `nmap -sn 192.168.1.0/24`
   - Access at new IP address

### Scenario 3: Using QR Code for Easy Access

1. **Start the web interface**
   ```bash
   sudo systemctl start live-ad-web
   ```

2. **Start WiFi AP**
   ```bash
   sudo bash scripts/start_ap.sh LiveAdSetup
   ```

3. **Connect to AP from phone**
   - Connect to "LiveAdSetup" network

4. **Access web interface**
   - Navigate to: `http://192.168.4.1:5000`

5. **Scan QR code**
   - QR code is displayed on the main page
   - Bookmark or save for easy access
   - Share with other users

## Cluster Configuration

### Setting Up Multiple Nodes

1. **Configure Head Device First**
   - Complete WiFi setup
   - Note the head device IP address
   - Ensure web interface is accessible

2. **Configure Each Cluster Node**

   **Method 1: Using AP Mode**
   ```bash
   # On the node
   sudo bash scripts/start_ap.sh NodeSetup

   # Connect from your phone/computer
   # Access http://192.168.4.1:5000
   # Configure WiFi to same network as head device
   ```

   **Method 2: Pre-configure**
   ```bash
   # Edit config before first boot
   sudo nano /etc/live-ad-detection/device_config.yaml

   # Set:
   # - device_role: "node"
   # - cluster.enabled: true
   # - cluster.head_node_ip: "HEAD_DEVICE_IP"
   ```

3. **Verify Cluster Communication**
   - All nodes should be on same network
   - Test connectivity: `ping HEAD_DEVICE_IP`
   - Check web interface on each node

### Network Topology Options

**Option 1: All devices on home WiFi**
```
Internet Router
    |
    +-- Head Device (wlan0: home WiFi, wlan1: setup AP)
    +-- Node 1 (wlan0: home WiFi)
    +-- Node 2 (wlan0: home WiFi)
```

**Option 2: Private cluster network**
```
Internet Router
    |
    +-- Head Device (wlan0: internet, wlan1: cluster AP)
            |
            +-- Node 1 (wlan0: cluster AP)
            +-- Node 2 (wlan0: cluster AP)
```

## Common Setup Scenarios

### Scenario A: Home Installation

**Goal**: Cluster in home, need easy setup

1. Set up head device with touchscreen
2. Connect head to home WiFi via touchscreen
3. For each node:
   - Power on with AP auto-start enabled
   - Connect to node's AP from phone
   - Use web interface to connect node to home WiFi
   - Repeat for all nodes

### Scenario B: Remote Installation

**Goal**: Install cluster where no screen access after installation

1. **Before installation:**
   - Configure all devices with AP auto-start
   - Set AP SSID and password
   - Test all devices

2. **At installation site:**
   - Power on head device
   - Connect to head's AP from phone
   - Configure head to site WiFi
   - Repeat for all nodes
   - Verify all connected

3. **After leaving site:**
   - Can reconfigure via web interface
   - No physical access needed

### Scenario C: Temporary Setup

**Goal**: Quick demo or testing

1. Use head device AP only
2. Connect nodes to head's AP
3. No internet required
4. All devices on private network

## Troubleshooting Setup

### Can't Connect to Web Interface

```bash
# Check if service is running
sudo systemctl status live-ad-web

# Check IP address
hostname -I

# Check firewall
sudo ufw status
sudo ufw allow 5000

# Restart service
sudo systemctl restart live-ad-web
```

### Touchscreen Not Responding

```bash
# Check service
sudo systemctl status live-ad-touch

# Check display
echo $DISPLAY

# Allow X access
export DISPLAY=:0
xhost +local:

# Restart touchscreen UI
sudo systemctl restart live-ad-touch
```

### WiFi AP Not Starting

```bash
# Check WiFi interfaces
nmcli device status
iw dev

# Stop conflicting services
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

# Start AP manually
sudo bash scripts/start_ap.sh TestAP

# Check logs
sudo journalctl -xe
```

### Device Not Connecting to WiFi

```bash
# Check NetworkManager
sudo systemctl status NetworkManager

# Scan manually
sudo nmcli device wifi list

# Connect manually
sudo nmcli device wifi connect "SSID" password "PASSWORD"

# Check saved connections
nmcli connection show
```

## Next Steps

After setup:
1. Configure ad detection settings (when implemented)
2. Set up cluster synchronization
3. Configure automatic updates
4. Set up monitoring and alerts

## Support

For issues:
- Check logs: `sudo journalctl -u live-ad-web -f`
- Review configuration: `cat /etc/live-ad-detection/device_config.yaml`
- Test WiFi: `nmcli device wifi list`
