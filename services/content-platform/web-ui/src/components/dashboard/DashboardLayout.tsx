'use client';

import { useState } from 'react';
import { ContentUpload } from '@/components/content/ContentUpload';
import { ContentList } from '@/components/content/ContentList';
import { ScheduleForm } from '@/components/schedule/ScheduleForm';
import { ScheduleList } from '@/components/schedule/ScheduleList';
import { AdDetectionDashboard } from '@/components/detection/AdDetectionDashboard';
import { Button } from '@/components/ui/button';
import { Content, Schedule } from '@/lib/api';
import {
  Plus,
  Upload,
  Calendar,
  PlayCircle,
  BarChart3,
  Settings,
  Home,
  Menu,
  X,
  Brain,
} from 'lucide-react';

/**
 * Main Dashboard Layout
 * 
 * Integrates content and schedule management with a unified interface
 * Provides navigation, quick actions, and comprehensive content management
 */

type View = 'dashboard' | 'content' | 'schedules' | 'upload' | 'schedule-form' | 'analytics' | 'ad-detection';

interface DashboardLayoutProps {
  defaultView?: View;
}

export function DashboardLayout({ defaultView = 'dashboard' }: DashboardLayoutProps) {
  const [currentView, setCurrentView] = useState<View>(defaultView);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleContentEdit = (content: Content) => {
    console.log('Edit content:', content.id);
    // TODO: Implement content editing
  };

  const handleContentSchedule = (content: Content) => {
    setSelectedContent(content);
    setCurrentView('schedule-form');
  };

  const handleContentView = (content: Content) => {
    console.log('View content:', content.id);
    // TODO: Implement content preview/playback
  };

  const handleScheduleEdit = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setCurrentView('schedule-form');
  };

  const handleScheduleHistory = (schedule: Schedule) => {
    console.log('View schedule history:', schedule.id);
    // TODO: Implement execution history view
  };

  const handleUploadComplete = (contentId: string) => {
    console.log('Upload complete:', contentId);
    setCurrentView('content');
  };

  const handleScheduleSubmit = (scheduleId: string) => {
    console.log('Schedule submitted:', scheduleId);
    setSelectedContent(null);
    setSelectedSchedule(null);
    setCurrentView('schedules');
  };

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    { id: 'content', name: 'Content Library', icon: PlayCircle },
    { id: 'schedules', name: 'Schedules', icon: Calendar },
    { id: 'ad-detection', name: 'Ad Detection', icon: Brain },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
  ];

  const quickActions = [
    {
      id: 'upload',
      name: 'Upload Content',
      icon: Upload,
      action: () => setCurrentView('upload'),
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      id: 'schedule',
      name: 'Create Schedule',
      icon: Plus,
      action: () => {
        setSelectedContent(null);
        setSelectedSchedule(null);
        setCurrentView('schedule-form');
      },
      color: 'bg-green-500 hover:bg-green-600',
    },
  ];

  const renderContent = () => {
    switch (currentView) {
      case 'content':
        return (
          <ContentList
            onEdit={handleContentEdit}
            onSchedule={handleContentSchedule}
            onView={handleContentView}
          />
        );
      
      case 'schedules':
        return (
          <ScheduleList
            onEdit={handleScheduleEdit}
            onViewHistory={handleScheduleHistory}
          />
        );
      
      case 'upload':
        return (
          <ContentUpload
            onUploadComplete={handleUploadComplete}
            onCancel={() => setCurrentView('content')}
          />
        );
      
      case 'schedule-form':
        return (
          <ScheduleForm
            schedule={selectedSchedule || undefined}
            onSubmit={handleScheduleSubmit}
            onCancel={() => {
              setSelectedContent(null);
              setSelectedSchedule(null);
              setCurrentView('schedules');
            }}
          />
        );
      
      case 'ad-detection':
        return <AdDetectionDashboard />;
      
      case 'analytics':
        return (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Analytics Coming Soon</h3>
            <p className="text-gray-500">
              Detailed analytics and reporting features will be available soon.
            </p>
          </div>
        );
      
      case 'dashboard':
      default:
        return <DashboardOverview onNavigate={setCurrentView} />;
    }
  };

  const currentNavItem = navigation.find(item => item.id === currentView);
  const pageTitle = currentView === 'upload' ? 'Upload Content' 
                  : currentView === 'schedule-form' ? (selectedSchedule ? 'Edit Schedule' : 'Create Schedule')
                  : currentView === 'ad-detection' ? 'AI Ad Detection'
                  : currentNavItem?.name || 'Dashboard';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Content Platform</h1>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="mt-6">
          <div className="px-3 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id || 
                (item.id === 'content' && (currentView === 'upload')) ||
                (item.id === 'schedules' && (currentView === 'schedule-form'));
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </button>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mt-8 px-3">
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="mt-2 space-y-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    onClick={action.action}
                    className={`w-full justify-start text-white ${action.color}`}
                    size="sm"
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {action.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden text-gray-400 hover:text-gray-600"
                >
                  <Menu className="w-6 h-6" />
                </button>
                <h2 className="ml-4 lg:ml-0 text-2xl font-bold text-gray-900">
                  {pageTitle}
                </h2>
              </div>
              
              <div className="flex items-center space-x-4">
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

function DashboardOverview({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome to Content Platform</h2>
        <p className="text-blue-100 mb-4">
          Manage your content library and schedule automated playback with precision
        </p>
        <div className="flex space-x-4">
          <Button 
            onClick={() => onNavigate('upload')} 
            className="bg-white text-blue-600 hover:bg-gray-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Content
          </Button>
          <Button 
            onClick={() => onNavigate('schedule-form')} 
            variant="outline"
            className="border-white text-white hover:bg-white hover:text-blue-600"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Create Schedule
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Content', value: '24', change: '+3 this week', color: 'text-blue-600' },
          { label: 'Active Schedules', value: '8', change: '+2 this week', color: 'text-green-600' },
          { label: 'Executions Today', value: '156', change: '+12%', color: 'text-purple-600' },
          { label: 'Success Rate', value: '98.5%', change: '+0.3%', color: 'text-emerald-600' },
        ].map((stat, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Content */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Content</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('content')}>
              View All
            </Button>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Product Demo Video', type: 'video', uploaded: '2 hours ago' },
              { name: 'Brand Showcase', type: 'image', uploaded: '5 hours ago' },
              { name: 'Tutorial Series', type: 'video', uploaded: '1 day ago' },
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-3">
                {item.type === 'video' ? (
                  <PlayCircle className="w-5 h-5 text-blue-500" />
                ) : (
                  <PlayCircle className="w-5 h-5 text-green-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.uploaded}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Schedules */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Upcoming Schedules</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('schedules')}>
              View All
            </Button>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Morning Showcase', time: 'in 2 hours', status: 'active' },
              { name: 'Lunch Break Content', time: 'in 5 hours', status: 'active' },
              { name: 'Evening Highlights', time: 'in 8 hours', status: 'active' },
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.time}</p>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}