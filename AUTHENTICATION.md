# Authentication Guide

Complete guide for authentication in the Live Ad Detection Cloud API.

## Table of Contents

- [Overview](#overview)
- [Authentication Methods](#authentication-methods)
- [User Authentication (JWT)](#user-authentication-jwt)
- [Device Authentication (API Keys)](#device-authentication-api-keys)
- [API Endpoints](#api-endpoints)
- [Usage Examples](#usage-examples)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Cloud API supports two authentication methods:

1. **JWT Tokens** - For human users accessing the dashboard and API
2. **API Keys** - For edge devices (Raspberry Pi) reporting telemetry

Both methods use Bearer token authentication via the `Authorization` header.

## Authentication Methods

### JWT Tokens (User Authentication)

- Used by: Admin users, dashboard, management tools
- Token type: JSON Web Tokens (JWT)
- Expiration: 24 hours (access token), 30 days (refresh token)
- Security: HMAC SHA-256 signature
- Scope: Organization-based access control

### API Keys (Device Authentication)

- Used by: Edge devices (Raspberry Pi)
- Token type: Secure random 32-byte URL-safe string
- Expiration: None (revocable)
- Security: Stored in database, can be disabled
- Scope: Device-specific

## User Authentication (JWT)

### Registration

Create a new user account:

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "admin@restaurant.com",
  "password": "secure-password-123",
  "full_name": "John Doe",
  "organization_id": 1
}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": 1,
    "email": "admin@restaurant.com",
    "full_name": "John Doe",
    "organization_id": 1,
    "is_active": true,
    "is_superuser": false,
    "created_at": "2025-01-15T10:00:00Z"
  }
}
```

### Login

Authenticate existing user:

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@restaurant.com",
  "password": "secure-password-123"
}
```

Response: Same as registration

### Using Access Token

Include the access token in all API requests:

```bash
GET /api/v1/devices
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Refreshing Tokens

When access token expires, use refresh token to get a new pair:

```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User

Retrieve authenticated user information:

```bash
GET /api/v1/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Change Password

Update user password:

```bash
POST /api/v1/auth/change-password
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "current_password": "old-password",
  "new_password": "new-secure-password-456"
}
```

## Device Authentication (API Keys)

### Generate API Key

Create or regenerate API key for a device:

```bash
POST /api/v1/devices/rpi-001/api-key
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Response:
```json
{
  "api_key": "vQ7X9YmK3pL2wN5zB8jT1hR4dF6sA0cV...",
  "device_id": "rpi-001",
  "created_at": "2025-01-15T10:00:00Z",
  "enabled": true
}
```

**IMPORTANT**: Store this API key securely on the device. It cannot be retrieved again.

### Configure Device

On the Raspberry Pi, save the API key to the environment file:

```bash
# /etc/ad-detection/edge-device.env
API_KEY=vQ7X9YmK3pL2wN5zB8jT1hR4dF6sA0cV...
CLOUD_API_URL=https://api.example.com
```

### Using API Key

Devices use the API key as a bearer token:

```bash
POST /api/v1/telemetry
Authorization: Bearer vQ7X9YmK3pL2wN5zB8jT1hR4dF6sA0cV...
Content-Type: application/json

{
  "device_id": "rpi-001",
  "frames_captured": 1000,
  "total_ad_breaks": 5,
  ...
}
```

### Revoke API Key

Disable a device's API key:

```bash
DELETE /api/v1/devices/rpi-001/api-key
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/v1/auth/register` | No | Register new user |
| POST | `/api/v1/auth/login` | No | User login |
| POST | `/api/v1/auth/refresh` | No | Refresh access token |
| GET | `/api/v1/auth/me` | Yes (JWT) | Get current user |
| POST | `/api/v1/auth/change-password` | Yes (JWT) | Change password |

### Device API Key Management

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/v1/devices/{device_id}/api-key` | Yes (JWT) | Generate API key |
| DELETE | `/api/v1/devices/{device_id}/api-key` | Yes (JWT) | Revoke API key |

### Protected Endpoints

All other API endpoints require authentication via JWT (users) or API Key (devices).

## Usage Examples

### Python (User Authentication)

```python
import httpx

# Login
response = httpx.post("https://api.example.com/api/v1/auth/login", json={
    "email": "admin@restaurant.com",
    "password": "secure-password-123"
})
tokens = response.json()
access_token = tokens["access_token"]

# Use access token
headers = {"Authorization": f"Bearer {access_token}"}
devices = httpx.get("https://api.example.com/api/v1/devices", headers=headers)
print(devices.json())

# Refresh token when expired
refresh_response = httpx.post("https://api.example.com/api/v1/auth/refresh", json={
    "refresh_token": tokens["refresh_token"]
})
new_tokens = refresh_response.json()
```

### Python (Device Authentication)

```python
import httpx
import os

# Get API key from environment
api_key = os.environ.get("API_KEY")

# Report telemetry
headers = {"Authorization": f"Bearer {api_key}"}
response = httpx.post(
    "https://api.example.com/api/v1/telemetry",
    headers=headers,
    json={
        "device_id": "rpi-001",
        "frames_captured": 1000,
        "total_ad_breaks": 5,
        "period_start": "2025-01-15T10:00:00Z",
        "period_end": "2025-01-15T11:00:00Z"
    }
)
```

### JavaScript/TypeScript

```typescript
// Login
const loginResponse = await fetch("https://api.example.com/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@restaurant.com",
    password: "secure-password-123"
  })
});
const { access_token, refresh_token } = await loginResponse.json();

// Use access token
const devicesResponse = await fetch("https://api.example.com/api/v1/devices", {
  headers: { "Authorization": `Bearer ${access_token}` }
});
const devices = await devicesResponse.json();

// Store tokens securely (e.g., httpOnly cookies, secure storage)
localStorage.setItem("access_token", access_token);
localStorage.setItem("refresh_token", refresh_token);
```

### cURL Examples

```bash
# Login
curl -X POST https://api.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restaurant.com","password":"secure-password-123"}'

# Get devices (with token)
curl https://api.example.com/api/v1/devices \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Generate device API key
curl -X POST https://api.example.com/api/v1/devices/rpi-001/api-key \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Device reporting telemetry
curl -X POST https://api.example.com/api/v1/telemetry \
  -H "Authorization: Bearer vQ7X9YmK3pL2wN5zB8jT1hR4dF6sA0cV..." \
  -H "Content-Type: application/json" \
  -d '{"device_id":"rpi-001","frames_captured":1000,...}'
```

## Security Best Practices

### For Administrators

1. **Strong Passwords**
   - Minimum 8 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Use a password manager

2. **Token Storage**
   - Never store tokens in localStorage (vulnerable to XSS)
   - Use httpOnly cookies or secure storage
   - Clear tokens on logout

3. **Token Rotation**
   - Refresh access tokens before expiration
   - Rotate refresh tokens periodically
   - Implement token revocation for compromised accounts

4. **API Key Management**
   - Generate unique API key per device
   - Revoke keys for decommissioned devices
   - Rotate keys if compromised
   - Monitor API key usage

5. **Organization Isolation**
   - Users can only access their organization's data
   - Superusers can access all organizations
   - Verify organization access in all endpoints

### For Edge Devices

1. **API Key Protection**
   - Store in encrypted file system (`/etc/ad-detection/`)
   - Never log or display API keys
   - Use environment variables, not hardcoded values
   - Restrict file permissions: `chmod 600 /etc/ad-detection/edge-device.env`

2. **Network Security**
   - Always use HTTPS for API communication
   - Validate SSL certificates
   - Use VPN for added security

3. **Key Rotation**
   - Implement automated key rotation schedule
   - Support rolling updates without downtime

### For Developers

1. **Secret Management**
   - Never commit JWT secret keys to git
   - Use environment variables: `SECRET_KEY=...`
   - Generate strong secrets: `openssl rand -hex 32`
   - Rotate secrets periodically

2. **Input Validation**
   - Validate all user input (Pydantic handles this)
   - Sanitize error messages (don't leak sensitive info)
   - Use parameterized queries (SQLAlchemy handles this)

3. **Rate Limiting**
   - Implement rate limiting on auth endpoints
   - Block brute force attacks
   - Log suspicious activity

4. **HTTPS Enforcement**
   - Always use HTTPS in production
   - Redirect HTTP to HTTPS
   - Use HSTS headers

5. **Logging & Monitoring**
   - Log authentication attempts
   - Monitor for suspicious patterns
   - Alert on multiple failed logins

## Troubleshooting

### 401 Unauthorized

**Problem**: API returns 401 Unauthorized

**Solutions**:
- Verify token is included in `Authorization` header
- Check token format: `Bearer <token>`
- Ensure token hasn't expired
- For JWT: Use refresh token to get new access token
- For API key: Verify key is enabled and correct

### 403 Forbidden

**Problem**: API returns 403 Forbidden

**Solutions**:
- User account may be disabled (check `is_active`)
- User doesn't have access to organization (check `organization_id`)
- Superuser privileges required (check `is_superuser`)
- Device API key may be disabled (check `api_key_enabled`)

### Token Expired

**Problem**: "Token has expired" error

**Solutions**:
- Access tokens expire after 24 hours
- Use refresh token to get new access token
- Implement automatic token refresh in client
- Store refresh token securely

### Invalid Token

**Problem**: "Invalid token" error

**Solutions**:
- Verify JWT secret key matches on server
- Check token wasn't tampered with
- Ensure token is properly formatted
- Regenerate tokens if needed

### Device Can't Authenticate

**Problem**: Device can't connect to cloud API

**Solutions**:
- Verify API key is correctly configured
- Check `/etc/ad-detection/edge-device.env` file
- Ensure API key hasn't been revoked
- Regenerate API key if needed
- Verify network connectivity to cloud API

### Password Reset

**Problem**: User forgot password

**Solutions**:
- Currently no self-service password reset
- Superuser can update password directly in database:
  ```python
  from cloud_api.auth import hash_password
  new_password_hash = hash_password("new-password")
  # Update in database
  ```
- TODO: Implement email-based password reset flow

## Configuration

### Environment Variables

```bash
# Cloud API
SECRET_KEY=your-secret-key-change-in-production  # JWT signing key
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/db
ALLOWED_ORIGINS=https://dashboard.example.com

# Access token expiration (minutes)
ACCESS_TOKEN_EXPIRE_MINUTES=1440  # 24 hours

# Refresh token expiration (days)
REFRESH_TOKEN_EXPIRE_DAYS=30

# Rate limiting
AUTH_RATE_LIMIT=10  # requests per minute
```

### Generating Secret Key

Generate a secure secret key:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

## Next Steps

1. Implement email-based password reset
2. Add two-factor authentication (2FA)
3. Implement API rate limiting per user/device
4. Add OAuth2 support (Google, GitHub)
5. Implement token revocation (blacklist)
6. Add audit logging for all auth events
7. Implement session management
8. Add IP whitelisting for devices

## Resources

- [JWT.io](https://jwt.io/) - JWT debugger and documentation
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [bcrypt Documentation](https://github.com/pyca/bcrypt/)
