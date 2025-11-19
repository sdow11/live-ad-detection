"""Main Cloud API application.

FastAPI application for remote fleet management.
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator, List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ad_detection_common.models.device import DeviceStatus
from cloud_api import auth, models, schemas
from cloud_api.analytics import AnalyticsService
from cloud_api.cache import cache, cached
from cloud_api.database import engine, get_db
from cloud_api.middleware import (
    PerformanceMonitoringMiddleware,
    RateLimitMiddleware,
    RequestLoggingMiddleware,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Cloud Fleet Management API")

    # Connect to Redis cache
    await cache.connect()

    # Create tables (in production, use Alembic migrations)
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    yield

    # Shutdown
    logger.info("Shutting down Cloud Fleet Management API")
    await cache.disconnect()


# Create FastAPI app
app = FastAPI(
    title="Live TV Ad Detection - Cloud API",
    description="Remote fleet management API for edge devices",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Performance monitoring middleware
app.add_middleware(PerformanceMonitoringMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware, enabled=True)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# Health check endpoint


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# Authentication endpoints


@app.post("/api/v1/auth/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: schemas.UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user.

    Creates a new user account and returns authentication tokens.
    """
    # Check if email already exists
    result = await db.execute(
        models.User.__table__.select().where(
            models.User.email == user_data.email
        )
    )
    existing_user = result.first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Verify organization exists
    organization = await db.get(models.Organization, user_data.organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    # Create user
    hashed_password = auth.hash_password(user_data.password)
    db_user = models.User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        organization_id=user_data.organization_id,
        is_active=True,
        is_superuser=False
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    # Create tokens
    token_pair = auth.create_token_pair(
        user_id=db_user.id,
        organization_id=db_user.organization_id,
        email=db_user.email,
        is_superuser=db_user.is_superuser
    )

    return schemas.TokenResponse(
        **token_pair.model_dump(),
        user=schemas.UserResponse.model_validate(db_user)
    )


@app.post("/api/v1/auth/login", response_model=schemas.TokenResponse)
async def login_user(
    credentials: schemas.UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate user and return tokens.

    Validates email and password, returns JWT tokens if successful.
    """
    # Get user by email
    result = await db.execute(
        models.User.__table__.select().where(
            models.User.email == credentials.email
        )
    )
    user = result.first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Verify password
    if not auth.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create tokens
    token_pair = auth.create_token_pair(
        user_id=user.id,
        organization_id=user.organization_id,
        email=user.email,
        is_superuser=user.is_superuser
    )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return schemas.TokenResponse(
        **token_pair.model_dump(),
        user=schemas.UserResponse.model_validate(user)
    )


@app.post("/api/v1/auth/refresh", response_model=schemas.TokenResponse)
async def refresh_token(
    refresh_request: schemas.RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token.

    Args:
        refresh_request: Refresh token request
        db: Database session

    Returns:
        New token pair
    """
    # Decode refresh token
    payload = auth.decode_token(refresh_request.refresh_token)

    # Verify token type
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )

    # Get user
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create new token pair
    token_pair = auth.create_token_pair(
        user_id=user.id,
        organization_id=user.organization_id,
        email=user.email,
        is_superuser=user.is_superuser
    )

    return schemas.TokenResponse(
        **token_pair.model_dump(),
        user=schemas.UserResponse.model_validate(user)
    )


@app.get("/api/v1/auth/me", response_model=schemas.UserResponse)
async def get_current_user_info(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get current user information.

    Requires authentication.
    """
    return schemas.UserResponse.model_validate(current_user)


@app.post("/api/v1/auth/change-password")
async def change_password(
    password_change: schemas.PasswordChange,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change user password.

    Requires authentication.
    """
    # Verify current password
    if not auth.verify_password(password_change.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )

    # Update password
    current_user.hashed_password = auth.hash_password(password_change.new_password)
    await db.commit()

    return {"status": "password_changed"}


# Device API Key Management


@app.post("/api/v1/devices/{device_id}/api-key", response_model=schemas.APIKeyResponse)
async def generate_device_api_key(
    device_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate or regenerate API key for a device.

    Requires authentication. User must have access to device's organization.
    """
    # Get device
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get location to check organization access
    location = await db.get(models.Location, device.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Verify organization access
    await auth.verify_organization_access(current_user, location.organization_id)

    # Generate new API key
    api_key = auth.generate_api_key()
    device.api_key = api_key
    device.api_key_enabled = True
    device.api_key_created_at = datetime.now(timezone.utc)

    await db.commit()

    return schemas.APIKeyResponse(
        api_key=api_key,
        device_id=device_id,
        created_at=device.api_key_created_at,
        enabled=device.api_key_enabled
    )


@app.delete("/api/v1/devices/{device_id}/api-key")
async def revoke_device_api_key(
    device_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke API key for a device.

    Requires authentication. User must have access to device's organization.
    """
    # Get device
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get location to check organization access
    location = await db.get(models.Location, device.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Verify organization access
    await auth.verify_organization_access(current_user, location.organization_id)

    # Disable API key
    device.api_key_enabled = False
    await db.commit()

    return {"status": "revoked", "device_id": device_id}


# Organization endpoints


@app.post("/api/v1/organizations", response_model=schemas.Organization, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org: schemas.OrganizationCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new organization."""
    db_org = models.Organization(**org.model_dump())
    db.add(db_org)
    await db.commit()
    await db.refresh(db_org)
    return db_org


@app.get("/api/v1/organizations", response_model=List[schemas.Organization])
async def list_organizations(
    skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)
):
    """List all organizations."""
    result = await db.execute(
        models.Organization.__table__.select().offset(skip).limit(limit)
    )
    return result.all()


@app.get("/api/v1/organizations/{org_id}", response_model=schemas.Organization)
async def get_organization(org_id: int, db: AsyncSession = Depends(get_db)):
    """Get organization by ID."""
    result = await db.get(models.Organization, org_id)
    if not result:
        raise HTTPException(status_code=404, detail="Organization not found")
    return result


# Location endpoints


@app.post("/api/v1/locations", response_model=schemas.Location, status_code=status.HTTP_201_CREATED)
async def create_location(
    location: schemas.LocationCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new location."""
    db_location = models.Location(**location.model_dump())
    db.add(db_location)
    await db.commit()
    await db.refresh(db_location)
    return db_location


@app.get("/api/v1/locations", response_model=List[schemas.Location])
async def list_locations(
    organization_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List locations, optionally filtered by organization."""
    query = models.Location.__table__.select()

    if organization_id:
        query = query.where(models.Location.organization_id == organization_id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.all()


# Device endpoints


@app.post("/api/v1/devices/register", response_model=schemas.Device, status_code=status.HTTP_201_CREATED)
async def register_device(
    device: schemas.DeviceRegister, db: AsyncSession = Depends(get_db)
):
    """Register a new device or update existing."""
    # Check if device already exists
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device.device_id
        )
    )
    existing = result.first()

    if existing:
        # Update existing device
        for key, value in device.model_dump(exclude_unset=True).items():
            setattr(existing, key, value)

        existing.last_seen = datetime.utcnow()
        existing.status = DeviceStatus.ONLINE
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        # Create new device
        db_device = models.Device(**device.model_dump())
        db_device.status = DeviceStatus.ONLINE
        db_device.last_seen = datetime.utcnow()
        db.add(db_device)
        await db.commit()
        await db.refresh(db_device)
        return db_device


@app.post("/api/v1/devices/heartbeat")
async def device_heartbeat(
    heartbeat: schemas.DeviceHeartbeat, db: AsyncSession = Depends(get_db)
):
    """Record device heartbeat."""
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == heartbeat.device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Update heartbeat
    device.last_heartbeat = datetime.utcnow()
    device.last_seen = datetime.utcnow()
    device.status = heartbeat.status

    if heartbeat.ip_address:
        device.ip_address = heartbeat.ip_address

    await db.commit()

    return {"status": "acknowledged", "device_id": heartbeat.device_id}


@app.get("/api/v1/devices", response_model=List[schemas.Device])
async def list_devices(
    location_id: int | None = None,
    status: DeviceStatus | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List devices with optional filters."""
    query = models.Device.__table__.select()

    if location_id:
        query = query.where(models.Device.location_id == location_id)

    if status:
        query = query.where(models.Device.status == status)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.all()


@app.get("/api/v1/devices/{device_id}", response_model=schemas.Device)
async def get_device(device_id: str, db: AsyncSession = Depends(get_db)):
    """Get device by device_id."""
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    return device


# Health reporting endpoints


@app.post("/api/v1/health", status_code=status.HTTP_201_CREATED)
async def submit_device_health(
    health: schemas.DeviceHealthCreate, db: AsyncSession = Depends(get_db)
):
    """Submit device health data."""
    # Get device by device_id
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == health.device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Create health record
    db_health = models.DeviceHealth(
        device_id=device.id, **health.model_dump(exclude={"device_id"})
    )
    db.add(db_health)
    await db.commit()

    return {"status": "recorded"}


@app.get("/api/v1/devices/{device_id}/health", response_model=List[schemas.DeviceHealthResponse])
async def get_device_health(
    device_id: str,
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
):
    """Get device health history."""
    # Get device
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get health records
    since = datetime.utcnow() - timedelta(hours=hours)

    result = await db.execute(
        models.DeviceHealth.__table__.select()
        .where(
            and_(
                models.DeviceHealth.device_id == device.id,
                models.DeviceHealth.recorded_at >= since,
            )
        )
        .order_by(models.DeviceHealth.recorded_at.desc())
    )

    return result.all()


# Telemetry endpoints


@app.post("/api/v1/telemetry", status_code=status.HTTP_201_CREATED)
async def submit_telemetry(
    telemetry: schemas.TelemetryCreate, db: AsyncSession = Depends(get_db)
):
    """Submit device telemetry data."""
    # Get device
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == telemetry.device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Create telemetry record
    db_telemetry = models.Telemetry(
        device_id=device.id, **telemetry.model_dump(exclude={"device_id"})
    )
    db.add(db_telemetry)
    await db.commit()

    return {"status": "recorded"}


@app.get("/api/v1/devices/{device_id}/telemetry", response_model=List[schemas.TelemetryResponse])
async def get_device_telemetry(
    device_id: str,
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
):
    """Get device telemetry history."""
    # Get device
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get telemetry records
    since = datetime.utcnow() - timedelta(hours=hours)

    result = await db.execute(
        models.Telemetry.__table__.select()
        .where(
            and_(
                models.Telemetry.device_id == device.id,
                models.Telemetry.recorded_at >= since,
            )
        )
        .order_by(models.Telemetry.recorded_at.desc())
    )

    return result.all()


# Firmware endpoints


@app.post("/api/v1/firmware", response_model=schemas.FirmwareVersion, status_code=status.HTTP_201_CREATED)
async def create_firmware_version(
    firmware: schemas.FirmwareVersionCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new firmware version."""
    db_firmware = models.FirmwareVersion(**firmware.model_dump())
    db.add(db_firmware)
    await db.commit()
    await db.refresh(db_firmware)
    return db_firmware


@app.get("/api/v1/firmware", response_model=List[schemas.FirmwareVersion])
async def list_firmware_versions(db: AsyncSession = Depends(get_db)):
    """List all firmware versions."""
    result = await db.execute(
        models.FirmwareVersion.__table__.select().order_by(
            models.FirmwareVersion.released_at.desc()
        )
    )
    return result.all()


@app.get("/api/v1/firmware/latest", response_model=schemas.FirmwareVersion)
async def get_latest_firmware(db: AsyncSession = Depends(get_db)):
    """Get latest stable firmware version."""
    result = await db.execute(
        models.FirmwareVersion.__table__.select()
        .where(models.FirmwareVersion.is_latest == True)
        .limit(1)
    )
    firmware = result.first()

    if not firmware:
        raise HTTPException(status_code=404, detail="No firmware versions available")

    return firmware


# Advanced Analytics endpoints


@app.get("/api/v1/analytics/organizations/{org_id}")
async def get_enhanced_organization_stats(
    org_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive organization-level statistics.

    Requires authentication. Returns detailed metrics including video pipeline,
    ad detection, and device health statistics.
    """
    # Verify organization access
    await auth.verify_organization_access(current_user, org_id)

    analytics = AnalyticsService(db)
    stats = await analytics.get_organization_stats(org_id, start_date, end_date)

    if not stats:
        raise HTTPException(status_code=404, detail="Organization not found")

    return stats


@app.get("/api/v1/analytics/locations/{location_id}")
async def get_enhanced_location_stats(
    location_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive location-level statistics.

    Requires authentication. User must have access to location's organization.
    """
    # Get location to check organization access
    location = await db.get(models.Location, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    await auth.verify_organization_access(current_user, location.organization_id)

    analytics = AnalyticsService(db)
    stats = await analytics.get_location_stats(location_id, start_date, end_date)

    if not stats:
        raise HTTPException(status_code=404, detail="Location not found")

    return stats


@app.get("/api/v1/analytics/devices/{device_id}")
async def get_enhanced_device_stats(
    device_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive device-level statistics.

    Requires authentication. User must have access to device's organization.
    """
    # Get device to check organization access
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.device_id == device_id
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    location = await db.get(models.Location, device.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    await auth.verify_organization_access(current_user, location.organization_id)

    analytics = AnalyticsService(db)
    stats = await analytics.get_device_stats(device_id, start_date, end_date)

    if not stats:
        raise HTTPException(status_code=404, detail="Device not found")

    return stats


@app.get("/api/v1/analytics/time-series")
async def get_time_series_analytics(
    metric: str,
    organization_id: Optional[int] = None,
    location_id: Optional[int] = None,
    device_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    interval: str = "hour",
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get time-series data for a specific metric.

    Requires authentication. Supports metrics: ad_breaks, fps, latency.
    Intervals: hour, day, week.
    """
    # Verify access based on scope
    if organization_id:
        await auth.verify_organization_access(current_user, organization_id)
    elif location_id:
        location = await db.get(models.Location, location_id)
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        await auth.verify_organization_access(current_user, location.organization_id)
    elif device_id:
        result = await db.execute(
            models.Device.__table__.select().where(
                models.Device.device_id == device_id
            )
        )
        device = result.first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        location = await db.get(models.Location, device.location_id)
        await auth.verify_organization_access(current_user, location.organization_id)

    analytics = AnalyticsService(db)
    data = await analytics.get_time_series_data(
        organization_id=organization_id,
        location_id=location_id,
        device_id=device_id,
        metric=metric,
        start_date=start_date,
        end_date=end_date,
        interval=interval
    )

    return {
        "metric": metric,
        "interval": interval,
        "data": data
    }


@app.get("/api/v1/analytics/top-locations")
async def get_top_locations_by_ad_breaks(
    org_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 10,
    current_user: models.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get top locations by ad break count.

    Requires authentication. Returns top N locations with most ad breaks.
    """
    await auth.verify_organization_access(current_user, org_id)

    analytics = AnalyticsService(db)
    top_locations = await analytics.get_top_locations_by_ad_breaks(
        org_id, start_date, end_date, limit
    )

    return {
        "organization_id": org_id,
        "top_locations": top_locations
    }


# ML Model Registry endpoints


@app.post("/api/v1/models", response_model=schemas.MLModel, status_code=status.HTTP_201_CREATED)
async def create_model(
    model: schemas.MLModelCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new ML model."""
    db_model = models.MLModel(**model.model_dump())
    db.add(db_model)
    await db.commit()
    await db.refresh(db_model)
    return db_model


@app.get("/api/v1/models", response_model=List[schemas.MLModel])
async def list_models(
    model_type: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List all ML models."""
    query = models.MLModel.__table__.select()

    if model_type:
        query = query.where(models.MLModel.model_type == model_type)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.all()


@app.get("/api/v1/models/{model_name}", response_model=schemas.MLModelWithVersions)
async def get_model(model_name: str, db: AsyncSession = Depends(get_db)):
    """Get ML model by name with all versions."""
    result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get versions
    versions_result = await db.execute(
        models.MLModelVersion.__table__.select()
        .where(models.MLModelVersion.model_id == model.id)
        .order_by(models.MLModelVersion.created_at.desc())
    )
    versions = versions_result.all()

    # Combine model and versions
    model_dict = dict(model._mapping)
    model_dict['versions'] = [dict(v._mapping) for v in versions]

    return model_dict


@app.post("/api/v1/models/{model_name}/versions", response_model=schemas.MLModelVersion, status_code=status.HTTP_201_CREATED)
async def create_model_version(
    model_name: str,
    version: schemas.MLModelVersionBase,
    db: AsyncSession = Depends(get_db)
):
    """Create a new version for an ML model."""
    # Get model
    result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Check if version already exists
    existing_result = await db.execute(
        models.MLModelVersion.__table__.select().where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.version == version.version
            )
        )
    )
    existing = existing_result.first()

    if existing:
        raise HTTPException(status_code=400, detail="Version already exists")

    # Create version
    db_version = models.MLModelVersion(
        model_id=model.id,
        **version.model_dump()
    )
    db.add(db_version)
    await db.commit()
    await db.refresh(db_version)

    return db_version


@app.get("/api/v1/models/{model_name}/versions", response_model=List[schemas.MLModelVersion])
async def list_model_versions(
    model_name: str,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List all versions of an ML model."""
    # Get model
    result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get versions
    query = models.MLModelVersion.__table__.select().where(
        models.MLModelVersion.model_id == model.id
    )

    if status_filter:
        query = query.where(models.MLModelVersion.status == status_filter)

    query = query.order_by(models.MLModelVersion.created_at.desc())

    result = await db.execute(query)
    return result.all()


@app.get("/api/v1/models/{model_name}/versions/{version}", response_model=schemas.MLModelVersion)
async def get_model_version(
    model_name: str,
    version: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific model version."""
    # Get model
    result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get version
    result = await db.execute(
        models.MLModelVersion.__table__.select().where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.version == version
            )
        )
    )
    version_obj = result.first()

    if not version_obj:
        raise HTTPException(status_code=404, detail="Model version not found")

    return version_obj


@app.get("/api/v1/models/{model_name}/versions/{version}/download", response_model=schemas.MLModelDownload)
async def download_model_version(
    model_name: str,
    version: str,
    db: AsyncSession = Depends(get_db)
):
    """Get download info for a model version."""
    # Get model and version
    model_result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = model_result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    version_result = await db.execute(
        models.MLModelVersion.__table__.select().where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.version == version
            )
        )
    )
    version_obj = version_result.first()

    if not version_obj:
        raise HTTPException(status_code=404, detail="Model version not found")

    # Return download info
    return {
        "model_name": model_name,
        "version": version,
        "file_url": version_obj.file_url,
        "file_size_bytes": version_obj.file_size_bytes,
        "checksum_sha256": version_obj.checksum_sha256,
        "metadata": {
            "input_shape": version_obj.input_shape,
            "output_shape": version_obj.output_shape,
            "quantization": version_obj.quantization,
            "framework": version_obj.framework,
            "model_metadata": version_obj.model_metadata
        }
    }


@app.get("/api/v1/models/{model_name}/production", response_model=schemas.MLModelVersion)
async def get_production_model_version(
    model_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Get the production version of a model."""
    # Get model
    result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get production version
    result = await db.execute(
        models.MLModelVersion.__table__.select()
        .where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.is_production == True
            )
        )
        .limit(1)
    )
    version = result.first()

    if not version:
        raise HTTPException(status_code=404, detail="No production version available")

    return version


@app.post("/api/v1/models/{model_name}/versions/{version}/promote")
async def promote_model_version(
    model_name: str,
    version: str,
    update: schemas.MLModelVersionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Promote a model version (update status/rollout percentage)."""
    # Get model
    model_result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = model_result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get version
    version_result = await db.execute(
        models.MLModelVersion.__table__.select().where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.version == version
            )
        )
    )
    version_obj = version_result.first()

    if not version_obj:
        raise HTTPException(status_code=404, detail="Model version not found")

    # If promoting to production, demote existing production version
    if update.is_production:
        await db.execute(
            models.MLModelVersion.__table__.update()
            .where(
                and_(
                    models.MLModelVersion.model_id == model.id,
                    models.MLModelVersion.is_production == True
                )
            )
            .values(is_production=False, status="deprecated")
        )

    # Update version
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(version_obj, key, value)

    await db.commit()

    return {"status": "promoted", "model_name": model_name, "version": version}


@app.delete("/api/v1/models/{model_name}/versions/{version}")
async def deprecate_model_version(
    model_name: str,
    version: str,
    db: AsyncSession = Depends(get_db)
):
    """Deprecate a model version."""
    # Get model
    model_result = await db.execute(
        models.MLModel.__table__.select().where(
            models.MLModel.name == model_name
        )
    )
    model = model_result.first()

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get version
    version_result = await db.execute(
        models.MLModelVersion.__table__.select().where(
            and_(
                models.MLModelVersion.model_id == model.id,
                models.MLModelVersion.version == version
            )
        )
    )
    version_obj = version_result.first()

    if not version_obj:
        raise HTTPException(status_code=404, detail="Model version not found")

    # Don't allow deleting production version
    if version_obj.is_production:
        raise HTTPException(
            status_code=400,
            detail="Cannot deprecate production version. Promote another version first."
        )

    # Mark as deprecated
    version_obj.status = "deprecated"
    version_obj.rollout_percentage = 0.0

    await db.commit()

    return {"status": "deprecated", "model_name": model_name, "version": version}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
