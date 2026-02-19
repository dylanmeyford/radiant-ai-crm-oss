import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import { PipelineStage } from '../types/pipeline';

interface CreateStageData {
  name: string;
  order: number;
  description?: string;
}

interface UpdateStageData {
  name?: string;
  order?: number;
  description?: string;
}

interface ReorderStagesData {
  stages: Array<{ id: string; order: number }>;
}

export function usePipelineStages(pipelineId: string | undefined) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Query key for this specific pipeline's stages
  const stagesQueryKey = pipelineId 
    ? queryKeys.pipelineStages.byPipeline(pipelineId)
    : queryKeys.pipelineStages.list();

  // Use TanStack Query for fetching pipeline stages
  const stagesQuery = useQuery({
    queryKey: stagesQueryKey,
    queryFn: async () => {
      if (!pipelineId) {
        return [];
      }
      
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/stages`, 
        "GET", 
        null
      );
      if (apiError) throw new Error(apiError);
      
      const stagesData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process dates and sort by order
      return stagesData
        .map((stage: any) => ({
          ...stage,
          createdAt: new Date(stage.createdAt),
          updatedAt: new Date(stage.updatedAt)
        }))
        .sort((a: any, b: any) => a.order - b.order);
    },
    enabled: !!pipelineId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const createMutation = useMutation({
    mutationFn: async (stageData: CreateStageData) => {
      if (!pipelineId) throw new Error("Pipeline ID is required");
      
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/stages`,
        "POST",
        stageData
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (newStage) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: stagesQueryKey });

      // Snapshot the previous value
      const previousStages = queryClient.getQueryData(stagesQueryKey);

      // Optimistically add the new stage
      queryClient.setQueryData(stagesQueryKey, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        const optimisticStage = {
          _id: `temp-${Date.now()}`,
          ...newStage,
          description: newStage.description || '',
          organization: 'temp',
          pipeline: pipelineId,
          isClosedWon: false,
          isClosedLost: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        return [...old, optimisticStage].sort((a, b) => a.order - b.order);
      });

      return { previousStages };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData(stagesQueryKey, context.previousStages);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: stagesQueryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ stageId, updates }: { stageId: string; updates: UpdateStageData }) => {
      if (!pipelineId) throw new Error("Pipeline ID is required");
      
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/stages/${stageId}`,
        "PUT",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: stagesQueryKey });

      // Snapshot the previous values
      const previousStages = queryClient.getQueryData(stagesQueryKey);

      // Optimistically update the stage
      queryClient.setQueryData(stagesQueryKey, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old
          .map((stage: PipelineStage) =>
            stage._id === variables.stageId
              ? { ...stage, ...variables.updates, updatedAt: new Date() }
              : stage
          )
          .sort((a, b) => a.order - b.order);
      });

      return { previousStages };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData(stagesQueryKey, context.previousStages);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: stagesQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (stageId: string) => {
      if (!pipelineId) throw new Error("Pipeline ID is required");
      
      const { error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/stages/${stageId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (stageId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: stagesQueryKey });

      // Snapshot the previous value
      const previousStages = queryClient.getQueryData(stagesQueryKey);

      // Optimistically remove the stage
      queryClient.setQueryData(stagesQueryKey, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((stage: PipelineStage) => stage._id !== stageId);
      });

      return { previousStages };
    },
    onError: (_err, _stageId, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData(stagesQueryKey, context.previousStages);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: stagesQueryKey });
      // Also refetch opportunities since they might reference this stage
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderData: ReorderStagesData) => {
      if (!pipelineId) throw new Error("Pipeline ID is required");
      
      const { data, error: apiError } = await requestWithAuth(
        `api/pipelines/${pipelineId}/stages/reorder`,
        "PATCH",
        reorderData
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: stagesQueryKey });

      // Snapshot the previous value
      const previousStages = queryClient.getQueryData(stagesQueryKey);

      // Optimistically update the order
      queryClient.setQueryData(stagesQueryKey, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        // Create a map of new orders
        const orderMap = new Map(
          variables.stages.map(s => [s.id, s.order])
        );
        
        return old
          .map((stage: PipelineStage) => ({
            ...stage,
            order: orderMap.get(stage._id) ?? stage.order,
            updatedAt: new Date()
          }))
          .sort((a, b) => a.order - b.order);
      });

      return { previousStages };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData(stagesQueryKey, context.previousStages);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: stagesQueryKey });
    },
  });

  // Wrapper functions for easier component usage
  const createStage = async (stageData: CreateStageData) => {
    setError(null);
    try {
      const data = await createMutation.mutateAsync(stageData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create stage";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateStage = async (stageId: string, updates: UpdateStageData) => {
    setError(null);
    try {
      const data = await updateMutation.mutateAsync({ stageId, updates });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update stage";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteStage = async (stageId: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(stageId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete stage";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const reorderStages = async (stages: Array<{ id: string; order: number }>) => {
    setError(null);
    try {
      const data = await reorderMutation.mutateAsync({ stages });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reorder stages";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    pipelineStages: stagesQuery.data || [],
    isLoadingStages: stagesQuery.isLoading,
    stagesError: stagesQuery.error,
    refetchStages: stagesQuery.refetch,
    
    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
    error,
    
    // Actions
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    clearError,
  };
}
