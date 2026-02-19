import { QueryClient } from '@tanstack/react-query';

// Custom retry function that handles network errors gracefully
const retryFn = (failureCount: number, error: any) => {
  // Don't retry on authentication errors
  if (error?.message?.includes('Session expired') || error?.message?.includes('Please Login')) {
    return false;
  }
  
  // For network errors (offline), retry up to 3 times with exponential backoff
  if (error?.message?.includes('Network Error') || error?.message?.includes('Failed to fetch')) {
    return failureCount < 3;
  }
  
  // For other errors, retry once
  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryFn,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: retryFn,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'offlineFirst',
    },
  },
});

// Global error handler for unhandled query errors
queryClient.setMutationDefaults(['mutations'], {
  mutationFn: undefined,
  onError: (error) => {
    console.warn('Mutation error (will be retried):', error);
  },
});

// Enable background refetching
queryClient.setQueryDefaults(['queries'], {
  refetchOnMount: 'always',
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
});


