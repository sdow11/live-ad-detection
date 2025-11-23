'use client';

import { useState } from 'react';
import { useSchedules, useDeleteSchedule, useToggleSchedule } from '@/hooks/useSchedule';
import { Button } from '@/components/ui/button';
import { Schedule } from '@/lib/api';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  History,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { formatDate, formatRelativeTime, getScheduleStatusColor } from '@/lib/utils';

/**
 * Schedule List Component
 * 
 * Displays schedules with filtering, status indicators, and management actions
 * Shows execution history and upcoming schedule information
 */

interface ScheduleListProps {
  onEdit?: (schedule: Schedule) => void;
  onViewHistory?: (schedule: Schedule) => void;
}

type FilterType = 'all' | 'active' | 'inactive' | 'error';

export function ScheduleList({ onEdit, onViewHistory }: ScheduleListProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading, error, refetch } = useSchedules({
    isActive: filter === 'all' ? undefined : filter === 'active',
    sortBy: 'nextExecutionAt',
    sortOrder: 'asc',
  });

  const deleteMutation = useDeleteSchedule();
  const toggleMutation = useToggleSchedule();

  const handleDelete = async (schedule: Schedule) => {
    if (confirm(`Are you sure you want to delete the schedule "${schedule.name}"?`)) {
      try {
        await deleteMutation.mutateAsync(schedule.id);
      } catch (error) {
        console.error('Failed to delete schedule:', error);
      }
    }
  };

  const handleToggle = async (schedule: Schedule) => {
    try {
      await toggleMutation.mutateAsync({
        id: schedule.id,
        isActive: !schedule.isActive,
      });
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'inactive':
        return <Pause className="w-5 h-5 text-gray-400" />;
      case 'expired':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.9) return 'text-green-600';
    if (rate >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Error loading schedules: {error.message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const schedules = data?.data || [];
  const filteredSchedules = schedules.filter((schedule) => {
    if (filter === 'all') return true;
    if (filter === 'active') return schedule.isActive && schedule.status === 'active';
    if (filter === 'inactive') return !schedule.isActive || schedule.status === 'inactive';
    if (filter === 'error') return schedule.status === 'error';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Content Schedules</h2>
        
        <div className="flex items-center space-x-4">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Schedules</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="error">Error</option>
          </select>

          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', count: schedules.length, color: 'text-gray-600' },
          { label: 'Active', count: schedules.filter(s => s.isActive).length, color: 'text-green-600' },
          { label: 'Inactive', count: schedules.filter(s => !s.isActive).length, color: 'text-gray-600' },
          { label: 'Errors', count: schedules.filter(s => s.status === 'error').length, color: 'text-red-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className={`text-2xl font-semibold ${stat.color}`}>{stat.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Schedule List */}
      {filteredSchedules.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules found</h3>
          <p className="text-gray-500">
            {filter === 'all' 
              ? 'Create your first schedule to automate content playback'
              : `No ${filter} schedules found. Try adjusting your filter.`
            }
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="space-y-4">
              {filteredSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  onEdit={onEdit}
                  onViewHistory={onViewHistory}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  onViewHistory,
  onDelete,
  onToggle,
}: {
  schedule: Schedule;
  onEdit?: (schedule: Schedule) => void;
  onViewHistory?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
  onToggle?: (schedule: Schedule) => void;
}) {
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'inactive':
        return <Pause className="w-5 h-5 text-gray-400" />;
      case 'expired':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.9) return 'text-green-600';
    if (rate >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatTimeUntilNext = (timeMs: number | undefined) => {
    if (!timeMs) return null;
    
    const hours = Math.floor(timeMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (timeMs < 0) {
      return <span className="text-red-600">Overdue</span>;
    }
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    
    return `${minutes}m`;
  };

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3 mb-2">
            {getStatusIcon(schedule.status)}
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {schedule.name}
            </h3>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getScheduleStatusColor(schedule.status)} bg-gray-100`}>
              {schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1)}
            </span>
            {schedule.isOverdue && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Overdue
              </span>
            )}
          </div>

          {schedule.description && (
            <p className="text-sm text-gray-600 mb-2">{schedule.description}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Schedule</p>
              <p className="font-mono text-gray-900">{schedule.cronExpression}</p>
              <p className="text-xs text-gray-500">{schedule.timezone}</p>
            </div>

            <div>
              <p className="text-gray-500">Next Execution</p>
              {schedule.nextExecutionAt ? (
                <div>
                  <p className="text-gray-900">{formatDate(schedule.nextExecutionAt)}</p>
                  <p className="text-xs text-gray-500">
                    in {formatTimeUntilNext(schedule.timeUntilNextExecution)}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500">Not scheduled</p>
              )}
            </div>

            <div>
              <p className="text-gray-500">Success Rate</p>
              <p className={`font-medium ${getSuccessRateColor(schedule.successRate)}`}>
                {(schedule.successRate * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                {schedule.executionCount} executions
              </p>
            </div>

            <div>
              <p className="text-gray-500">Last Executed</p>
              {schedule.lastExecutedAt ? (
                <div>
                  <p className="text-gray-900">{formatRelativeTime(schedule.lastExecutedAt)}</p>
                  {schedule.failureCount > 0 && (
                    <p className="text-xs text-red-600">
                      {schedule.failureCount} failures
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Never</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          {onToggle && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggle(schedule)}
              title={schedule.isActive ? 'Pause schedule' : 'Activate schedule'}
            >
              {schedule.isActive ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          )}

          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(schedule)}
              title="Edit schedule"
            >
              <Edit className="w-4 h-4" />
            </Button>
          )}

          {onViewHistory && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewHistory(schedule)}
              title="View execution history"
            >
              <History className="w-4 h-4" />
            </Button>
          )}

          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(schedule)}
              title="Delete schedule"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}