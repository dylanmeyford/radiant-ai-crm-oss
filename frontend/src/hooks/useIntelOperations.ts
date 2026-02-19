import { useState } from "react";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';

// Define the Intel interface
interface Intel {
  _id: string;
  type: 'prospect' | 'competitor';
  title: string;
  content: string;
  source?: string;
  url?: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'archived';
  prospect?: {
    _id: string;
    name: string;
    website: string;
  };
  competitor?: {
    _id: string;
    name: string;
    website: string;
  };
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface IntelFilters {
  importance?: string;
  type?: string;
  prospect?: string;
  competitor?: string;
}

export function useIntelOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (intelData: Partial<Intel>) => {
      const { error } = await requestWithAuth("api/intel/", "POST", intelData);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'intel' }] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ intelId, intelData }: { intelId: string; intelData: Partial<Intel> }) => {
      const { error } = await requestWithAuth(`api/intel/${intelId}`, "PUT", intelData);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'intel' }] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (intelId: string) => {
      const { error } = await requestWithAuth(`api/intel/${intelId}`, "DELETE", null);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'intel' }] });
    },
  });

  const fetchIntel = async (filters: IntelFilters = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await queryClient.ensureQueryData({
        queryKey: queryKeys.intel.list(filters),
        queryFn: async () => {
          let url = 'api/intel';
          const queryParams = new URLSearchParams();
          if (filters.importance) queryParams.append('importance', filters.importance);
          if (filters.type) queryParams.append('type', filters.type);
          if (filters.prospect) queryParams.append('prospect', filters.prospect);
          if (filters.competitor) queryParams.append('competitor', filters.competitor);
          if (queryParams.toString()) url += `?${queryParams.toString()}`;
          return requestWithAuth(url, 'GET', null);
        },
      });
      
      if (error) throw new Error(error);
      return Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch intel";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const createIntel = async (intelData: Partial<Intel>) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await createMutation.mutateAsync(intelData);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create intel";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateIntel = async (intelId: string, intelData: Partial<Intel>) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await updateMutation.mutateAsync({ intelId, intelData });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update intel";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteIntel = async (intelId: string) => {
    try {
      setIsDeleting(true);
      setError(null);
      
      await deleteMutation.mutateAsync(intelId);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete intel";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isLoading,
    isSubmitting,
    isDeleting,
    error,
    fetchIntel,
    createIntel,
    updateIntel,
    deleteIntel
  };
} 