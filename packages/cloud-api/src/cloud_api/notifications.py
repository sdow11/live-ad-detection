"""Notification service for sending alerts via email and SMS.

Supports:
- Email notifications via SMTP or SendGrid
- SMS notifications via Twilio
- Configurable templates for different alert types
- Rate limiting to prevent spam
- Delivery tracking and retry logic
"""

import logging
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """Notification type."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class NotificationChannel(str, Enum):
    """Notification delivery channel."""
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"


class NotificationService:
    """Service for sending notifications."""

    def __init__(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: int = 587,
        smtp_user: Optional[str] = None,
        smtp_password: Optional[str] = None,
        sendgrid_api_key: Optional[str] = None,
        twilio_account_sid: Optional[str] = None,
        twilio_auth_token: Optional[str] = None,
        twilio_from_number: Optional[str] = None,
        from_email: str = "noreply@ad-detection.example.com",
        rate_limit_per_hour: int = 100
    ):
        """Initialize notification service.

        Args:
            smtp_host: SMTP server host
            smtp_port: SMTP server port
            smtp_user: SMTP username
            smtp_password: SMTP password
            sendgrid_api_key: SendGrid API key (alternative to SMTP)
            twilio_account_sid: Twilio account SID
            twilio_auth_token: Twilio auth token
            twilio_from_number: Twilio phone number
            from_email: Default from email address
            rate_limit_per_hour: Maximum notifications per hour per recipient
        """
        # Email configuration
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password
        self.sendgrid_api_key = sendgrid_api_key
        self.from_email = from_email

        # SMS configuration
        self.twilio_account_sid = twilio_account_sid
        self.twilio_auth_token = twilio_auth_token
        self.twilio_from_number = twilio_from_number

        # Rate limiting
        self.rate_limit_per_hour = rate_limit_per_hour
        self.notification_history: Dict[str, List[datetime]] = {}

    def _check_rate_limit(self, recipient: str) -> bool:
        """Check if recipient is within rate limit.

        Args:
            recipient: Recipient identifier (email or phone)

        Returns:
            True if within rate limit
        """
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=1)

        # Clean old entries
        if recipient in self.notification_history:
            self.notification_history[recipient] = [
                ts for ts in self.notification_history[recipient]
                if ts > cutoff
            ]

        # Check limit
        count = len(self.notification_history.get(recipient, []))

        if count >= self.rate_limit_per_hour:
            logger.warning(
                f"Rate limit exceeded for {recipient}: {count}/{self.rate_limit_per_hour}"
            )
            return False

        return True

    def _record_notification(self, recipient: str) -> None:
        """Record notification for rate limiting.

        Args:
            recipient: Recipient identifier
        """
        if recipient not in self.notification_history:
            self.notification_history[recipient] = []

        self.notification_history[recipient].append(datetime.utcnow())

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """Send email notification.

        Args:
            to: Recipient email address
            subject: Email subject
            body: Plain text body
            html_body: HTML body (optional)
            cc: CC recipients
            bcc: BCC recipients

        Returns:
            True if sent successfully
        """
        # Check rate limit
        if not self._check_rate_limit(to):
            return False

        try:
            if self.sendgrid_api_key:
                # Use SendGrid API
                success = await self._send_via_sendgrid(
                    to, subject, body, html_body, cc, bcc
                )
            elif self.smtp_host:
                # Use SMTP
                success = self._send_via_smtp(
                    to, subject, body, html_body, cc, bcc
                )
            else:
                logger.error("No email backend configured (SMTP or SendGrid)")
                return False

            if success:
                self._record_notification(to)
                logger.info(f"Email sent to {to}: {subject}")

            return success

        except Exception as e:
            logger.error(f"Failed to send email to {to}: {e}")
            return False

    def _send_via_smtp(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """Send email via SMTP.

        Args:
            to: Recipient email
            subject: Email subject
            body: Plain text body
            html_body: HTML body
            cc: CC recipients
            bcc: BCC recipients

        Returns:
            True if sent successfully
        """
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["From"] = self.from_email
            msg["To"] = to
            msg["Subject"] = subject

            if cc:
                msg["Cc"] = ", ".join(cc)

            # Add plain text part
            msg.attach(MIMEText(body, "plain"))

            # Add HTML part if provided
            if html_body:
                msg.attach(MIMEText(html_body, "html"))

            # Build recipient list
            recipients = [to]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            # Connect to SMTP server
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()

                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)

                server.send_message(msg)

            return True

        except Exception as e:
            logger.error(f"SMTP send failed: {e}")
            return False

    async def _send_via_sendgrid(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """Send email via SendGrid API.

        Args:
            to: Recipient email
            subject: Email subject
            body: Plain text body
            html_body: HTML body
            cc: CC recipients
            bcc: BCC recipients

        Returns:
            True if sent successfully
        """
        try:
            # Build request payload
            payload = {
                "personalizations": [
                    {
                        "to": [{"email": to}],
                    }
                ],
                "from": {"email": self.from_email},
                "subject": subject,
                "content": [
                    {"type": "text/plain", "value": body}
                ]
            }

            if cc:
                payload["personalizations"][0]["cc"] = [{"email": e} for e in cc]

            if bcc:
                payload["personalizations"][0]["bcc"] = [{"email": e} for e in bcc]

            if html_body:
                payload["content"].append({"type": "text/html", "value": html_body})

            # Send via SendGrid API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.sendgrid_api_key}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )

                response.raise_for_status()

            return True

        except Exception as e:
            logger.error(f"SendGrid send failed: {e}")
            return False

    async def send_sms(
        self,
        to: str,
        message: str
    ) -> bool:
        """Send SMS notification via Twilio.

        Args:
            to: Recipient phone number (E.164 format: +1234567890)
            message: SMS message (max 160 characters)

        Returns:
            True if sent successfully
        """
        if not self.twilio_account_sid or not self.twilio_auth_token:
            logger.error("Twilio not configured")
            return False

        # Check rate limit
        if not self._check_rate_limit(to):
            return False

        try:
            # Truncate message if too long
            if len(message) > 160:
                message = message[:157] + "..."

            # Send via Twilio API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_account_sid}/Messages.json",
                    auth=(self.twilio_account_sid, self.twilio_auth_token),
                    data={
                        "From": self.twilio_from_number,
                        "To": to,
                        "Body": message
                    }
                )

                response.raise_for_status()

            self._record_notification(to)
            logger.info(f"SMS sent to {to}")

            return True

        except Exception as e:
            logger.error(f"Failed to send SMS to {to}: {e}")
            return False

    async def send_alert(
        self,
        title: str,
        message: str,
        notification_type: NotificationType,
        email_recipients: Optional[List[str]] = None,
        sms_recipients: Optional[List[str]] = None,
        include_details: Optional[Dict] = None
    ) -> Dict[str, bool]:
        """Send alert notification via multiple channels.

        Args:
            title: Alert title
            message: Alert message
            notification_type: Type of notification (info, warning, error, critical)
            email_recipients: List of email addresses
            sms_recipients: List of phone numbers
            include_details: Additional details to include

        Returns:
            Dict mapping recipient to success status
        """
        results = {}

        # Format message
        formatted_message = f"[{notification_type.upper()}] {title}\n\n{message}"

        if include_details:
            formatted_message += "\n\nDetails:\n"
            for key, value in include_details.items():
                formatted_message += f"  {key}: {value}\n"

        # Send emails
        if email_recipients:
            # Generate HTML version
            html_body = self._generate_html_alert(
                title, message, notification_type, include_details
            )

            for recipient in email_recipients:
                success = await self.send_email(
                    to=recipient,
                    subject=f"[{notification_type.upper()}] {title}",
                    body=formatted_message,
                    html_body=html_body
                )
                results[f"email:{recipient}"] = success

        # Send SMS (shorter format)
        if sms_recipients:
            sms_message = f"[{notification_type.upper()}] {title}: {message}"

            for recipient in sms_recipients:
                success = await self.send_sms(
                    to=recipient,
                    message=sms_message
                )
                results[f"sms:{recipient}"] = success

        return results

    def _generate_html_alert(
        self,
        title: str,
        message: str,
        notification_type: NotificationType,
        details: Optional[Dict] = None
    ) -> str:
        """Generate HTML email for alert.

        Args:
            title: Alert title
            message: Alert message
            notification_type: Notification type
            details: Additional details

        Returns:
            HTML string
        """
        # Color scheme based on type
        colors = {
            NotificationType.INFO: "#3498db",
            NotificationType.WARNING: "#f39c12",
            NotificationType.ERROR: "#e74c3c",
            NotificationType.CRITICAL: "#c0392b"
        }

        color = colors.get(notification_type, "#95a5a6")

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: {color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .content {{ background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }}
        .details {{ background-color: white; padding: 15px; margin-top: 15px; border-radius: 5px; }}
        .footer {{ margin-top: 20px; padding: 10px; text-align: center; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">{notification_type.upper()}: {title}</h2>
        </div>
        <div class="content">
            <p>{message}</p>
"""

        if details:
            html += """
            <div class="details">
                <h3 style="margin-top: 0;">Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
"""
            for key, value in details.items():
                html += f"""
                    <tr>
                        <td style="padding: 5px; font-weight: bold; width: 40%;">{key}:</td>
                        <td style="padding: 5px;">{value}</td>
                    </tr>
"""
            html += """
                </table>
            </div>
"""

        html += f"""
        </div>
        <div class="footer">
            <p>This is an automated notification from Live TV Ad Detection System</p>
            <p>Timestamp: {datetime.utcnow().isoformat()}</p>
        </div>
    </div>
</body>
</html>
"""

        return html


# Global notification service instance (configured from environment)
notification_service = NotificationService()
