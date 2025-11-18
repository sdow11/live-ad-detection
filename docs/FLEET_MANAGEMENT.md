# Dual Fleet Management Architecture

## Overview

Two-tier fleet management system:
1. **Local Fleet Management**: Web-based UI on local network for venue staff
2. **Remote Fleet Management**: Cloud-based admin panel for system operators

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Cloud (Remote Fleet)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Admin Panel  │  │ Fleet API    │  │ Firmware     │      │
│  │ (Next.js)    │→ │ (FastAPI)    │→ │ Repository   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS/gRPC
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              Bar/Restaurant Location (Local Network)         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Coordinator Device (Raspberry Pi - Main)           │   │
│  │  ┌────────────────┐  ┌─────────────────────────┐   │   │
│  │  │  Web Server    │  │  Local Fleet Manager    │   │   │
│  │  │  (FastAPI)     │  │  - Device discovery     │   │   │
│  │  │  Port 8080     │  │  - Config sync          │   │   │
│  │  └────────────────┘  │  - Health monitoring    │   │   │
│  │                      └─────────────────────────┘   │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                             │ Local Network (mDNS)         │
│         ┌───────────────────┼────────────────┐             │
│         ↓                   ↓                ↓             │
│  ┌─────────────┐    ┌─────────────┐  ┌─────────────┐     │
│  │ Worker Pi 1 │    │ Worker Pi 2 │  │ Worker Pi N │     │
│  │ TV #1       │    │ TV #2       │  │ TV #N       │     │
│  └─────────────┘    └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Local Fleet Management

### Purpose
- **Venue staff** control and monitor TVs in their location
- **No internet required** for basic operation
- **One device** acts as coordinator
- **Web interface** accessible from any device on local network

### Features

#### 1. TV Control Dashboard
```
┌────────────────────────────────────────────┐
│ Bar XYZ - TV Control                       │
├────────────────────────────────────────────┤
│                                            │
│  TV 1 (Main Bar)        🟢 Online          │
│  Channel: ESPN          Ad Detection: ON   │
│  [Change Channel] [Settings] [Disable]     │
│                                            │
│  TV 2 (Dining)          🟢 Online          │
│  Channel: CNN           Ad Detection: ON   │
│  [Change Channel] [Settings] [Disable]     │
│                                            │
│  TV 3 (Patio)           🔴 Offline         │
│  [Reconnect]                               │
│                                            │
│  + Add New TV                              │
└────────────────────────────────────────────┘
```

#### 2. Schedule Management
```
┌────────────────────────────────────────────┐
│ TV Schedule Configuration                  │
├────────────────────────────────────────────┤
│                                            │
│  Monday - Friday                           │
│  ┌──────────────────────────────────────┐ │
│  │ 11:00 AM - 2:00 PM: ESPN (All TVs)   │ │
│  │ 2:00 PM - 5:00 PM:  CNN (TV 2)       │ │
│  │ 5:00 PM - 11:00 PM: Sports Mix       │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [Add Schedule] [Edit] [Delete]            │
└────────────────────────────────────────────┘
```

#### 3. What's On TV
```
┌────────────────────────────────────────────┐
│ Currently Airing                           │
├────────────────────────────────────────────┤
│  TV 1: NFL - Patriots vs Jets             │
│        4th Quarter                         │
│        Next Ad Break: ~3 min               │
│        Detections today: 47                │
│                                            │
│  TV 2: Breaking News                       │
│        Ad Detection: Paused                │
│        [Resume Detection]                  │
└────────────────────────────────────────────┘
```

### Technical Architecture

#### Device Roles

**Coordinator Device:**
- Elected via consensus (Raft algorithm)
- Runs web server (FastAPI)
- Stores local state (SQLite)
- Coordinates other devices
- Handles EPG data

**Worker Devices:**
- Run ad detection
- Register with coordinator
- Receive config from coordinator
- Report telemetry to coordinator

#### Service Discovery

```python
# Avahi/mDNS for zero-config networking
Service Type: _ad-detection._tcp.local.

Coordinator announces:
  - Name: "ad-detection-coordinator"
  - Port: 8080
  - TXT records: role=coordinator, version=1.0.0

Workers discover and register:
  - Scan for _ad-detection._tcp
  - Connect to coordinator
  - Send registration: device_id, capabilities, location
```

#### Communication Protocol

```python
# Local API (REST + Server-Sent Events for real-time)

# Worker → Coordinator
POST /api/v1/local/register
{
  "device_id": "rpi-001",
  "capabilities": ["hdmi_capture", "ir_blaster"],
  "tv_location": "Main Bar",
  "ip_address": "192.168.1.100"
}

# Coordinator → Worker
POST http://192.168.1.100:8081/control/channel
{
  "channel": "ESPN",
  "action": "change"
}

# Real-time updates (SSE)
GET /api/v1/local/events
event: device_status
data: {"device_id": "rpi-001", "status": "online"}

event: ad_detected
data: {"device_id": "rpi-001", "channel": "ESPN", "confidence": 0.96}
```

### Web UI Technology

**Backend:** FastAPI (Python)
- Fast, async support
- Auto-generated OpenAPI docs
- WebSocket/SSE support

**Frontend:** HTMX + Alpine.js (Lightweight, no build step)
- Server-rendered HTML
- Progressive enhancement
- Real-time updates via SSE
- Works on any device (phone, tablet, laptop)

**Alternative:** Simple React app (if more interactivity needed)

## Remote Fleet Management

### Purpose
- **System administrators** manage all deployments
- **Firmware updates** and configuration
- **Analytics** across all locations
- **Support** and troubleshooting

### Features

#### 1. Multi-Location Dashboard
```
┌────────────────────────────────────────────┐
│ Fleet Overview - 47 Locations, 312 Devices │
├────────────────────────────────────────────┤
│                                            │
│  🟢 Online: 298    🔴 Offline: 14         │
│  ⚠️  Alerts: 3                            │
│                                            │
│  Locations:                                │
│  ┌──────────────────────────────────────┐ │
│  │ Bar XYZ (NYC)        12 TVs  🟢      │ │
│  │ Restaurant ABC (LA)   8 TVs  🟢      │ │
│  │ Sports Bar (CHI)      6 TVs  ⚠️      │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [Add Location] [Bulk Update] [Reports]    │
└────────────────────────────────────────────┘
```

#### 2. Firmware Management
```
┌────────────────────────────────────────────┐
│ Firmware Updates                           │
├────────────────────────────────────────────┤
│                                            │
│  Current Version: v1.2.3 (298 devices)    │
│  Latest Version:  v1.3.0                   │
│                                            │
│  Staged Rollout:                           │
│  ┌──────────────────────────────────────┐ │
│  │ Phase 1: 5% (15 devices)   Complete  │ │
│  │ Phase 2: 20% (60 devices)  In Prog   │ │
│  │ Phase 3: 100% (all)        Pending   │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  Rollback available: v1.2.3                │
│  [Deploy] [Pause] [Rollback]               │
└────────────────────────────────────────────┘
```

#### 3. Device Management
```
┌────────────────────────────────────────────┐
│ Device: rpi-001 (Bar XYZ - Main Bar)       │
├────────────────────────────────────────────┤
│                                            │
│  Status: Online                            │
│  Firmware: v1.2.3                          │
│  Uptime: 45 days, 3 hours                  │
│  Model: Raspberry Pi 4 (4GB)               │
│                                            │
│  Health:                                   │
│    CPU: 42% | Memory: 1.2GB / 4GB         │
│    Temp: 52°C | Network: Good             │
│                                            │
│  Actions:                                  │
│  [Update Firmware] [Restart] [Logs]       │
│  [Remote Shell] [Rollback]                │
└────────────────────────────────────────────┘
```

### Technical Architecture

#### Firmware Update System

**Components:**
1. **Firmware Repository** (S3/MinIO)
2. **Update Orchestrator** (Cloud service)
3. **Device Update Agent** (On each Pi)

**Update Flow:**

```python
# 1. Admin triggers update via dashboard
POST /api/v1/admin/firmware/deploy
{
  "version": "v1.3.0",
  "strategy": "staged",
  "phases": [
    {"percentage": 5, "wait_hours": 24},
    {"percentage": 20, "wait_hours": 48},
    {"percentage": 100}
  ],
  "rollback_on_failure": true
}

# 2. Orchestrator selects devices for phase 1
selected_devices = select_canary_devices(total * 0.05)

# 3. Send update command to devices
for device in selected_devices:
    mqtt.publish(f"device/{device.id}/update", {
        "version": "v1.3.0",
        "checksum": "sha256:abc123...",
        "url": "https://cdn.example.com/firmware/v1.3.0.tar.gz",
        "signature": "RSA:def456..."
    })

# 4. Device downloads and verifies
device.download_firmware(url)
device.verify_checksum(checksum)
device.verify_signature(signature)

# 5. Device applies update (A/B partition)
device.install_to_partition_b()
device.set_boot_partition("B")
device.reboot()

# 6. Device reports health after reboot
device.report_health()

# 7. If healthy, continue to next phase
# 8. If failures > threshold, auto-rollback all
```

**A/B Partition Strategy:**
```
┌─────────────────────────────────┐
│  Raspberry Pi Storage           │
│                                 │
│  Partition A: v1.2.3 (current) │
│  Partition B: v1.3.0 (new)     │
│                                 │
│  Boot: A (safe) or B (new)     │
└─────────────────────────────────┘

Update Process:
1. Write v1.3.0 to Partition B
2. Set boot to B
3. Reboot
4. If boot fails 3x → auto-revert to A
5. If boot succeeds → verify health
6. If healthy → mark B as good
7. If unhealthy → revert to A
```

#### Security

**Device Authentication:**
```python
# Mutual TLS
- Each device has unique certificate
- Signed by internal CA
- Cloud verifies device identity
- Device verifies cloud identity

# JWT for API calls
- Short-lived tokens (1 hour)
- Refresh tokens (30 days)
- Rotated automatically
```

**Firmware Security:**
```python
# Code signing
- Firmware signed with private key
- Device verifies with public key
- Prevents unauthorized firmware

# Secure boot (optional)
- Boot loader verifies OS
- OS verifies firmware
- Chain of trust
```

**Network Security:**
```python
# Local network
- mDNS limited to local subnet
- Coordinator firewall rules
- Optional: WPA2 Enterprise

# Remote communication
- TLS 1.3 only
- Certificate pinning
- VPN option for added security
```

## Data Models

### Device Model

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class DeviceRole(str, Enum):
    COORDINATOR = "coordinator"
    WORKER = "worker"

class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UPDATING = "updating"
    ERROR = "error"

class Device(BaseModel):
    """Represents a physical Raspberry Pi device."""

    device_id: str = Field(..., description="Unique device identifier")
    role: DeviceRole
    status: DeviceStatus

    # Hardware info
    model: str = Field(..., example="Raspberry Pi 4 Model B")
    serial_number: str
    mac_address: str

    # Network
    ip_address: str
    hostname: str

    # Location
    location_id: str
    tv_location: str = Field(..., example="Main Bar")

    # Software
    firmware_version: str
    os_version: str

    # Capabilities
    capabilities: List[str] = Field(
        default=["hdmi_capture", "ir_blaster"],
        description="Hardware capabilities"
    )

    # Health
    cpu_usage: float = Field(..., ge=0, le=100)
    memory_usage: float = Field(..., ge=0)
    memory_total: float
    temperature: float = Field(..., description="CPU temp in Celsius")
    uptime_seconds: int

    # Timestamps
    last_seen: datetime
    registered_at: datetime
    updated_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "device_id": "rpi-001",
                "role": "worker",
                "status": "online",
                "model": "Raspberry Pi 4 Model B",
                "serial_number": "10000000a3b2c1d0",
                "mac_address": "dc:a6:32:12:34:56",
                "ip_address": "192.168.1.100",
                "hostname": "ad-detection-001",
                "location_id": "loc-xyz",
                "tv_location": "Main Bar",
                "firmware_version": "v1.2.3",
                "os_version": "Raspberry Pi OS 11",
                "capabilities": ["hdmi_capture", "ir_blaster"],
                "cpu_usage": 42.5,
                "memory_usage": 1200.0,
                "memory_total": 4096.0,
                "temperature": 52.3,
                "uptime_seconds": 3888000
            }
        }
```

### Location Model

```python
class Location(BaseModel):
    """Represents a physical location (bar/restaurant)."""

    location_id: str
    name: str = Field(..., example="Bar XYZ")

    # Address
    address: str
    city: str
    state: str
    zip_code: str
    timezone: str = Field(..., example="America/New_York")

    # Contact
    contact_name: str
    contact_email: str
    contact_phone: str

    # Devices
    coordinator_id: Optional[str] = None
    device_count: int = 0

    # Customer
    customer_id: str

    # Config
    config: dict = Field(default_factory=dict)

    # Timestamps
    created_at: datetime
    updated_at: datetime
```

### Firmware Update Model

```python
class FirmwareVersion(BaseModel):
    """Firmware version metadata."""

    version: str = Field(..., example="v1.3.0")
    release_date: datetime

    # Files
    url: str
    checksum: str = Field(..., description="SHA256 checksum")
    signature: str = Field(..., description="RSA signature")
    size_bytes: int

    # Compatibility
    min_hardware_version: str
    compatible_models: List[str]

    # Release notes
    changelog: str
    breaking_changes: bool = False

    # Status
    status: str = Field(..., example="stable")  # draft, beta, stable, deprecated

class FirmwareDeployment(BaseModel):
    """Firmware deployment/rollout."""

    deployment_id: str
    version: str

    # Strategy
    strategy: str = Field(..., example="staged")  # immediate, staged, scheduled
    phases: List[dict]

    # Progress
    total_devices: int
    updated_devices: int
    failed_devices: int

    # Health
    rollback_on_failure: bool = True
    failure_threshold: float = 0.05  # Rollback if >5% fail

    # Status
    status: str = Field(..., example="in_progress")  # pending, in_progress, completed, failed, rolled_back

    # Timestamps
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
```

## Implementation Strategy

### Phase 1: Local Fleet Management

1. **Device Discovery Service** (Week 1)
   - Avahi/mDNS integration
   - Coordinator election (Raft)
   - Device registration

2. **Local Web UI** (Week 2)
   - FastAPI backend
   - HTMX frontend
   - Real-time updates (SSE)

3. **TV Control** (Week 3)
   - Channel management
   - Schedule configuration
   - EPG integration

### Phase 2: Remote Fleet Management

1. **Cloud API** (Week 4)
   - Device management endpoints
   - Location management
   - Multi-tenancy

2. **Admin Dashboard** (Week 5)
   - Next.js frontend
   - Fleet overview
   - Analytics

3. **Firmware Update System** (Week 6)
   - Update orchestrator
   - A/B partitions
   - Rollback mechanism

## Testing Strategy

### Local Fleet

```python
# Test coordinator election
def test_coordinator_election():
    """Test that coordinator is elected correctly."""
    devices = [create_device() for _ in range(5)]
    coordinator = elect_coordinator(devices)
    assert coordinator is not None
    assert coordinator.role == DeviceRole.COORDINATOR

# Test device discovery
def test_device_discovery():
    """Test mDNS device discovery."""
    service = DiscoveryService()
    service.announce("coordinator", port=8080)

    discovered = service.discover(timeout=5)
    assert len(discovered) > 0
    assert discovered[0]["role"] == "coordinator"

# Test failover
def test_coordinator_failover():
    """Test coordinator failover when main fails."""
    coordinator = create_device(role="coordinator")
    workers = [create_device(role="worker") for _ in range(3)]

    # Simulate coordinator failure
    coordinator.status = DeviceStatus.OFFLINE

    # New coordinator should be elected
    new_coordinator = elect_coordinator(workers)
    assert new_coordinator is not None
```

### Remote Fleet

```python
# Test firmware deployment
async def test_firmware_deployment():
    """Test staged firmware rollout."""
    deployment = FirmwareDeployment(
        version="v1.3.0",
        strategy="staged",
        phases=[
            {"percentage": 5, "wait_hours": 0.1},  # Fast for test
            {"percentage": 100}
        ]
    )

    orchestrator = UpdateOrchestrator()
    result = await orchestrator.deploy(deployment)

    assert result.status == "completed"
    assert result.updated_devices == result.total_devices
    assert result.failed_devices == 0

# Test rollback
async def test_automatic_rollback():
    """Test automatic rollback on failures."""
    deployment = create_deployment(
        rollback_on_failure=True,
        failure_threshold=0.05
    )

    # Simulate 10% failure rate
    mock_device_failures(rate=0.10)

    orchestrator = UpdateOrchestrator()
    result = await orchestrator.deploy(deployment)

    assert result.status == "rolled_back"
    assert all_devices_on_previous_version()
```

## Security Considerations

1. **Local Network Isolation**: Coordinator only accessible on local subnet
2. **Authentication**: All API calls require valid JWT
3. **Authorization**: Role-based access control (staff vs admin)
4. **Firmware Integrity**: Code signing and verification
5. **Secure Updates**: HTTPS, checksum validation, signature verification
6. **Audit Logging**: All actions logged for compliance
7. **Rate Limiting**: Prevent brute force attacks
8. **Input Validation**: All inputs validated via Pydantic

## Scalability

### Local (per location)
- Up to 50 devices per coordinator
- SQLite for local state
- Minimal resource usage

### Remote (cloud)
- Horizontal scaling with Kubernetes
- Database sharding by location
- CDN for firmware distribution
- Redis for real-time features

## Monitoring

### Local
- Device health checks (every 30s)
- Network connectivity
- Resource usage (CPU, memory, temp)
- Detection accuracy

### Remote
- Aggregate metrics across all locations
- Firmware deployment success rate
- Alert on offline devices
- Performance trends
