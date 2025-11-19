"""Basic smoke tests for cloud API."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from cloud_api.main import app, get_db
from cloud_api.models import Base


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Create test database session."""
    async_session = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session


@pytest.fixture
async def client(db_session):
    """Create test HTTP client with database override."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_health(client: AsyncClient):
    """Test that API is responding."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_create_and_list_organizations(client: AsyncClient):
    """Test basic organization CRUD."""
    # Create org
    create_response = await client.post(
        "/api/v1/organizations",
        json={"name": "Test Org", "slug": "test-org"},
    )

    print(f"Create response status: {create_response.status_code}")
    print(f"Create response body: {create_response.text}")

    assert create_response.status_code in [200, 201]
    org_data = create_response.json()
    assert "id" in org_data
    org_id = org_data["id"]

    # List orgs
    list_response = await client.get("/api/v1/organizations")
    assert list_response.status_code == 200
    orgs = list_response.json()
    assert len(orgs) == 1
    assert orgs[0]["id"] == org_id


@pytest.mark.asyncio
async def test_device_registration_flow(client: AsyncClient):
    """Test complete device registration flow."""
    # 1. Create organization
    org_resp = await client.post(
        "/api/v1/organizations",
        json={"name": "Test Chain", "slug": "test-chain"},
    )
    assert org_resp.status_code in [200, 201]
    org_id = org_resp.json()["id"]

    # 2. Create location
    loc_resp = await client.post(
        "/api/v1/locations",
        json={
            "organization_id": org_id,
            "name": "Test Bar",
        },
    )
    print(f"Location response: {loc_resp.status_code} - {loc_resp.text}")
    assert loc_resp.status_code in [200, 201]
    loc_id = loc_resp.json()["id"]

    # 3. Register device
    device_resp = await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "rpi-test-001",
            "location_id": loc_id,
            "role": "coordinator",
        },
    )
    print(f"Device response: {device_resp.status_code} - {device_resp.text}")
    assert device_resp.status_code in [200, 201]

    # 4. List devices
    list_resp = await client.get("/api/v1/devices")
    assert list_resp.status_code == 200
    devices = list_resp.json()
    assert len(devices) == 1
    assert devices[0]["device_id"] == "rpi-test-001"
