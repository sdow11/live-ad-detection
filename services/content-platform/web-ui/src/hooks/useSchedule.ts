import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scheduleApi, type Schedule, type ScheduleCreateData, type ScheduleUpdateData, type UpcomingExecution } from '@/lib/api';

/**
 * Schedule Management Hooks
 * 
 * Custom React hooks for managing schedule operations with React Query
 * Provides optimistic updates, caching, and error handling for scheduling
 */

// Query Keys
export const scheduleKeys = {
  all: ['schedule'] as const,
  lists: () => [...scheduleKeys.all, 'list'] as const,
  list: (filter?: any) => [...scheduleKeys.lists(), filter] as const,
  details: () => [...scheduleKeys.all, 'detail'] as const,
  detail: (id: string) => [...scheduleKeys.details(), id] as const,
  upcoming: () => [...scheduleKeys.all, 'upcoming'] as const,
  history: (id: string) => [...scheduleKeys.all, 'history', id] as const,
};

// Get schedules list with filtering
export function useSchedules(filter?: any) {
  return useQuery({
    queryKey: scheduleKeys.list(filter),
    queryFn: () => scheduleApi.getSchedules(filter),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// Get single schedule
export function useScheduleById(id: string) {
  return useQuery({
    queryKey: scheduleKeys.detail(id),
    queryFn: () => scheduleApi.getScheduleById(id),
    enabled: !!id,
  });
}

// Get upcoming executions
export function useUpcomingExecutions(limit = 10) {
  return useQuery({
    queryKey: scheduleKeys.upcoming(),
    queryFn: () => scheduleApi.getUpcomingExecutions(limit),
    staleTime: 1000 * 30, // 30 seconds (more frequent updates)
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

// Get execution history
export function useExecutionHistory(scheduleId: string, limit = 50) {
  return useQuery({
    queryKey: scheduleKeys.history(scheduleId),
    queryFn: () => scheduleApi.getExecutionHistory(scheduleId, limit),
    enabled: !!scheduleId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Create schedule mutation
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ScheduleCreateData) => scheduleApi.createSchedule(data),
    onSuccess: (data) => {
      // Invalidate schedules lists to refetch
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.upcoming() });
      
      // Add the new schedule to cache
      queryClient.setQueryData(scheduleKeys.detail(data.data.id), data);
    },
  });
}

// Update schedule mutation
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ScheduleUpdateData }) =>
      scheduleApi.updateSchedule(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: scheduleKeys.detail(id) });

      // Snapshot previous value
      const previousSchedule = queryClient.getQueryData(scheduleKeys.detail(id));

      // Optimistically update
      queryClient.setQueryData(scheduleKeys.detail(id), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            ...data,
            updatedAt: new Date().toISOString(),
          },
        };
      });

      return { previousSchedule };
    },
    onError: (err, { id }, context) => {
      // Revert optimistic update on error
      if (context?.previousSchedule) {
        queryClient.setQueryData(scheduleKeys.detail(id), context.previousSchedule);
      }
    },
    onSettled: (data, error, { id }) => {
      // Invalidate queries after mutation
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.upcoming() });
    },
  });
}

// Delete schedule mutation
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteSchedule(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: scheduleKeys.lists() });

      // Remove from all list queries
      queryClient.setQueriesData(
        { queryKey: scheduleKeys.lists() },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((item: Schedule) => item.id !== id),
          };
        }
      );

      // Remove detail query
      queryClient.removeQueries({ queryKey: scheduleKeys.detail(id) });
      queryClient.removeQueries({ queryKey: scheduleKeys.history(id) });
    },
    onError: () => {
      // Refetch on error to restore correct state
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.upcoming() });
    },
  });
}

// Toggle schedule mutation
export function useToggleSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      scheduleApi.toggleSchedule(id, isActive),
    onMutate: async ({ id, isActive }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: scheduleKeys.detail(id) });

      // Optimistically update
      queryClient.setQueryData(scheduleKeys.detail(id), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            isActive,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    onError: (err, { id }) => {
      // Refetch on error
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(id) });
    },
    onSettled: (data, error, { id }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.upcoming() });
    },
  });
}

// Validate cron expression mutation
export function useValidateCron() {
  return useMutation({
    mutationFn: (expression: string) => scheduleApi.validateCron(expression),
  });
}

// Preview schedule executions mutation
export function usePreviewExecutions() {
  return useMutation({
    mutationFn: ({
      cronExpression,
      timezone,
      count = 5,
    }: {
      cronExpression: string;
      timezone: string;
      count?: number;
    }) => scheduleApi.previewExecutions(cronExpression, timezone, count),
  });
}