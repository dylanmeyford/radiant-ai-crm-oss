import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import { OpportunityData } from '../types/pipeline';

interface OpportunityFormData {
  name: string;
  description?: string;
  amount: number;
  stage: string;
  probability: number;
  expectedCloseDate: Date;
  createdDate: Date;
  prospect: string;
  contacts: string[];
  tags?: string[];
  opportunityStartDate?: Date;
}

interface ProcessingStatus {
  type: 'batch' | 'individual';
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'scheduled';
  processed?: number;
  total?: number;
  pending?: number;
  isScheduled?: boolean;
  isRunning?: boolean;
}

export function useOpportunityOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingOpportunity, setIsFetchingOpportunity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching opportunities
  const opportunitiesQuery = useQuery({
    queryKey: queryKeys.opportunities.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/opportunities", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const opportunitiesData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process activities dates
      return opportunitiesData.map((opp: any) => ({
        ...opp,
        activities: opp.activities ? opp.activities.map((activity: any) => ({
          ...activity,
          date: new Date(activity.date)
        })) : []
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  const createMutation = useMutation({
    mutationFn: async (opportunityData: OpportunityFormData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/opportunities",
        "POST",
        opportunityData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ opportunityId, opportunityData }: { opportunityId: string; opportunityData: OpportunityFormData }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/opportunities/${opportunityId}`,
        "PUT",
        opportunityData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });

      // Snapshot the previous values
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());
      const previousOpportunity = queryClient.getQueryData(queryKeys.opportunities.detail(variables.opportunityId));

      // Optimistically update the opportunities list
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((opp: any) =>
          opp._id === variables.opportunityId
            ? { ...opp, ...variables.opportunityData }
            : opp
        );
      });

      // Optimistically update the individual opportunity
      queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), (old: any) => {
        if (!old) return old;
        return { ...old, ...variables.opportunityData };
      });

      return { previousOpportunities, previousOpportunity };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
      if (context?.previousOpportunity) {
        queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), context.previousOpportunity);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ opportunityId, stage }: { opportunityId: string; stage: string }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/opportunities/${opportunityId}`,
        "PUT",
        { stage }
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });

      // Snapshot the previous values
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());
      const previousOpportunity = queryClient.getQueryData(queryKeys.opportunities.detail(variables.opportunityId));

      // Optimistically update the opportunities list
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((opp: any) =>
          opp._id === variables.opportunityId
            ? { ...opp, stage: variables.stage }
            : opp
        );
      });

      // Optimistically update the individual opportunity
      queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          stage: variables.stage
        };
      });

      // Return a context object with the snapshotted values
      return { previousOpportunities, previousOpportunity };
    },
    onError: (_err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
      if (context?.previousOpportunity) {
        queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), context.previousOpportunity);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/opportunities/${opportunityId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (opportunityId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.detail(opportunityId) });

      // Snapshot the previous values
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());
      const previousOpportunity = queryClient.getQueryData(queryKeys.opportunities.detail(opportunityId));

      // Optimistically remove from cache
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((opp: any) => opp._id !== opportunityId);
      });

      return { previousOpportunities, previousOpportunity };
    },
    onError: (_err, opportunityId, context) => {
      // Rollback on error
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
      if (context?.previousOpportunity) {
        queryClient.setQueryData(queryKeys.opportunities.detail(opportunityId), context.previousOpportunity);
      }
    },
    onSettled: (_data, _error, opportunityId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.detail(opportunityId) });
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: async ({ opportunityId, contactId }: { opportunityId: string; contactId: string }) => {
      const { error: apiError } = await requestWithAuth(
        `api/opportunities/${opportunityId}/contacts/${contactId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });

      // Snapshot the previous values
      const previousOpportunity = queryClient.getQueryData(queryKeys.opportunities.detail(variables.opportunityId));
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());

      // Optimistically update the opportunity detail
      queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          contacts: old.contacts?.filter((contact: any) => contact._id !== variables.contactId) || []
        };
      });

      // Optimistically update the opportunities list
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((opp: any) =>
          opp._id === variables.opportunityId
            ? {
                ...opp,
                contacts: opp.contacts?.filter((contact: any) => contact._id !== variables.contactId) || []
              }
            : opp
        );
      });

      return { previousOpportunity, previousOpportunities };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOpportunity) {
        queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), context.previousOpportunity);
      }
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
    },
  });

  const createOpportunity = async (opportunityData: OpportunityFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await createMutation.mutateAsync(opportunityData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create opportunity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const updateOpportunity = async (opportunityId: string, opportunityData: OpportunityFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await updateMutation.mutateAsync({ opportunityId, opportunityData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update opportunity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };



  const fetchOpportunityDetails = async (opportunityId: string) => {
    setIsFetchingOpportunity(true);
    setError(null);

    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.opportunities.detail(opportunityId),
        queryFn: async () => requestWithAuth(`api/opportunities/${opportunityId}`, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      if (data && (data._id || (data.data && data.data._id))) {
        const opportunityData = data._id ? data : data.data;
        return { success: true, data: opportunityData };
      } else {
        return { success: false, error: "No opportunity data found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load opportunity details";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsFetchingOpportunity(false);
    }
  };

  const updateOpportunityStage = async (opportunityId: string, stage: string) => {
    setError(null);

    try {
      const data = await updateStageMutation.mutateAsync({ opportunityId, stage });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update opportunity stage";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteOpportunity = async (opportunityId: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await deleteMutation.mutateAsync(opportunityId);

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete opportunity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsDeleting(false);
    }
  };

  // New function: removeContactFromOpportunity
  const removeContactFromOpportunity = async (opportunityId: string, contactId: string) => {
    setError(null);

    try {
      await removeContactMutation.mutateAsync({ opportunityId, contactId });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to remove contact from opportunity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Function to get a single opportunity by ID
  const getOpportunityById = (opportunityId: string) => {
    return useQuery<OpportunityData>({
      queryKey: queryKeys.opportunities.detail(opportunityId),
      queryFn: async () => {
        if (!opportunityId) throw new Error('No opportunity ID provided');
        
        const { data, error: apiError } = await requestWithAuth(
          `api/opportunities/${opportunityId}`, 
          "GET", 
          null
        );
        
        if (apiError) throw new Error(apiError);
        
        // Handle nested data structure
        if (data && data.data && data.data._id) {
          return data.data as OpportunityData;
        }
        if (data && data._id) {
          return data as OpportunityData;
        }
        
        throw new Error('Invalid opportunity data received');
      },
      enabled: !!opportunityId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  // Function to get opportunity processing status
  const getOpportunityProcessingStatus = (opportunityId: string) => {
    return useQuery<ProcessingStatus>({
      queryKey: queryKeys.opportunities.processingStatus(opportunityId),
      queryFn: async () => {
        const { data, error: apiError } = await requestWithAuth(
          `api/opportunities/${opportunityId}/processing-status`,
          "GET",
          null
        );
        if (apiError) throw new Error(apiError);
        
        // Handle nested data structure
        if (data && data.data) {
          return data.data as ProcessingStatus;
        }
        if (data) {
          return data as ProcessingStatus;
        }
        
        throw new Error('Invalid processing status data received');
      },
      enabled: !!opportunityId,
      staleTime: 30 * 1000, // 30 seconds - more frequent updates for processing status
      refetchInterval: (query) => {
        // Auto-refetch every 5 seconds if processing is active
        const data = query.state.data;
        if (data?.status === 'processing' || data?.status === 'pending' || data?.status === 'scheduled') {
          return 5000; // 5 seconds
        }
        return false; // Don't auto-refetch if idle/completed/failed
      },
    });
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    opportunities: opportunitiesQuery.data || [],
    isLoadingOpportunities: opportunitiesQuery.isLoading,
    opportunitiesError: opportunitiesQuery.error,
    refetchOpportunities: opportunitiesQuery.refetch,
    
    // Mutation states
    isLoading,
    isDeleting,
    isFetchingOpportunity,
    isUpdatingStage: updateStageMutation.isPending,
    isRemovingContact: removeContactMutation.isPending,
    error,
    
    // Actions
    createOpportunity,
    updateOpportunity,
    fetchOpportunityDetails,
    updateOpportunityStage,
    deleteOpportunity,
    removeContactFromOpportunity,
    getOpportunityById,
    getOpportunityProcessingStatus,
    clearError,
  };
} 