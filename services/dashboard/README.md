# Live Ad Detection - Dashboard

React-based web dashboard for monitoring the Live Ad Detection cluster.

## Features

- **Cluster Overview**: Real-time statistics of nodes and detections
- **Node Monitoring**: Status, CPU, memory, and disk usage of each node
- **Detection Feed**: Live feed of ad detections with confidence scores
- **Auto-refresh**: Updates every 5 seconds

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

## Docker

```bash
# Build
docker build -t live-ad-dashboard .

# Run
docker run -p 3000:3000 -e API_URL=http://api-server:8000 live-ad-dashboard
```

## Environment Variables

- `REACT_APP_API_URL`: API server URL (default: http://localhost:8000)

## Components

- **ClusterOverview**: Displays cluster statistics
- **NodeList**: Shows all registered nodes with their status
- **DetectionList**: Lists recent ad detections
