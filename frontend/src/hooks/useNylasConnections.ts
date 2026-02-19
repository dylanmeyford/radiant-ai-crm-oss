import { useCallback } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';

interface ConnectedAccount {
  _id: string;
  email: string;
  provider: string;
  syncStatus: "active" | "disconnected" | "error" | "expired";
  grantId: string;
  calendars: string[];
  emailSignature?: string;
}

export const useNylasConnections = () => {
  const queryClient = useQueryClient();

  // Use useQuery for data fetching (single source of truth)
  const connectionsQuery = useQuery({
    queryKey: queryKeys.nylas.connections(),
    queryFn: async () => {
      const { data, error } = await requestWithAuth("api/nylas/", "GET", null);
      if (error) throw new Error("Failed to fetch connected accounts");
      
      // Return clean data structure - extract connections array
      const connections = data?.nylasConnections || [];
      return connections as ConnectedAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const connectAccount = useCallback(async () => {
    try {
      const { data, error } = await requestWithAuth("api/nylas/oauth/exchange", "GET", null);
      if (error) {
        throw new Error("Failed to initiate OAuth flow");
      }
      window.open(data.url, "_blank");
      // After redirect, user will complete oauth. Invalidation will trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.nylas.connections() });
    } catch (error) {
      console.error("Failed to connect account:", error);
    }
  }, [queryClient]);

  return {
    // Query data and states (single source of truth)
    connections: connectionsQuery.data || [],
    isLoading: connectionsQuery.isLoading,
    error: connectionsQuery.error,
    refetchConnections: connectionsQuery.refetch,
    
    // Actions
    connectAccount,
  };
}; 