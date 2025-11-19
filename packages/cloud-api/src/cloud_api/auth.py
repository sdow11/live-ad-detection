"""Authentication utilities for Cloud API.

Provides JWT token generation/validation and password hashing.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api import models
from cloud_api.database import get_db

# JWT Configuration
SECRET_KEY = "your-secret-key-change-in-production"  # Should be from environment variable
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30

# Security schemes
bearer_scheme = HTTPBearer(auto_error=False)


class TokenData(BaseModel):
    """Token payload data."""

    user_id: int
    organization_id: int
    email: str
    is_superuser: bool = False
    exp: datetime


class TokenPair(BaseModel):
    """Access and refresh token pair."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash.

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password

    Returns:
        True if password matches
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


def create_access_token(
    user_id: int,
    organization_id: int,
    email: str,
    is_superuser: bool = False,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token.

    Args:
        user_id: User ID
        organization_id: Organization ID
        email: User email
        is_superuser: Whether user is superuser
        expires_delta: Token expiration time

    Returns:
        JWT token string
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "organization_id": organization_id,
        "email": email,
        "is_superuser": is_superuser,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access"
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT refresh token.

    Args:
        user_id: User ID
        expires_delta: Token expiration time

    Returns:
        JWT token string
    """
    if expires_delta is None:
        expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh"
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_token_pair(
    user_id: int,
    organization_id: int,
    email: str,
    is_superuser: bool = False
) -> TokenPair:
    """Create access and refresh token pair.

    Args:
        user_id: User ID
        organization_id: Organization ID
        email: User email
        is_superuser: Whether user is superuser

    Returns:
        Token pair
    """
    access_token = create_access_token(user_id, organization_id, email, is_superuser)
    refresh_token = create_refresh_token(user_id)

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        Token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def generate_api_key() -> str:
    """Generate a secure API key.

    Returns:
        API key string
    """
    return secrets.token_urlsafe(32)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    """Get current authenticated user from JWT token.

    Args:
        credentials: HTTP bearer token credentials
        db: Database session

    Returns:
        Current user

    Raises:
        HTTPException: If authentication fails
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    # Verify token type
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return user


async def get_current_superuser(
    current_user: models.User = Depends(get_current_user)
) -> models.User:
    """Get current user and verify superuser status.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user

    Raises:
        HTTPException: If user is not a superuser
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required"
        )
    return current_user


async def verify_organization_access(
    user: models.User,
    organization_id: int
) -> bool:
    """Verify user has access to an organization.

    Args:
        user: User to check
        organization_id: Organization ID

    Returns:
        True if user has access

    Raises:
        HTTPException: If user doesn't have access
    """
    if user.is_superuser:
        return True

    if user.organization_id != organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this organization"
        )

    return True


async def verify_device_api_key(
    api_key: str,
    db: AsyncSession
) -> models.Device:
    """Verify device API key and return device.

    Args:
        api_key: API key to verify
        db: Database session

    Returns:
        Device associated with API key

    Raises:
        HTTPException: If API key is invalid
    """
    # Query device by API key
    result = await db.execute(
        models.Device.__table__.select().where(
            models.Device.api_key == api_key
        )
    )
    device = result.first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    if not device.api_key_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key is disabled"
        )

    return device


async def get_device_from_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db)
) -> models.Device:
    """Get device from API key in bearer token.

    This allows devices to authenticate using their API key instead of JWT.

    Args:
        credentials: HTTP bearer token credentials
        db: Database session

    Returns:
        Device

    Raises:
        HTTPException: If authentication fails
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    api_key = credentials.credentials

    # Try to verify as device API key
    return await verify_device_api_key(api_key, db)


class OptionalAuth:
    """Optional authentication - returns None if not authenticated."""

    def __init__(self, require_superuser: bool = False):
        """Initialize optional auth.

        Args:
            require_superuser: Whether to require superuser status
        """
        self.require_superuser = require_superuser

    async def __call__(
        self,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
        db: AsyncSession = Depends(get_db)
    ) -> Optional[models.User]:
        """Get current user if authenticated, None otherwise.

        Args:
            credentials: HTTP bearer token credentials
            db: Database session

        Returns:
            User or None
        """
        if not credentials:
            return None

        try:
            token = credentials.credentials
            payload = decode_token(token)

            if payload.get("type") != "access":
                return None

            user_id = payload.get("user_id")
            if not user_id:
                return None

            user = await db.get(models.User, user_id)
            if not user or not user.is_active:
                return None

            if self.require_superuser and not user.is_superuser:
                return None

            return user

        except HTTPException:
            return None
