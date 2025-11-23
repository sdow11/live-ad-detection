import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentApi, type Content, type ContentCreateData, type ContentFilter, type ContentUpdateData } from '@/lib/api';

/**
 * Content Management Hooks
 * 
 * Custom React hooks for managing content operations with React Query
 * Provides optimistic updates, caching, and error handling
 */

// Query Keys
export const contentKeys = {
  all: ['content'] as const,
  lists: () => [...contentKeys.all, 'list'] as const,
  list: (filter?: ContentFilter) => [...contentKeys.lists(), filter] as const,
  details: () => [...contentKeys.all, 'detail'] as const,
  detail: (id: string) => [...contentKeys.details(), id] as const,
  stats: () => [...contentKeys.all, 'stats'] as const,
};

// Get content list with filtering
export function useContent(filter?: ContentFilter) {
  return useQuery({
    queryKey: contentKeys.list(filter),
    queryFn: () => contentApi.getContent(filter),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// Get single content item
export function useContentById(id: string) {
  return useQuery({
    queryKey: contentKeys.detail(id),
    queryFn: () => contentApi.getContentById(id),
    enabled: !!id,
  });
}

// Get content stats
export function useContentStats() {
  return useQuery({
    queryKey: contentKeys.stats(),
    queryFn: () => contentApi.getContentStats(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Upload content mutation
export function useUploadContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: ContentCreateData }) =>
      contentApi.uploadContent(file, metadata),
    onSuccess: (data) => {
      // Invalidate content lists to refetch
      queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: contentKeys.stats() });
      
      // Add the new content to cache
      queryClient.setQueryData(contentKeys.detail(data.data.id), data);
    },
  });
}

// Update content mutation
export function useUpdateContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContentUpdateData }) =>
      contentApi.updateContent(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: contentKeys.detail(id) });

      // Snapshot previous value
      const previousContent = queryClient.getQueryData(contentKeys.detail(id));

      // Optimistically update
      queryClient.setQueryData(contentKeys.detail(id), (old: any) => {
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

      return { previousContent };
    },
    onError: (err, { id }, context) => {
      // Revert optimistic update on error
      if (context?.previousContent) {
        queryClient.setQueryData(contentKeys.detail(id), context.previousContent);
      }
    },
    onSettled: (data, error, { id }) => {
      // Invalidate queries after mutation
      queryClient.invalidateQueries({ queryKey: contentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
    },
  });
}

// Delete content mutation
export function useDeleteContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contentApi.deleteContent(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: contentKeys.lists() });

      // Remove from all list queries
      queryClient.setQueriesData(
        { queryKey: contentKeys.lists() },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((item: Content) => item.id !== id),
          };
        }
      );

      // Remove detail query
      queryClient.removeQueries({ queryKey: contentKeys.detail(id) });
    },
    onError: () => {
      // Refetch on error to restore correct state
      queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.stats() });
    },
  });
}

// Get content URL mutation (for temporary URLs)
export function useGetContentUrl() {
  return useMutation({
    mutationFn: (id: string) => contentApi.getContentUrl(id),
  });
}