-- Live Ad Detection Database Schema

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id VARCHAR(255) UNIQUE NOT NULL,
    node_name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    cpu_usage FLOAT DEFAULT 0,
    memory_usage FLOAT DEFAULT 0,
    disk_usage FLOAT DEFAULT 0,
    metadata JSONB
);

-- Detections table
CREATE TABLE IF NOT EXISTS detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    detection_id VARCHAR(255) UNIQUE NOT NULL,
    node_id VARCHAR(255) REFERENCES nodes(node_id),
    timestamp TIMESTAMP NOT NULL,
    confidence FLOAT NOT NULL,
    ad_type VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Node statistics (time series)
CREATE TABLE IF NOT EXISTS node_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id VARCHAR(255) REFERENCES nodes(node_id),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cpu_usage FLOAT,
    memory_usage FLOAT,
    disk_usage FLOAT,
    network_bytes_sent BIGINT,
    network_bytes_recv BIGINT,
    temperature FLOAT
);

-- Detection events (for analytics)
CREATE TABLE IF NOT EXISTS detection_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    detection_id UUID REFERENCES detections(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configuration storage
CREATE TABLE IF NOT EXISTS node_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id VARCHAR(255) REFERENCES nodes(node_id),
    config JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_detections_node_id ON detections(node_id);
CREATE INDEX idx_detections_timestamp ON detections(timestamp);
CREATE INDEX idx_node_stats_node_id ON node_stats(node_id);
CREATE INDEX idx_node_stats_timestamp ON node_stats(timestamp);
CREATE INDEX idx_detection_events_detection_id ON detection_events(detection_id);

-- Create views
CREATE OR REPLACE VIEW node_summary AS
SELECT
    n.node_id,
    n.node_name,
    n.role,
    n.status,
    n.last_seen,
    COUNT(DISTINCT d.id) as total_detections,
    MAX(d.timestamp) as last_detection
FROM nodes n
LEFT JOIN detections d ON n.node_id = d.node_id
GROUP BY n.node_id, n.node_name, n.role, n.status, n.last_seen;

-- Insert sample data (optional, for testing)
-- Uncomment for development
/*
INSERT INTO nodes (node_id, node_name, ip_address, role, status)
VALUES
    ('head-main', 'Main Head', '192.168.1.100', 'head', 'online'),
    ('node-01', 'Node 1', '192.168.1.101', 'node', 'online'),
    ('node-02', 'Node 2', '192.168.1.102', 'node', 'online');
*/
