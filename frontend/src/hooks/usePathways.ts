import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';

interface PathwayStep {
  name: string;
  description?: string;
  order?: number;
  _id?: string;
}

export interface Pathway {
  _id: string;
  name: string;
  description?: string;
  steps: PathwayStep[] | string[];
  isDefault: boolean;
  createdAt: Date;
}

export interface PathwayProgress {
  stepId: string;
  name: string;
  description?: string;
  order: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  updatedAt: Date | null;
  updatedBy?: any;
  notes?: string | null;
}

export interface PathwayProgressData {
  salesRoom: {
    id: string;
    name: string;
    description: string;
  };
  pathway: {
    id: string;
    name: string;
    description?: string;
  };
  progress: {
    completedSteps: number;
    totalSteps: number;
    percentComplete: number;
    currentStep: PathwayProgress | null;
  };
  steps: PathwayProgress[];
}

interface CreatePathwayData {
  name: string;
  description?: string;
  steps: PathwayStep[];
}

interface AssignPathwayData {
  salesRoomId: string;
  pathwayId: string;
  setDefault?: boolean;
}

interface UpdateProgressData {
  salesRoomId: string;
  stepId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;
}

export function usePathways() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching pathways
  const pathwaysQuery = useQuery({
    queryKey: queryKeys.pathways.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth('api/digital-sales-rooms/pathways', 'GET', null);
      if (apiError) throw new Error(apiError);
      
      const pathwaysData = Array.isArray(data) ? data : (data?.data || []);
      return pathwaysData.map((pathway: any) => ({
        ...pathway,
        createdAt: new Date(pathway.createdAt)
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Query for pathway progress (authenticated)
  const getPathwayProgressQuery = (salesRoomId: string) => useQuery({
    queryKey: queryKeys.pathways.progress(salesRoomId),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(`api/digital-sales-rooms/${salesRoomId}/sales-progress`, 'GET', null);
      if (apiError) throw new Error(apiError);
      
      const progressData = data?.data || data;
      return {
        ...progressData,
        steps: progressData.steps?.map((step: any) => ({
          ...step,
          updatedAt: step.updatedAt ? new Date(step.updatedAt) : null
        })) || []
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (progress changes more frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!salesRoomId,
  });

  // Query for public pathway progress
  const getPathwayProgressPublicQuery = (salesRoomId: string) => useQuery({
    queryKey: queryKeys.pathways.progressPublic(salesRoomId),
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${baseUrl}/api/digital-sales-rooms/public/${salesRoomId}/pathway-progress`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get pathway progress');
      }
      
      const data = await response.json();
      const progressData = data?.data || data;
      return {
        ...progressData,
        steps: progressData.steps?.map((step: any) => ({
          ...step,
          updatedAt: step.updatedAt ? new Date(step.updatedAt) : null
        })) || []
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!salesRoomId,
  });

  // Create pathway mutation
  const createMutation = useMutation({
    mutationFn: async (pathwayData: CreatePathwayData) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/digital-sales-rooms/pathways',
        'POST',
        pathwayData
      );
      if (apiError) throw new Error(apiError);
      return data?.data || data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.list() });
    },
  });

  // Assign pathway mutation
  const assignMutation = useMutation({
    mutationFn: async ({ salesRoomId, pathwayId, setDefault = false }: AssignPathwayData) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/digital-sales-rooms/pathways/assign',
        'POST',
        { salesRoomId, pathwayId, setDefault }
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate progress queries for the affected sales room
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progress(variables.salesRoomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progressPublic(variables.salesRoomId) });
    },
  });

  // Update progress mutation with optimistic updates
  const updateProgressMutation = useMutation({
    mutationFn: async ({ salesRoomId, stepId, status, notes }: UpdateProgressData) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/sales-progress`,
        'POST',
        { stepId, status, notes }
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.pathways.progress(variables.salesRoomId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.pathways.progressPublic(variables.salesRoomId) });

      // Snapshot the previous values
      const previousProgress = queryClient.getQueryData(queryKeys.pathways.progress(variables.salesRoomId));
      const previousProgressPublic = queryClient.getQueryData(queryKeys.pathways.progressPublic(variables.salesRoomId));

      // Optimistically update the progress
      const updateProgressData = (old: PathwayProgressData | undefined) => {
        if (!old) return old;
        
        const updatedSteps = old.steps.map((step: PathwayProgress) =>
          step.stepId === variables.stepId
            ? {
                ...step,
                status: variables.status,
                notes: variables.notes || step.notes,
                updatedAt: new Date()
              }
            : step
        );

        // Recalculate progress
        const completedSteps = updatedSteps.filter(step => step.status === 'completed').length;
        const totalSteps = updatedSteps.length;
        const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        
        // Find current step (first non-completed step)
        const currentStep = updatedSteps.find(step => 
          step.status === 'not_started' || step.status === 'in_progress'
        ) || null;

        return {
          ...old,
          steps: updatedSteps,
          progress: {
            ...old.progress,
            completedSteps,
            totalSteps,
            percentComplete,
            currentStep
          }
        };
      };

      queryClient.setQueryData(queryKeys.pathways.progress(variables.salesRoomId), updateProgressData);
      queryClient.setQueryData(queryKeys.pathways.progressPublic(variables.salesRoomId), updateProgressData);

      return { previousProgress, previousProgressPublic };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousProgress) {
        queryClient.setQueryData(queryKeys.pathways.progress(variables.salesRoomId), context.previousProgress);
      }
      if (context?.previousProgressPublic) {
        queryClient.setQueryData(queryKeys.pathways.progressPublic(variables.salesRoomId), context.previousProgressPublic);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progress(variables.salesRoomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progressPublic(variables.salesRoomId) });
    },
  });

  // Initialize pathway progress mutation
  const initializeMutation = useMutation({
    mutationFn: async (salesRoomId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/initialize-pathway`,
        'POST',
        null
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: (_data, salesRoomId) => {
      // Invalidate progress queries for the affected sales room
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progress(salesRoomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pathways.progressPublic(salesRoomId) });
    },
  });

  // Wrapper functions for easier component usage
  const createPathway = async (name: string, steps: PathwayStep[], description?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await createMutation.mutateAsync({ name, description, steps });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create pathway";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const assignPathwayToSalesRoom = async (salesRoomId: string, pathwayId: string, setDefault: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      await assignMutation.mutateAsync({ salesRoomId, pathwayId, setDefault });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to assign pathway";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const updateSalesRoomPathwayProgress = async (
    salesRoomId: string,
    stepId: string,
    status: 'not_started' | 'in_progress' | 'completed' | 'skipped',
    notes?: string
  ) => {
    setError(null);

    try {
      await updateProgressMutation.mutateAsync({ salesRoomId, stepId, status, notes });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update pathway progress";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const initializePathwayProgress = async (salesRoomId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await initializeMutation.mutateAsync(salesRoomId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to initialize pathway progress";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    pathways: pathwaysQuery.data || [],
    isLoadingPathways: pathwaysQuery.isLoading,
    pathwaysError: pathwaysQuery.error,
    refetchPathways: pathwaysQuery.refetch,
    
    // Query functions for progress (return query objects)
    getPathwayProgressQuery,
    getPathwayProgressPublicQuery,
    
    // Mutation states
    isLoading,
    isCreating: createMutation.isPending,
    isAssigning: assignMutation.isPending,
    isUpdatingProgress: updateProgressMutation.isPending,
    isInitializing: initializeMutation.isPending,
    error,
    
    // Actions
    createPathway,
    assignPathwayToSalesRoom,
    updateSalesRoomPathwayProgress,
    initializePathwayProgress,
    clearError,
  };
}