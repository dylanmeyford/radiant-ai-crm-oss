import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { requestWithAuth } from './requestWithAuth';
import type { AIUsageResponse } from '../types/aiUsage';

interface UsageBreakdown {
  processing: {
    count: number;
    cost: number;
  };
  actions: {
    count: number;
    cost: number;
  };
  research: {
    count: number;
    cost: number;
  };
}

interface UsageData {
  totalCost: number;
  totalTokens: number;
  breakdown: UsageBreakdown;
}

interface LiveUsageStats {
  usage: UsageData;
  limits: {
    monthlyLimit: number;
    currentUsage: number;
    percentUsed: number;
  };
}

export function useBillingOperations() {
  const [error, setError] = useState<string | null>(null);

  // Get current month's AI usage (new tracking system)
  const liveUsageQuery = useQuery({
    queryKey: queryKeys.aiUsage.current(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        'api/ai-usage/current',
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      
      const apiResponse = data as AIUsageResponse;
      
      // Transform new AI usage response to match old format for backward compatibility
      const breakdown: UsageBreakdown = {
        processing: {
          count: apiResponse.breakdown?.processing?.callCount || 0,
          cost: apiResponse.breakdown?.processing?.cost || 0,
        },
        actions: {
          count: apiResponse.breakdown?.actions?.callCount || 0,
          cost: apiResponse.breakdown?.actions?.cost || 0,
        },
        research: {
          count: apiResponse.breakdown?.research?.callCount || 0,
          cost: apiResponse.breakdown?.research?.cost || 0,
        },
      };
      
      const transformedResponse: LiveUsageStats = {
        usage: {
          totalCost: apiResponse.totalCost || 0,
          totalTokens: (apiResponse.totalTokens?.input || 0) + (apiResponse.totalTokens?.output || 0),
          breakdown,
        },
        limits: {
          monthlyLimit: 0, // TODO: Add limits configuration
          currentUsage: apiResponse.totalCost || 0,
          percentUsed: 0, // TODO: Calculate based on limits
        },
      };
      
      return transformedResponse;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
  });

  // Get current billing period data (disabled until billing is set up)
  // const currentPeriodQuery = useQuery({
  //   queryKey: queryKeys.billing.currentPeriod(),
  //   queryFn: async () => {
  //     const { data, error: apiError } = await requestWithAuth(
  //       'api/organization/billing/current-period',
  //       'GET',
  //       null
  //     );
  //     if (apiError) throw new Error(apiError);
  //     return data as CurrentPeriodData;
  //   },
  //   staleTime: 10 * 60 * 1000, // 10 minutes
  //   gcTime: 30 * 60 * 1000, // 30 minutes
  // });

  const clearError = () => setError(null);

  return {
    // Live usage stats (provides all needed data)
    liveUsage: liveUsageQuery.data,
    isLoadingLiveUsage: liveUsageQuery.isLoading,
    liveUsageError: liveUsageQuery.error,
    refetchLiveUsage: liveUsageQuery.refetch,

    // Current period data (disabled until billing is set up)
    currentPeriod: null,
    isLoadingCurrentPeriod: false,
    currentPeriodError: null,
    refetchCurrentPeriod: () => Promise.resolve({ data: null }),

    // General error handling
    error,
    clearError,
  };
}
