'use client';

import { useState } from 'react';
import { useContent, useDeleteContent } from '@/hooks/useContent';
import { Button } from '@/components/ui/button';
import { Content } from '@/lib/api';
import {
  FileVideo,
  FileImage,
  Play,
  Download,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  HardDrive,
  Filter,
  Grid3X3,
  List,
} from 'lucide-react';
import { formatFileSize, formatRelativeTime, getContentStatusColor, truncateText } from '@/lib/utils';

/**
 * Content List Component
 * 
 * Displays content in grid or list view with filtering and actions
 * Supports CRUD operations and content management
 */

interface ContentListProps {
  onEdit?: (content: Content) => void;
  onSchedule?: (content: Content) => void;
  onView?: (content: Content) => void;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'video' | 'image';
type SortType = 'newest' | 'oldest' | 'name' | 'size';

export function ContentList({ onEdit, onSchedule, onView }: ContentListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useContent({
    contentType: filter === 'all' ? undefined : filter,
    search: search || undefined,
    sortBy: sort === 'name' ? 'title' : sort === 'size' ? 'fileSize' : 'createdAt',
    sortOrder: sort === 'newest' ? 'desc' : 'asc',
    limit: 50,
  });

  const deleteMutation = useDeleteContent();

  const handleDelete = async (content: Content) => {
    if (confirm(`Are you sure you want to delete "${content.title}"?`)) {
      try {
        await deleteMutation.mutateAsync(content.id);
      } catch (error) {
        console.error('Failed to delete content:', error);
      }
    }
  };

  const getContentIcon = (contentType: string) => {
    return contentType === 'video' ? (
      <FileVideo className="w-5 h-5 text-blue-500" />
    ) : (
      <FileImage className="w-5 h-5 text-green-500" />
    );
  };

  const getStatusBadge = (status: string) => {
    const color = getContentStatusColor(status);
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 ${color}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
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
        <p className="text-red-600">Error loading content: {error.message}</p>
      </div>
    );
  }

  const content = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Content Library</h2>
        
        <div className="flex items-center space-x-2">
          {/* View Mode Toggle */}
          <div className="flex border rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filter by Type */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterType)}
          className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Types</option>
          <option value="video">Videos</option>
          <option value="image">Images</option>
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name A-Z</option>
          <option value="size">File Size</option>
        </select>
      </div>

      {/* Content Grid/List */}
      {content.length === 0 ? (
        <div className="text-center py-12">
          <FileVideo className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No content found</h3>
          <p className="text-gray-500">
            {search ? 'Try adjusting your search or filters' : 'Upload your first video or image to get started'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {content.map((item) => (
            <ContentCard
              key={item.id}
              content={item}
              onEdit={onEdit}
              onSchedule={onSchedule}
              onView={onView}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {content.map((item) => (
              <ContentListItem
                key={item.id}
                content={item}
                onEdit={onEdit}
                onSchedule={onSchedule}
                onView={onView}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContentCard({ 
  content, 
  onEdit, 
  onSchedule, 
  onView, 
  onDelete 
}: {
  content: Content;
  onEdit?: (content: Content) => void;
  onSchedule?: (content: Content) => void;
  onView?: (content: Content) => void;
  onDelete?: (content: Content) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow border hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-100 rounded-t-lg flex items-center justify-center">
        {content.thumbnailPath ? (
          <img
            src={content.thumbnailPath}
            alt={content.title}
            className="w-full h-full object-cover rounded-t-lg"
          />
        ) : (
          <div className="flex flex-col items-center space-y-2 text-gray-400">
            {getContentIcon(content.contentType)}
            <span className="text-sm">{content.contentType.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Content Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-900 truncate" title={content.title}>
            {truncateText(content.title, 30)}
          </h3>
          <div className="flex items-center space-x-1">
            {content.isPublic ? (
              <Eye className="w-4 h-4 text-green-500" title="Public" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-400" title="Private" />
            )}
          </div>
        </div>

        <div className="space-y-1 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>{formatFileSize(content.fileSize)}</span>
            {getStatusBadge(content.status)}
          </div>
          {content.duration && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{content.formattedDuration}</span>
            </div>
          )}
          <div className="flex items-center space-x-1">
            <Calendar className="w-3 h-3" />
            <span>{formatRelativeTime(content.createdAt)}</span>
          </div>
        </div>

        {/* Tags */}
        {content.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {content.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
              >
                {tag}
              </span>
            ))}
            {content.tags.length > 2 && (
              <span className="text-xs text-gray-500">+{content.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex space-x-1">
          {onView && (
            <Button variant="outline" size="sm" onClick={() => onView(content)}>
              <Play className="w-3 h-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(content)}>
              <Edit className="w-3 h-3" />
            </Button>
          )}
          {onSchedule && (
            <Button variant="outline" size="sm" onClick={() => onSchedule(content)}>
              <Calendar className="w-3 h-3" />
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" onClick={() => onDelete(content)}>
              <Trash2 className="w-3 h-3 text-red-500" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContentListItem({ 
  content, 
  onEdit, 
  onSchedule, 
  onView, 
  onDelete 
}: {
  content: Content;
  onEdit?: (content: Content) => void;
  onSchedule?: (content: Content) => void;
  onView?: (content: Content) => void;
  onDelete?: (content: Content) => void;
}) {
  return (
    <li className="px-4 py-4 hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        {/* Icon */}
        <div className="flex-shrink-0">
          {getContentIcon(content.contentType)}
        </div>

        {/* Content Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {content.title}
            </p>
            {content.isPublic ? (
              <Eye className="w-4 h-4 text-green-500" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-400" />
            )}
            {getStatusBadge(content.status)}
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>{formatFileSize(content.fileSize)}</span>
            {content.duration && <span>{content.formattedDuration}</span>}
            <span>{formatRelativeTime(content.createdAt)}</span>
          </div>
          {content.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {content.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1">
          {onView && (
            <Button variant="ghost" size="sm" onClick={() => onView(content)}>
              <Play className="w-4 h-4" />
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(content)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
          {onSchedule && (
            <Button variant="ghost" size="sm" onClick={() => onSchedule(content)}>
              <Calendar className="w-4 h-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(content)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function getContentIcon(contentType: string) {
  return contentType === 'video' ? (
    <FileVideo className="w-5 h-5 text-blue-500" />
  ) : (
    <FileImage className="w-5 h-5 text-green-500" />
  );
}