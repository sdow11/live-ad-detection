#!/usr/bin/env python3
"""Cloud API server for complete system demo.

Starts the cloud fleet management API server with an in-memory SQLite
database for quick testing and demonstration.

Usage:
    # Start cloud API:
    $ python demo_cloud_api.py

    # In another terminal, start edge device:
    $ cd ../edge-device/examples
    $ python demo_complete_system.py --device-id rpi-001 --location-id 1

    # Open dashboard in browser:
    $ open http://localhost:8000/dashboard.html

The API will be available at http://localhost:8000
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

# Import cloud API components
sys.path.insert(0, '/home/user/live-ad-detection/packages/cloud-api/src')

from cloud_api.models import Base, Organization, Location
from cloud_api.main import app as main_app, get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


# Demo database setup
DEMO_DATABASE_URL = "sqlite+aiosqlite:///demo_fleet.db"


async def setup_demo_database():
    """Set up demo database with sample data."""
    logger.info("🗄️  Setting up demo database...")

    # Create engine and session
    engine = create_async_engine(
        DEMO_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False}
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    logger.info("✅ Database tables created")

    # Create sample data
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Create sample organization
        org = Organization(
            name="Demo Restaurant Chain",
            slug="demo-chain",
            contact_email="demo@example.com",
            plan="enterprise"
        )
        session.add(org)
        await session.flush()

        # Create sample locations
        locations = [
            Location(
                organization_id=org.id,
                name="Downtown Sports Bar",
                address="123 Main St",
                city="San Francisco",
                state="CA",
                zip_code="94102",
                timezone="America/Los_Angeles"
            ),
            Location(
                organization_id=org.id,
                name="Airport Lounge",
                address="456 Terminal Dr",
                city="San Francisco",
                state="CA",
                zip_code="94128",
                timezone="America/Los_Angeles"
            ),
            Location(
                organization_id=org.id,
                name="Suburban Grill",
                address="789 Oak Ave",
                city="Oakland",
                state="CA",
                zip_code="94601",
                timezone="America/Los_Angeles"
            )
        ]

        for loc in locations:
            session.add(loc)

        await session.commit()

        logger.info(f"✅ Created organization: {org.name}")
        logger.info(f"✅ Created {len(locations)} sample locations")

    return engine


# Override get_db for demo
async def get_demo_db():
    """Get demo database session."""
    engine = create_async_engine(
        DEMO_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False}
    )

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session


async def main():
    """Main entry point."""
    logger.info("=" * 70)
    logger.info("🚀 STARTING CLOUD FLEET MANAGEMENT API")
    logger.info("=" * 70)

    # Set up demo database
    engine = await setup_demo_database()

    # Override database dependency
    main_app.dependency_overrides[get_db] = get_demo_db

    logger.info("")
    logger.info("=" * 70)
    logger.info("✅ CLOUD API SERVER READY")
    logger.info("=" * 70)
    logger.info("API URL: http://localhost:8000")
    logger.info("Dashboard: http://localhost:8000/dashboard.html")
    logger.info("API Docs: http://localhost:8000/docs")
    logger.info("")
    logger.info("Sample data created:")
    logger.info("  • Organization: Demo Restaurant Chain (ID: 1)")
    logger.info("  • Location 1: Downtown Sports Bar (ID: 1)")
    logger.info("  • Location 2: Airport Lounge (ID: 2)")
    logger.info("  • Location 3: Suburban Grill (ID: 3)")
    logger.info("")
    logger.info("Start edge devices with:")
    logger.info("  python demo_complete_system.py --device-id rpi-001 --location-id 1")
    logger.info("")
    logger.info("Press Ctrl+C to stop...")
    logger.info("=" * 70)

    # Configure uvicorn
    config = uvicorn.Config(
        main_app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True
    )

    server = uvicorn.Server(config)

    # Run server
    try:
        await server.serve()
    except KeyboardInterrupt:
        logger.info("\n🛑 Shutting down server...")
    finally:
        # Cleanup
        await engine.dispose()
        logger.info("✅ Server stopped")


if __name__ == "__main__":
    asyncio.run(main())
