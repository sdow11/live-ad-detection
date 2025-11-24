import React, { useState } from 'react';

/**
 * Stream Card Component
 * 
 * Individual stream card displaying stream information and controls.
 * Responsive design with mobile-optimized layout and accessibility features.
 */

interface Stream {
  id: string;
  title: string;
  status: { state: string; health: string };
  quality: { resolution: string; bitrate: number; framerate: number };
  currentViewers: number;
  isPublic: boolean;
  recordingEnabled: boolean;
  adDetectionEnabled: boolean;
  createdAt: Date;
  thumbnailUrl?: string | null;
}

interface StreamCardProps {
  stream: Stream;
  isMobile: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onQualityChange: (quality: any) => void;
  hasPermission: (permission: string) => boolean;
}

export const StreamCard: React.FC<StreamCardProps> = ({
  stream,
  isMobile,
  onStart,
  onStop,
  onPause,
  onQualityChange,
  hasPermission
}) => {
  const [showQualitySettings, setShowQualitySettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'live': return 'bg-green-500';
      case 'idle': return 'bg-gray-500';
      case 'paused': return 'bg-yellow-500';
      case 'stopped': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getHealthIndicator = (health: string) => {
    const colors = {
      good: 'text-green-500',
      poor: 'text-yellow-500',
      critical: 'text-red-500'
    };
    
    const messages = {
      good: 'Good Connection',
      poor: 'Connection Issues',
      critical: 'Critical Issues'
    };

    return (
      <div data-testid={`health-indicator-${health}`} className={`flex items-center space-x-1 ${colors[health as keyof typeof colors]}`}>
        <div className="w-2 h-2 rounded-full bg-current"></div>
        <span className="text-xs">{messages[health as keyof typeof messages]}</span>
      </div>
    );
  };

  const formatDuration = (createdAt: Date) => {
    const now = new Date();
    const diff = now.getTime() - createdAt.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleQualitySubmit = () => {
    const qualitySelect = document.getElementById(`quality-select-${stream.id}`) as HTMLSelectElement;
    const resolution = qualitySelect.value;
    
    const qualityMap = {
      '1920x1080': { resolution: '1920x1080', bitrate: 2500, framerate: 30 },
      '1280x720': { resolution: '1280x720', bitrate: 1500, framerate: 30 },
      '854x480': { resolution: '854x480', bitrate: 1000, framerate: 30 }
    };

    onQualityChange(qualityMap[resolution as keyof typeof qualityMap]);
    setShowQualitySettings(false);
  };

  const cardTestId = isMobile ? `mobile-stream-card-${stream.id}` : `stream-card-${stream.id}`;
  const CardComponent = isMobile ? `mobile-stream-card-${stream.id}` : `desktop-stream-card-${stream.id}`;

  return (
    <div data-testid={cardTestId} className={`bg-white rounded-lg shadow-sm border ${isMobile ? 'p-4' : 'p-6'} space-y-4`}>
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
        {stream.thumbnailUrl ? (
          <img
            src={stream.thumbnailUrl}
            alt={`${stream.title} thumbnail`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div data-testid="stream-thumbnail-placeholder" className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Stream Info */}
      <div>
        <h3 className="font-medium text-gray-900 truncate">{stream.title}</h3>
        
        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
          {/* Status */}
          <div className="flex items-center space-x-2">
            <div data-testid={`stream-status-${stream.status.state}`} className={`w-2 h-2 rounded-full ${getStatusColor(stream.status.state)}`}></div>
            <span className="capitalize">{stream.status.state}</span>
          </div>

          {/* Viewers */}
          <div>{stream.currentViewers} viewers</div>

          {/* Quality */}
          <div>{stream.quality.resolution}</div>
        </div>

        {/* Health Indicator */}
        <div className="mt-2">
          {getHealthIndicator(stream.status.health)}
        </div>
      </div>

      {/* Analytics Preview */}
      <div className="grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <div className="font-medium text-gray-900">{formatDuration(stream.createdAt)}</div>
          <div className="text-gray-500">Duration</div>
        </div>
        <div>
          <div className="font-medium text-gray-900">156 total views</div>
          <div className="text-gray-500">Total Views</div>
        </div>
        <div>
          <div className="font-medium text-gray-900">8 ads detected</div>
          <div className="text-gray-500">Ads Detected</div>
        </div>
      </div>

      {/* Controls */}
      {hasPermission('stream_manage') && (
        <div className="flex space-x-2">
          {stream.status.state === 'idle' || stream.status.state === 'stopped' ? (
            <button
              data-testid={`start-stream-${stream.id}`}
              onClick={onStart}
              className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600"
            >
              Start Stream
            </button>
          ) : (
            <>
              <button
                data-testid={`stop-stream-${stream.id}`}
                onClick={onStop}
                className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600"
              >
                Stop
              </button>
              <button
                onClick={onPause}
                className="flex-1 bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600"
              >
                Pause
              </button>
            </>
          )}
          
          <button
            data-testid={`quality-settings-${stream.id}`}
            onClick={() => setShowQualitySettings(true)}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
          >
            ⚙️
          </button>
        </div>
      )}

      {/* Expand Analytics Button */}
      <button
        data-testid={`expand-analytics-${stream.id}`}
        onClick={() => setShowAnalytics(!showAnalytics)}
        className="w-full text-center text-blue-600 hover:text-blue-800 text-sm"
      >
        {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
      </button>

      {/* Expanded Analytics */}
      {showAnalytics && (
        <div className="border-t pt-4 space-y-4">
          <div data-testid="viewer-chart" className="h-32 bg-gray-50 rounded flex items-center justify-center">
            <span className="text-gray-500">Viewer Chart Placeholder</span>
          </div>
          <div data-testid="ad-detection-chart" className="h-32 bg-gray-50 rounded flex items-center justify-center">
            <span className="text-gray-500">Ad Detection Chart Placeholder</span>
          </div>
        </div>
      )}

      {/* Quality Settings Modal */}
      {showQualitySettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Stream Quality Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor={`quality-select-${stream.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution
                </label>
                <select
                  id={`quality-select-${stream.id}`}
                  data-testid="quality-select"
                  defaultValue={stream.quality.resolution}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="1920x1080">1920x1080 (Full HD)</option>
                  <option value="1280x720">1280x720 (HD)</option>
                  <option value="854x480">854x480 (SD)</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleQualitySubmit}
                className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
              >
                Apply
              </button>
              <button
                onClick={() => setShowQualitySettings(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};