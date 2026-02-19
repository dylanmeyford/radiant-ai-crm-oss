import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import { Pipeline } from '../types/pipeline';

interface CreatePipelineData {
  name: string;
  description?: string;
}

interface UpdatePipelineData {
  name?: string;
  description?: string;
}

export function usePipelines() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching pipelines
  const pipelinesQuery = useQuery({
    queryKey: queryKeys.pipelines.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/pipelines", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const pipelinesData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process dates
      return pipelinesData.map((pipeline: any) => ({
        ...pipeline,
        createdAt: new Date(pipeline.createdAt),
        updatedAt: new Date(pipeline.updatedAt)
      })) as Pipeline[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Query for default pipeline
  const defaultPipelineQuery = useQuery({
    queryKey: queryKeys.pipelines.default(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/pipelines/default", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const pipelineData = data?.data || data;
      if (!pipelineData) return null;
      
      return {
        ...pipelineData,
        createdAt: new Date(pipelineData.createdAt),
        updatedAt: new Date(pipelineData.updatedAt)
      } as Pipeline;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (pipelineData: CreatePipelineData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/pipelines",
        "POST",
        pipelineData
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (newPipeline) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.pipelines.list() });

      // Snapshot the previous value
      const previousPipelines = queryClient.getQueryData(queryKeys.pipelines.list());

      // Optimistically add the new pipeline
      queryClient.setQueryData(queryKeys.pipelines.list(), (old: Pipeline[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        
        const optimisticPipeline: Pipeline = {
          _id: `temp-${Date.now()}`,
          name: newPipeline.name,
          description: newPipeline.description || '',
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        return [...old, optimisticPipeline];
      });

      return { previousPipelines };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousPipelines) {
        queryClient.setQueryData(queryKeys.pipelines.list(), context.previousPipelines);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list() });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ pipelineId, updates }: { pipelineId: string; updates: UpdatePipelineData }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}`,
        "PUT",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.pipelines.list() });

      // Snapshot the previous values
      const previousPipelines = queryClient.getQueryData(queryKeys.pipelines.list());

      // Optimistically update the pipeline
      queryClient.setQueryData(queryKeys.pipelines.list(), (old: Pipeline[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((pipeline: Pipeline) =>
          pipeline._id === variables.pipelineId
            ? { ...pipeline, ...variables.updates, updatedAt: new Date() }
            : pipeline
        );
      });

      return { previousPipelines };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousPipelines) {
        queryClient.setQueryData(queryKeys.pipelines.list(), context.previousPipelines);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (pipelineId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.pipelines.list() });

      // Snapshot the previous value
      const previousPipelines = queryClient.getQueryData(queryKeys.pipelines.list());

      // Optimistically remove the pipeline
      queryClient.setQueryData(queryKeys.pipelines.list(), (old: Pipeline[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((pipeline: Pipeline) => pipeline._id !== pipelineId);
      });

      return { previousPipelines };
    },
    onError: (_err, _pipelineId, context) => {
      // Rollback on error
      if (context?.previousPipelines) {
        queryClient.setQueryData(queryKeys.pipelines.list(), context.previousPipelines);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list() });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/set-default`,
        "PATCH",
        null
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (pipelineId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.pipelines.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.pipelines.default() });

      // Snapshot the previous values
      const previousPipelines = queryClient.getQueryData(queryKeys.pipelines.list());
      const previousDefault = queryClient.getQueryData(queryKeys.pipelines.default());

      // Optimistically update the default pipeline
      queryClient.setQueryData(queryKeys.pipelines.list(), (old: Pipeline[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((pipeline: Pipeline) => ({
          ...pipeline,
          isDefault: pipeline._id === pipelineId,
          updatedAt: pipeline._id === pipelineId ? new Date() : pipeline.updatedAt
        }));
      });

      return { previousPipelines, previousDefault };
    },
    onError: (_err, _pipelineId, context) => {
      // Rollback on error
      if (context?.previousPipelines) {
        queryClient.setQueryData(queryKeys.pipelines.list(), context.previousPipelines);
      }
      if (context?.previousDefault) {
        queryClient.setQueryData(queryKeys.pipelines.default(), context.previousDefault);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.default() });
    },
  });

  // Wrapper functions for easier component usage
  const createPipeline = async (pipelineData: CreatePipelineData) => {
    setError(null);
    try {
      const data = await createMutation.mutateAsync(pipelineData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create pipeline";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updatePipeline = async (pipelineId: string, updates: UpdatePipelineData) => {
    setError(null);
    try {
      const data = await updateMutation.mutateAsync({ pipelineId, updates });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update pipeline";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deletePipeline = async (pipelineId: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(pipelineId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete pipeline";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const setDefaultPipeline = async (pipelineId: string) => {
    setError(null);
    try {
      const data = await setDefaultMutation.mutateAsync(pipelineId);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to set default pipeline";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  // Helper to get default pipeline from list or dedicated query
  const defaultPipeline = defaultPipelineQuery.data || 
    pipelinesQuery.data?.find((p: Pipeline) => p.isDefault) || 
    pipelinesQuery.data?.[0] || 
    null;

  return {
    // Query data and states
    pipelines: pipelinesQuery.data || [],
    defaultPipeline,
    isLoadingPipelines: pipelinesQuery.isLoading,
    isLoadingDefault: defaultPipelineQuery.isLoading,
    pipelinesError: pipelinesQuery.error,
    refetchPipelines: pipelinesQuery.refetch,
    
    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSettingDefault: setDefaultMutation.isPending,
    error,
    
    // Actions
    createPipeline,
    updatePipeline,
    deletePipeline,
    setDefaultPipeline,
    clearError,
  };
}
