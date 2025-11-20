## Live Ad Detection - Deployment Guide

This guide covers deploying the complete Live Ad Detection system including services and devices.

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Deploying Services](#deploying-services)
5. [Deploying Devices](#deploying-devices)
6. [Full Cluster Deployment](#full-cluster-deployment)
7. [Health Checks](#health-checks)
8. [Troubleshooting](#troubleshooting)

## Deployment Overview

The Live Ad Detection system consists of three main components:

### 1. **Services** (Laptop/Server/Cloud)
Centralized backend services that coordinate the cluster:
- **API Server**: REST API for node management and data collection
- **Data Collector**: Polls nodes and aggregates statistics
- **Dashboard**: Web-based monitoring interface
- **PostgreSQL**: Database for detections and analytics
- **Redis**: Caching and message queue
- **Grafana**: Metrics visualization
- **Prometheus**: Metrics collection

### 2. **Head Device** (Raspberry Pi with Touchscreen)
Main controller with:
- Touchscreen UI for local setup
- Web interface for remote configuration
- WiFi AP mode for initial setup
- Device monitoring and status

### 3. **Cluster Nodes** (Raspberry Pi devices)
Detection devices with:
- Web interface for configuration
- Optional small displays (OLED/LCD)
- WiFi connectivity
- Ad detection capabilities (when implemented)

## Prerequisites

### For Services Deployment

**Local Machine:**
- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB disk space

**Remote Machine:**
- SSH access
- Docker and Docker Compose installed
- Port access: 8000, 3000, 3001, 5432, 6379, 9090

### For Device Deployment

**Control Machine:**
- Linux, macOS, or WSL
- SSH client
- rsync
- Bash 4.0+

**Target Devices:**
- Raspberry Pi (3B+, 4, Zero W)
- Raspberry Pi OS, Ubuntu, or Debian
- SSH enabled
- WiFi adapter(s)
- Optional: Touchscreen (for head device)

**Network:**
- SSH keys set up for passwordless access
- Devices accessible on network or via direct connection

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd live-ad-detection
```

### 2. Deploy Services

```bash
cd services
bash deploy_services.sh up
```

Access at:
- API Server: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Dashboard: http://localhost:3000
- Grafana: http://localhost:3001 (admin/admin)

### 3. Deploy Head Device

```bash
# Set up SSH keys (if not already done)
ssh-copy-id pi@192.168.1.100

# Deploy
bash scripts/deploy_head.sh 192.168.1.100
```

### 4. Deploy Cluster Node

```bash
bash scripts/deploy_node.sh 192.168.1.101 --head-ip 192.168.1.100 --node-name node-01
```

## Deploying Services

### Local Deployment

1. **Navigate to services directory:**

```bash
cd services
```

2. **Start all services:**

```bash
bash deploy_services.sh up
```

3. **Verify deployment:**

```bash
bash deploy_services.sh ps
```

4. **View logs:**

```bash
bash deploy_services.sh logs api-server
```

### Service Management

```bash
# Stop services
bash deploy_services.sh down

# Restart services
bash deploy_services.sh restart

# Rebuild services
bash deploy_services.sh build

# Clean up (removes data!)
bash deploy_services.sh clean
```

### Remote Deployment

If deploying services to a remote machine:

```bash
# Copy services directory
rsync -avz services/ user@remote-host:/opt/live-ad-services/

# Deploy remotely
ssh user@remote-host "cd /opt/live-ad-services && bash deploy_services.sh up"
```

### Service Configuration

Edit `services/docker-compose.yml` to customize:
- Ports
- Database credentials
- Resource limits
- Volume mounts

### Accessing Services

| Service | URL | Purpose |
|---------|-----|---------|
| API Server | http://localhost:8000 | REST API |
| API Docs | http://localhost:8000/docs | Interactive API documentation |
| Dashboard | http://localhost:3000 | Cluster monitoring |
| Grafana | http://localhost:3001 | Metrics and dashboards |
| Prometheus | http://localhost:9090 | Raw metrics |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache/Queue |

## Deploying Devices

### Prerequisites

1. **Set up SSH keys:**

```bash
# Generate key if you don't have one
ssh-keygen -t ed25519

# Copy to device
ssh-copy-id pi@192.168.1.100
```

2. **Test SSH access:**

```bash
ssh pi@192.168.1.100 "echo 'SSH working'"
```

### Deploy Head Device

The head device is the main controller with a touchscreen.

**Basic deployment:**

```bash
bash scripts/deploy_head.sh 192.168.1.100
```

**With options:**

```bash
bash scripts/deploy_head.sh 192.168.1.100 \
  --user ubuntu \
  --ap-ssid MyCluster \
  --ap-password MyPassword123 \
  --no-touchscreen
```

**Options:**
- `--user <username>`: SSH username (default: pi)
- `--ap-ssid <ssid>`: Access Point name
- `--ap-password <password>`: AP password (8+ chars or empty for open)
- `--no-touchscreen`: Disable touchscreen UI

**What it does:**
1. Transfers project files to device
2. Installs system dependencies
3. Installs Python packages
4. Configures device as head node
5. Sets up systemd services
6. Starts web interface and touchscreen UI
7. Configures WiFi AP for initial setup

### Deploy Cluster Node

Cluster nodes perform ad detection and report to the head device.

**Basic deployment:**

```bash
bash scripts/deploy_node.sh 192.168.1.101 --head-ip 192.168.1.100 --node-name node-01
```

**With display:**

```bash
bash scripts/deploy_node.sh 192.168.1.101 \
  --head-ip 192.168.1.100 \
  --node-name node-01 \
  --with-display \
  --display-type oled
```

**Options:**
- `--user <username>`: SSH username
- `--head-ip <ip>`: Head device IP address
- `--node-name <name>`: Node identifier
- `--with-display`: Enable small display
- `--display-type <type>`: Display type (oled, lcd, e-ink)
- `--ap-ssid <ssid>`: AP name for setup

## Full Cluster Deployment

For deploying multiple devices at once:

### 1. Create Inventory File

```bash
cp deployment/inventory.yaml.example deployment/inventory.yaml
```

### 2. Edit Inventory

Edit `deployment/inventory.yaml` with your device information:

```yaml
services:
  host: localhost
  deploy: true

head_device:
  ip: 192.168.1.100
  user: pi
  ap_ssid: LiveAdDetection
  touchscreen: true
  deploy: true

cluster_nodes:
  - name: node-01
    ip: 192.168.1.101
    user: pi
    deploy: true

  - name: node-02
    ip: 192.168.1.102
    user: pi
    deploy: true
```

### 3. Deploy Everything

```bash
bash scripts/deploy_all.sh
```

**Deploy specific components:**

```bash
# Services only
bash scripts/deploy_all.sh --services-only

# Head device only
bash scripts/deploy_all.sh --head-only

# Cluster nodes only
bash scripts/deploy_all.sh --nodes-only

# Dry run (preview)
bash scripts/deploy_all.sh --dry-run
```

## Health Checks

### Manual Health Check

```bash
bash scripts/health_check.sh
```

Output:
```
=== Live Ad Detection Health Check ===

Checking Services:
  API Server... ✓ OK
  API Docs... ✓ OK
  Dashboard... ✓ OK
  Grafana... ✓ OK
  Prometheus... ✓ OK
  PostgreSQL... ✓ OK
  Redis... ✓ OK

Checking Devices:
  Head Device SSH... ✓ OK
  Head Web Interface... ✓ OK
  Head Device Info... ✓ OK

=== Summary ===
Services:  7 OK, 0 Failed
Devices:   3 OK, 0 Failed

✓ All systems operational
```

### Individual Service Checks

**API Server:**
```bash
curl http://localhost:8000/health
```

**Head Device:**
```bash
curl http://192.168.1.100:5000/api/current
```

**Docker Services:**
```bash
cd services
docker compose ps
```

## Troubleshooting

### Services Not Starting

**Check Docker:**
```bash
docker --version
docker compose version
```

**View logs:**
```bash
cd services
docker compose logs api-server
docker compose logs data-collector
```

**Restart services:**
```bash
cd services
bash deploy_services.sh restart
```

### Cannot Connect to Device

**Check network:**
```bash
ping 192.168.1.100
```

**Check SSH:**
```bash
ssh -v pi@192.168.1.100
```

**Copy SSH keys:**
```bash
ssh-copy-id pi@192.168.1.100
```

### Device Deployment Failed

**Check SSH access:**
```bash
ssh pi@192.168.1.100 "whoami"
```

**Check device logs:**
```bash
ssh pi@192.168.1.100 "sudo journalctl -u live-ad-web -f"
```

**Manual deployment:**
```bash
# SSH into device
ssh pi@192.168.1.100

# Check services
sudo systemctl status live-ad-web
sudo systemctl status live-ad-touch

# Restart services
sudo systemctl restart live-ad-web
```

### Web Interface Not Accessible

**Check firewall:**
```bash
# On device
sudo ufw status
sudo ufw allow 5000
```

**Check service status:**
```bash
ssh pi@192.168.1.100 "sudo systemctl status live-ad-web"
```

**Check port:**
```bash
ssh pi@192.168.1.100 "sudo netstat -tulpn | grep 5000"
```

### WiFi Issues

**Scan networks:**
```bash
ssh pi@192.168.1.100 "nmcli device wifi list"
```

**Check NetworkManager:**
```bash
ssh pi@192.168.1.100 "sudo systemctl status NetworkManager"
```

**Restart WiFi:**
```bash
ssh pi@192.168.1.100 "sudo systemctl restart NetworkManager"
```

## Advanced Deployment

### Using Environment Variables

```bash
# Custom user
DEPLOY_USER=ubuntu bash scripts/deploy_head.sh 192.168.1.100

# Custom inventory
INVENTORY_FILE=./my-cluster.yaml bash scripts/deploy_all.sh
```

### Parallel Deployment

To deploy multiple nodes in parallel:

```bash
# Deploy nodes in background
bash scripts/deploy_node.sh 192.168.1.101 --head-ip 192.168.1.100 --node-name node-01 &
bash scripts/deploy_node.sh 192.168.1.102 --head-ip 192.168.1.100 --node-name node-02 &
bash scripts/deploy_node.sh 192.168.1.103 --head-ip 192.168.1.100 --node-name node-03 &

# Wait for all to complete
wait

echo "All deployments complete"
```

### Custom Configuration

To use custom device configuration:

```bash
# Create custom config
cat > /tmp/custom-config.yaml << EOF
device_role: "head"
wifi:
  ap_ssid: "MyCustomAP"
# ... more config
EOF

# Copy to device after deployment
scp /tmp/custom-config.yaml pi@192.168.1.100:/tmp/
ssh pi@192.168.1.100 "sudo cp /tmp/custom-config.yaml /etc/live-ad-detection/device_config.yaml && sudo systemctl restart live-ad-web"
```

### Monitoring Deployment

```bash
# Watch logs in real-time
watch -n 2 'curl -s http://localhost:8000/api/v1/nodes | jq'

# Monitor all nodes
watch -n 5 'bash scripts/health_check.sh'
```

## Post-Deployment

After successful deployment:

1. **Register nodes with API:**
   - Access API docs: http://localhost:8000/docs
   - Or nodes will auto-register when configured

2. **Configure WiFi:**
   - Via touchscreen on head device
   - Or via web interface at http://device-ip:5000

3. **Monitor cluster:**
   - Dashboard: http://localhost:3000
   - Grafana: http://localhost:3001

4. **Set up alerts:**
   - Configure Grafana alerts
   - Set up email notifications

5. **Configure backups:**
   - Database backups
   - Configuration backups

## Production Checklist

- [ ] Change default passwords (Grafana, PostgreSQL)
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Configure monitoring alerts
- [ ] Document device locations
- [ ] Create recovery procedures
- [ ] Set up log rotation
- [ ] Configure update schedule
- [ ] Test disaster recovery

## Next Steps

- Read [SETUP_GUIDE.md](SETUP_GUIDE.md) for device setup
- See [README.md](README.md) for usage instructions
- Review API documentation at http://localhost:8000/docs
