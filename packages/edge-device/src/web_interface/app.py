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
# Health & Info
#

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse({
        "status": "healthy",
        "is_leader": coordinator.is_leader()
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
