import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = {
  // Cluster Status
  getClusterStatus: async () => {
    const response = await axios.get(`${API_URL}/api/v1/cluster/status`);
    return response.data;
  },

  // Nodes
  getNodes: async () => {
    const response = await axios.get(`${API_URL}/api/v1/nodes`);
    return response.data;
  },

  getNode: async (nodeId) => {
    const response = await axios.get(`${API_URL}/api/v1/nodes/${nodeId}`);
    return response.data;
  },

  // Detections
  getDetections: async (limit = 100, nodeId = null) => {
    const params = { limit };
    if (nodeId) params.node_id = nodeId;
    const response = await axios.get(`${API_URL}/api/v1/detections`, { params });
    return response.data;
  },

  getDetection: async (detectionId) => {
    const response = await axios.get(`${API_URL}/api/v1/detections/${detectionId}`);
    return response.data;
  },
};

export default api;
