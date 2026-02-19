import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestNoAuth } from './requestNoAuth';
import { TrackingData } from '../types/digitalSalesRoom';
import { queryKeys } from './queryKeys';

interface DocumentTrackingOptions {
  documentAccessId?: string; // Required for API tracking
  onTrackingDataAvailable?: (trackingData: TrackingData) => void;
  trackingInterval?: number; // in milliseconds
  minTrackingDuration?: number; // in milliseconds
  isPdf?: boolean;
  autoSubmit?: boolean; // Whether to automatically submit tracking data
}

export function useDocumentTracking(options?: DocumentTrackingOptions) {
  const {
    documentAccessId,
    onTrackingDataAvailable,
    trackingInterval = 5000, // Default: track every 5 seconds
    minTrackingDuration = 1000, // Default: minimum 1 second to count as viewed
    isPdf = false,
    autoSubmit = true
  } = options || {};

  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pageViews, setPageViews] = useState<Map<number, number>>(new Map());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [lastPageChangeTime, setLastPageChangeTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const intervalRef = useRef<number | null>(null);
  const pageViewsRef = useRef(pageViews);
  const queryClient = useQueryClient();

  // Update the ref when pageViews changes
  useEffect(() => {
    pageViewsRef.current = pageViews;
  }, [pageViews]);

  // TanStack Query mutation for tracking document interactions
  const trackingMutation = useMutation({
    mutationFn: async (trackingData: TrackingData) => {
      if (!documentAccessId) {
        throw new Error('Document access ID is required for tracking');
      }
      
      const { data, error: apiError } = await requestNoAuth(
        `api/digital-sales-rooms/public/track/${documentAccessId}`,
        'POST',
        trackingData
      );
      
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (trackingData) => {
      // Cancel any outgoing refetches for analytics
      if (documentAccessId) {
        await queryClient.cancelQueries({ 
          queryKey: queryKeys.salesRoom.analytics(documentAccessId) 
        });
      }
      
      // We could optimistically update analytics here if we had that query
      // For now, we'll just track the interaction locally
      return { trackingData };
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Failed to track document interaction';
      setError(errorMessage);
      console.error('Document tracking error:', errorMessage);
    },
    onSettled: () => {
      // Invalidate analytics queries to refresh data
      if (documentAccessId) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.salesRoom.analytics(documentAccessId) 
        });
      }
    },
  });

  // Start tracking
  const startTracking = () => {
    if (isTracking) return;
    
    const now = new Date();
    setStartTime(now);
    setIsTracking(true);
    setLastPageChangeTime(now);
    
    // Initialize page view for the first page
    if (isPdf) {
      setPageViews(new Map([[currentPage, 0]]));
    }
    
    // Set up interval for periodic tracking
    if (intervalRef.current === null) {
      intervalRef.current = window.setInterval(() => {
        updateTracking();
      }, trackingInterval);
    }
  };

  // Stop tracking and return the data
  const stopTracking = async (): Promise<{ success: boolean; data?: TrackingData; error?: string }> => {
    if (!isTracking || !startTime) {
      return { success: false, error: 'Tracking not active' };
    }
    
    // Update page view timing for the current page
    if (isPdf && lastPageChangeTime) {
      updatePageView(currentPage, new Date().getTime() - lastPageChangeTime.getTime());
    }
    
    // Calculate total duration
    const durationMs = new Date().getTime() - startTime.getTime();
    
    // Clean up tracking state
    setIsTracking(false);
    setStartTime(null);
    
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Don't count very brief views
    if (durationMs < minTrackingDuration) {
      return { success: false, error: 'Duration too short to track' };
    }
    
    // Prepare the tracking data
    const trackingData: TrackingData = {
      durationMs
    };
    
    // If tracking PDF, include page views
    if (isPdf && pageViewsRef.current.size > 0) {
      trackingData.pageViews = Array.from(pageViewsRef.current.entries()).map((entry) => {
        const [page, duration] = entry as [number, number];
        return { page, durationMs: duration };
      });
    }
    
    // Trigger callback if provided
    if (onTrackingDataAvailable) {
      onTrackingDataAvailable(trackingData);
    }
    
    // Submit tracking data to server if autoSubmit is enabled and documentAccessId is provided
    if (autoSubmit && documentAccessId) {
      try {
        await trackingMutation.mutateAsync(trackingData);
        return { success: true, data: trackingData };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit tracking data';
        return { success: false, data: trackingData, error: errorMessage };
      }
    }
    
    return { success: true, data: trackingData };
  };

  // Update tracking data periodically
  const updateTracking = () => {
    if (!isTracking || !startTime) return;
    
    // For PDFs, update the time spent on the current page
    if (isPdf && lastPageChangeTime) {
      const now = new Date();
      const timeOnPage = now.getTime() - lastPageChangeTime.getTime();
      
      updatePageView(currentPage, timeOnPage);
      
      // Reset the page change time to now
      setLastPageChangeTime(now);
    }
  };

  // Record page change in a PDF
  const handlePageChange = (newPage: number) => {
    if (!isTracking || !lastPageChangeTime) return;
    
    // Calculate time spent on the previous page
    const now = new Date();
    const timeOnPreviousPage = now.getTime() - lastPageChangeTime.getTime();
    
    // Update time for the previous page
    updatePageView(currentPage, timeOnPreviousPage);
    
    // Set new current page and reset timer
    setCurrentPage(newPage);
    setLastPageChangeTime(now);
  };

  // Helper to update the page view durations
  const updatePageView = (page: number, durationMs: number) => {
    setPageViews(prev => {
      const newMap = new Map<number, number>(prev);
      const currentDuration = newMap.get(page) ?? 0;
      newMap.set(page, currentDuration + (durationMs || 0));
      return newMap;
    });
  };

  // Manual submit function for tracking data
  const submitTrackingData = async (trackingData: TrackingData): Promise<{ success: boolean; error?: string }> => {
    if (!documentAccessId) {
      const errorMessage = 'Document access ID is required for tracking';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }

    setError(null);
    
    try {
      await trackingMutation.mutateAsync(trackingData);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit tracking data';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Clear error function
  const clearError = () => {
    setError(null);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      
      // If still tracking when component unmounts, finalize the tracking
      if (isTracking && startTime) {
        // Use the non-async version for cleanup to avoid issues
        const durationMs = new Date().getTime() - startTime.getTime();
        if (durationMs >= minTrackingDuration) {
          const trackingData: TrackingData = { durationMs };
          if (isPdf && pageViewsRef.current.size > 0) {
            trackingData.pageViews = Array.from(pageViewsRef.current.entries()).map((entry) => {
              const [page, duration] = entry as [number, number];
              return { page, durationMs: duration };
            });
          }
          
          if (onTrackingDataAvailable) {
            onTrackingDataAvailable(trackingData);
          }
          
          // Submit in background if autoSubmit is enabled
          if (autoSubmit && documentAccessId) {
            trackingMutation.mutate(trackingData);
          }
        }
      }
    };
  }, [isTracking, startTime, minTrackingDuration, isPdf, onTrackingDataAvailable, autoSubmit, documentAccessId, trackingMutation]);

  return {
    // Tracking state
    isTracking,
    error,
    
    // Mutation states
    isSubmitting: trackingMutation.isPending,
    
    // Current tracking data (live)
    currentTrackingData: {
      durationMs: startTime ? new Date().getTime() - startTime.getTime() : 0,
      pageViews: isPdf 
        ? Array.from(pageViews.entries()).map((entry) => {
            const [page, duration] = entry as [number, number];
            return { page, durationMs: duration };
          })
        : undefined
    },
    
    // Actions
    startTracking,
    stopTracking,
    handlePageChange,
    submitTrackingData,
    clearError,
  };
} 