import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import { ApiKey, CreateApiKeyResponse, ListApiKeysResponse, UpdateApiKeyResponse } from '../types/apiKey';

interface CreateApiKeyData {
  name: string;
}

interface UpdateApiKeyData {
  isActive: boolean;
}

export function useApiKeyOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch all API keys
  const apiKeysQuery = useQuery({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/api-keys", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const response = data as ListApiKeysResponse;
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: async (keyData: CreateApiKeyData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/api-keys",
        "POST",
        keyData
      );
      if (apiError) throw new Error(apiError);
      return data as CreateApiKeyResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list() });
    },
  });

  // Update API key mutation (toggle active status)
  const updateMutation = useMutation({
    mutationFn: async ({ keyId, updates }: { keyId: string; updates: UpdateApiKeyData }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/api-keys/${keyId}`,
        "PATCH",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data as UpdateApiKeyResponse;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys.detail(variables.keyId) });

      // Snapshot the previous values
      const previousKeys = queryClient.getQueryData(queryKeys.apiKeys.list());
      const previousKey = queryClient.getQueryData(queryKeys.apiKeys.detail(variables.keyId));

      // Optimistically update the keys list
      queryClient.setQueryData(queryKeys.apiKeys.list(), (old: ApiKey[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((key: ApiKey) =>
          key._id === variables.keyId
            ? { ...key, ...variables.updates }
            : key
        );
      });

      // Also update individual key cache if it exists
      queryClient.setQueryData(queryKeys.apiKeys.detail(variables.keyId), (old: ApiKey | undefined) => {
        if (!old) return old;
        return { ...old, ...variables.updates };
      });

      // Return context for rollback
      return { previousKeys, previousKey };
    },
    onError: (_err, variables, context) => {
      // Rollback on failure
      if (context?.previousKeys) {
        queryClient.setQueryData(queryKeys.apiKeys.list(), context.previousKeys);
      }
      if (context?.previousKey) {
        queryClient.setQueryData(queryKeys.apiKeys.detail(variables.keyId), context.previousKey);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.detail(variables.keyId) });
    },
  });

  // Wrapper functions for easier usage
  const createApiKey = async (name: string) => {
    setError(null);
    try {
      const data = await createMutation.mutateAsync({ name });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create API key";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const toggleApiKeyStatus = async (keyId: string, isActive: boolean) => {
    setError(null);
    try {
      const data = await updateMutation.mutateAsync({ keyId, updates: { isActive } });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update API key";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    // Query data and states
    apiKeys: apiKeysQuery.data || [],
    isLoadingKeys: apiKeysQuery.isLoading,
    keysError: apiKeysQuery.error,
    refetchKeys: apiKeysQuery.refetch,
    
    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    error,
    
    // Actions
    createApiKey,
    toggleApiKeyStatus,
    clearError: () => setError(null),
  };
}

