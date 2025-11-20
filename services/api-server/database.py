"""
Database models and connection management for API server
"""

from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database URL from environment or default to local postgres
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/live_ad_detection"
)

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


class DBNode(Base):
    """Database model for cluster nodes"""
    __tablename__ = "nodes"

    node_id = Column(String, primary_key=True, index=True)
    node_name = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "head" or "node"
    status = Column(String, default="online")  # "online", "offline", "error"
    last_seen = Column(DateTime, default=datetime.now)
    cpu_usage = Column(Float, default=0.0)
    memory_usage = Column(Float, default=0.0)
    disk_usage = Column(Float, default=0.0)
    capabilities = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBDetection(Base):
    """Database model for ad detections"""
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    detection_id = Column(String, unique=True, index=True, nullable=False)
    node_id = Column(String, nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.now, index=True)
    confidence = Column(Float, nullable=False)
    ad_type = Column(String, nullable=False, index=True)
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.now)


class DBConfig(Base):
    """Database model for node configurations"""
    __tablename__ = "node_configs"

    node_id = Column(String, primary_key=True, index=True)
    config = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
