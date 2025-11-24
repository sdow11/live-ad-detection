import React from 'react';

/**
 * Analytics Panel Component
 * 
 * Displays stream analytics and metrics with charts and statistics.
 */

interface AnalyticsPanelProps {
  'data-testid'?: string;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ 'data-testid': testId }) => {
  return (
    <div data-testid={testId || 'analytics-panel'} className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Stream Analytics</h2>
        
        {/* Analytics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-blue-600">1,234</div>
            <div className="text-sm text-gray-600">Total Views</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-green-600">89</div>
            <div className="text-sm text-gray-600">Active Streams</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-purple-600">456</div>
            <div className="text-sm text-gray-600">Ads Detected</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-orange-600">23m</div>
            <div className="text-sm text-gray-600">Avg Watch Time</div>
          </div>
        </div>

        {/* Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-medium mb-4">Viewer Trends</h3>
            <div className="h-64 bg-gray-50 rounded flex items-center justify-center">
              <span className="text-gray-500">Viewer Trends Chart</span>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-medium mb-4">Ad Detection Performance</h3>
            <div className="h-64 bg-gray-50 rounded flex items-center justify-center">
              <span className="text-gray-500">Ad Detection Chart</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};