import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';

interface ProspectFormData {
  name: string;
  website: string;
  domains: string[];
  industry: string;
  size: string;
  description: string;
  status: string;
}

interface Prospect {
  _id: string;
  name: string;
  website: string;
  domains: string[];
  industry: string;
  size: string;
  description: string;
  status: string;
  createdAt: Date;
  lastActivity?: Date | null;
  contacts: any[];
  activities: any[];
}

export function useProspectOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Helper function to safely convert date strings to Date objects
  const safeDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      console.error("Invalid date encountered:", dateString);
      return null;
    }
  };

  // Use TanStack Query for fetching prospects
  const prospectsQuery = useQuery({
    queryKey: queryKeys.prospects.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/prospects/", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const prospectsData = Array.isArray(data) ? data : (data?.data || []);
      
      // Convert date strings to Date objects safely
      return prospectsData.map((prospect: any) => ({
        ...prospect,
        createdAt: safeDate(prospect.createdAt) || new Date(),
        lastActivity: safeDate(prospect.lastActivity),
        contacts: Array.isArray(prospect.contacts) ? prospect.contacts.map((contact: any) => ({
          ...contact,
          lastContacted: safeDate(contact.lastContacted),
        })) : [],
        activities: Array.isArray(prospect.activities) ? prospect.activities.map((activity: any) => ({
          ...activity,
          date: safeDate(activity.date) || new Date(),
        })) : [],
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const createMutation = useMutation({
    mutationFn: async (prospectData: ProspectFormData) => {
      const { data, error: apiError } = await requestWithAuth("api/prospects", "POST", prospectData);
      if (apiError || !data?.data?._id) throw new Error(apiError || "Failed to create prospect or prospect data is invalid.");
      return data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.list() });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ prospectId, prospectData }: { prospectId: string; prospectData: Partial<ProspectFormData> }) => {
      const { data, error: apiError } = await requestWithAuth(`api/prospects/${prospectId}`, "PUT", prospectData);
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.prospects.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.prospects.detail(variables.prospectId) });

      // Snapshot the previous values
      const previousProspects = queryClient.getQueryData(queryKeys.prospects.list());
      const previousProspect = queryClient.getQueryData(queryKeys.prospects.detail(variables.prospectId));

      // Optimistically update the prospects list
      queryClient.setQueryData(queryKeys.prospects.list(), (old: Prospect[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((prospect: Prospect) =>
          prospect._id === variables.prospectId
            ? { ...prospect, ...variables.prospectData }
            : prospect
        );
      });

      // Optimistically update the individual prospect
      queryClient.setQueryData(queryKeys.prospects.detail(variables.prospectId), (old: Prospect) => {
        if (!old) return old;
        return { ...old, ...variables.prospectData };
      });

      return { previousProspects, previousProspect };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousProspects) {
        queryClient.setQueryData(queryKeys.prospects.list(), context.previousProspects);
      }
      if (context?.previousProspect) {
        queryClient.setQueryData(queryKeys.prospects.detail(variables.prospectId), context.previousProspect);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.detail(variables.prospectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.list() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      const { error: apiError } = await requestWithAuth(`api/prospects/${prospectId}`, "DELETE", null);
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (prospectId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.prospects.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.prospects.detail(prospectId) });

      // Snapshot the previous values
      const previousProspects = queryClient.getQueryData(queryKeys.prospects.list());
      const previousProspect = queryClient.getQueryData(queryKeys.prospects.detail(prospectId));

      // Optimistically remove from cache
      queryClient.setQueryData(queryKeys.prospects.list(), (old: Prospect[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((prospect: Prospect) => prospect._id !== prospectId);
      });

      return { previousProspects, previousProspect };
    },
    onError: (_err, prospectId, context) => {
      // Rollback on error
      if (context?.previousProspects) {
        queryClient.setQueryData(queryKeys.prospects.list(), context.previousProspects);
      }
      if (context?.previousProspect) {
        queryClient.setQueryData(queryKeys.prospects.detail(prospectId), context.previousProspect);
      }
    },
    onSettled: (_data, _error, prospectId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.detail(prospectId) });
    },
  });

  // Individual prospect query (for detail pages)
  const fetchProspectDetails = async (prospectId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.prospects.detail(prospectId),
        queryFn: async () => requestWithAuth(`api/prospects/${prospectId}`, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      if (data && (data._id || (data.data && data.data._id))) {
        const prospectData = data._id ? data : data.data;
        
        // Process dates for individual prospect
        const processedProspect = {
          ...prospectData,
          createdAt: safeDate(prospectData.createdAt) || new Date(),
          lastActivity: safeDate(prospectData.lastActivity),
          contacts: Array.isArray(prospectData.contacts) ? prospectData.contacts.map((contact: any) => ({
            ...contact,
            lastContacted: safeDate(contact.lastContacted),
          })) : [],
          activities: Array.isArray(prospectData.activities) ? prospectData.activities.map((activity: any) => ({
            ...activity,
            date: safeDate(activity.date) || new Date(),
          })) : [],
        };
        
        return { success: true, data: processedProspect };
      } else {
        return { success: false, error: "No prospect data found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load prospect details";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  // Wrapper functions for easier usage
  const createProspect = async (prospectData: ProspectFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await createMutation.mutateAsync(prospectData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create prospect";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProspect = async (prospectId: string, prospectData: Partial<ProspectFormData>) => {
    setError(null);

    try {
      const data = await updateMutation.mutateAsync({ prospectId, prospectData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update prospect";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteProspect = async (prospectId: string) => {
    setError(null);

    try {
      await deleteMutation.mutateAsync(prospectId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete prospect";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states (single source of truth)
    prospects: prospectsQuery.data || [],
    isLoadingProspects: prospectsQuery.isLoading,
    prospectsError: prospectsQuery.error,
    refetchProspects: prospectsQuery.refetch,
    
    // Mutation states
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error,
    
    // Actions
    createProspect,
    updateProspect,
    deleteProspect,
    fetchProspectDetails,
    clearError,
  };
} 