import React from 'react';
import './ClusterOverview.css';

function ClusterOverview({ status }) {
  if (!status) return null;

  return (
    <div className="cluster-overview">
      <div className="stat-card">
        <div className="stat-icon">🖥️</div>
        <div className="stat-content">
          <div className="stat-label">Total Nodes</div>
          <div className="stat-value">{status.total_nodes || 0}</div>
        </div>
      </div>

      <div className="stat-card online">
        <div className="stat-icon">✅</div>
        <div className="stat-content">
          <div className="stat-label">Online</div>
          <div className="stat-value">{status.online_nodes || 0}</div>
        </div>
      </div>

      <div className="stat-card offline">
        <div className="stat-icon">❌</div>
        <div className="stat-content">
          <div className="stat-label">Offline</div>
          <div className="stat-value">{status.offline_nodes || 0}</div>
        </div>
      </div>

      <div className="stat-card detections">
        <div className="stat-icon">🎯</div>
        <div className="stat-content">
          <div className="stat-label">Total Detections</div>
          <div className="stat-value">{status.total_detections || 0}</div>
        </div>
      </div>

      {status.last_detection && (
        <div className="stat-card last-detection">
          <div className="stat-icon">⏰</div>
          <div className="stat-content">
            <div className="stat-label">Last Detection</div>
            <div className="stat-value-small">
              {new Date(status.last_detection).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClusterOverview;
