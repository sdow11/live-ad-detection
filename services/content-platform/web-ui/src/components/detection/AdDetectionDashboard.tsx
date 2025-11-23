'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Play, 
  Square, 
  Settings, 
  Monitor, 
  Brain,
  AlertCircle,
  CheckCircle,
  Zap,
  BarChart3,
  Eye,
  Video
} from 'lucide-react';

/**
 * Ad Detection Dashboard Component
 * 
 * Provides real-time monitoring and control of the AI-powered ad detection system
 * Integrates with the Content Platform's PiP automation
 */

interface AdDetectionStats {
  detector: {
    total_frames_processed: number;
    total_detections: number;
    detections_by_stream: Record<string, number>;
    processing_fps: number;
    inference_time_ms: number;
    model_swaps: number;
  };
  streams: Record<string, {
    fps: number;
    frames_processed: number;
    status: string;
  }>;
  model: {
    name: string;
    path: string;
    loaded: boolean;
    device_info: string;
  };
}

interface AdDetectionStatus {
  running: boolean;
  detector_connected: boolean;
  recent_detections_count: number;
  active_streams: number;
  config: {
    confidence_threshold: number;
    auto_start_pip: boolean;
    pip_trigger_types: string[];
  };
}

interface AdDetection {
  detection_id: string;
  stream_id: string;
  timestamp: string;
  confidence: number;
  ad_type: string;
  bounding_box?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export function AdDetectionDashboard() {
  const [status, setStatus] = useState<AdDetectionStatus | null>(null);
  const [stats, setStats] = useState<AdDetectionStats | null>(null);
  const [recentDetections, setRecentDetections] = useState<AdDetection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Fetch status and stats
  const fetchData = async () => {
    try {
      const [statusRes, statsRes, detectionsRes] = await Promise.all([
        fetch('/api/v1/ad-detection/status'),
        fetch('/api/v1/ad-detection/stats'),
        fetch('/api/v1/ad-detection/detections?limit=10')
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData.data);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data);
      }

      if (detectionsRes.ok) {
        const detectionsData = await detectionsRes.json();
        setRecentDetections(detectionsData.data);
      }

      setError(null);
    } catch (err) {
      setError('Failed to fetch ad detection data');
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize and start auto-refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const response = await fetch('/api/v1/ad-detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        await fetchData();
      } else {
        throw new Error('Failed to start ad detection');
      }
    } catch (err) {
      setError('Failed to start ad detection system');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const response = await fetch('/api/v1/ad-detection/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        await fetchData();
      } else {
        throw new Error('Failed to stop ad detection');
      }
    } catch (err) {
      setError('Failed to stop ad detection system');
    } finally {
      setIsStopping(false);
    }
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  const getAdTypeColor = (adType: string) => {
    const colors = {
      commercial: 'bg-red-100 text-red-800',
      banner: 'bg-blue-100 text-blue-800',
      'pre-roll': 'bg-orange-100 text-orange-800',
      'mid-roll': 'bg-yellow-100 text-yellow-800',
      overlay: 'bg-purple-100 text-purple-800',
      sponsored_content: 'bg-green-100 text-green-800'
    };
    return colors[adType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Ad Detection</h2>
          <p className="text-gray-600">Real-time advertisement detection with Picture-in-Picture automation</p>
        </div>
        
        <div className="flex items-center space-x-2">
          {status?.running ? (
            <Button 
              onClick={handleStop} 
              disabled={isStopping}
              className="bg-red-500 hover:bg-red-600"
            >
              <Square className="w-4 h-4 mr-2" />
              {isStopping ? 'Stopping...' : 'Stop Detection'}
            </Button>
          ) : (
            <Button 
              onClick={handleStart} 
              disabled={isStarting}
              className="bg-green-500 hover:bg-green-600"
            >
              <Play className="w-4 h-4 mr-2" />
              {isStarting ? 'Starting...' : 'Start Detection'}
            </Button>
          )}
          
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">System Status</p>
              <p className={`text-lg font-semibold ${status?.running ? 'text-green-600' : 'text-gray-400'}`}>
                {status?.running ? 'Running' : 'Stopped'}
              </p>
            </div>
            <div className={`p-2 rounded-full ${status?.running ? 'bg-green-100' : 'bg-gray-100'}`}>
              {status?.running ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Streams</p>
              <p className="text-lg font-semibold text-blue-600">
                {status?.active_streams || 0}
              </p>
            </div>
            <div className="p-2 rounded-full bg-blue-100">
              <Monitor className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Detections</p>
              <p className="text-lg font-semibold text-purple-600">
                {stats?.detector.total_detections || 0}
              </p>
            </div>
            <div className="p-2 rounded-full bg-purple-100">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Processing FPS</p>
              <p className="text-lg font-semibold text-orange-600">
                {stats?.detector.processing_fps?.toFixed(1) || '0.0'}
              </p>
            </div>
            <div className="p-2 rounded-full bg-orange-100">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {stats && (
        <div className="bg-white rounded-lg shadow border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Inference Performance</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Inference Time:</span>
                  <span className="text-sm font-medium">{stats.detector.inference_time_ms?.toFixed(1)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Frames Processed:</span>
                  <span className="text-sm font-medium">{stats.detector.total_frames_processed.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Model Swaps:</span>
                  <span className="text-sm font-medium">{stats.detector.model_swaps}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">AI Model Info</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`text-sm font-medium ${stats.model.loaded ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.model.loaded ? 'Loaded' : 'Not Loaded'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Device:</span>
                  <span className="text-sm font-medium">{stats.model.device_info}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Configuration</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Confidence Threshold:</span>
                  <span className="text-sm font-medium">{(status?.config.confidence_threshold || 0) * 100}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Auto PiP:</span>
                  <span className={`text-sm font-medium ${status?.config.auto_start_pip ? 'text-green-600' : 'text-gray-600'}`}>
                    {status?.config.auto_start_pip ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Detections */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Recent Detections</h3>
            <Button variant="ghost" size="sm" onClick={fetchData}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="p-6">
          {recentDetections.length === 0 ? (
            <div className="text-center py-8">
              <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Recent Detections</h4>
              <p className="text-gray-500">
                {status?.running 
                  ? 'Ad detection is running. Detections will appear here when ads are found.'
                  : 'Start ad detection to begin monitoring for advertisements.'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentDetections.map((detection) => (
                <div key={detection.detection_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <Video className="w-5 h-5 text-blue-500" />
                      <span className="font-medium text-gray-900">{detection.stream_id}</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getAdTypeColor(detection.ad_type)}`}>
                        {detection.ad_type}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{formatRelativeTime(detection.timestamp)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      Confidence: <span className="font-medium">{(detection.confidence * 100).toFixed(1)}%</span>
                    </span>
                    {detection.bounding_box && (
                      <span className="text-gray-600">
                        Position: {Math.round(detection.bounding_box.x * 100)}%, {Math.round(detection.bounding_box.y * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}