"""Webhook system for third-party integrations.

Supports:
- Event-driven webhooks for various system events
- Configurable webhook endpoints per organization
- Retry logic with exponential backoff
- Payload signing for security (HMAC-SHA256)
- Event filtering and transformation
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import Column, DateTime, Enum as SQLEnum, Integer, JSON, String, Text
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api.models import Base

logger = logging.getLogger(__name__)


class WebhookEvent(str, Enum):
    """Webhook event types."""
    # Device events
    DEVICE_REGISTERED = "device.registered"
    DEVICE_ONLINE = "device.online"
    DEVICE_OFFLINE = "device.offline"
    DEVICE_ERROR = "device.error"

    # Ad detection events
    AD_BREAK_STARTED = "ad_break.started"
    AD_BREAK_ENDED = "ad_break.ended"

    # Model events
    MODEL_DEPLOYED = "model.deployed"
    MODEL_DRIFT_DETECTED = "model.drift_detected"
    MODEL_PERFORMANCE_DEGRADED = "model.performance_degraded"

    # Firmware events
    FIRMWARE_UPDATE_STARTED = "firmware.update_started"
    FIRMWARE_UPDATE_COMPLETED = "firmware.update_completed"
    FIRMWARE_UPDATE_FAILED = "firmware.update_failed"

    # Alert events
    ALERT_TRIGGERED = "alert.triggered"


class WebhookStatus(str, Enum):
    """Webhook delivery status."""
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"


class Webhook(Base):
    """Webhook configuration model."""

    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, nullable=False, index=True)

    # Webhook configuration
    name = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    secret = Column(String(255))  # For payload signing
    enabled = Column(Integer, default=1)  # SQLite doesn't have boolean

    # Event filtering
    events = Column(JSON)  # List of event types to subscribe to

    # Retry configuration
    max_retries = Column(Integer, default=3)
    retry_delay_seconds = Column(Integer, default=60)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    last_triggered_at = Column(DateTime)
    last_success_at = Column(DateTime)
    last_failure_at = Column(DateTime)

    def __repr__(self) -> str:
        return f"<Webhook(id={self.id}, name='{self.name}', url='{self.url}')>"


class WebhookDelivery(Base):
    """Webhook delivery tracking model."""

    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(Integer, nullable=False, index=True)

    # Event details
    event_type = Column(String(100), nullable=False, index=True)
    payload = Column(JSON, nullable=False)

    # Delivery status
    status = Column(SQLEnum(WebhookStatus), default=WebhookStatus.PENDING, nullable=False)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)

    # Response tracking
    response_status_code = Column(Integer)
    response_body = Column(Text)
    error_message = Column(Text)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    next_retry_at = Column(DateTime)
    delivered_at = Column(DateTime)

    def __repr__(self) -> str:
        return f"<WebhookDelivery(id={self.id}, webhook_id={self.webhook_id}, status={self.status})>"


class WebhookService:
    """Service for managing and delivering webhooks."""

    def __init__(self, timeout: int = 30):
        """Initialize webhook service.

        Args:
            timeout: HTTP request timeout in seconds
        """
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    def _sign_payload(self, payload: str, secret: str) -> str:
        """Sign payload with HMAC-SHA256.

        Args:
            payload: JSON payload string
            secret: Webhook secret

        Returns:
            Signature hex string
        """
        signature = hmac.new(
            secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        return signature

    async def trigger_event(
        self,
        session: AsyncSession,
        event_type: WebhookEvent,
        payload: Dict[str, Any],
        organization_id: Optional[int] = None
    ) -> List[int]:
        """Trigger webhook event.

        Args:
            session: Database session
            event_type: Event type
            payload: Event payload
            organization_id: Organization ID (None = all organizations)

        Returns:
            List of created webhook delivery IDs
        """
        from sqlalchemy import select

        # Find matching webhooks
        query = select(Webhook).where(Webhook.enabled == 1)

        if organization_id:
            query = query.where(Webhook.organization_id == organization_id)

        result = await session.execute(query)
        webhooks = result.scalars().all()

        delivery_ids = []

        for webhook in webhooks:
            # Check if webhook is subscribed to this event
            if webhook.events and event_type not in webhook.events:
                continue

            # Create delivery record
            delivery = WebhookDelivery(
                webhook_id=webhook.id,
                event_type=event_type,
                payload=payload,
                max_attempts=webhook.max_retries
            )

            session.add(delivery)
            await session.flush()

            # Attempt immediate delivery
            await self._deliver_webhook(session, webhook, delivery)

            delivery_ids.append(delivery.id)

        await session.commit()

        logger.info(
            f"Triggered {len(delivery_ids)} webhooks for event {event_type}"
        )

        return delivery_ids

    async def _deliver_webhook(
        self,
        session: AsyncSession,
        webhook: Webhook,
        delivery: WebhookDelivery
    ) -> bool:
        """Deliver webhook to endpoint.

        Args:
            session: Database session
            webhook: Webhook configuration
            delivery: Delivery record

        Returns:
            True if delivered successfully
        """
        try:
            # Prepare payload
            event_payload = {
                "event": delivery.event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "delivery_id": delivery.id,
                "data": delivery.payload
            }

            payload_json = json.dumps(event_payload)

            # Sign payload if secret is configured
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "LiveTVAdDetection-Webhooks/1.0"
            }

            if webhook.secret:
                signature = self._sign_payload(payload_json, webhook.secret)
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            # Send webhook
            delivery.attempts += 1

            response = await self.client.post(
                webhook.url,
                content=payload_json,
                headers=headers
            )

            # Record response
            delivery.response_status_code = response.status_code
            delivery.response_body = response.text[:1000]  # Limit stored response

            # Check if successful (2xx status code)
            if 200 <= response.status_code < 300:
                delivery.status = WebhookStatus.DELIVERED
                delivery.delivered_at = datetime.utcnow()

                webhook.last_success_at = datetime.utcnow()
                webhook.last_triggered_at = datetime.utcnow()

                logger.info(
                    f"Webhook delivered: {webhook.name} -> {webhook.url} "
                    f"(status: {response.status_code})"
                )

                return True
            else:
                raise Exception(f"HTTP {response.status_code}: {response.text[:200]}")

        except Exception as e:
            error_message = str(e)
            delivery.error_message = error_message[:1000]

            webhook.last_failure_at = datetime.utcnow()
            webhook.last_triggered_at = datetime.utcnow()

            # Check if we should retry
            if delivery.attempts < delivery.max_attempts:
                delivery.status = WebhookStatus.RETRYING

                # Calculate next retry time (exponential backoff)
                delay = webhook.retry_delay_seconds * (2 ** (delivery.attempts - 1))
                delivery.next_retry_at = datetime.utcnow() + \
                    __import__('datetime').timedelta(seconds=delay)

                logger.warning(
                    f"Webhook delivery failed (attempt {delivery.attempts}/{delivery.max_attempts}): "
                    f"{webhook.name} -> {webhook.url}: {error_message}. "
                    f"Retrying in {delay}s"
                )
            else:
                delivery.status = WebhookStatus.FAILED

                logger.error(
                    f"Webhook delivery failed permanently: "
                    f"{webhook.name} -> {webhook.url}: {error_message}"
                )

            return False

        finally:
            await session.commit()

    async def retry_failed_deliveries(
        self,
        session: AsyncSession
    ) -> int:
        """Retry failed webhook deliveries.

        Args:
            session: Database session

        Returns:
            Number of deliveries retried
        """
        from sqlalchemy import select, and_

        # Find deliveries ready for retry
        query = select(WebhookDelivery).where(
            and_(
                WebhookDelivery.status == WebhookStatus.RETRYING,
                WebhookDelivery.next_retry_at <= datetime.utcnow()
            )
        )

        result = await session.execute(query)
        deliveries = result.scalars().all()

        retry_count = 0

        for delivery in deliveries:
            # Get webhook configuration
            webhook_result = await session.execute(
                select(Webhook).where(Webhook.id == delivery.webhook_id)
            )
            webhook = webhook_result.scalar_one_or_none()

            if not webhook or not webhook.enabled:
                delivery.status = WebhookStatus.FAILED
                delivery.error_message = "Webhook disabled or deleted"
                continue

            # Retry delivery
            await self._deliver_webhook(session, webhook, delivery)
            retry_count += 1

        if retry_count > 0:
            await session.commit()
            logger.info(f"Retried {retry_count} webhook deliveries")

        return retry_count

    async def get_delivery_stats(
        self,
        session: AsyncSession,
        webhook_id: Optional[int] = None,
        hours: int = 24
    ) -> Dict:
        """Get webhook delivery statistics.

        Args:
            session: Database session
            webhook_id: Webhook ID (None = all webhooks)
            hours: Time window in hours

        Returns:
            Statistics dict
        """
        from sqlalchemy import select, func
        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        query = select(
            WebhookDelivery.status,
            func.count(WebhookDelivery.id).label("count")
        ).where(WebhookDelivery.created_at >= cutoff)

        if webhook_id:
            query = query.where(WebhookDelivery.webhook_id == webhook_id)

        query = query.group_by(WebhookDelivery.status)

        result = await session.execute(query)
        stats = {row.status: row.count for row in result}

        total = sum(stats.values())
        delivered = stats.get(WebhookStatus.DELIVERED, 0)
        failed = stats.get(WebhookStatus.FAILED, 0)
        retrying = stats.get(WebhookStatus.RETRYING, 0)
        pending = stats.get(WebhookStatus.PENDING, 0)

        return {
            "time_window_hours": hours,
            "total_deliveries": total,
            "delivered": delivered,
            "failed": failed,
            "retrying": retrying,
            "pending": pending,
            "success_rate": (delivered / total * 100) if total > 0 else 0,
            "failure_rate": (failed / total * 100) if total > 0 else 0
        }

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()


# Global webhook service instance
webhook_service = WebhookService()
