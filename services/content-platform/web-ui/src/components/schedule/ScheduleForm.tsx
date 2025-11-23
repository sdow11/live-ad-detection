'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useContent } from '@/hooks/useContent';
import { useCreateSchedule, useUpdateSchedule, useValidateCron, usePreviewExecutions } from '@/hooks/useSchedule';
import { Schedule, ScheduleCreateData, ScheduleUpdateData } from '@/lib/api';
import { getCommonTimezones, formatDate } from '@/lib/utils';
import { Calendar, Clock, Play, AlertCircle, CheckCircle, Info } from 'lucide-react';

/**
 * Schedule Form Component
 * 
 * Form for creating and editing content schedules
 * Includes cron expression validation and preview functionality
 */

const scheduleSchema = z.object({
  contentId: z.string().min(1, 'Please select content'),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  isActive: z.boolean().default(true),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

interface ScheduleFormProps {
  schedule?: Schedule;
  onSubmit?: (scheduleId: string) => void;
  onCancel?: () => void;
}

const cronPresets = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Daily at 6 PM', value: '0 18 * * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  { label: 'Weekends at 10 AM', value: '0 10 * * 6,0' },
  { label: 'Weekly on Monday', value: '0 9 * * 1' },
  { label: 'Monthly on 1st', value: '0 9 1 * *' },
];

export function ScheduleForm({ schedule, onSubmit, onCancel }: ScheduleFormProps) {
  const [cronValidation, setCronValidation] = useState<{ isValid: boolean; errors: string[] } | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: contentData } = useContent({ limit: 100 });
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const validateCronMutation = useValidateCron();
  const previewMutation = usePreviewExecutions();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      isActive: true,
      timezone: 'America/New_York',
      cronExpression: '0 9 * * *', // Daily at 9 AM
    },
  });

  // Watch form values for validation and preview
  const watchedCron = watch('cronExpression');
  const watchedTimezone = watch('timezone');

  // Load schedule data if editing
  useEffect(() => {
    if (schedule) {
      reset({
        contentId: schedule.contentId,
        name: schedule.name,
        description: schedule.description || '',
        startDate: schedule.startDate.split('T')[0], // Convert to date string
        endDate: schedule.endDate ? schedule.endDate.split('T')[0] : '',
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
        isActive: schedule.isActive,
      });
    }
  }, [schedule, reset]);

  // Validate cron expression when it changes
  useEffect(() => {
    if (watchedCron) {
      const validateCron = async () => {
        try {
          const result = await validateCronMutation.mutateAsync(watchedCron);
          setCronValidation(result.data);
        } catch (error) {
          setCronValidation({ isValid: false, errors: ['Invalid cron expression'] });
        }
      };

      const timeoutId = setTimeout(validateCron, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [watchedCron, validateCronMutation]);

  const handlePreview = async () => {
    if (!watchedCron || !watchedTimezone || !cronValidation?.isValid) return;

    try {
      const result = await previewMutation.mutateAsync({
        cronExpression: watchedCron,
        timezone: watchedTimezone,
        count: 5,
      });
      setPreview(result.data);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
    }
  };

  const onFormSubmit = async (data: ScheduleFormData) => {
    const formData = {
      ...data,
      startDate: new Date(data.startDate).toISOString(),
      endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
    };

    try {
      if (schedule) {
        // Update existing schedule
        await updateMutation.mutateAsync({
          id: schedule.id,
          data: formData as ScheduleUpdateData,
        });
        onSubmit?.(schedule.id);
      } else {
        // Create new schedule
        const result = await createMutation.mutateAsync(formData as ScheduleCreateData);
        onSubmit?.(result.data.id);
      }
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  };

  const content = contentData?.data || [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {schedule ? 'Edit Schedule' : 'Create Schedule'}
        </h2>
        <p className="mt-2 text-gray-600">
          Schedule content to play at specific times using cron expressions
        </p>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
        {/* Content Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Content *
          </label>
          <select
            {...register('contentId')}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select content to schedule</option>
            {content.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.contentType})
              </option>
            ))}
          </select>
          {errors.contentId && (
            <p className="mt-1 text-sm text-red-600">{errors.contentId.message}</p>
          )}
        </div>

        {/* Schedule Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Schedule Name *
          </label>
          <input
            {...register('name')}
            type="text"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter schedule name"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter schedule description (optional)"
          />
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Start Date *
            </label>
            <input
              {...register('startDate')}
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.startDate && (
              <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              End Date (Optional)
            </label>
            <input
              {...register('endDate')}
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Timezone *
          </label>
          <select
            {...register('timezone')}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {getCommonTimezones().map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          {errors.timezone && (
            <p className="mt-1 text-sm text-red-600">{errors.timezone.message}</p>
          )}
        </div>

        {/* Cron Expression */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Schedule (Cron Expression) *
          </label>
          
          {/* Cron Presets */}
          <div className="mt-2 mb-3">
            <p className="text-sm text-gray-600 mb-2">Quick presets:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {cronPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setValue('cronExpression', preset.value)}
                  className="text-xs py-1 px-2 bg-gray-100 hover:bg-gray-200 rounded border text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <input
            {...register('cronExpression')}
            type="text"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="0 9 * * * (Daily at 9 AM)"
          />
          
          <div className="mt-2 text-sm text-gray-500">
            <p>Format: minute hour day month weekday</p>
            <p>Example: "0 9 * * 1-5" = Weekdays at 9:00 AM</p>
          </div>

          {/* Cron Validation */}
          {cronValidation && (
            <div className="mt-2">
              {cronValidation.isValid ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Valid cron expression</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Invalid cron expression</span>
                  </div>
                  {cronValidation.errors.map((error, index) => (
                    <p key={index} className="text-sm text-red-600 ml-6">
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {errors.cronExpression && (
            <p className="mt-1 text-sm text-red-600">{errors.cronExpression.message}</p>
          )}
        </div>

        {/* Preview Button */}
        {cronValidation?.isValid && (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="w-full"
            >
              <Clock className="w-4 h-4 mr-2" />
              Preview Next 5 Executions
            </Button>

            {showPreview && preview.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-md">
                <div className="flex items-center space-x-2 mb-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    Next 5 scheduled executions:
                  </span>
                </div>
                <ul className="space-y-1">
                  {preview.map((date, index) => (
                    <li key={index} className="text-sm text-blue-800">
                      {formatDate(date)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Active Toggle */}
        <div className="flex items-center">
          <input
            {...register('isActive')}
            type="checkbox"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-700">
            Start this schedule immediately
          </label>
        </div>

        {/* Error Messages */}
        {(createMutation.error || updateMutation.error) && (
          <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">
              {createMutation.error?.message || updateMutation.error?.message}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-3 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || !cronValidation?.isValid}
            className="flex-1"
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>{schedule ? 'Updating...' : 'Creating...'}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{schedule ? 'Update Schedule' : 'Create Schedule'}</span>
              </div>
            )}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}