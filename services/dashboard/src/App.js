import React, { useState, useEffect } from 'react';
import './App.css';
import ClusterOverview from './components/ClusterOverview';
import NodeList from './components/NodeList';
import DetectionList from './components/DetectionList';
import api from './services/api';

function App() {
  const [clusterStatus, setClusterStatus] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusData, nodesData, detectionsData] = await Promise.all([
        api.getClusterStatus(),
        api.getNodes(),
        api.getDetections(20)
      ]);

      setClusterStatus(statusData);
      setNodes(nodesData);
      setDetections(detectionsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to connect to API server. Make sure services are running.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !clusterStatus) {
    return (
      <div className="App">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <div className="error">
          <h2>⚠️ Connection Error</h2>
          <p>{error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎯 Live Ad Detection</h1>
        <p>Cluster Monitoring Dashboard</p>
      </header>

      <main className="App-main">
        <ClusterOverview status={clusterStatus} />
        <NodeList nodes={nodes} />
        <DetectionList detections={detections} />
      </main>
    </div>
  );
}

export default App;
