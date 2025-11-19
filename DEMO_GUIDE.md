# Complete System Demo Guide

This guide walks you through running the complete live TV ad detection system with full edge-to-cloud integration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud API (Port 8000)                   │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │   REST API   │  │  Database   │  │ Admin Dashboard  │   │
│  │  (FastAPI)   │  │ (SQLite)    │  │     (HTML)       │   │
│  └──────┬───────┘  └─────────────┘  └──────────────────┘   │
└─────────┼──────────────────────────────────────────────────┘
          │
          │ HTTPS (Heartbeat, Health, Telemetry)
          │
┌─────────▼────────────────────────────────────────────────────┐
│                    Edge Device(s)                            │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Video Pipeline│  │  ML Detector │  │  Cloud Reporter │   │
│  │ (Capture→PiP) │  │ (Ad Detection│  │  (Telemetry)    │   │
│  └───────┬───────┘  └──────┬───────┘  └─────────────────┘   │
│          │                 │                                 │
│          └────────┬────────┘                                 │
│                   │                                          │
│          ┌────────▼─────────┐                                │
│          │   TV Controller  │                                │
│          │  (IR/CEC/HTTP)   │                                │
│          └──────────────────┘                                │
└──────────────────────────────────────────────────────────────┘
```

## What Gets Demonstrated

### Edge Device Features
- ✅ Video capture and processing
- ✅ ML-based ad detection (mock model)
- ✅ Picture-in-Picture composition
- ✅ Multiple ad response strategies
- ✅ TV control integration
- ✅ Real-time telemetry collection
- ✅ Cloud communication with retry logic

### Cloud API Features
- ✅ Device registration and management
- ✅ Heartbeat monitoring (device online/offline status)
- ✅ Health metrics collection (CPU, memory, temperature)
- ✅ Telemetry aggregation (ad detection statistics)
- ✅ Multi-tenant database (organizations/locations/devices)
- ✅ RESTful API with automatic documentation
- ✅ Real-time admin dashboard

## Prerequisites

### Software Requirements
```bash
# Python 3.11+ with all dependencies installed
pip install -e packages/shared/python-common
pip install -e packages/edge-device
pip install -e packages/cloud-api[dev]
```

### Optional Hardware (for full TV control)
- IR blaster (e.g., via GPIO or USB)
- HDMI CEC support
- HDMI capture card (e.g., Auvidea B101)

## Quick Start

### Step 1: Start Cloud API

In terminal 1:
```bash
cd packages/cloud-api/examples
python demo_cloud_api.py
```

Expected output:
```
🚀 STARTING CLOUD FLEET MANAGEMENT API
🗄️  Setting up demo database...
✅ Database tables created
✅ Created organization: Demo Restaurant Chain
✅ Created 3 sample locations
✅ CLOUD API SERVER READY
API URL: http://localhost:8000
Dashboard: http://localhost:8000/dashboard.html
```

**Verify it's running:**
- API: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- Dashboard: http://localhost:8000/dashboard.html

### Step 2: Start Edge Device(s)

In terminal 2:
```bash
cd packages/edge-device/examples
python demo_complete_system.py \
  --device-id rpi-bar-001 \
  --location-id 1 \
  --strategy pip_only
```

Expected output:
```
🚀 STARTING COMPLETE AD DETECTION SYSTEM
Device ID: rpi-bar-001
Location ID: 1
Strategy: pip_only
Cloud API: http://localhost:8000
📡 Setting up cloud reporter...
📹 Setting up video capture...
🖥️  Setting up video output...
⚙️  Setting up integrated pipeline...
✅ System setup complete!
▶️  STARTING VIDEO PIPELINE
```

### Step 3: Monitor via Dashboard

Open in your browser:
```
http://localhost:8000/dashboard.html
```

You should see:
- Device status (online)
- Health metrics updating every 5 minutes
- Telemetry statistics

### Step 4: Run Multiple Devices (Optional)

Start additional edge devices on different locations:

Terminal 3:
```bash
python demo_complete_system.py \
  --device-id rpi-airport-001 \
  --location-id 2 \
  --strategy channel_change
```

Terminal 4:
```bash
python demo_complete_system.py \
  --device-id rpi-grill-001 \
  --location-id 3 \
  --strategy pip_with_mute
```

All devices will appear in the dashboard!

## Configuration Options

### Edge Device Options

```bash
python demo_complete_system.py --help
```

Available arguments:
- `--device-id` - Unique device identifier (default: rpi-demo-001)
- `--location-id` - Location ID in cloud database (1, 2, or 3)
- `--cloud-api-url` - Cloud API URL (default: http://localhost:8000)
- `--role` - Device role: coordinator or worker (default: worker)
- `--strategy` - Ad response strategy:
  - `pip_only` - Just show PiP with alternate content
  - `channel_change` - Change TV channel during ads
  - `input_switch` - Switch TV input during ads
  - `pip_with_mute` - PiP + mute TV audio
- `--enable-tv-control` - Enable actual TV control (requires hardware)
- `--video-mode` - Resolution: 720p30, 720p60, 1080p30, 1080p60
- `--duration` - Run for N seconds (0 = infinite)

### Example Configurations

**Coordinator device at sports bar:**
```bash
python demo_complete_system.py \
  --device-id rpi-coordinator-001 \
  --location-id 1 \
  --role coordinator \
  --strategy channel_change \
  --video-mode 1080p60
```

**Worker device with real TV control:**
```bash
python demo_complete_system.py \
  --device-id rpi-worker-001 \
  --location-id 2 \
  --enable-tv-control \
  --strategy pip_with_mute
```

**Time-limited demo run:**
```bash
python demo_complete_system.py \
  --device-id rpi-demo-001 \
  --location-id 1 \
  --duration 300  # Run for 5 minutes
```

## Monitoring and Verification

### Cloud API Endpoints

Test the REST API directly:

**List all devices:**
```bash
curl http://localhost:8000/api/v1/devices
```

**Get organization analytics:**
```bash
curl http://localhost:8000/api/v1/analytics/organization/1
```

**Get device health history:**
```bash
curl http://localhost:8000/api/v1/devices/1/health
```

**List firmware versions:**
```bash
curl http://localhost:8000/api/v1/firmware
```

### Edge Device Logs

Watch edge device logs for activity:
```bash
tail -f edge_device.log
```

Look for:
- `✅ Device registered successfully`
- `Heartbeat sent successfully`
- `Health reported: CPU X%, Mem Y%, Temp Z°C`
- `Telemetry reported: N ad breaks, M frames`
- `🎬 AD BREAK DETECTED` when ads are detected
- `📺 CONTENT RESUMED` when content returns

### Status Updates

Both cloud API and edge device provide periodic status updates:

**Edge device** (every minute):
```
📊 STATUS UPDATE
Frames processed: 1800
Average FPS: 30.0
Average latency: 75.2ms
Drop rate: 0.00%
Cloud registered: True
Last heartbeat: 2025-11-19 01:23:45
```

## Data Flow

### Device Registration (Startup)
```
Edge Device → POST /api/v1/devices/register
            ← 201 Created {id: 1, device_id: "rpi-001"}
```

### Heartbeat (Every 30 seconds)
```
Edge Device → POST /api/v1/devices/heartbeat
            ← 200 OK {last_heartbeat: "2025-11-19T01:23:45Z"}
```

### Health Reporting (Every 5 minutes)
```
Edge Device → POST /api/v1/health
            {
              "cpu_usage_percent": 45.2,
              "memory_used_mb": 2048,
              "temperature_celsius": 55.3
            }
            ← 200 OK
```

### Telemetry Reporting (Every hour)
```
Edge Device → POST /api/v1/telemetry
            {
              "total_ad_breaks": 42,
              "total_ad_duration_seconds": 1260,
              "average_fps": 30.1,
              "total_frames_processed": 108000
            }
            ← 200 OK
```

## Troubleshooting

### Cloud API won't start
- **Check port 8000 is available:**
  ```bash
  lsof -i :8000
  ```
- **Check database permissions:**
  ```bash
  ls -la demo_fleet.db
  ```

### Edge device can't connect to cloud
- **Verify cloud API is running:**
  ```bash
  curl http://localhost:8000/health
  ```
- **Check cloud API URL is correct:**
  Look for `Cloud API: http://localhost:8000` in edge device output
- **Check firewall settings:**
  Ensure localhost connections are allowed

### Device not appearing in dashboard
- **Wait for heartbeat:** First heartbeat is sent after 30 seconds
- **Check device logs:** Look for "Device registered successfully"
- **Refresh dashboard:** Dashboard auto-refreshes every 30 seconds
- **Check location ID:** Must match an existing location (1, 2, or 3)

### No telemetry data
- **Telemetry is hourly:** Wait up to 1 hour for first report
- **Check edge device is processing frames:** Look for status updates
- **Verify telemetry is enabled:** Check `enable_telemetry_reporting=True`

## Stopping the Demo

### Graceful Shutdown

**Stop edge device:**
Press `Ctrl+C` in the edge device terminal

Expected output:
```
🛑 Received shutdown signal...
🛑 SHUTTING DOWN SYSTEM
Stopping pipeline...
Stopping cloud reporter...
📈 FINAL STATISTICS
Total frames processed: 108000
Average FPS: 30.0
✅ Shutdown complete
```

**Stop cloud API:**
Press `Ctrl+C` in the cloud API terminal

### Cleanup

Remove demo database:
```bash
rm packages/cloud-api/examples/demo_fleet.db
rm packages/edge-device/examples/edge_device.log
```

## Next Steps

After running the demo:

1. **Explore the code:**
   - Edge device: `packages/edge-device/src/`
   - Cloud API: `packages/cloud-api/src/`
   - Shared models: `packages/shared/python-common/src/`

2. **Run the tests:**
   ```bash
   pytest packages/edge-device/tests/
   pytest packages/cloud-api/tests/
   ```

3. **Customize the system:**
   - Train your own ML model for ad detection
   - Configure real TV control hardware
   - Deploy to production environment
   - Add authentication to cloud API
   - Implement HTTPS for cloud communication

4. **Production deployment:**
   - See `DEPLOYMENT.md` for production setup
   - Configure systemd services
   - Set up WiFi Access Point for coordinator
   - Deploy cloud API to AWS/GCP/Azure
   - Configure PostgreSQL database
   - Set up monitoring and alerting

## Support

For issues or questions:
- Check logs: `edge_device.log`
- Review API docs: http://localhost:8000/docs
- Test API endpoints directly with curl
- Enable debug logging: Set `level=logging.DEBUG` in demo scripts

## Demo Video

The demo shows:
1. ⏱️ 0:00 - Cloud API startup with sample data
2. ⏱️ 0:30 - Edge device registration and initialization
3. ⏱️ 1:00 - Video pipeline processing frames
4. ⏱️ 1:30 - ML ad detection and PiP composition
5. ⏱️ 2:00 - Cloud dashboard showing device status
6. ⏱️ 2:30 - Heartbeat and health reporting
7. ⏱️ 3:00 - Multiple devices in fleet view
8. ⏱️ 3:30 - Telemetry and analytics
9. ⏱️ 4:00 - Graceful shutdown

Total runtime: ~4 minutes for complete demonstration
