import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { requestWithAuth } from './requestWithAuth';
import type { AIUsageResponse, AIUsageHistoryResponse } from '../types/aiUsage';

export function useAIUsageOperations() {
  const [error, setError] = useState<string | null>(null);

  // Get current month's AI usage
  const currentUsageQuery = useQuery({
    queryKey: queryKeys.aiUsage.current(),
    queryFn: async (): Promise<AIUsageResponse> => {
      const { data, error: apiError } = await requestWithAuth(
        'api/ai-usage/current',
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      
      return data as AIUsageResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - usage data doesn't change rapidly
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Get usage for a specific month
  const getMonthUsage = (year: number, month: number) => {
    return useQuery({
      queryKey: queryKeys.aiUsage.month(year, month),
      queryFn: async (): Promise<AIUsageResponse> => {
        const { data, error: apiError } = await requestWithAuth(
          `api/ai-usage/${year}/${month}`,
          'GET',
          null
        );
        if (apiError) throw new Error(apiError);
        
        return data as AIUsageResponse;
      },
      staleTime: 10 * 60 * 1000, // 10 minutes - historical data changes even less
      gcTime: 30 * 60 * 1000, // 30 minutes
    });
  };

  // Get usage history for multiple months
  const getUsageHistory = (months: number = 6) => {
    return useQuery({
      queryKey: queryKeys.aiUsage.history(months),
      queryFn: async (): Promise<AIUsageHistoryResponse> => {
        const { data, error: apiError } = await requestWithAuth(
          `api/ai-usage/history?months=${months}`,
          'GET',
          null
        );
        if (apiError) throw new Error(apiError);
        
        return data as AIUsageHistoryResponse;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    });
  };

  const clearError = () => setError(null);

  return {
    // Current month usage
    currentUsage: currentUsageQuery.data,
    isLoadingCurrentUsage: currentUsageQuery.isLoading,
    currentUsageError: currentUsageQuery.error,
    refetchCurrentUsage: currentUsageQuery.refetch,

    // Utility functions for historical data
    getMonthUsage,
    getUsageHistory,

    // General error handling
    error,
    clearError,
  };
}

// Hook for usage history with configurable months
export function useAIUsageHistory(months: number = 6) {
  const [error, setError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: queryKeys.aiUsage.history(months),
    queryFn: async (): Promise<AIUsageHistoryResponse> => {
      const { data, error: apiError } = await requestWithAuth(
        `api/ai-usage/history?months=${months}`,
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      
      return data as AIUsageHistoryResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: months > 0 && months <= 24, // Only fetch if months is valid
  });

  const clearError = () => setError(null);

  return {
    history: historyQuery.data?.history || [],
    requestedMonths: historyQuery.data?.requestedMonths || months,
    isLoadingHistory: historyQuery.isLoading,
    historyError: historyQuery.error,
    refetchHistory: historyQuery.refetch,
    error,
    clearError,
  };
}

// Hook for specific month usage
export function useAIUsageMonth(year: number, month: number) {
  const [error, setError] = useState<string | null>(null);

  const monthQuery = useQuery({
    queryKey: queryKeys.aiUsage.month(year, month),
    queryFn: async (): Promise<AIUsageResponse> => {
      const { data, error: apiError } = await requestWithAuth(
        `api/ai-usage/${year}/${month}`,
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      
      return data as AIUsageResponse;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - historical data changes less
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: year > 0 && month >= 1 && month <= 12, // Only fetch if valid
  });

  const clearError = () => setError(null);

  return {
    monthUsage: monthQuery.data,
    isLoadingMonth: monthQuery.isLoading,
    monthError: monthQuery.error,
    refetchMonth: monthQuery.refetch,
    error,
    clearError,
  };
}

