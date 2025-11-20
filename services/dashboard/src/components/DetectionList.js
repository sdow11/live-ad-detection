import React from 'react';
import './DetectionList.css';

function DetectionList({ detections }) {
  if (!detections || detections.length === 0) {
    return (
      <div className="card">
        <h2>Recent Detections</h2>
        <p className="empty-state">No detections yet</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Recent Detections ({detections.length})</h2>
      <div className="detection-list">
        {detections.map((detection) => (
          <div key={detection.detection_id} className="detection-item">
            <div className="detection-icon">
              {getAdTypeIcon(detection.ad_type)}
            </div>

            <div className="detection-content">
              <div className="detection-header">
                <div className="detection-type">{detection.ad_type}</div>
                <div className="detection-confidence">
                  {(detection.confidence * 100).toFixed(1)}%
                </div>
              </div>

              <div className="detection-details">
                <span className="detection-node">Node: {detection.node_id}</span>
                <span className="detection-time">
                  {new Date(detection.timestamp).toLocaleString()}
                </span>
              </div>

              {detection.metadata && (
                <div className="detection-metadata">
                  {Object.entries(detection.metadata).map(([key, value]) => (
                    <span key={key} className="metadata-tag">
                      {key}: {JSON.stringify(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="confidence-bar-vertical">
              <div
                className="confidence-fill"
                style={{ height: `${detection.confidence * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAdTypeIcon(adType) {
  const icons = {
    'commercial': '📺',
    'banner': '🎨',
    'pre-roll': '▶️',
    'mid-roll': '⏸️',
    'overlay': '🔲',
    'sponsored_content': '💰'
  };
  return icons[adType] || '🎯';
}

export default DetectionList;
