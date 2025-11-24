import React, { useState } from 'react';

/**
 * Create Stream Modal Component
 * 
 * Modal for creating new streams with form validation and accessibility features.
 */

interface CreateStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (streamData: any) => void;
}

export const CreateStreamModal: React.FC<CreateStreamModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isPublic: false,
    recordingEnabled: false,
    adDetectionEnabled: true,
    quality: {
      resolution: '1920x1080',
      bitrate: 2500,
      framerate: 30,
      codec: 'h264'
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Stream title is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when field is updated
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div data-testid="create-stream-modal" className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-6">Create New Stream</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Stream Title */}
          <div>
            <label htmlFor="stream-title" className="block text-sm font-medium text-gray-700 mb-2">
              Stream Title
            </label>
            <input
              id="stream-title"
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter stream title"
            />
            {errors.title && (
              <p className="text-red-500 text-sm mt-1">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="stream-description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="stream-description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Enter stream description (optional)"
            />
          </div>

          {/* Stream Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Stream Settings</h3>
            
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => handleChange('isPublic', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Public Stream</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.recordingEnabled}
                  onChange={(e) => handleChange('recordingEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Enable Recording</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.adDetectionEnabled}
                  onChange={(e) => handleChange('adDetectionEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Enable Ad Detection</span>
              </label>
            </div>
          </div>

          {/* Quality Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Quality Settings</h3>
            <select
              value={formData.quality.resolution}
              onChange={(e) => {
                const qualityMap = {
                  '1920x1080': { resolution: '1920x1080', bitrate: 2500, framerate: 30, codec: 'h264' },
                  '1280x720': { resolution: '1280x720', bitrate: 1500, framerate: 30, codec: 'h264' },
                  '854x480': { resolution: '854x480', bitrate: 1000, framerate: 30, codec: 'h264' }
                };
                handleChange('quality', qualityMap[e.target.value as keyof typeof qualityMap]);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="1920x1080">1920x1080 (Full HD)</option>
              <option value="1280x720">1280x720 (HD)</option>
              <option value="854x480">854x480 (SD)</option>
            </select>
          </div>

          {/* Form Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
            >
              Create Stream
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};