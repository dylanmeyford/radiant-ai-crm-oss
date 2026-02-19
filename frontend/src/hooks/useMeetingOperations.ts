import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from './queryKeys';
import { CalendarActivity } from '@/types/dashboard';
import type { Prospect, Contact } from "@/types/prospect";

interface MediaUrlResponse {
  success: boolean;
  url: string;
  expiresIn: number;
  contentType: string;
}

interface RecordedMeetingsParams {
  page?: number;
  limit?: number;
}

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

interface RecordedMeetingsResult {
  meetings: CalendarActivity[];
  pagination: PaginationMeta;
}

interface AssignProspectVariables {
  meetingId: string;
  prospect: Prospect | null;
}

interface AssignContactsVariables {
  meetingId: string;
  contacts: Contact[];
}

interface RecordedQuerySnapshot {
  key: QueryKey;
  data: RecordedMeetingsResult | undefined;
}

export function useMeetingOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const normalizeMeeting = (meeting: any): CalendarActivity => {
    if (!meeting) {
      throw new Error('Meeting data is required');
    }

    return {
      ...meeting,
      startTime: meeting.startTime ? new Date(meeting.startTime) : meeting.startTime,
      endTime: meeting.endTime ? new Date(meeting.endTime) : meeting.endTime,
      aiSummary: meeting.aiSummary
        ? {
            ...meeting.aiSummary,
            date: meeting.aiSummary.date ? new Date(meeting.aiSummary.date) : meeting.aiSummary.date,
          }
        : undefined,
      agenda: meeting.agenda
        ? {
            ...meeting.agenda,
            generatedAt: meeting.agenda.generatedAt ? new Date(meeting.agenda.generatedAt) : meeting.agenda.generatedAt,
          }
        : undefined,
    } as CalendarActivity;
  };

  const snapshotRecordedQueries = (): RecordedQuerySnapshot[] => {
    return queryClient
      .getQueriesData<RecordedMeetingsResult>({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] })
      .map(([key, data]) => ({ key, data }));
  };

  const updateRecordedQueries = (
    meetingId: string,
    updater: (meeting: CalendarActivity) => CalendarActivity
  ) => {
    const recordedQueries = queryClient.getQueriesData<RecordedMeetingsResult>({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] });
    recordedQueries.forEach(([key]) => {
      queryClient.setQueryData<RecordedMeetingsResult | undefined>(key, (old) => {
        if (!old || !Array.isArray(old.meetings)) return old;
        return {
          ...old,
          meetings: old.meetings.map((meeting) =>
            meeting._id === meetingId ? updater(meeting) : meeting
          ),
        };
      });
    });
  };

  // Fetch single meeting details
  const useMeetingDetails = (meetingId: string | undefined) => {
    return useQuery({
      queryKey: queryKeys.calendars.activity(meetingId || ''),
      queryFn: async () => {
        if (!meetingId) throw new Error('Meeting ID is required');
        
        const { data, error: apiError } = await requestWithAuth(
          `api/calendar-activities/${meetingId}`,
          "GET",
          null
        );
        
        if (apiError) throw new Error(apiError);
        
        // Handle response structure - it might be data.data or just data
        const meetingData = data?.data || data;
        
        if (!meetingData) throw new Error('No meeting data found');
        
        // Process date fields
        return {
          ...meetingData,
          startTime: new Date(meetingData.startTime),
          endTime: new Date(meetingData.endTime),
          aiSummary: meetingData.aiSummary ? {
            ...meetingData.aiSummary,
            date: new Date(meetingData.aiSummary.date)
          } : undefined,
          agenda: meetingData.agenda ? {
            ...meetingData.agenda,
            generatedAt: new Date(meetingData.agenda.generatedAt)
          } : undefined,
        } as CalendarActivity;
      },
      enabled: !!meetingId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  const useRecordedMeetings = ({ page = 1, limit = 10 }: RecordedMeetingsParams = {}) => {
    return useQuery<RecordedMeetingsResult>({
      queryKey: queryKeys.calendars.recorded({ page, limit }),
      queryFn: async () => {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        }).toString();

        const { data, error: apiError } = await requestWithAuth(
          `api/calendar-activities/recorded?${params}`,
          "GET",
          null
        );

        if (apiError) throw new Error(apiError);

        const rawMeetings = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

        const paginationSource = data?.pagination || {};

        return {
          meetings: rawMeetings.map(normalizeMeeting),
          pagination: {
            currentPage: paginationSource.currentPage ?? page,
            totalPages: paginationSource.totalPages ?? 1,
            totalItems: paginationSource.totalItems ?? rawMeetings.length,
            itemsPerPage: paginationSource.itemsPerPage ?? limit,
          },
        };
      },
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  };

  const assignProspectMutation = useMutation({
    mutationFn: async ({ meetingId, prospect }: AssignProspectVariables) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/calendar-activities/${meetingId}`,
        "PUT",
        { prospect: prospect?._id ?? null }
      );

      if (apiError) throw new Error(apiError);

      return normalizeMeeting(data?.data || data);
    },
    onMutate: async ({ meetingId, prospect }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] });
      await queryClient.cancelQueries({ queryKey: queryKeys.calendars.activity(meetingId) });

      const previousRecorded = snapshotRecordedQueries();
      const previousMeeting = queryClient.getQueryData<CalendarActivity>(queryKeys.calendars.activity(meetingId));

      updateRecordedQueries(meetingId, (meeting) => ({ ...meeting, prospect }));
      queryClient.setQueryData<CalendarActivity | undefined>(queryKeys.calendars.activity(meetingId), (old) => {
        if (!old) return old;
        return { ...old, prospect };
      });

      return { previousRecorded, previousMeeting };
    },
    onError: (mutationError, variables, context) => {
      if (context?.previousRecorded) {
        context.previousRecorded.forEach(({ key, data }) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousMeeting) {
        queryClient.setQueryData(queryKeys.calendars.activity(variables.meetingId), context.previousMeeting);
      }
      const errorMessage = mutationError instanceof Error ? mutationError.message : "Failed to assign prospect";
      setError(errorMessage);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.activity(variables.meetingId) });
    },
  });

  const assignContactsMutation = useMutation({
    mutationFn: async ({ meetingId, contacts }: AssignContactsVariables) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/calendar-activities/${meetingId}`,
        "PUT",
        { contacts: contacts.map((contact) => contact._id) }
      );

      if (apiError) throw new Error(apiError);

      return normalizeMeeting(data?.data || data);
    },
    onMutate: async ({ meetingId, contacts }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] });
      await queryClient.cancelQueries({ queryKey: queryKeys.calendars.activity(meetingId) });

      const previousRecorded = snapshotRecordedQueries();
      const previousMeeting = queryClient.getQueryData<CalendarActivity>(queryKeys.calendars.activity(meetingId));

      updateRecordedQueries(meetingId, (meeting) => ({ ...meeting, contacts }));
      queryClient.setQueryData<CalendarActivity | undefined>(queryKeys.calendars.activity(meetingId), (old) => {
        if (!old) return old;
        return { ...old, contacts };
      });

      return { previousRecorded, previousMeeting };
    },
    onError: (mutationError, variables, context) => {
      if (context?.previousRecorded) {
        context.previousRecorded.forEach(({ key, data }) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousMeeting) {
        queryClient.setQueryData(queryKeys.calendars.activity(variables.meetingId), context.previousMeeting);
      }
      const errorMessage = mutationError instanceof Error ? mutationError.message : "Failed to assign contacts";
      setError(errorMessage);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'calendars', entity: 'recorded' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.activity(variables.meetingId) });
    },
  });

  // Fetch presigned media URL (recording or transcript)
  const fetchMediaUrl = async (
    meetingId: string,
    mediaType: 'recording' | 'transcript'
  ): Promise<{ success: boolean; data?: MediaUrlResponse; error?: string }> => {
    setError(null);

    try {
      const { data, error: apiError } = await requestWithAuth(
        `api/calendar-activities/recorded/${meetingId}/media/${mediaType}`,
        "GET",
        null
      );

      if (apiError) {
        throw new Error(apiError);
      }

      if (data?.success && data?.url) {
        return { success: true, data: data as MediaUrlResponse };
      } else {
        return { success: false, error: "No media URL found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to load ${mediaType}`;
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Query for recording URL
  const useRecordingUrl = (meetingId: string | undefined, enabled: boolean = true) => {
    return useQuery({
      queryKey: queryKeys.notetaker.media(meetingId || '', 'recording'),
      queryFn: async () => {
        if (!meetingId) throw new Error('Meeting ID is required');
        
        const result = await fetchMediaUrl(meetingId, 'recording');
        
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch recording URL');
        }
        
        return result.data;
      },
      enabled: !!meetingId && enabled,
      staleTime: 50 * 60 * 1000, // 50 minutes (URLs expire in 1 hour)
      gcTime: 60 * 60 * 1000, // 1 hour
    });
  };

  // Query for transcript URL
  const useTranscriptUrl = (meetingId: string | undefined, enabled: boolean = true) => {
    return useQuery({
      queryKey: queryKeys.notetaker.media(meetingId || '', 'transcript'),
      queryFn: async () => {
        if (!meetingId) throw new Error('Meeting ID is required');
        
        const result = await fetchMediaUrl(meetingId, 'transcript');
        
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch transcript URL');
        }
        
        return result.data;
      },
      enabled: !!meetingId && enabled,
      staleTime: 50 * 60 * 1000, // 50 minutes
      gcTime: 60 * 60 * 1000, // 1 hour
    });
  };

  // Mutation: Add or replace transcript for a meeting (optimistic)
  const useAddTranscript = (meetingId: string | undefined) => {
    return useMutation({
      mutationFn: async (transcriptionText: string) => {
        if (!meetingId) throw new Error('Meeting ID is required');
        const { data, error: apiError } = await requestWithAuth(
          `api/calendar-activities/${meetingId}/transcript`,
          "PUT",
          { transcriptionText }
        );
        if (apiError) throw new Error(apiError);
        return data?.data || data;
      },
      onMutate: async (newTranscript) => {
        if (!meetingId) return;
        await queryClient.cancelQueries({ queryKey: queryKeys.calendars.activity(meetingId) });
        await queryClient.cancelQueries({ queryKey: queryKeys.notetaker.media(meetingId, 'transcript') });

        const previousMeeting = queryClient.getQueryData<CalendarActivity>(queryKeys.calendars.activity(meetingId));

        // Optimistically set the transcriptionText
        queryClient.setQueryData<CalendarActivity | undefined>(queryKeys.calendars.activity(meetingId), (old) => {
          if (!old) return old as any;
          return {
            ...old,
            transcriptionText: newTranscript,
          };
        });

        return { previousMeeting };
      },
      onError: (_err, _vars, context) => {
        if (!meetingId) return;
        if (context?.previousMeeting) {
          queryClient.setQueryData(queryKeys.calendars.activity(meetingId), context.previousMeeting);
        }
      },
      onSettled: () => {
        if (!meetingId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.calendars.activity(meetingId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.notetaker.media(meetingId, 'transcript') });
      },
    });
  };

  const clearError = () => {
    setError(null);
  };

  const assignMeetingProspect = async (meetingId: string, prospect: Prospect | null) => {
    try {
      const data = await assignProspectMutation.mutateAsync({ meetingId, prospect });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to assign prospect";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const assignMeetingContacts = async (meetingId: string, contacts: Contact[]) => {
    try {
      const data = await assignContactsMutation.mutateAsync({ meetingId, contacts });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to assign contacts";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    // Queries
    useMeetingDetails,
    useRecordedMeetings,
    useRecordingUrl,
    useTranscriptUrl,
    
    // Mutations
    useAddTranscript,
    assignMeetingProspect,
    assignMeetingContacts,
    
    // State
    error,
    isAssigningProspect: assignProspectMutation.isPending,
    isAssigningContacts: assignContactsMutation.isPending,
    
    // Actions
    fetchMediaUrl,
    clearError,
  };
}

