"""
Database models and connection management for API server
Aligned with services/postgres/init.sql schema
"""

from sqlalchemy import create_engine, Column, String, Float, Integer, BigInteger, DateTime, JSON, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
import uuid

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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(String(255), unique=True, nullable=False, index=True)
    node_name = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=False)
    role = Column(String(50), nullable=False)  # "head" or "node"
    status = Column(String(50), nullable=False, default="offline")  # "online", "offline", "error"
    created_at = Column(DateTime, default=datetime.now)
    last_seen = Column(DateTime)
    cpu_usage = Column(Float, default=0.0)
    memory_usage = Column(Float, default=0.0)
    disk_usage = Column(Float, default=0.0)
    metadata = Column(JSON)  # JSONB in PostgreSQL

    # Relationships
    detections = relationship("DBDetection", back_populates="node")
    stats = relationship("DBNodeStats", back_populates="node")
    configs = relationship("DBConfig", back_populates="node")


class DBDetection(Base):
    """Database model for ad detections"""
    __tablename__ = "detections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    detection_id = Column(String(255), unique=True, nullable=False, index=True)
    node_id = Column(String(255), ForeignKey("nodes.node_id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    ad_type = Column(String(100), nullable=False, index=True)
    metadata = Column(JSON)  # JSONB in PostgreSQL
    created_at = Column(DateTime, default=datetime.now)

    # Relationships
    node = relationship("DBNode", back_populates="detections")
    events = relationship("DBDetectionEvent", back_populates="detection")


class DBNodeStats(Base):
    """Database model for node statistics time series"""
    __tablename__ = "node_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(String(255), ForeignKey("nodes.node_id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.now, index=True)
    cpu_usage = Column(Float)
    memory_usage = Column(Float)
    disk_usage = Column(Float)
    network_bytes_sent = Column(BigInteger)
    network_bytes_recv = Column(BigInteger)
    temperature = Column(Float)

    # Relationships
    node = relationship("DBNode", back_populates="stats")


class DBDetectionEvent(Base):
    """Database model for detection events (analytics)"""
    __tablename__ = "detection_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    detection_id = Column(UUID(as_uuid=True), ForeignKey("detections.id"), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    event_data = Column(JSON)  # JSONB in PostgreSQL
    created_at = Column(DateTime, default=datetime.now)

    # Relationships
    detection = relationship("DBDetection", back_populates="events")


class DBConfig(Base):
    """Database model for node configurations"""
    __tablename__ = "node_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(String(255), ForeignKey("nodes.node_id"), nullable=False, index=True)
    config = Column(JSON, nullable=False)  # JSONB in PostgreSQL
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    node = relationship("DBNode", back_populates="configs")


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


# Export all models
__all__ = [
    "Base",
    "DBNode",
    "DBDetection",
    "DBNodeStats",
    "DBDetectionEvent",
    "DBConfig",
    "init_db",
    "get_db",
    "engine",
    "SessionLocal"
]
