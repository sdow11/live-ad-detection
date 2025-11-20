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

# In-memory storage (replace with database in production)
nodes: Dict[str, NodeInfo] = {}
detections: List[Detection] = []

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
async def register_node(node: NodeRegistration):
    """Register a new node in the cluster"""
    node_id = f"{node.role}-{node.node_name}"

    node_info = NodeInfo(
        node_id=node_id,
        node_name=node.node_name,
        ip_address=node.ip_address,
        role=node.role,
        status="online",
        last_seen=datetime.now(),
        cpu_usage=0.0,
        memory_usage=0.0,
        disk_usage=0.0
    )

    nodes[node_id] = node_info
    logger.info(f"Node registered: {node_id} at {node.ip_address}")

    return node_info

@app.get("/api/v1/nodes", response_model=List[NodeInfo])
async def list_nodes():
    """List all registered nodes"""
    return list(nodes.values())

@app.get("/api/v1/nodes/{node_id}", response_model=NodeInfo)
async def get_node(node_id: str):
    """Get information about a specific node"""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")
    return nodes[node_id]

@app.put("/api/v1/nodes/{node_id}/heartbeat")
async def node_heartbeat(node_id: str, stats: Dict[str, float]):
    """Update node heartbeat and statistics"""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")

    node = nodes[node_id]
    node.last_seen = datetime.now()
    node.status = "online"
    node.cpu_usage = stats.get("cpu_usage", 0.0)
    node.memory_usage = stats.get("memory_usage", 0.0)
    node.disk_usage = stats.get("disk_usage", 0.0)

    return {"status": "ok", "timestamp": node.last_seen}

@app.delete("/api/v1/nodes/{node_id}")
async def unregister_node(node_id: str):
    """Unregister a node from the cluster"""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")

    del nodes[node_id]
    logger.info(f"Node unregistered: {node_id}")

    return {"status": "deleted", "node_id": node_id}

# Detection Management
@app.post("/api/v1/detections", response_model=Detection)
async def report_detection(detection: Detection):
    """Report a new ad detection from a node"""
    detections.append(detection)
    logger.info(f"Detection reported from {detection.node_id}: {detection.ad_type} ({detection.confidence})")
    return detection

@app.get("/api/v1/detections", response_model=List[Detection])
async def list_detections(limit: int = 100, node_id: Optional[str] = None):
    """List recent detections"""
    filtered = detections

    if node_id:
        filtered = [d for d in filtered if d.node_id == node_id]

    return filtered[-limit:]

@app.get("/api/v1/detections/{detection_id}", response_model=Detection)
async def get_detection(detection_id: str):
    """Get details of a specific detection"""
    for detection in detections:
        if detection.detection_id == detection_id:
            return detection

    raise HTTPException(status_code=404, detail="Detection not found")

# Cluster Status
@app.get("/api/v1/cluster/status", response_model=ClusterStatus)
async def get_cluster_status():
    """Get overall cluster status"""
    online_nodes = sum(1 for n in nodes.values() if n.status == "online")
    offline_nodes = len(nodes) - online_nodes

    last_detection = None
    if detections:
        last_detection = max(d.timestamp for d in detections)

    return ClusterStatus(
        total_nodes=len(nodes),
        online_nodes=online_nodes,
        offline_nodes=offline_nodes,
        total_detections=len(detections),
        last_detection=last_detection
    )

# Configuration Management
@app.get("/api/v1/config/{node_id}")
async def get_node_config(node_id: str):
    """Get configuration for a specific node"""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")

    # Return default config (customize per node as needed)
    return {
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

@app.put("/api/v1/config/{node_id}")
async def update_node_config(node_id: str, config: Dict[str, Any]):
    """Update configuration for a specific node"""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")

    # Store config (implement persistent storage)
    logger.info(f"Config updated for {node_id}")
    return {"status": "updated", "config": config}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
