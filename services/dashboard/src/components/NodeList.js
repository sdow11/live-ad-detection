import React from 'react';
import './NodeList.css';

function NodeList({ nodes }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="card">
        <h2>Cluster Nodes</h2>
        <p className="empty-state">No nodes registered yet</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Cluster Nodes ({nodes.length})</h2>
      <div className="node-grid">
        {nodes.map((node) => (
          <div key={node.node_id} className={`node-card ${node.status}`}>
            <div className="node-header">
              <div className="node-status-indicator" />
              <div className="node-info">
                <div className="node-name">{node.node_name}</div>
                <div className="node-role">{node.role}</div>
              </div>
            </div>

            <div className="node-details">
              <div className="node-detail">
                <span className="detail-label">IP:</span>
                <span className="detail-value">{node.ip_address}</span>
              </div>
              <div className="node-detail">
                <span className="detail-label">Status:</span>
                <span className={`detail-value status-${node.status}`}>
                  {node.status}
                </span>
              </div>
              {node.last_seen && (
                <div className="node-detail">
                  <span className="detail-label">Last Seen:</span>
                  <span className="detail-value">
                    {new Date(node.last_seen).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            <div className="node-stats">
              <div className="stat-bar">
                <div className="stat-bar-label">CPU</div>
                <div className="stat-bar-container">
                  <div
                    className="stat-bar-fill cpu"
                    style={{ width: `${node.cpu_usage || 0}%` }}
                  />
                </div>
                <div className="stat-bar-value">{(node.cpu_usage || 0).toFixed(1)}%</div>
              </div>

              <div className="stat-bar">
                <div className="stat-bar-label">Memory</div>
                <div className="stat-bar-container">
                  <div
                    className="stat-bar-fill memory"
                    style={{ width: `${node.memory_usage || 0}%` }}
                  />
                </div>
                <div className="stat-bar-value">{(node.memory_usage || 0).toFixed(1)}%</div>
              </div>

              <div className="stat-bar">
                <div className="stat-bar-label">Disk</div>
                <div className="stat-bar-container">
                  <div
                    className="stat-bar-fill disk"
                    style={{ width: `${node.disk_usage || 0}%` }}
                  />
                </div>
                <div className="stat-bar-value">{(node.disk_usage || 0).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NodeList;
