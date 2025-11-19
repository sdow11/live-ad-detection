# Production Deployment Guide

This guide covers deploying the Live TV Ad Detection system to production environments.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Cloud API Deployment](#cloud-api-deployment)
3. [Edge Device Deployment](#edge-device-deployment)
4. [Network Configuration](#network-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
8. [Scaling Considerations](#scaling-considerations)

## Architecture Overview

### Production Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloud Infrastructure                     │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │  Load Balancer │  │  PostgreSQL  │  │  Redis Cluster    │   │
│  │   (nginx/ALB)  │  │   (RDS/HA)   │  │  (ElastiCache)    │   │
│  └───────┬────────┘  └──────┬───────┘  └─────────┬─────────┘   │
│          │                  │                     │             │
│  ┌───────▼──────────────────▼─────────────────────▼─────────┐   │
│  │           Cloud API Cluster (3+ instances)               │   │
│  │    ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │    │  API-1   │  │  API-2   │  │  API-3   │            │   │
│  │    │ (Docker) │  │ (Docker) │  │ (Docker) │            │   │
│  │    └──────────┘  └──────────┘  └──────────┘            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Monitoring & Logging                        │   │
│  │  Prometheus + Grafana + ELK Stack                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           │ HTTPS (TLS 1.3)
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                    Edge Locations (Multiple)                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Location 1: Sports Bar (3 devices)                     │    │
│  │    ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │    │
│  │    │ Coordinator  │  │  Worker 1    │  │  Worker 2   │ │    │
│  │    │ (RPi 5 8GB)  │  │ (RPi 5 4GB)  │  │ (RPi 5 4GB) │ │    │
│  │    └──────┬───────┘  └──────────────┘  └─────────────┘ │    │
│  │           │ WiFi AP (192.168.50.0/24)                   │    │
│  └───────────┼─────────────────────────────────────────────┘    │
│              │ Internet (eth0/wlan0)                             │
└──────────────┴───────────────────────────────────────────────────┘
```

### Component Responsibilities

**Cloud API Cluster:**
- Device registration and authentication
- Real-time health monitoring
- Telemetry aggregation and analytics
- Firmware distribution
- Multi-tenant data isolation
- RESTful API for web dashboard

**Edge Coordinators:**
- Local fleet coordination (Raft consensus)
- WiFi Access Point for local network
- mDNS service discovery
- Local device registry
- Internet gateway for workers

**Edge Workers:**
- Video processing and ML inference
- TV control (IR/CEC/HTTP)
- Cloud telemetry reporting
- Peer discovery via mDNS

## Cloud API Deployment

### Option 1: Docker Compose (Recommended for Small-Medium Scale)

#### Prerequisites

- Docker 24.0+
- Docker Compose 2.20+
- 4GB+ RAM
- 20GB+ disk space

#### Quick Start

1. **Clone repository:**
   ```bash
   git clone https://github.com/your-org/live-ad-detection.git
   cd live-ad-detection
   ```

2. **Configure environment:**
   ```bash
   cd deployment/docker
   cp .env.example .env
   nano .env  # Edit configuration
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Verify deployment:**
   ```bash
   docker-compose ps
   curl http://localhost:8000/health
   ```

5. **View logs:**
   ```bash
   docker-compose logs -f api
   ```

#### Docker Compose Configuration

See `deployment/docker/docker-compose.yml` for full configuration.

Key services:
- `api` - Cloud API (3 replicas)
- `postgres` - PostgreSQL database
- `redis` - Redis cache
- `nginx` - Load balancer
- `prometheus` - Metrics collection
- `grafana` - Metrics visualization

#### Scaling

Scale API instances:
```bash
docker-compose up -d --scale api=5
```

### Option 2: Kubernetes (Recommended for Large Scale)

#### Prerequisites

- Kubernetes 1.27+
- kubectl configured
- Helm 3.12+
- Ingress controller (nginx/traefik)
- Certificate manager (cert-manager)

#### Deploy with Helm

1. **Add Helm repo (future):**
   ```bash
   helm repo add ad-detection https://charts.example.com/ad-detection
   helm repo update
   ```

2. **Create namespace:**
   ```bash
   kubectl create namespace ad-detection
   ```

3. **Configure values:**
   ```bash
   cat > values.yaml <<EOF
   replicaCount: 3

   image:
     repository: your-registry/ad-detection-cloud
     tag: "1.0.0"

   postgresql:
     enabled: true
     auth:
       database: addetection
       username: addetection

   redis:
     enabled: true
     architecture: replication

   ingress:
     enabled: true
     className: nginx
     hosts:
       - host: api.example.com
         paths:
           - path: /
             pathType: Prefix
     tls:
       - secretName: api-tls
         hosts:
           - api.example.com

   autoscaling:
     enabled: true
     minReplicas: 3
     maxReplicas: 10
     targetCPUUtilizationPercentage: 70
   EOF
   ```

4. **Install:**
   ```bash
   helm install ad-detection ad-detection/cloud-api \
     --namespace ad-detection \
     --values values.yaml
   ```

5. **Verify:**
   ```bash
   kubectl get pods -n ad-detection
   kubectl get svc -n ad-detection
   ```

See `deployment/kubernetes/` for manifests.

### Option 3: Cloud Providers

#### AWS Deployment

**Architecture:**
- ECS/EKS for container orchestration
- RDS PostgreSQL (Multi-AZ)
- ElastiCache Redis
- Application Load Balancer
- CloudWatch for monitoring
- S3 for firmware storage

**Quick Deploy:**
```bash
cd deployment/aws
terraform init
terraform plan
terraform apply
```

#### GCP Deployment

**Architecture:**
- GKE for Kubernetes
- Cloud SQL PostgreSQL (HA)
- Memorystore Redis
- Cloud Load Balancing
- Cloud Monitoring
- Cloud Storage for firmware

**Quick Deploy:**
```bash
cd deployment/gcp
terraform init
terraform plan
terraform apply
```

#### Azure Deployment

**Architecture:**
- AKS for Kubernetes
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Load Balancer
- Azure Monitor
- Azure Blob Storage for firmware

**Quick Deploy:**
```bash
cd deployment/azure
terraform init
terraform plan
terraform apply
```

### Database Setup

#### PostgreSQL Configuration

**Production settings (`postgresql.conf`):**
```conf
# Connection Settings
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 10MB
maintenance_work_mem = 512MB

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Query Planner
random_page_cost = 1.1
effective_io_concurrency = 200

# Write Ahead Log
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

# Logging
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_min_duration_statement = 1000
```

**Run migrations:**
```bash
# Using Alembic
cd packages/cloud-api
alembic upgrade head
```

#### Redis Configuration

**Production settings (`redis.conf`):**
```conf
# Network
bind 0.0.0.0
protected-mode yes
port 6379

# General
daemonize no
supervised systemd
pidfile /var/run/redis/redis-server.pid

# Snapshotting
save 900 1
save 300 10
save 60 10000

# Replication
replica-read-only yes

# Security
requirepass your-strong-password-here

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Append Only File
appendonly yes
appendfsync everysec
```

### SSL/TLS Configuration

**Generate certificates:**
```bash
# Using Let's Encrypt
certbot certonly --standalone \
  -d api.example.com \
  --email admin@example.com \
  --agree-tos
```

**nginx configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://api-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Edge Device Deployment

### At-Scale Deployment

**For 100+ devices:**

1. **Prepare installation media:**
   ```bash
   # Create base image with pre-configured system
   cd deployment/edge
   ./create-base-image.sh
   ```

2. **Flash to SD cards:**
   ```bash
   # Bulk flash with device-specific configs
   ./bulk-flash.sh --count 100 --location-id 1
   ```

3. **Ship pre-configured devices**

### Zero-Touch Provisioning

**Enable auto-registration:**

1. **Create provisioning server:**
   - Devices boot and request config via DHCP option
   - Provisioning server assigns device ID and location
   - Device downloads config and starts services

2. **Device configuration:**
   ```bash
   # /boot/provision.txt
   PROVISION_URL=https://provision.example.com/register
   PROVISION_TOKEN=secret-token-here
   ```

3. **First boot:**
   - Device contacts provisioning server
   - Receives unique config
   - Registers with cloud API
   - Starts services automatically

### Remote Management

**Over-the-Air (OTA) Updates:**

1. **Firmware distribution:**
   - Upload new firmware to cloud API
   - Mark as stable/beta
   - Devices check periodically
   - Download and install during maintenance window

2. **Configuration updates:**
   - Push config changes via cloud API
   - Devices receive via polling or webhooks
   - Apply changes and restart services

3. **Remote troubleshooting:**
   - SSH tunneling via cloud API
   - Log aggregation
   - Remote reboot/restart

## Network Configuration

### Cloud API Network

**Firewall rules:**
```bash
# Inbound
Allow TCP 443 (HTTPS) from 0.0.0.0/0
Allow TCP 22 (SSH) from management IPs only
Allow TCP 5432 (PostgreSQL) from API instances only
Allow TCP 6379 (Redis) from API instances only

# Outbound
Allow all (for firmware downloads, etc.)
```

**Security groups (AWS example):**
```hcl
resource "aws_security_group" "api" {
  name = "ad-detection-api"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### Edge Device Network

**Coordinator dual-network:**
```
Internet Interface (eth0/wlan0):
  - DHCP client or static IP
  - Gateway to internet
  - DNS: 8.8.8.8, 1.1.1.1

Access Point Interface (wlan1):
  - Static IP: 192.168.50.1/24
  - DHCP server: 192.168.50.10-50
  - NAT to internet interface
  - mDNS relay enabled
```

**Worker connection:**
```
WiFi Interface (wlan0):
  - Connect to coordinator AP
  - DHCP client
  - Gateway: 192.168.50.1
  - mDNS for discovery
```

**Internet connectivity test:**
```bash
# On worker device
ping -c 3 8.8.8.8          # Internet
ping -c 3 192.168.50.1     # Coordinator
avahi-browse -a            # mDNS discovery
curl https://api.example.com/health  # Cloud API
```

## Security Hardening

### Cloud API Security

**1. Authentication & Authorization:**
```python
# Implement JWT authentication
from fastapi.security import HTTPBearer
from jose import JWTError, jwt

security = HTTPBearer()

@app.post("/api/v1/devices/register")
async def register_device(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    token = credentials.credentials
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    # Verify device authorization...
```

**2. Rate Limiting:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/v1/devices/register")
@limiter.limit("10/minute")
async def register_device(...):
    ...
```

**3. Input Validation:**
- All inputs validated via Pydantic ✅
- SQL injection prevention via SQLAlchemy ORM ✅
- XSS prevention via proper escaping ✅

**4. Secrets Management:**
```bash
# Use environment variables, never commit secrets
export DATABASE_URL="postgresql://..."
export SECRET_KEY="$(openssl rand -hex 32)"
export API_KEYS="key1,key2,key3"

# Or use secrets manager
export DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id prod/addetection/db-url \
  --query SecretString \
  --output text)"
```

### Edge Device Security

**1. OS Hardening:**
```bash
# Disable unnecessary services
systemctl disable bluetooth
systemctl disable cups
systemctl disable avahi-daemon  # Unless needed

# Enable automatic security updates
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow from 192.168.50.0/24  # Local network only
ufw enable
```

**2. File System Security:**
```bash
# Read-only root filesystem (optional)
# Add to /boot/cmdline.txt
ro

# Writable overlay for logs
overlayfs
```

**3. Secure Communication:**
```bash
# Always use HTTPS for cloud API
CLOUD_API_URL=https://api.example.com  # Not HTTP!

# Verify SSL certificates
SSL_VERIFY=true
```

## Monitoring and Observability

### Metrics (Prometheus)

**Cloud API metrics:**
```python
from prometheus_client import Counter, Histogram, Gauge

# Request metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

# Device metrics
devices_online = Gauge(
    'devices_online',
    'Number of online devices',
    ['location']
)

# Database metrics
db_query_duration_seconds = Histogram(
    'db_query_duration_seconds',
    'Database query duration',
    ['query_type']
)
```

**Prometheus configuration:**
```yaml
scrape_configs:
  - job_name: 'ad-detection-api'
    static_configs:
      - targets: ['api-1:9090', 'api-2:9090', 'api-3:9090']
    scrape_interval: 15s
```

**Grafana dashboards:**
- API request rate and latency
- Device online/offline status
- Database performance
- Error rates
- Telemetry statistics

### Logging (ELK Stack)

**Structured logging:**
```python
import structlog

logger = structlog.get_logger()

logger.info(
    "device_registered",
    device_id="rpi-001",
    location_id=1,
    hardware_model="Raspberry Pi 5"
)
```

**Log aggregation:**
- Filebeat on each API instance
- Logstash for processing
- Elasticsearch for storage
- Kibana for visualization

**Log retention:**
- Hot: 7 days (fast SSD)
- Warm: 30 days (slower storage)
- Cold: 90 days (archive)
- Delete: after 90 days

### Alerting

**Critical alerts:**
```yaml
groups:
  - name: ad-detection-critical
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseDown
        expr: up{job="postgresql"} == 0
        for: 1m
        annotations:
          summary: "PostgreSQL is down"

      - alert: ManyDevicesOffline
        expr: devices_offline / devices_total > 0.2
        for: 10m
        annotations:
          summary: "More than 20% devices offline"
```

**Notification channels:**
- PagerDuty for critical issues
- Slack for warnings
- Email for informational

## Backup and Disaster Recovery

### Database Backups

**Automated backups:**
```bash
#!/bin/bash
# /etc/cron.daily/backup-postgres

BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/addetection_$DATE.sql.gz"

# Backup
pg_dump addetection | gzip > "$BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" s3://backups/postgres/

# Retain last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

**Point-in-time recovery:**
- WAL archiving enabled
- Continuous backup to S3/GCS
- Recovery Point Objective (RPO): 5 minutes
- Recovery Time Objective (RTO): 30 minutes

### Disaster Recovery Plan

**Scenario 1: API instance failure**
- Auto-scaling replaces failed instance
- Load balancer routes around failure
- RTO: < 1 minute (automatic)

**Scenario 2: Database failure**
- Failover to replica
- Promote replica to primary
- RTO: < 5 minutes (automatic with HA)

**Scenario 3: Complete region failure**
- Restore from backup in new region
- Update DNS to point to new region
- RTO: 30-60 minutes (manual)

**Scenario 4: Data corruption**
- Restore from point-in-time backup
- Replay WAL to specific timestamp
- RTO: 1-2 hours (manual)

## Scaling Considerations

### Horizontal Scaling

**API instances:**
- Stateless design allows easy scaling
- Add instances as load increases
- Auto-scaling based on CPU/memory

**Database:**
- Read replicas for read-heavy queries
- Connection pooling (PgBouncer)
- Partitioning for large tables

**Redis:**
- Cluster mode for >100k devices
- Separate caches for different data types

### Vertical Scaling

**When to scale up:**
- Single API instance using >70% CPU consistently
- Database using >80% memory
- Query latency >100ms p95

**Instance sizing:**
```
Small: 1k devices  → 2 CPU, 4GB RAM
Medium: 10k devices → 4 CPU, 8GB RAM
Large: 100k devices → 8 CPU, 16GB RAM
```

### Performance Optimization

**Database optimization:**
```sql
-- Add indexes for common queries
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_location ON devices(location_id);
CREATE INDEX idx_health_device_time ON device_health(device_id, timestamp DESC);
CREATE INDEX idx_telemetry_device_time ON telemetry(device_id, period_end DESC);

-- Partitioning for time-series data
CREATE TABLE telemetry (
    -- ... columns ...
) PARTITION BY RANGE (period_end);

CREATE TABLE telemetry_2025_01 PARTITION OF telemetry
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

**Caching strategy:**
```python
# Cache device list for 60 seconds
@cache(ttl=60)
async def get_devices(location_id: int):
    return await db.query(Device).filter_by(location_id=location_id).all()

# Cache analytics for 5 minutes
@cache(ttl=300)
async def get_analytics(org_id: int):
    return await calculate_analytics(org_id)
```

**CDN for static assets:**
- CloudFront/CloudFlare for dashboard assets
- Firmware distribution via CDN
- Reduce API server load

### Cost Optimization

**Cloud costs:**
- Reserved instances for baseline capacity
- Spot instances for burst capacity
- Auto-scaling to minimize idle resources
- Data transfer optimization

**Example monthly costs (AWS, 1000 devices):**
- ECS/EKS: $200-300
- RDS PostgreSQL (db.t3.medium): $50-70
- ElastiCache Redis (cache.t3.small): $20-30
- ALB: $20-30
- Data transfer: $50-100
- **Total: ~$350-530/month**

## Production Checklist

Before going live:

**Infrastructure:**
- [ ] SSL/TLS certificates configured
- [ ] Database backups automated
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured
- [ ] Auto-scaling policies defined
- [ ] Disaster recovery plan tested

**Security:**
- [ ] Authentication implemented
- [ ] Rate limiting configured
- [ ] Firewall rules in place
- [ ] Secrets management configured
- [ ] Security scan completed
- [ ] Penetration test passed

**Performance:**
- [ ] Load testing completed
- [ ] Database indexes optimized
- [ ] Caching strategy implemented
- [ ] CDN configured for static assets
- [ ] API response times <100ms p95

**Operations:**
- [ ] Deployment automation working
- [ ] Rollback procedure tested
- [ ] On-call rotation established
- [ ] Runbooks documented
- [ ] Post-incident review process defined

**Compliance:**
- [ ] Data retention policies defined
- [ ] GDPR compliance verified (if applicable)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Data processing agreements signed

---

For questions or support, contact: devops@example.com
