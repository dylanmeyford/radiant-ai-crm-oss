import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import type {
  GetMeetingsParams, 
  MeetingListResponse, 
  InviteNotetakerPayload, 
  InviteNotetakerResponse, 
  CancelNotetakerResponse,
  MeetingDetail,
  MeetingStatus,
} from "../types/notetaker";

export function useNotetakerOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching meetings
  const meetingsQuery = useQuery({
    queryKey: queryKeys.notetaker.meetings(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/calendar-activities/recorded", "GET", null);
      if (apiError) throw new Error(apiError);
      
      const meetingsData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process any date fields
      return meetingsData.map((meeting: any) => ({
        ...meeting,
        startTime: meeting.startTime ? new Date(meeting.startTime) : undefined,
        endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Individual meeting detail query
  const useMeetingDetail = (meetingId: string) => {
    return useQuery({
      queryKey: queryKeys.notetaker.meeting(meetingId),
      queryFn: async () => {
        const { data, error: apiError } = await requestWithAuth(`api/calendar-activities/recorded/${meetingId}`, "GET", null);
        if (apiError) throw new Error(apiError);

        // Check for errors or unexpected response structure
        if (!data || typeof data.success !== 'boolean') {
          throw new Error("Failed to fetch meeting details due to unexpected response structure.");
        }

        if (!data.success || !data.data) {
          throw new Error(data.message || "Failed to fetch meeting details: Operation not successful or no data.");
        }
        
        const apiMeetingData = data.data as any;

        // Map the API data to our MeetingDetail type
        const meetingDetails: MeetingDetail = {
          _id: apiMeetingData._id,
          title: apiMeetingData.title,
          startTime: apiMeetingData.startTime,
          endTime: apiMeetingData.endTime,
          status: apiMeetingData.status as MeetingStatus,
          participants: apiMeetingData.attendees || [], 
          durationMinutes: apiMeetingData.durationMinutes, 
          aiSummarySnippet: apiMeetingData.aiSummarySnippet,
          aiSummary: apiMeetingData.aiSummary?.summary,
          notetakerId: apiMeetingData.nylasNotetakerId || apiMeetingData.eventId || apiMeetingData.notetakerId,
          mediaUrl: undefined, 
          transcription: undefined, 
        };

        return meetingDetails;
      },
      enabled: !!meetingId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  // Media content query
  const useMeetingMedia = (activityId: string, mediaType: 'transcript' | 'recording') => {
    return useQuery({
      queryKey: queryKeys.notetaker.media(activityId, mediaType),
      queryFn: async () => {
        const config = { 
          headers: { 
            'Accept': mediaType === 'transcript' ? 'text/plain, application/json' : 'application/octet-stream, */*' 
          } 
        };
        
        const { data, error: apiError } = await requestWithAuth(
          `api/calendar-activities/recorded/${activityId}/media/${mediaType}`, 
          "GET", 
          null, 
          config
        );
        
        if (apiError) throw new Error(apiError);

        // Handle different data types based on media type
        if ((mediaType === 'recording' && data instanceof Blob) || (mediaType === 'transcript' && typeof data === 'string')) {
          return data;
        } else if (data instanceof Blob && mediaType === 'transcript') {
          return await data.text();
        } else {
          console.warn(`Unexpected data type for ${mediaType}:`, typeof data);
          if (data instanceof Blob) return data;
          if (typeof data === 'string') return data;
          throw new Error(`Unexpected data format received for ${mediaType}.`);
        }
      },
      enabled: !!activityId && !!mediaType,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  // Invite notetaker mutation with optimistic updates
  const inviteMutation = useMutation({
    mutationFn: async (payload: InviteNotetakerPayload) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/notetaker/invite",
        "POST",
        payload
      );
      if (apiError) throw new Error(apiError);
      return data as InviteNotetakerResponse;
    },
    onSuccess: () => {
      // Invalidate meetings to refresh the list
      queryClient.invalidateQueries({ queryKey: queryKeys.notetaker.meetings() });
    },
  });

  // Cancel notetaker mutation with optimistic updates
  const cancelMutation = useMutation({
    mutationFn: async (notetakerId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/notetaker/meetings/${notetakerId}/cancel`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
      return data as CancelNotetakerResponse;
    },
    onMutate: async (notetakerId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.notetaker.meetings() });
      await queryClient.cancelQueries({ queryKey: queryKeys.notetaker.meeting(notetakerId) });

      // Snapshot the previous values
      const previousMeetings = queryClient.getQueryData(queryKeys.notetaker.meetings());
      const previousMeeting = queryClient.getQueryData(queryKeys.notetaker.meeting(notetakerId));

      // Optimistically update the meetings list to show cancelled status
      queryClient.setQueryData(queryKeys.notetaker.meetings(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((meeting: any) =>
          meeting.notetakerId === notetakerId || meeting._id === notetakerId
            ? { ...meeting, status: 'cancelled' as MeetingStatus }
            : meeting
        );
      });

      // Optimistically update the individual meeting
      queryClient.setQueryData(queryKeys.notetaker.meeting(notetakerId), (old: any) => {
        if (!old) return old;
        return { ...old, status: 'cancelled' as MeetingStatus };
      });

      return { previousMeetings, previousMeeting };
    },
    onError: (_err, notetakerId, context) => {
      // Rollback on error
      if (context?.previousMeetings) {
        queryClient.setQueryData(queryKeys.notetaker.meetings(), context.previousMeetings);
      }
      if (context?.previousMeeting) {
        queryClient.setQueryData(queryKeys.notetaker.meeting(notetakerId), context.previousMeeting);
      }
    },
    onSettled: (_data, _error, notetakerId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.notetaker.meetings() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notetaker.meeting(notetakerId) });
    },
  });

  // Wrapper functions for easier usage
  const inviteNotetaker = async (payload: InviteNotetakerPayload) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await inviteMutation.mutateAsync(payload);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to invite notetaker";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const cancelNotetaker = async (notetakerId: string) => {
    setError(null);

    try {
      const data = await cancelMutation.mutateAsync(notetakerId);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel notetaker";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const fetchMeetingsWithParams = async (params?: GetMeetingsParams) => {
    setIsLoading(true);
    setError(null);

    try {
      let url = `api/calendar-activities/recorded`;
      if (params) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
      }

      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.notetaker.meetings(params as any),
        queryFn: async () => requestWithAuth(url, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      return { success: true, data: data as MeetingListResponse };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch meetings";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    meetings: meetingsQuery.data || [],
    isLoadingMeetings: meetingsQuery.isLoading,
    meetingsError: meetingsQuery.error,
    refetchMeetings: meetingsQuery.refetch,
    
    // Query hooks for components to use
    useMeetingDetail,
    useMeetingMedia,
    
    // Mutation states
    isLoading,
    isInviting: inviteMutation.isPending,
    isCancelling: cancelMutation.isPending,
    error,
    
    // Actions
    inviteNotetaker,
    cancelNotetaker,
    fetchMeetingsWithParams,
    clearError,
  };
} 