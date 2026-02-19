import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';
import { Activity, ActivityType } from '../types/prospect';

interface ActivityFormData {
  title: string;
  description?: string;
  date: Date;
  type: ActivityType;
  duration?: number;
  status?: 'to_do' | 'scheduled' | 'completed' | 'cancelled' | 'draft';
  contacts?: string[];
  attachments?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

type ActivityScope = 'opportunity' | 'prospect' | 'contact';

export const useActivityOperations = (params?: { entityType: ActivityScope; entityId: string }) => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Compute scoped list key and endpoint based on provided params
  const listKey = params?.entityType === 'opportunity'
    ? queryKeys.activities.byOpportunity(params.entityId)
    : params?.entityType === 'prospect'
    ? queryKeys.activities.byProspect(params.entityId)
    : params?.entityType === 'contact'
    ? queryKeys.activities.byContact(params.entityId)
    : queryKeys.activities.list();

  const listEndpoint = params?.entityType && params?.entityId
    ? `api/activities/${params.entityType}/${params.entityId}`
    : 'api/activities';

  // Use useQuery for fetching activities
  const activitiesQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(listEndpoint, "GET", null);
      if (apiError) throw new Error(apiError);
      
      const activitiesData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process date fields
      return activitiesData.map((activity: any) => ({
        ...activity,
        date: new Date(activity.date),
        createdAt: new Date(activity.createdAt),
        updatedAt: activity.updatedAt ? new Date(activity.updatedAt) : undefined,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const deleteMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await requestWithAuth(
        `api/activities/${activityId}`,
        'DELETE',
        null
      );
      if (error) throw new Error(error);
    },
    onMutate: async (activityId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.activities.detail(activityId) });

      // Snapshot the previous values
      const previousActivities = queryClient.getQueryData(listKey);
      const previousActivity = queryClient.getQueryData(queryKeys.activities.detail(activityId));

      // Optimistically remove from cache
      queryClient.setQueryData(listKey, (old: Activity[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((activity: Activity) => activity._id !== activityId);
      });

      return { previousActivities, previousActivity };
    },
    onError: (_err, activityId, context) => {
      // Rollback on error
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousActivity) {
        queryClient.setQueryData(queryKeys.activities.detail(activityId), context.previousActivity);
      }
    },
    onSettled: (_data, _error, activityId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.detail(activityId) });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (activityData: ActivityFormData) => {
      const { data, error } = await requestWithAuth(
        'api/activities',
        'POST',
        activityData
      );
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ activityId, activityData }: { activityId: string; activityData: Partial<ActivityFormData> }) => {
      const { data, error } = await requestWithAuth(
        `api/activities/${activityId}`,
        'PUT',
        activityData
      );
      if (error) throw new Error(error);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.activities.detail(variables.activityId) });

      // Snapshot the previous values
      const previousActivities = queryClient.getQueryData(listKey);
      const previousActivity = queryClient.getQueryData(queryKeys.activities.detail(variables.activityId));

      // Optimistically update the cache
      queryClient.setQueryData(listKey, (old: Activity[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((activity: Activity) =>
          activity._id === variables.activityId
            ? { ...activity, ...variables.activityData }
            : activity
        );
      });

      // Also update individual activity cache if it exists
      queryClient.setQueryData(queryKeys.activities.detail(variables.activityId), (old: Activity) => {
        if (!old) return old;
        return { ...old, ...variables.activityData };
      });

      return { previousActivities, previousActivity };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousActivity) {
        queryClient.setQueryData(queryKeys.activities.detail(variables.activityId), context.previousActivity);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.detail(variables.activityId) });
    },
  });

  const deleteActivity = async (activityId: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(activityId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete activity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const createActivity = async (activityData: ActivityFormData) => {
    setError(null);
    try {
      const data = await createMutation.mutateAsync(activityData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create activity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateActivity = async (activityId: string, activityData: Partial<ActivityFormData>) => {
    setError(null);
    try {
      const data = await updateMutation.mutateAsync({ activityId, activityData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update activity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const fetchActivityDetails = async (activityId: string) => {
    setError(null);
    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.activities.detail(activityId),
        queryFn: async () => requestWithAuth(`api/activities/${activityId}`, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      if (data && (data._id || (data.data && data.data._id))) {
        const activityData = data._id ? data : data.data;
        return { success: true, data: activityData };
      } else {
        return { success: false, error: "No activity data found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load activity details";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    activities: activitiesQuery.data || [],
    isLoadingActivities: activitiesQuery.isLoading,
    activitiesError: activitiesQuery.error,
    refetchActivities: activitiesQuery.refetch,
    
    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error,
    
    // Actions
    createActivity,
    updateActivity,
    deleteActivity,
    fetchActivityDetails,
    clearError,
  };
}; 