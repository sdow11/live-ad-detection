"""Middleware for Cloud API.

Provides rate limiting, request logging, and performance monitoring.
"""

import logging
import time
from typing import Callable

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from cloud_api.cache import get_client_identifier, rate_limiter

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis."""

    def __init__(
        self,
        app,
        enabled: bool = True,
        exempt_paths: list = None
    ):
        """Initialize rate limit middleware.

        Args:
            app: FastAPI app
            enabled: Whether rate limiting is enabled
            exempt_paths: List of paths to exempt from rate limiting
        """
        super().__init__(app)
        self.enabled = enabled
        self.exempt_paths = exempt_paths or ["/health", "/docs", "/openapi.json"]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with rate limiting.

        Args:
            request: Incoming request
            call_next: Next middleware/handler

        Returns:
            Response

        Raises:
            HTTPException: If rate limit exceeded
        """
        # Skip rate limiting if disabled or path is exempt
        if not self.enabled or request.url.path in self.exempt_paths:
            return await call_next(request)

        # Get client identifier
        identifier = get_client_identifier(request)

        # Determine limit type based on endpoint
        limit_type = "default"
        if request.url.path.startswith("/api/v1/auth"):
            limit_type = "auth"
        elif request.url.path.startswith("/api/v1/analytics"):
            limit_type = "analytics"

        # Check rate limit
        allowed, info = await rate_limiter.check_rate_limit(identifier, limit_type)

        if not allowed:
            logger.warning(
                f"Rate limit exceeded for {identifier} on {request.url.path}"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers={
                    "X-RateLimit-Limit": str(info["limit"]),
                    "X-RateLimit-Remaining": str(info["remaining"]),
                    "X-RateLimit-Reset": str(info["reset"]),
                    "Retry-After": str(info.get("retry_after", 60))
                }
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers["X-RateLimit-Limit"] = str(info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(info["reset"])

        return response


class PerformanceMonitoringMiddleware(BaseHTTPMiddleware):
    """Performance monitoring middleware."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with performance monitoring.

        Args:
            request: Incoming request
            call_next: Next middleware/handler

        Returns:
            Response with performance headers
        """
        # Record start time
        start_time = time.time()

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration = time.time() - start_time
        duration_ms = int(duration * 1000)

        # Add performance headers
        response.headers["X-Process-Time"] = f"{duration_ms}ms"

        # Log slow requests (> 1 second)
        if duration > 1.0:
            logger.warning(
                f"Slow request: {request.method} {request.url.path} "
                f"took {duration_ms}ms"
            )

        # Log all requests
        logger.info(
            f"{request.method} {request.url.path} "
            f"- {response.status_code} - {duration_ms}ms"
        )

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Request logging middleware."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with logging.

        Args:
            request: Incoming request
            call_next: Next middleware/handler

        Returns:
            Response
        """
        # Log request
        logger.info(
            f"Request: {request.method} {request.url.path} "
            f"from {request.client.host if request.client else 'unknown'}"
        )

        # Add request ID
        request_id = request.headers.get("X-Request-ID", str(time.time()))
        request.state.request_id = request_id

        # Process request
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as e:
            logger.error(
                f"Request failed: {request.method} {request.url.path} - {str(e)}",
                exc_info=True
            )
            raise
