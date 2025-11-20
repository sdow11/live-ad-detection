# Quick Deployment Reference

Quick commands for deploying Live Ad Detection system.

## 🚀 Services (Laptop/Server)

### Start Services
```bash
cd services
bash deploy_services.sh up
```

### Check Status
```bash
cd services
docker compose ps
```

### View Logs
```bash
cd services
bash deploy_services.sh logs
```

### Access URLs
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Dashboard: http://localhost:3000
- Grafana: http://localhost:3001 (admin/admin)

---

## 🖥️ Head Device

### One-Line Deploy
```bash
bash scripts/deploy_head.sh 192.168.1.100
```

### With Custom Settings
```bash
bash scripts/deploy_head.sh 192.168.1.100 \
  --user pi \
  --ap-ssid LiveAdDetection \
  --ap-password MyPass123
```

### Check Status
```bash
ssh pi@192.168.1.100 "sudo systemctl status live-ad-web"
```

### Access
- Web Interface: http://192.168.1.100:5000
- SSH: `ssh pi@192.168.1.100`

---

## 📡 Cluster Node

### One-Line Deploy
```bash
bash scripts/deploy_node.sh 192.168.1.101 \
  --head-ip 192.168.1.100 \
  --node-name node-01
```

### With Display
```bash
bash scripts/deploy_node.sh 192.168.1.101 \
  --head-ip 192.168.1.100 \
  --node-name node-01 \
  --with-display \
  --display-type oled
```

### Check Status
```bash
ssh pi@192.168.1.101 "sudo systemctl status live-ad-web"
```

---

## 🎯 Full Cluster Deploy

### Step 1: Create Inventory
```bash
cp deployment/inventory.yaml.example deployment/inventory.yaml
# Edit with your device IPs
nano deployment/inventory.yaml
```

### Step 2: Deploy Everything
```bash
bash scripts/deploy_all.sh
```

### Step 3: Check Health
```bash
bash scripts/health_check.sh
```

---

## 🔧 Common Tasks

### SSH Setup
```bash
# Generate SSH key (if needed)
ssh-keygen -t ed25519

# Copy to device
ssh-copy-id pi@192.168.1.100
```

### Restart Services
```bash
# On services machine
cd services && bash deploy_services.sh restart

# On device
ssh pi@192.168.1.100 "sudo systemctl restart live-ad-web"
```

### View Device Logs
```bash
# Web interface
ssh pi@192.168.1.100 "sudo journalctl -u live-ad-web -f"

# Touchscreen UI
ssh pi@192.168.1.100 "sudo journalctl -u live-ad-touch -f"
```

### Manual WiFi Setup
```bash
# Via SSH
ssh pi@192.168.1.100
nmcli device wifi list
nmcli device wifi connect "MySSID" password "MyPassword"
```

---

## 🩺 Troubleshooting

### Services Won't Start
```bash
cd services
docker compose down
docker compose up -d
docker compose logs -f
```

### Can't Connect to Device
```bash
# Check network
ping 192.168.1.100

# Check SSH
ssh -v pi@192.168.1.100

# Reset SSH keys
ssh-keygen -R 192.168.1.100
ssh-copy-id pi@192.168.1.100
```

### Device Not Responding
```bash
# SSH in and check
ssh pi@192.168.1.100

# Check services
sudo systemctl status live-ad-web
sudo systemctl status NetworkManager

# Restart
sudo systemctl restart live-ad-web
sudo systemctl restart NetworkManager
```

---

## 📋 Cheat Sheet

### Port Reference
| Service | Port | URL |
|---------|------|-----|
| API Server | 8000 | http://localhost:8000 |
| Dashboard | 3000 | http://localhost:3000 |
| Grafana | 3001 | http://localhost:3001 |
| Prometheus | 9090 | http://localhost:9090 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| Device Web | 5000 | http://device-ip:5000 |

### Default Credentials
- Grafana: admin / admin
- PostgreSQL: postgres / postgres

### File Locations (on device)
- Config: `/etc/live-ad-detection/device_config.yaml`
- Install: `/opt/live-ad-detection/`
- Logs: `/var/log/live-ad-detection.log`
- Systemd: `/etc/systemd/system/live-ad-*.service`

---

## 🎬 Quick Start (Complete Setup)

### 1. Deploy Services
```bash
cd services
bash deploy_services.sh up
```

### 2. Deploy Head Device
```bash
bash scripts/deploy_head.sh 192.168.1.100
```

### 3. Deploy Nodes
```bash
bash scripts/deploy_node.sh 192.168.1.101 --head-ip 192.168.1.100 --node-name node-01
bash scripts/deploy_node.sh 192.168.1.102 --head-ip 192.168.1.100 --node-name node-02
```

### 4. Health Check
```bash
bash scripts/health_check.sh
```

### 5. Access
- API: http://localhost:8000/docs
- Dashboard: http://localhost:3000
- Head Device: http://192.168.1.100:5000

---

## 📚 Documentation

- Full deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)
- Device setup guide: [SETUP_GUIDE.md](SETUP_GUIDE.md)
- Project overview: [README.md](README.md)
