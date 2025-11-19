"""Redis caching layer for Cloud API.

Provides caching for frequently accessed data to reduce database load
and improve response times.
"""

import json
import logging
from datetime import timedelta
from functools import wraps
from typing import Any, Callable, Optional

import redis.asyncio as redis
from fastapi import Request

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-based caching service."""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        default_ttl: int = 300  # 5 minutes
    ):
        """Initialize cache service.

        Args:
            redis_url: Redis connection URL
            default_ttl: Default TTL in seconds
        """
        self.redis_url = redis_url
        self.default_ttl = default_ttl
        self._redis: Optional[redis.Redis] = None

    async def connect(self) -> None:
        """Connect to Redis."""
        try:
            self._redis = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await self._redis.ping()
            logger.info("Connected to Redis successfully")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self._redis = None

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()
            logger.info("Disconnected from Redis")

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        if not self._redis:
            return None

        try:
            value = await self._redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Cache get error for key {key}: {e}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """Set value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (uses default if None)

        Returns:
            True if successful
        """
        if not self._redis:
            return False

        try:
            ttl = ttl or self.default_ttl
            serialized = json.dumps(value)
            await self._redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete value from cache.

        Args:
            key: Cache key

        Returns:
            True if successful
        """
        if not self._redis:
            return False

        try:
            await self._redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern.

        Args:
            pattern: Key pattern (e.g., "analytics:*")

        Returns:
            Number of keys deleted
        """
        if not self._redis:
            return 0

        try:
            keys = []
            async for key in self._redis.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                return await self._redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache delete pattern error for {pattern}: {e}")
            return 0

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache.

        Args:
            key: Cache key

        Returns:
            True if key exists
        """
        if not self._redis:
            return False

        try:
            return await self._redis.exists(key) > 0
        except Exception as e:
            logger.error(f"Cache exists error for key {key}: {e}")
            return False

    async def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment counter.

        Args:
            key: Cache key
            amount: Amount to increment by

        Returns:
            New value or None on error
        """
        if not self._redis:
            return None

        try:
            return await self._redis.incrby(key, amount)
        except Exception as e:
            logger.error(f"Cache increment error for key {key}: {e}")
            return None

    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration on key.

        Args:
            key: Cache key
            ttl: Time to live in seconds

        Returns:
            True if successful
        """
        if not self._redis:
            return False

        try:
            return await self._redis.expire(key, ttl)
        except Exception as e:
            logger.error(f"Cache expire error for key {key}: {e}")
            return False

    def cache_key(self, *parts: str) -> str:
        """Generate cache key from parts.

        Args:
            *parts: Key components

        Returns:
            Cache key string
        """
        return ":".join(str(p) for p in parts)


# Global cache instance
cache = CacheService()


def cached(
    ttl: Optional[int] = None,
    key_prefix: str = "",
    key_func: Optional[Callable] = None
):
    """Decorator for caching function results.

    Args:
        ttl: Cache TTL in seconds
        key_prefix: Prefix for cache key
        key_func: Function to generate cache key from args

    Returns:
        Decorator function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default: use function name and args
                key_parts = [key_prefix or func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = cache.cache_key(*key_parts)

            # Try to get from cache
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit for {cache_key}")
                return cached_value

            # Execute function
            logger.debug(f"Cache miss for {cache_key}")
            result = await func(*args, **kwargs)

            # Store in cache
            await cache.set(cache_key, result, ttl)

            return result

        return wrapper
    return decorator


class RateLimiter:
    """Redis-based rate limiter."""

    def __init__(
        self,
        cache_service: CacheService,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000
    ):
        """Initialize rate limiter.

        Args:
            cache_service: Cache service instance
            requests_per_minute: Rate limit per minute
            requests_per_hour: Rate limit per hour
        """
        self.cache = cache_service
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour

    async def check_rate_limit(
        self,
        identifier: str,
        limit_type: str = "default"
    ) -> tuple[bool, dict]:
        """Check if request is within rate limit.

        Args:
            identifier: User/IP identifier
            limit_type: Type of limit to check

        Returns:
            Tuple of (allowed, info_dict)
        """
        # Check minute limit
        minute_key = self.cache.cache_key("ratelimit", "minute", identifier, limit_type)
        minute_count = await self.cache.get(minute_key) or 0

        if minute_count >= self.requests_per_minute:
            return False, {
                "limit": self.requests_per_minute,
                "remaining": 0,
                "reset": 60,
                "retry_after": 60
            }

        # Check hour limit
        hour_key = self.cache.cache_key("ratelimit", "hour", identifier, limit_type)
        hour_count = await self.cache.get(hour_key) or 0

        if hour_count >= self.requests_per_hour:
            return False, {
                "limit": self.requests_per_hour,
                "remaining": 0,
                "reset": 3600,
                "retry_after": 3600
            }

        # Increment counters
        new_minute_count = await self.cache.increment(minute_key)
        if new_minute_count == 1:
            await self.cache.expire(minute_key, 60)

        new_hour_count = await self.cache.increment(hour_key)
        if new_hour_count == 1:
            await self.cache.expire(hour_key, 3600)

        return True, {
            "limit": self.requests_per_minute,
            "remaining": self.requests_per_minute - new_minute_count,
            "reset": 60
        }

    async def reset(self, identifier: str) -> None:
        """Reset rate limit for identifier.

        Args:
            identifier: User/IP identifier
        """
        pattern = self.cache.cache_key("ratelimit", "*", identifier, "*")
        await self.cache.delete_pattern(pattern)


# Global rate limiter instance
rate_limiter = RateLimiter(cache)


async def get_cache() -> CacheService:
    """Dependency for getting cache service.

    Returns:
        Cache service instance
    """
    return cache


async def get_rate_limiter() -> RateLimiter:
    """Dependency for getting rate limiter.

    Returns:
        Rate limiter instance
    """
    return rate_limiter


def get_client_identifier(request: Request) -> str:
    """Get client identifier for rate limiting.

    Args:
        request: FastAPI request

    Returns:
        Client identifier string
    """
    # Try to get user ID from auth if available
    if hasattr(request.state, "user") and request.state.user:
        return f"user:{request.state.user.id}"

    # Fall back to IP address
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return f"ip:{forwarded_for.split(',')[0].strip()}"

    client_host = request.client.host if request.client else "unknown"
    return f"ip:{client_host}"
