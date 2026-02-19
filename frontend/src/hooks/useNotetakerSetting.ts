import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';

interface NotetakerConnectionConfig {
  connectionId: string;
  config: {
    enabled: boolean;
  };
}

interface NotetakerSettings {
  connections: NotetakerConnectionConfig[];
}

export const useNotetakerSetting = () => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use useQuery for data fetching (single source of truth)
  const settingsQuery = useQuery({
    queryKey: queryKeys.notetaker.setting(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/user/settings/notetaker", "GET", null);
      if (apiError) throw new Error(apiError);
      
      // Return clean data structure - data is an array of connection configs
      const connections = Array.isArray(data?.data) ? data.data : [];
      return {
        connections: connections.map((conn: any) => ({
          connectionId: conn.connectionId,
          config: {
            enabled: conn.config?.enabled ?? false
          }
        }))
      } as NotetakerSettings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Update mutation with proper optimistic updates for per-connection settings
  const updateSettingMutation = useMutation({
    mutationFn: async ({ connectionId, enabled }: { connectionId: string; enabled: boolean }) => {
      const { data, error: apiError } = await requestWithAuth(`api/user/settings/notetaker/${connectionId}`, "PATCH", { enabled });
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: queryKeys.notetaker.setting() });

      // Snapshot the previous value for rollback
      const previousSettings = queryClient.getQueryData(queryKeys.notetaker.setting());

      // Optimistically update the cache immediately
      queryClient.setQueryData(queryKeys.notetaker.setting(), (old: NotetakerSettings) => {
        if (!old) return old;
        
        return {
          ...old,
          connections: old.connections.map(conn => 
            conn.connectionId === variables.connectionId
              ? { ...conn, config: { ...conn.config, enabled: variables.enabled } }
              : conn
          )
        };
      });

      return { previousSettings };
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.notetaker.setting(), context.previousSettings);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.notetaker.setting() });
    },
  });

  // Wrapper function for easier usage
  const updateSetting = async (connectionId: string, enabled: boolean) => {
    setError(null);
    
    try {
      const data = await updateSettingMutation.mutateAsync({ connectionId, enabled });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update Notetaker setting";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  // Helper function to get setting for a specific connection
  const getConnectionSetting = (connectionId: string) => {
    const connection = settingsQuery.data?.connections.find(conn => conn.connectionId === connectionId);
    return connection?.config.enabled ?? false;
  };

  return {
    // Query data and states (single source of truth)
    settings: settingsQuery.data?.connections ?? [],
    isLoading: settingsQuery.isLoading,
    settingError: settingsQuery.error,
    refetchSettings: settingsQuery.refetch,
    
    // Helper functions
    getConnectionSetting,
    
    // Mutation states
    isUpdating: updateSettingMutation.isPending,
    error,
    
    // Actions
    updateSetting,
    clearError,
  };
}; 