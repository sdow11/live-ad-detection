"""
Live Ad Detection - API Server
Coordinates cluster nodes and provides REST API for management
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging
import os
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import (
    init_db,
    get_db,
    DBNode,
    DBDetection,
    DBConfig
)

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Live Ad Detection API",
    description="API for managing ad detection cluster",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized")

# Models
class NodeInfo(BaseModel):
    node_id: str
    node_name: str
    ip_address: str
    role: str  # "head" or "node"
    status: str  # "online", "offline", "error"
    last_seen: datetime
    cpu_usage: float
    memory_usage: float
    disk_usage: float

class NodeRegistration(BaseModel):
    node_name: str
    ip_address: str
    role: str
    capabilities: Dict[str, Any] = {}

class Detection(BaseModel):
    detection_id: str
    node_id: str
    timestamp: datetime
    confidence: float
    ad_type: str
    metadata: Dict[str, Any] = {}

class ClusterStatus(BaseModel):
    total_nodes: int
    online_nodes: int
    offline_nodes: int
    total_detections: int
    last_detection: Optional[datetime] = None

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "api-server"
    }

# Node Management
@app.post("/api/v1/nodes/register", response_model=NodeInfo)
async def register_node(node: NodeRegistration, db: Session = Depends(get_db)):
    """Register a new node in the cluster"""
    node_id = f"{node.role}-{node.node_name}"

    # Check if node already exists
    existing_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()

    if existing_node:
        # Update existing node
        existing_node.ip_address = node.ip_address
        existing_node.status = "online"
        existing_node.last_seen = datetime.now()
        existing_node.capabilities = node.capabilities
        db.commit()
        db.refresh(existing_node)
        db_node = existing_node
    else:
        # Create new node
        db_node = DBNode(
            node_id=node_id,
            node_name=node.node_name,
            ip_address=node.ip_address,
            role=node.role,
            status="online",
            last_seen=datetime.now(),
            cpu_usage=0.0,
            memory_usage=0.0,
            disk_usage=0.0,
            capabilities=node.capabilities
        )
        db.add(db_node)
        db.commit()
        db.refresh(db_node)

    logger.info(f"Node registered: {node_id} at {node.ip_address}")

    return NodeInfo(
        node_id=db_node.node_id,
        node_name=db_node.node_name,
        ip_address=db_node.ip_address,
        role=db_node.role,
        status=db_node.status,
        last_seen=db_node.last_seen,
        cpu_usage=db_node.cpu_usage,
        memory_usage=db_node.memory_usage,
        disk_usage=db_node.disk_usage
    )

@app.get("/api/v1/nodes", response_model=List[NodeInfo])
async def list_nodes(db: Session = Depends(get_db)):
    """List all registered nodes"""
    db_nodes = db.query(DBNode).all()
    return [
        NodeInfo(
            node_id=node.node_id,
            node_name=node.node_name,
            ip_address=node.ip_address,
            role=node.role,
            status=node.status,
            last_seen=node.last_seen,
            cpu_usage=node.cpu_usage,
            memory_usage=node.memory_usage,
            disk_usage=node.disk_usage
        )
        for node in db_nodes
    ]

@app.get("/api/v1/nodes/{node_id}", response_model=NodeInfo)
async def get_node(node_id: str, db: Session = Depends(get_db)):
    """Get information about a specific node"""
    db_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    return NodeInfo(
        node_id=db_node.node_id,
        node_name=db_node.node_name,
        ip_address=db_node.ip_address,
        role=db_node.role,
        status=db_node.status,
        last_seen=db_node.last_seen,
        cpu_usage=db_node.cpu_usage,
        memory_usage=db_node.memory_usage,
        disk_usage=db_node.disk_usage
    )

@app.put("/api/v1/nodes/{node_id}/heartbeat")
async def node_heartbeat(node_id: str, stats: Dict[str, float], db: Session = Depends(get_db)):
    """Update node heartbeat and statistics"""
    db_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    db_node.last_seen = datetime.now()
    db_node.status = "online"
    db_node.cpu_usage = stats.get("cpu_usage", 0.0)
    db_node.memory_usage = stats.get("memory_usage", 0.0)
    db_node.disk_usage = stats.get("disk_usage", 0.0)

    db.commit()

    return {"status": "ok", "timestamp": db_node.last_seen}

@app.delete("/api/v1/nodes/{node_id}")
async def unregister_node(node_id: str, db: Session = Depends(get_db)):
    """Unregister a node from the cluster"""
    db_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    db.delete(db_node)
    db.commit()
    logger.info(f"Node unregistered: {node_id}")

    return {"status": "deleted", "node_id": node_id}

# Detection Management
@app.post("/api/v1/detections", response_model=Detection)
async def report_detection(detection: Detection, db: Session = Depends(get_db)):
    """Report a new ad detection from a node"""
    db_detection = DBDetection(
        detection_id=detection.detection_id,
        node_id=detection.node_id,
        timestamp=detection.timestamp,
        confidence=detection.confidence,
        ad_type=detection.ad_type,
        metadata=detection.metadata
    )
    db.add(db_detection)
    db.commit()
    db.refresh(db_detection)

    logger.info(f"Detection reported from {detection.node_id}: {detection.ad_type} ({detection.confidence})")
    return detection

@app.get("/api/v1/detections", response_model=List[Detection])
async def list_detections(limit: int = 100, node_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List recent detections"""
    query = db.query(DBDetection).order_by(desc(DBDetection.timestamp))

    if node_id:
        query = query.filter(DBDetection.node_id == node_id)

    db_detections = query.limit(limit).all()

    return [
        Detection(
            detection_id=d.detection_id,
            node_id=d.node_id,
            timestamp=d.timestamp,
            confidence=d.confidence,
            ad_type=d.ad_type,
            metadata=d.metadata
        )
        for d in db_detections
    ]

@app.get("/api/v1/detections/{detection_id}", response_model=Detection)
async def get_detection(detection_id: str, db: Session = Depends(get_db)):
    """Get details of a specific detection"""
    db_detection = db.query(DBDetection).filter(DBDetection.detection_id == detection_id).first()

    if not db_detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    return Detection(
        detection_id=db_detection.detection_id,
        node_id=db_detection.node_id,
        timestamp=db_detection.timestamp,
        confidence=db_detection.confidence,
        ad_type=db_detection.ad_type,
        metadata=db_detection.metadata
    )

# Cluster Status
@app.get("/api/v1/cluster/status", response_model=ClusterStatus)
async def get_cluster_status(db: Session = Depends(get_db)):
    """Get overall cluster status"""
    total_nodes = db.query(DBNode).count()
    online_nodes = db.query(DBNode).filter(DBNode.status == "online").count()
    offline_nodes = total_nodes - online_nodes

    total_detections = db.query(DBDetection).count()

    # Get latest detection timestamp
    latest_detection = db.query(func.max(DBDetection.timestamp)).scalar()

    return ClusterStatus(
        total_nodes=total_nodes,
        online_nodes=online_nodes,
        offline_nodes=offline_nodes,
        total_detections=total_detections,
        last_detection=latest_detection
    )

# Configuration Management
@app.get("/api/v1/config/{node_id}")
async def get_node_config(node_id: str, db: Session = Depends(get_db)):
    """Get configuration for a specific node"""
    # Check if node exists
    db_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Get stored config or return default
    db_config = db.query(DBConfig).filter(DBConfig.node_id == node_id).first()

    if db_config:
        return db_config.config

    # Return default config
    default_config = {
        "ad_detection": {
            "enabled": True,
            "confidence_threshold": 0.8,
            "scan_interval": 5
        },
        "reporting": {
            "api_url": os.getenv("API_URL", "http://localhost:8000"),
            "report_interval": 10
        }
    }
    return default_config

@app.put("/api/v1/config/{node_id}")
async def update_node_config(node_id: str, config: Dict[str, Any], db: Session = Depends(get_db)):
    """Update configuration for a specific node"""
    # Check if node exists
    db_node = db.query(DBNode).filter(DBNode.node_id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Update or create config
    db_config = db.query(DBConfig).filter(DBConfig.node_id == node_id).first()

    if db_config:
        db_config.config = config
        db_config.updated_at = datetime.now()
    else:
        db_config = DBConfig(node_id=node_id, config=config)
        db.add(db_config)

    db.commit()
    logger.info(f"Config updated for {node_id}")

    return {"status": "updated", "config": config}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
