"""Alert management system.

Monitors system health and triggers notifications when issues are detected.
Integrates with notification service and webhooks.
"""

import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Float, Integer, JSON, String, Text
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api.models import Base
from cloud_api.notifications import NotificationService, NotificationType
from cloud_api.webhooks import WebhookEvent, WebhookService

logger = logging.getLogger(__name__)


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    """Alert status."""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    MUTED = "muted"


class AlertType(str, Enum):
    """Alert types."""
    DEVICE_OFFLINE = "device_offline"
    DEVICE_ERROR = "device_error"
    HIGH_ERROR_RATE = "high_error_rate"
    LOW_PERFORMANCE = "low_performance"
    MODEL_DRIFT = "model_drift"
    FIRMWARE_UPDATE_FAILED = "firmware_update_failed"
    CUSTOM = "custom"


class Alert(Base):
    """Alert model."""

    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, index=True)

    # Alert details
    alert_type = Column(SQLEnum(AlertType), nullable=False, index=True)
    severity = Column(SQLEnum(AlertSeverity), nullable=False, index=True)
    status = Column(SQLEnum(AlertStatus), default=AlertStatus.ACTIVE, nullable=False, index=True)

    # Content
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    details = Column(JSON)  # Additional context

    # Source
    source_type = Column(String(100))  # device, model, firmware, etc.
    source_id = Column(String(255))  # ID of the source

    # Lifecycle
    triggered_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime)
    acknowledged_by = Column(Integer)  # User ID
    resolved_at = Column(DateTime)
    resolved_by = Column(Integer)  # User ID
    muted_until = Column(DateTime)

    # Notification tracking
    notifications_sent = Column(JSON)  # List of notification delivery statuses

    def __repr__(self) -> str:
        return f"<Alert(id={self.id}, type={self.alert_type}, severity={self.severity}, status={self.status})>"


class AlertRule(Base):
    """Alert rule configuration."""

    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, index=True)

    # Rule configuration
    name = Column(String(255), nullable=False)
    description = Column(Text)
    alert_type = Column(SQLEnum(AlertType), nullable=False)
    enabled = Column(Integer, default=1)

    # Conditions
    conditions = Column(JSON, nullable=False)  # Trigger conditions

    # Severity and notifications
    severity = Column(SQLEnum(AlertSeverity), default=AlertSeverity.WARNING)
    email_recipients = Column(JSON)  # List of email addresses
    sms_recipients = Column(JSON)  # List of phone numbers
    webhook_enabled = Column(Integer, default=0)

    # Rate limiting
    cooldown_minutes = Column(Integer, default=60)  # Min time between alerts
    last_triggered_at = Column(DateTime)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AlertRule(id={self.id}, name='{self.name}', type={self.alert_type})>"


class AlertService:
    """Service for managing alerts."""

    def __init__(
        self,
        notification_service: Optional[NotificationService] = None,
        webhook_service: Optional[WebhookService] = None
    ):
        """Initialize alert service.

        Args:
            notification_service: Notification service instance
            webhook_service: Webhook service instance
        """
        self.notification_service = notification_service
        self.webhook_service = webhook_service

    async def create_alert(
        self,
        session: AsyncSession,
        alert_type: AlertType,
        severity: AlertSeverity,
        title: str,
        message: str,
        organization_id: Optional[int] = None,
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        details: Optional[Dict] = None,
        auto_notify: bool = True
    ) -> Alert:
        """Create and trigger alert.

        Args:
            session: Database session
            alert_type: Alert type
            severity: Alert severity
            title: Alert title
            message: Alert message
            organization_id: Organization ID
            source_type: Source type (device, model, etc.)
            source_id: Source identifier
            details: Additional details
            auto_notify: Automatically send notifications

        Returns:
            Created alert
        """
        # Check for existing active alert of same type
        from sqlalchemy import select, and_

        existing_result = await session.execute(
            select(Alert).where(
                and_(
                    Alert.alert_type == alert_type,
                    Alert.status == AlertStatus.ACTIVE,
                    Alert.source_id == source_id
                )
            )
        )
        existing_alert = existing_result.scalar_one_or_none()

        if existing_alert:
            logger.debug(
                f"Active alert already exists for {alert_type}/{source_id}, "
                f"not creating duplicate"
            )
            return existing_alert

        # Create alert
        alert = Alert(
            organization_id=organization_id,
            alert_type=alert_type,
            severity=severity,
            title=title,
            message=message,
            source_type=source_type,
            source_id=source_id,
            details=details or {},
            status=AlertStatus.ACTIVE
        )

        session.add(alert)
        await session.commit()
        await session.refresh(alert)

        logger.info(
            f"Alert created: {alert_type} - {title} (severity: {severity})"
        )

        # Send notifications
        if auto_notify:
            await self._send_alert_notifications(session, alert)

        return alert

    async def _send_alert_notifications(
        self,
        session: AsyncSession,
        alert: Alert
    ) -> None:
        """Send notifications for alert.

        Args:
            session: Database session
            alert: Alert to notify about
        """
        notifications_sent = {}

        # Get alert rules for this organization and type
        from sqlalchemy import select, and_

        result = await session.execute(
            select(AlertRule).where(
                and_(
                    AlertRule.organization_id == alert.organization_id,
                    AlertRule.alert_type == alert.alert_type,
                    AlertRule.enabled == 1
                )
            )
        )
        rules = result.scalars().all()

        for rule in rules:
            # Check cooldown
            if rule.last_triggered_at:
                time_since = datetime.utcnow() - rule.last_triggered_at
                if time_since.total_seconds() < rule.cooldown_minutes * 60:
                    logger.debug(
                        f"Alert rule {rule.name} in cooldown, skipping notification"
                    )
                    continue

            # Send email notifications
            if self.notification_service and rule.email_recipients:
                notification_type = self._severity_to_notification_type(alert.severity)

                results = await self.notification_service.send_alert(
                    title=alert.title,
                    message=alert.message,
                    notification_type=notification_type,
                    email_recipients=rule.email_recipients,
                    sms_recipients=rule.sms_recipients if rule.sms_recipients else None,
                    include_details=alert.details
                )

                notifications_sent.update(results)

            # Trigger webhooks
            if self.webhook_service and rule.webhook_enabled:
                webhook_event = self._alert_type_to_webhook_event(alert.alert_type)

                if webhook_event:
                    await self.webhook_service.trigger_event(
                        session=session,
                        event_type=webhook_event,
                        payload={
                            "alert_id": alert.id,
                            "alert_type": alert.alert_type,
                            "severity": alert.severity,
                            "title": alert.title,
                            "message": alert.message,
                            "source_type": alert.source_type,
                            "source_id": alert.source_id,
                            "details": alert.details
                        },
                        organization_id=alert.organization_id
                    )

            # Update rule last triggered time
            rule.last_triggered_at = datetime.utcnow()

        # Update alert with notification results
        alert.notifications_sent = notifications_sent
        await session.commit()

    def _severity_to_notification_type(
        self,
        severity: AlertSeverity
    ) -> NotificationType:
        """Convert alert severity to notification type.

        Args:
            severity: Alert severity

        Returns:
            Notification type
        """
        mapping = {
            AlertSeverity.INFO: NotificationType.INFO,
            AlertSeverity.WARNING: NotificationType.WARNING,
            AlertSeverity.ERROR: NotificationType.ERROR,
            AlertSeverity.CRITICAL: NotificationType.CRITICAL
        }

        return mapping.get(severity, NotificationType.INFO)

    def _alert_type_to_webhook_event(
        self,
        alert_type: AlertType
    ) -> Optional[WebhookEvent]:
        """Convert alert type to webhook event.

        Args:
            alert_type: Alert type

        Returns:
            Webhook event or None
        """
        mapping = {
            AlertType.DEVICE_OFFLINE: WebhookEvent.DEVICE_OFFLINE,
            AlertType.DEVICE_ERROR: WebhookEvent.DEVICE_ERROR,
            AlertType.MODEL_DRIFT: WebhookEvent.MODEL_DRIFT_DETECTED,
            AlertType.FIRMWARE_UPDATE_FAILED: WebhookEvent.FIRMWARE_UPDATE_FAILED
        }

        return mapping.get(alert_type)

    async def acknowledge_alert(
        self,
        session: AsyncSession,
        alert_id: int,
        user_id: int
    ) -> Alert:
        """Acknowledge alert.

        Args:
            session: Database session
            alert_id: Alert ID
            user_id: User acknowledging the alert

        Returns:
            Updated alert
        """
        from sqlalchemy import select

        result = await session.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()

        if not alert:
            raise ValueError(f"Alert {alert_id} not found")

        if alert.status != AlertStatus.ACTIVE:
            raise ValueError(f"Alert is not active (status: {alert.status})")

        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.utcnow()
        alert.acknowledged_by = user_id

        await session.commit()
        await session.refresh(alert)

        logger.info(f"Alert {alert_id} acknowledged by user {user_id}")

        return alert

    async def resolve_alert(
        self,
        session: AsyncSession,
        alert_id: int,
        user_id: int
    ) -> Alert:
        """Resolve alert.

        Args:
            session: Database session
            alert_id: Alert ID
            user_id: User resolving the alert

        Returns:
            Updated alert
        """
        from sqlalchemy import select

        result = await session.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()

        if not alert:
            raise ValueError(f"Alert {alert_id} not found")

        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.utcnow()
        alert.resolved_by = user_id

        await session.commit()
        await session.refresh(alert)

        logger.info(f"Alert {alert_id} resolved by user {user_id}")

        return alert

    async def mute_alert(
        self,
        session: AsyncSession,
        alert_id: int,
        duration_hours: int
    ) -> Alert:
        """Mute alert for specified duration.

        Args:
            session: Database session
            alert_id: Alert ID
            duration_hours: Mute duration in hours

        Returns:
            Updated alert
        """
        from sqlalchemy import select

        result = await session.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()

        if not alert:
            raise ValueError(f"Alert {alert_id} not found")

        alert.status = AlertStatus.MUTED
        alert.muted_until = datetime.utcnow() + timedelta(hours=duration_hours)

        await session.commit()
        await session.refresh(alert)

        logger.info(f"Alert {alert_id} muted for {duration_hours} hours")

        return alert

    async def get_active_alerts(
        self,
        session: AsyncSession,
        organization_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None,
        alert_type: Optional[AlertType] = None
    ) -> List[Alert]:
        """Get active alerts.

        Args:
            session: Database session
            organization_id: Filter by organization
            severity: Filter by severity
            alert_type: Filter by alert type

        Returns:
            List of active alerts
        """
        from sqlalchemy import select, and_

        conditions = [Alert.status == AlertStatus.ACTIVE]

        if organization_id:
            conditions.append(Alert.organization_id == organization_id)

        if severity:
            conditions.append(Alert.severity == severity)

        if alert_type:
            conditions.append(Alert.alert_type == alert_type)

        result = await session.execute(
            select(Alert)
            .where(and_(*conditions))
            .order_by(Alert.triggered_at.desc())
        )

        return result.scalars().all()


# Global alert service instance
alert_service = AlertService()
