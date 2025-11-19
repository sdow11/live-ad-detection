"""Advanced analytics service for Cloud API.

Provides aggregated statistics, time-series data, and performance metrics
for organizations, locations, and devices.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api import models
from ad_detection_common.models.device import DeviceStatus


class AnalyticsService:
    """Service for computing analytics and statistics."""

    def __init__(self, db: AsyncSession):
        """Initialize analytics service.

        Args:
            db: Database session
        """
        self.db = db

    async def get_organization_stats(
        self,
        organization_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Get comprehensive organization-level statistics.

        Args:
            organization_id: Organization ID
            start_date: Start date for time range (default: 24 hours ago)
            end_date: End date for time range (default: now)

        Returns:
            Dictionary with organization statistics
        """
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=1)

        # Get organization
        organization = await self.db.get(models.Organization, organization_id)
        if not organization:
            return None

        # Count locations
        locations_result = await self.db.execute(
            select(func.count(models.Location.id)).where(
                models.Location.organization_id == organization_id
            )
        )
        total_locations = locations_result.scalar() or 0

        # Count devices by status
        devices_query = (
            select(
                models.Device.status,
                func.count(models.Device.id).label("count")
            )
            .join(models.Location)
            .where(models.Location.organization_id == organization_id)
            .group_by(models.Device.status)
        )
        devices_result = await self.db.execute(devices_query)
        device_counts = {row.status: row.count for row in devices_result}

        total_devices = sum(device_counts.values())
        online_devices = device_counts.get(DeviceStatus.ONLINE, 0)
        offline_devices = device_counts.get(DeviceStatus.OFFLINE, 0)
        error_devices = device_counts.get(DeviceStatus.ERROR, 0)

        # Aggregate telemetry data
        telemetry_stats = await self._aggregate_telemetry(
            organization_id=organization_id,
            start_date=start_date,
            end_date=end_date
        )

        # Get device health averages
        health_stats = await self._aggregate_health(
            organization_id=organization_id,
            start_date=start_date,
            end_date=end_date
        )

        return {
            "organization_id": organization_id,
            "organization_name": organization.name,
            "time_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "locations": {
                "total": total_locations
            },
            "devices": {
                "total": total_devices,
                "online": online_devices,
                "offline": offline_devices,
                "error": error_devices,
                "uptime_percentage": (online_devices / total_devices * 100) if total_devices > 0 else 0
            },
            "video_pipeline": {
                "total_frames_captured": telemetry_stats["total_frames_captured"],
                "total_frames_dropped": telemetry_stats["total_frames_dropped"],
                "total_frames_displayed": telemetry_stats["total_frames_displayed"],
                "average_fps": telemetry_stats["average_fps"],
                "average_latency_ms": telemetry_stats["average_latency_ms"],
                "drop_rate_percentage": (
                    telemetry_stats["total_frames_dropped"] /
                    telemetry_stats["total_frames_captured"] * 100
                ) if telemetry_stats["total_frames_captured"] > 0 else 0
            },
            "ad_detection": {
                "total_frames_analyzed": telemetry_stats["total_frames_analyzed"],
                "ad_frames_detected": telemetry_stats["ad_frames_detected"],
                "content_frames_detected": telemetry_stats["content_frames_detected"],
                "total_ad_breaks": telemetry_stats["total_ad_breaks"],
                "total_ad_duration_seconds": telemetry_stats["total_ad_duration_seconds"],
                "average_ad_break_duration_seconds": (
                    telemetry_stats["total_ad_duration_seconds"] /
                    telemetry_stats["total_ad_breaks"]
                ) if telemetry_stats["total_ad_breaks"] > 0 else 0,
                "average_confidence": telemetry_stats["average_confidence"],
                "average_inference_time_ms": telemetry_stats["average_inference_time_ms"]
            },
            "device_health": {
                "average_cpu_usage_percent": health_stats["average_cpu_usage"],
                "average_memory_usage_percent": health_stats["average_memory_usage"],
                "average_temperature_celsius": health_stats["average_temperature"],
                "average_uptime_hours": health_stats["average_uptime"]
            }
        }

    async def get_location_stats(
        self,
        location_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Get comprehensive location-level statistics.

        Args:
            location_id: Location ID
            start_date: Start date for time range (default: 24 hours ago)
            end_date: End date for time range (default: now)

        Returns:
            Dictionary with location statistics
        """
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=1)

        # Get location
        location = await self.db.get(models.Location, location_id)
        if not location:
            return None

        # Count devices by status
        devices_query = (
            select(
                models.Device.status,
                func.count(models.Device.id).label("count")
            )
            .where(models.Device.location_id == location_id)
            .group_by(models.Device.status)
        )
        devices_result = await self.db.execute(devices_query)
        device_counts = {row.status: row.count for row in devices_result}

        total_devices = sum(device_counts.values())
        online_devices = device_counts.get(DeviceStatus.ONLINE, 0)

        # Aggregate telemetry data
        telemetry_stats = await self._aggregate_telemetry(
            location_id=location_id,
            start_date=start_date,
            end_date=end_date
        )

        # Get device health averages
        health_stats = await self._aggregate_health(
            location_id=location_id,
            start_date=start_date,
            end_date=end_date
        )

        return {
            "location_id": location_id,
            "location_name": location.name,
            "organization_id": location.organization_id,
            "time_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "devices": {
                "total": total_devices,
                "online": online_devices,
                "offline": device_counts.get(DeviceStatus.OFFLINE, 0)
            },
            "video_pipeline": {
                "average_fps": telemetry_stats["average_fps"],
                "average_latency_ms": telemetry_stats["average_latency_ms"]
            },
            "ad_detection": {
                "total_ad_breaks": telemetry_stats["total_ad_breaks"],
                "total_ad_duration_seconds": telemetry_stats["total_ad_duration_seconds"],
                "average_inference_time_ms": telemetry_stats["average_inference_time_ms"]
            },
            "device_health": {
                "average_cpu_usage_percent": health_stats["average_cpu_usage"],
                "average_temperature_celsius": health_stats["average_temperature"]
            }
        }

    async def get_device_stats(
        self,
        device_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Get comprehensive device-level statistics.

        Args:
            device_id: Device ID
            start_date: Start date for time range (default: 24 hours ago)
            end_date: End date for time range (default: now)

        Returns:
            Dictionary with device statistics
        """
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=1)

        # Get device
        device_result = await self.db.execute(
            select(models.Device).where(models.Device.device_id == device_id)
        )
        device = device_result.scalar_one_or_none()
        if not device:
            return None

        # Get telemetry records
        telemetry_query = (
            select(models.Telemetry)
            .where(
                and_(
                    models.Telemetry.device_id == device.id,
                    models.Telemetry.recorded_at >= start_date,
                    models.Telemetry.recorded_at <= end_date
                )
            )
            .order_by(models.Telemetry.recorded_at.desc())
        )
        telemetry_result = await self.db.execute(telemetry_query)
        telemetry_records = telemetry_result.scalars().all()

        # Get health records
        health_query = (
            select(models.DeviceHealth)
            .where(
                and_(
                    models.DeviceHealth.device_id == device.id,
                    models.DeviceHealth.recorded_at >= start_date,
                    models.DeviceHealth.recorded_at <= end_date
                )
            )
            .order_by(models.DeviceHealth.recorded_at.desc())
        )
        health_result = await self.db.execute(health_query)
        health_records = health_result.scalars().all()

        # Calculate statistics
        total_ad_breaks = sum(t.total_ad_breaks for t in telemetry_records)
        total_ad_duration = sum(t.total_ad_duration_seconds for t in telemetry_records)

        avg_fps = (
            sum(t.average_fps for t in telemetry_records if t.average_fps) /
            len([t for t in telemetry_records if t.average_fps])
        ) if telemetry_records else None

        avg_latency = (
            sum(t.average_latency_ms for t in telemetry_records if t.average_latency_ms) /
            len([t for t in telemetry_records if t.average_latency_ms])
        ) if telemetry_records else None

        avg_cpu = (
            sum(h.cpu_usage_percent for h in health_records if h.cpu_usage_percent) /
            len([h for h in health_records if h.cpu_usage_percent])
        ) if health_records else None

        avg_temp = (
            sum(h.temperature_celsius for h in health_records if h.temperature_celsius) /
            len([h for h in health_records if h.temperature_celsius])
        ) if health_records else None

        return {
            "device_id": device_id,
            "device_name": device.hostname,
            "status": device.status.value if device.status else "unknown",
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
            "time_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "video_pipeline": {
                "average_fps": avg_fps,
                "average_latency_ms": avg_latency
            },
            "ad_detection": {
                "total_ad_breaks": total_ad_breaks,
                "total_ad_duration_seconds": total_ad_duration,
                "average_ad_break_duration_seconds": (
                    total_ad_duration / total_ad_breaks
                ) if total_ad_breaks > 0 else 0
            },
            "device_health": {
                "average_cpu_usage_percent": avg_cpu,
                "average_temperature_celsius": avg_temp,
                "data_points": len(health_records)
            },
            "telemetry": {
                "records_count": len(telemetry_records)
            }
        }

    async def get_time_series_data(
        self,
        organization_id: Optional[int] = None,
        location_id: Optional[int] = None,
        device_id: Optional[str] = None,
        metric: str = "ad_breaks",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "hour"
    ) -> List[Dict]:
        """Get time-series data for a specific metric.

        Args:
            organization_id: Filter by organization
            location_id: Filter by location
            device_id: Filter by device
            metric: Metric to query (ad_breaks, fps, latency, cpu_usage, temperature)
            start_date: Start date (default: 7 days ago)
            end_date: End date (default: now)
            interval: Time interval (hour, day, week)

        Returns:
            List of time-series data points
        """
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=7)

        # Determine time bucket based on interval
        if interval == "hour":
            time_bucket = func.date_trunc('hour', models.Telemetry.recorded_at)
        elif interval == "day":
            time_bucket = func.date_trunc('day', models.Telemetry.recorded_at)
        elif interval == "week":
            time_bucket = func.date_trunc('week', models.Telemetry.recorded_at)
        else:
            time_bucket = func.date_trunc('hour', models.Telemetry.recorded_at)

        # Build query based on metric
        if metric == "ad_breaks":
            query = (
                select(
                    time_bucket.label("time_bucket"),
                    func.sum(models.Telemetry.total_ad_breaks).label("value")
                )
                .where(
                    and_(
                        models.Telemetry.recorded_at >= start_date,
                        models.Telemetry.recorded_at <= end_date
                    )
                )
            )
        elif metric == "fps":
            query = (
                select(
                    time_bucket.label("time_bucket"),
                    func.avg(models.Telemetry.average_fps).label("value")
                )
                .where(
                    and_(
                        models.Telemetry.recorded_at >= start_date,
                        models.Telemetry.recorded_at <= end_date
                    )
                )
            )
        elif metric == "latency":
            query = (
                select(
                    time_bucket.label("time_bucket"),
                    func.avg(models.Telemetry.average_latency_ms).label("value")
                )
                .where(
                    and_(
                        models.Telemetry.recorded_at >= start_date,
                        models.Telemetry.recorded_at <= end_date
                    )
                )
            )
        else:
            return []

        # Apply filters
        if device_id:
            # Get device internal ID
            device_result = await self.db.execute(
                select(models.Device.id).where(models.Device.device_id == device_id)
            )
            device_internal_id = device_result.scalar_one_or_none()
            if device_internal_id:
                query = query.where(models.Telemetry.device_id == device_internal_id)
        elif location_id:
            query = query.join(models.Device).where(models.Device.location_id == location_id)
        elif organization_id:
            query = query.join(models.Device).join(models.Location).where(
                models.Location.organization_id == organization_id
            )

        # Group by time bucket
        query = query.group_by(time_bucket).order_by(time_bucket)

        # Execute query
        result = await self.db.execute(query)
        rows = result.all()

        return [
            {
                "timestamp": row.time_bucket.isoformat(),
                "value": float(row.value) if row.value is not None else 0
            }
            for row in rows
        ]

    async def get_top_locations_by_ad_breaks(
        self,
        organization_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 10
    ) -> List[Dict]:
        """Get top locations by ad break count.

        Args:
            organization_id: Organization ID
            start_date: Start date (default: 24 hours ago)
            end_date: End date (default: now)
            limit: Number of locations to return

        Returns:
            List of locations with ad break counts
        """
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=1)

        query = (
            select(
                models.Location.id,
                models.Location.name,
                func.sum(models.Telemetry.total_ad_breaks).label("total_ad_breaks")
            )
            .join(models.Device, models.Device.location_id == models.Location.id)
            .join(models.Telemetry, models.Telemetry.device_id == models.Device.id)
            .where(
                and_(
                    models.Location.organization_id == organization_id,
                    models.Telemetry.recorded_at >= start_date,
                    models.Telemetry.recorded_at <= end_date
                )
            )
            .group_by(models.Location.id, models.Location.name)
            .order_by(func.sum(models.Telemetry.total_ad_breaks).desc())
            .limit(limit)
        )

        result = await self.db.execute(query)
        rows = result.all()

        return [
            {
                "location_id": row.id,
                "location_name": row.name,
                "total_ad_breaks": row.total_ad_breaks or 0
            }
            for row in rows
        ]

    async def _aggregate_telemetry(
        self,
        organization_id: Optional[int] = None,
        location_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Aggregate telemetry data.

        Args:
            organization_id: Filter by organization
            location_id: Filter by location
            start_date: Start date
            end_date: End date

        Returns:
            Aggregated telemetry statistics
        """
        query = select(
            func.sum(models.Telemetry.frames_captured).label("total_frames_captured"),
            func.sum(models.Telemetry.frames_dropped).label("total_frames_dropped"),
            func.sum(models.Telemetry.frames_displayed).label("total_frames_displayed"),
            func.avg(models.Telemetry.average_fps).label("average_fps"),
            func.avg(models.Telemetry.average_latency_ms).label("average_latency_ms"),
            func.sum(models.Telemetry.total_frames_analyzed).label("total_frames_analyzed"),
            func.sum(models.Telemetry.ad_frames_detected).label("ad_frames_detected"),
            func.sum(models.Telemetry.content_frames_detected).label("content_frames_detected"),
            func.avg(models.Telemetry.average_confidence).label("average_confidence"),
            func.avg(models.Telemetry.average_inference_time_ms).label("average_inference_time_ms"),
            func.sum(models.Telemetry.total_ad_breaks).label("total_ad_breaks"),
            func.sum(models.Telemetry.total_ad_duration_seconds).label("total_ad_duration_seconds")
        )

        conditions = []
        if start_date:
            conditions.append(models.Telemetry.recorded_at >= start_date)
        if end_date:
            conditions.append(models.Telemetry.recorded_at <= end_date)

        if organization_id:
            query = query.join(models.Device).join(models.Location)
            conditions.append(models.Location.organization_id == organization_id)
        elif location_id:
            query = query.join(models.Device)
            conditions.append(models.Device.location_id == location_id)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        row = result.first()

        return {
            "total_frames_captured": row.total_frames_captured or 0,
            "total_frames_dropped": row.total_frames_dropped or 0,
            "total_frames_displayed": row.total_frames_displayed or 0,
            "average_fps": float(row.average_fps) if row.average_fps else None,
            "average_latency_ms": float(row.average_latency_ms) if row.average_latency_ms else None,
            "total_frames_analyzed": row.total_frames_analyzed or 0,
            "ad_frames_detected": row.ad_frames_detected or 0,
            "content_frames_detected": row.content_frames_detected or 0,
            "average_confidence": float(row.average_confidence) if row.average_confidence else None,
            "average_inference_time_ms": float(row.average_inference_time_ms) if row.average_inference_time_ms else None,
            "total_ad_breaks": row.total_ad_breaks or 0,
            "total_ad_duration_seconds": row.total_ad_duration_seconds or 0
        }

    async def _aggregate_health(
        self,
        organization_id: Optional[int] = None,
        location_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Aggregate device health data.

        Args:
            organization_id: Filter by organization
            location_id: Filter by location
            start_date: Start date
            end_date: End date

        Returns:
            Aggregated health statistics
        """
        query = select(
            func.avg(models.DeviceHealth.cpu_usage_percent).label("average_cpu_usage"),
            func.avg(models.DeviceHealth.memory_used_mb / models.DeviceHealth.memory_total_mb * 100).label("average_memory_usage"),
            func.avg(models.DeviceHealth.temperature_celsius).label("average_temperature"),
            func.avg(models.DeviceHealth.uptime_seconds / 3600).label("average_uptime")
        )

        conditions = []
        if start_date:
            conditions.append(models.DeviceHealth.recorded_at >= start_date)
        if end_date:
            conditions.append(models.DeviceHealth.recorded_at <= end_date)

        if organization_id:
            query = query.join(models.Device).join(models.Location)
            conditions.append(models.Location.organization_id == organization_id)
        elif location_id:
            query = query.join(models.Device)
            conditions.append(models.Device.location_id == location_id)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        row = result.first()

        return {
            "average_cpu_usage": float(row.average_cpu_usage) if row.average_cpu_usage else None,
            "average_memory_usage": float(row.average_memory_usage) if row.average_memory_usage else None,
            "average_temperature": float(row.average_temperature) if row.average_temperature else None,
            "average_uptime": float(row.average_uptime) if row.average_uptime else None
        }
