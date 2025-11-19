"""Local web interface for cluster management.

Provides web-based interface for managing the device cluster,
configuring PiP content, and monitoring status.

Runs on cluster leader at http://<leader-ip>:8080
"""

import logging
from datetime import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from pip_content import ContentType, pip_content_manager, ContentSchedule
from local_fleet.coordinator import coordinator
from local_fleet.registry import device_registry
from home_screen import AppRegistry
from system import system_monitor, health_checker, diagnostics_collector

# Create app registry instance
app_registry = AppRegistry()

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Ad Detection Cluster Manager",
    description="Local web interface for cluster management",
    version="1.0.0"
)

# Setup templates
template_dir = Path(__file__).parent / "templates"
template_dir.mkdir(exist_ok=True)
templates = Jinja2Templates(directory=str(template_dir))

# Setup static files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


#
# Dashboard & Status Pages
#

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Main dashboard page."""
    # Get cluster status
    cluster_info = coordinator.get_cluster_info()
    devices = device_registry.get_all_devices()

    # Get current leader
    leader_id = cluster_info.get("leader_id")
    is_leader = cluster_info.get("is_leader", False)

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "cluster_info": cluster_info,
        "devices": devices,
        "leader_id": leader_id,
        "is_leader": is_leader,
        "device_count": len(devices)
    })


@app.get("/devices", response_class=HTMLResponse)
async def devices_page(request: Request):
    """Devices management page."""
    devices = device_registry.get_all_devices()

    return templates.TemplateResponse("devices.html", {
        "request": request,
        "devices": devices
    })


@app.get("/pip-content", response_class=HTMLResponse)
async def pip_content_page(request: Request):
    """PiP content management page."""
    content_sources = pip_content_manager.list_content_sources()
    devices = device_registry.get_all_devices()

    # Get device configs
    device_configs = []
    for device in devices:
        config = pip_content_manager.get_device_config(device["device_id"])
        device_configs.append({
            "device": device,
            "config": config.to_dict() if config else None
        })

    return templates.TemplateResponse("pip_content.html", {
        "request": request,
        "content_sources": [s.to_dict() for s in content_sources],
        "device_configs": device_configs,
        "content_types": [ct.value for ct in ContentType]
    })


@app.get("/apps", response_class=HTMLResponse)
async def apps_page(request: Request):
    """Apps management page."""
    installed_apps = app_registry.list_apps()
    active_app = app_registry.get_active_app()

    return templates.TemplateResponse("apps.html", {
        "request": request,
        "installed_apps": [
            {
                "app_id": app.app_id,
                "name": app.name,
                "description": app.description,
                "icon": app.icon,
                "category": app.category.value,
                "version": app.version,
                "status": app.status.value
            }
            for app in installed_apps
        ],
        "active_app_id": active_app.app_id if active_app else None
    })


#
# API Endpoints - Content Management
#

@app.post("/api/content/add")
async def add_content_source(
    content_id: str = Form(...),
    name: str = Form(...),
    content_type: str = Form(...),
    source_uri: str = Form(...),
    description: str = Form(""),
    file: Optional[UploadFile] = File(None)
):
    """Add new content source."""
    try:
        # Handle file upload if provided
        if file and content_type in ["video_file", "image", "slideshow"]:
            file_data = await file.read()
            file_path = pip_content_manager.upload_content_file(
                content_id,
                file.filename,
                file_data
            )
            # Use uploaded file path as source URI
            source_uri = file_path

        # Add content source
        source = pip_content_manager.add_content_source(
            content_id=content_id,
            name=name,
            content_type=ContentType(content_type),
            source_uri=source_uri,
            metadata={"description": description}
        )

        return JSONResponse({
            "status": "success",
            "content": source.to_dict()
        })

    except Exception as e:
        logger.error(f"Failed to add content source: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/content/{content_id}/delete")
async def delete_content_source(content_id: str):
    """Delete content source."""
    success = pip_content_manager.remove_content_source(content_id)

    if success:
        return JSONResponse({"status": "success"})
    else:
        raise HTTPException(status_code=404, detail="Content not found")


@app.get("/api/content")
async def list_content_sources():
    """List all content sources."""
    sources = pip_content_manager.list_content_sources()

    return JSONResponse({
        "content_sources": [s.to_dict() for s in sources]
    })


#
# API Endpoints - Device Configuration
#

@app.post("/api/device/{device_id}/pip-config")
async def set_device_pip_config(
    device_id: str,
    default_content_id: Optional[str] = Form(None),
    enabled: bool = Form(True)
):
    """Set device PiP configuration."""
    try:
        config = pip_content_manager.set_device_config(
            device_id=device_id,
            default_content_id=default_content_id,
            enabled=enabled
        )

        return JSONResponse({
            "status": "success",
            "config": config.to_dict()
        })

    except Exception as e:
        logger.error(f"Failed to set device config: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/device/{device_id}/schedule/add")
async def add_device_schedule(
    device_id: str,
    schedule_id: str = Form(...),
    content_id: str = Form(...),
    days_of_week: Optional[str] = Form(None),  # Comma-separated: "0,1,2"
    start_time: Optional[str] = Form(None),    # HH:MM format
    end_time: Optional[str] = Form(None),      # HH:MM format
    priority: int = Form(0)
):
    """Add schedule to device configuration."""
    try:
        # Parse days of week
        days = None
        if days_of_week:
            days = [int(d.strip()) for d in days_of_week.split(",")]

        # Parse times
        start = time.fromisoformat(start_time) if start_time else None
        end = time.fromisoformat(end_time) if end_time else None

        # Create schedule
        schedule = ContentSchedule(
            schedule_id=schedule_id,
            content_id=content_id,
            days_of_week=days,
            start_time=start,
            end_time=end,
            priority=priority
        )

        # Add to device
        config = pip_content_manager.add_device_schedule(device_id, schedule)

        return JSONResponse({
            "status": "success",
            "config": config.to_dict()
        })

    except Exception as e:
        logger.error(f"Failed to add schedule: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/device/{device_id}/schedule/{schedule_id}/delete")
async def delete_device_schedule(device_id: str, schedule_id: str):
    """Delete device schedule."""
    success = pip_content_manager.remove_device_schedule(device_id, schedule_id)

    if success:
        return JSONResponse({"status": "success"})
    else:
        raise HTTPException(status_code=404, detail="Schedule not found")


@app.get("/api/device/{device_id}/pip-config")
async def get_device_pip_config(device_id: str):
    """Get device PiP configuration."""
    config = pip_content_manager.get_device_config(device_id)

    if config:
        return JSONResponse(config.to_dict())
    else:
        return JSONResponse({
            "device_id": device_id,
            "default_content_id": None,
            "schedules": [],
            "enabled": True
        })


@app.get("/api/device/{device_id}/active-content")
async def get_device_active_content(device_id: str):
    """Get currently active content for device."""
    content = pip_content_manager.get_active_content_for_device(device_id)

    if content:
        return JSONResponse({
            "has_content": True,
            "content": content.to_dict()
        })
    else:
        return JSONResponse({
            "has_content": False
        })


#
# API Endpoints - Cluster Management
#

@app.get("/api/cluster/status")
async def get_cluster_status():
    """Get cluster status."""
    cluster_info = coordinator.get_cluster_info()
    devices = device_registry.get_all_devices()

    return JSONResponse({
        "cluster_info": cluster_info,
        "devices": devices,
        "device_count": len(devices)
    })


@app.post("/api/cluster/sync-content")
async def sync_content_to_cluster():
    """Sync content to all devices in cluster."""
    # TODO: Implement content distribution to follower devices
    # This would copy content files from leader to followers

    return JSONResponse({
        "status": "success",
        "message": "Content sync initiated"
    })


#
# API Endpoints - App Management
#

@app.get("/api/apps")
async def list_apps():
    """List all installed apps."""
    apps = app_registry.list_apps()

    return JSONResponse({
        "apps": [
            {
                "app_id": app.app_id,
                "name": app.name,
                "description": app.description,
                "icon": app.icon,
                "category": app.category.value,
                "version": app.version,
                "status": app.status.value
            }
            for app in apps
        ]
    })


@app.get("/api/apps/{app_id}")
async def get_app_info(app_id: str):
    """Get app information."""
    app = app_registry.get_app(app_id)

    if not app:
        raise HTTPException(status_code=404, detail="App not found")

    return JSONResponse({
        "app_id": app.app_id,
        "name": app.name,
        "description": app.description,
        "icon": app.icon,
        "category": app.category.value,
        "version": app.version,
        "status": app.status.value,
        "error_message": app.error_message
    })


@app.post("/api/apps/{app_id}/launch")
async def launch_app(app_id: str):
    """Launch an application."""
    success = await app_registry.launch_app(app_id)

    if success:
        return JSONResponse({
            "status": "success",
            "message": f"App {app_id} launched"
        })
    else:
        raise HTTPException(status_code=500, detail="Failed to launch app")


@app.post("/api/apps/{app_id}/stop")
async def stop_app(app_id: str):
    """Stop an application."""
    success = await app_registry.stop_app(app_id)

    if success:
        return JSONResponse({
            "status": "success",
            "message": f"App {app_id} stopped"
        })
    else:
        raise HTTPException(status_code=500, detail="Failed to stop app")


@app.get("/api/apps/active")
async def get_active_app():
    """Get currently active app."""
    active_app = app_registry.get_active_app()

    if active_app:
        return JSONResponse({
            "has_active_app": True,
            "app_id": active_app.app_id,
            "name": active_app.name,
            "status": active_app.status.value
        })
    else:
        return JSONResponse({
            "has_active_app": False
        })


#
# Health & Info
#

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse({
        "status": "healthy",
        "is_leader": coordinator.is_leader()
    })


#
# Monitoring & Diagnostics API
#

@app.get("/api/monitoring/metrics")
async def get_metrics():
    """Get current system metrics."""
    metrics = system_monitor.get_latest_metrics()

    if metrics:
        return JSONResponse(metrics.to_dict())
    else:
        return JSONResponse({"error": "No metrics available"}, status_code=503)


@app.get("/api/monitoring/metrics/history")
async def get_metrics_history(minutes: int = 60):
    """Get metrics history."""
    history = system_monitor.get_metrics_history(minutes)

    return JSONResponse({
        "history": [m.to_dict() for m in history],
        "count": len(history)
    })


@app.get("/api/monitoring/metrics/average")
async def get_average_metrics(minutes: int = 5):
    """Get average metrics over time period."""
    averages = system_monitor.get_average_metrics(minutes)

    return JSONResponse(averages)


@app.get("/api/monitoring/system-info")
async def get_system_info_endpoint():
    """Get system information."""
    return JSONResponse(system_monitor.get_system_info())


@app.get("/api/monitoring/health")
async def get_health_status():
    """Get health status."""
    return JSONResponse(health_checker.get_health_summary())


@app.post("/api/monitoring/health/check")
async def run_health_checks():
    """Run health checks now."""
    await health_checker.run_all_checks()

    return JSONResponse(health_checker.get_health_summary())


@app.get("/api/monitoring/diagnostics/errors")
async def get_errors(
    component: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100
):
    """Get error reports."""
    errors = diagnostics_collector.get_recent_errors(component, severity, limit)

    return JSONResponse({
        "errors": [e.to_dict() for e in errors],
        "count": len(errors)
    })


@app.get("/api/monitoring/diagnostics/summary")
async def get_error_summary_endpoint():
    """Get error summary statistics."""
    return JSONResponse(diagnostics_collector.get_error_summary())


@app.get("/api/monitoring/diagnostics/export")
async def export_diagnostics():
    """Export full diagnostics report."""
    output_file = diagnostics_collector.export_diagnostics()

    return JSONResponse({
        "status": "success",
        "file": str(output_file),
        "message": "Diagnostics exported successfully"
    })


@app.get("/monitoring", response_class=HTMLResponse)
async def monitoring_page(request: Request):
    """Monitoring dashboard page."""
    metrics = system_monitor.get_latest_metrics()
    health_summary = health_checker.get_health_summary()
    error_summary = diagnostics_collector.get_error_summary()
    system_info = system_monitor.get_system_info()

    return templates.TemplateResponse("monitoring.html", {
        "request": request,
        "metrics": metrics.to_dict() if metrics else {},
        "health_summary": health_summary,
        "error_summary": error_summary,
        "system_info": system_info
    })


@app.get("/api/info")
async def get_info():
    """Get system information."""
    return JSONResponse({
        "version": "1.0.0",
        "is_leader": coordinator.is_leader(),
        "content_count": len(pip_content_manager.list_content_sources()),
        "device_count": len(device_registry.get_all_devices())
    })


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )
