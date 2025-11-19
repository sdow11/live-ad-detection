# Cloud Fleet Management API

Remote fleet management API for Live TV Ad Detection edge devices.

## Features

- **Multi-tenant Device Management**: Organizations, locations, and devices
- **Real-time Health Monitoring**: CPU, memory, temperature tracking
- **Telemetry Collection**: Ad detection statistics and performance metrics
- **Firmware Management**: Version control and distribution
- **Analytics**: Organization and location-level insights
- **RESTful API**: OpenAPI/Swagger documentation

## Architecture

```
Edge Devices → Cloud API → PostgreSQL Database
                ↓
          Admin Dashboard
```

## Database Schema

**Organizations**: Customer tenants (restaurant chains)
**Locations**: Physical locations (specific bars/restaurants)
**Devices**: Raspberry Pi edge devices
**DeviceHealth**: Periodic health snapshots
**Telemetry**: Ad detection and performance metrics
**FirmwareVersions**: Available firmware releases
**Users**: Admin dashboard users

## API Endpoints

### Organizations

- `POST /api/v1/organizations` - Create organization
- `GET /api/v1/organizations` - List organizations
- `GET /api/v1/organizations/{id}` - Get organization

### Locations

- `POST /api/v1/locations` - Create location
- `GET /api/v1/locations` - List locations (filter by org)

### Devices

- `POST /api/v1/devices/register` - Register/update device
- `POST /api/v1/devices/heartbeat` - Device heartbeat
- `GET /api/v1/devices` - List devices (filter by location/status)
- `GET /api/v1/devices/{id}` - Get device details

### Health & Telemetry

- `POST /api/v1/health` - Submit health data
- `GET /api/v1/devices/{id}/health` - Get health history
- `POST /api/v1/telemetry` - Submit telemetry
- `GET /api/v1/devices/{id}/telemetry` - Get telemetry history

### Firmware

- `POST /api/v1/firmware` - Create firmware version
- `GET /api/v1/firmware` - List versions
- `GET /api/v1/firmware/latest` - Get latest stable

### Analytics

- `GET /api/v1/analytics/organization/{id}` - Org stats

## Setup

### Requirements

- Python 3.11+
- PostgreSQL 14+
- Redis (for caching/background tasks)

### Installation

```bash
# Install dependencies
pip install -e packages/cloud-api

# Set up database
createdb livetv_cloud
psql livetv_cloud < schema.sql

# Configure environment
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost/livetv_cloud"
export REDIS_URL="redis://localhost:6379/0"

# Run migrations (Alembic)
alembic upgrade head

# Start API server
uvicorn cloud_api.main:app --host 0.0.0.0 --port 8000
```

### Development

```bash
# Run with auto-reload
uvicorn cloud_api.main:app --reload

# Run tests
pytest packages/cloud-api/tests

# API documentation
http://localhost:8000/docs
```

## Edge Device Integration

Edge devices report to the cloud API:

```python
import httpx

async def report_to_cloud():
    async with httpx.AsyncClient() as client:
        # Register device
        await client.post(
            "https://api.livetv.example.com/api/v1/devices/register",
            json={
                "device_id": "rpi-001",
                "location_id": 1,
                "role": "coordinator",
                "firmware_version": "1.0.0"
            }
        )

        # Heartbeat every 30 seconds
        await client.post(
            "https://api.livetv.example.com/api/v1/devices/heartbeat",
            json={
                "device_id": "rpi-001",
                "status": "online"
            }
        )

        # Health every 5 minutes
        await client.post(
            "https://api.livetv.example.com/api/v1/health",
            json={
                "device_id": "rpi-001",
                "cpu_usage_percent": 45.2,
                "memory_used_mb": 2048,
                "memory_total_mb": 8192,
                "temperature_celsius": 55.3
            }
        )

        # Telemetry every hour
        await client.post(
            "https://api.livetv.example.com/api/v1/telemetry",
            json={
                "device_id": "rpi-001",
                "total_ad_breaks": 42,
                "total_ad_duration_seconds": 1260,
                "average_fps": 30.1,
                "period_start": "2025-01-01T00:00:00Z",
                "period_end": "2025-01-01T01:00:00Z"
            }
        )
```

## Deployment

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY packages/cloud-api /app
RUN pip install -e .

CMD ["uvicorn", "cloud_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:password@db/livetv
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      POSTGRES_DB: livetv
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloud-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cloud-api
  template:
    metadata:
      labels:
        app: cloud-api
    spec:
      containers:
      - name: api
        image: livetv/cloud-api:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: cloud-api-secrets
              key: database-url
```

## Security

- **Authentication**: JWT tokens (implement in production)
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Per-IP and per-user limits
- **Input Validation**: Pydantic schemas
- **SQL Injection**: SQLAlchemy ORM protection
- **HTTPS**: TLS/SSL required in production

## Monitoring

- **Prometheus**: Metrics endpoint at `/metrics`
- **Health Check**: `/health` endpoint
- **Logging**: Structured JSON logs
- **Alerts**: Slack/PagerDuty integration

## License

[Your License]
