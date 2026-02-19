import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';

export interface AttachmentMetadata {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url?: string;
  filePath?: string;
}

export interface EmailOperationData {
  subject: string;
  body: string;
  htmlBody: string;
  contentType: string;
  to: Array<{ name?: string; email: string }>;
  cc: Array<{ name?: string; email: string }>;
  bcc: Array<{ name?: string; email: string }>;
  from: { email: string; name: string; grantId: string };
  contactIds: string[];
  organizationId: string;
  replyToMessageId?: string;
  attachments: AttachmentMetadata[];
  threadId?: string;
  id?: string;
  isDraft?: boolean;
  scheduledDate?: string;
}

export interface EmailActivity {
  _id: string;
  subject: string;
  body: string;
  htmlBody: string;
  contentType: string;
  to: Array<{ name?: string; email: string }>;
  cc: Array<{ name?: string; email: string }>;
  bcc: Array<{ name?: string; email: string }>;
  from: { email: string; name: string; grantId: string };
  contactIds: string[];
  organizationId: string;
  threadId?: string;
  messageId?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'failed' | 'draft';
  scheduledDate?: string;
  attachments?: AttachmentMetadata[];
  createdAt: Date;
  updatedAt?: Date;
  date?: Date;
}

type EmailActivityScope = 'opportunity' | 'prospect' | 'contact';

export const useEmailOperations = (params?: { entityType: EmailActivityScope; entityId: string }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Compute scoped list key and endpoint based on provided params
  const listKey = params?.entityType === 'opportunity'
    ? queryKeys.emailActivities.byOpportunity(params.entityId)
    : params?.entityType === 'prospect'
    ? queryKeys.emailActivities.byProspect(params.entityId)
    : params?.entityType === 'contact'
    ? queryKeys.emailActivities.byContact(params.entityId)
    : queryKeys.emailActivities.list();

  const listEndpoint = params?.entityType && params?.entityId
    ? `api/email-activities/${params.entityType}/${params.entityId}`
    : 'api/email-activities';

  // Use useQuery for fetching email activities data (single source of truth)
  const emailActivitiesQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(listEndpoint, "GET", null);
      if (apiError) throw new Error(apiError);
      
      // Process and return clean data structure
      const activitiesData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process date fields and other transformations
      return activitiesData.map((activity: any) => ({
        ...activity,
        createdAt: new Date(activity.createdAt),
        updatedAt: activity.updatedAt ? new Date(activity.updatedAt) : undefined,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (emailData: EmailOperationData) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/email-activities/drafts',
        'POST',
        emailData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (emailData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.emailActivities.drafts() });

      // Snapshot the previous values for rollback
      const previousActivities = queryClient.getQueryData(listKey);
      const previousDrafts = queryClient.getQueryData(queryKeys.emailActivities.drafts());

      // Optimistically add the new draft to cache
      const optimisticDraft: EmailActivity = {
        _id: `temp-${Date.now()}`, // Temporary ID
        ...emailData,
        status: 'draft',
        createdAt: new Date(),
        messageId: '',
      };

      queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
        if (!old || !Array.isArray(old)) return [optimisticDraft];
        return [optimisticDraft, ...old];
      });

      return { previousActivities, previousDrafts };
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousDrafts) {
        queryClient.setQueryData(queryKeys.emailActivities.drafts(), context.previousDrafts);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.emailActivities.drafts() });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: EmailOperationData) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/email-activities/send',
        'POST',
        emailData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (emailData) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousActivities = queryClient.getQueryData(listKey);

      // Optimistically update draft to sent status
      if (emailData.id) {
        queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((activity: EmailActivity) =>
            activity._id === emailData.id
              ? { ...activity, status: 'completed' }
              : activity
          );
        });
      }

      return { previousActivities };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const scheduleEmailMutation = useMutation({
    mutationFn: async (emailData: EmailOperationData) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/email-activities/schedule',
        'POST',
        emailData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (emailData) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.emailActivities.scheduled() });
      
      const previousActivities = queryClient.getQueryData(listKey);
      const previousScheduled = queryClient.getQueryData(queryKeys.emailActivities.scheduled());

      // Optimistically add scheduled email
      const optimisticScheduled: EmailActivity = {
        _id: emailData.id || `temp-scheduled-${Date.now()}`,
        ...emailData,
        status: 'scheduled',
        createdAt: new Date(),
        messageId: '',
      };

      queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
        if (!old || !Array.isArray(old)) return [optimisticScheduled];
        
        // If updating existing draft, replace it; otherwise add new
        if (emailData.id) {
          return old.map((activity: EmailActivity) =>
            activity._id === emailData.id ? optimisticScheduled : activity
          );
        }
        return [optimisticScheduled, ...old];
      });

      return { previousActivities, previousScheduled };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousScheduled) {
        queryClient.setQueryData(queryKeys.emailActivities.scheduled(), context.previousScheduled);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.emailActivities.scheduled() });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ emailData, isDraft }: { emailData: EmailOperationData; isDraft: boolean }) => {
      const endpoint = isDraft && emailData.id
        ? `api/email-activities/drafts/${emailData.id}` 
        : 'api/email-activities/drafts';
      const method = isDraft && emailData.id ? 'PUT' : 'POST';
      const { data, error: apiError } = await requestWithAuth(endpoint, method, emailData);
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async ({ emailData, isDraft }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.emailActivities.drafts() });
      
      const previousActivities = queryClient.getQueryData(listKey);
      const previousDrafts = queryClient.getQueryData(queryKeys.emailActivities.drafts());

      // Optimistically update the draft
      queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        if (emailData.id) {
          // Update existing draft
          return old.map((activity: EmailActivity) =>
            activity._id === emailData.id
              ? { ...activity, ...emailData, status: isDraft ? 'draft' : 'completed', updatedAt: new Date() }
              : activity
          );
        }
        
        // Create new draft
        const newDraft: EmailActivity = {
          _id: `temp-${Date.now()}`,
          ...emailData,
          status: isDraft ? 'draft' : 'completed',
          createdAt: new Date(),
          messageId: '',
        };
        return [newDraft, ...old];
      });

      return { previousActivities, previousDrafts };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousDrafts) {
        queryClient.setQueryData(queryKeys.emailActivities.drafts(), context.previousDrafts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.emailActivities.drafts() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/email-activities/${emailId}`,
        'DELETE',
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousActivities = queryClient.getQueryData(listKey);

      // Optimistically remove from cache
      queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((activity: EmailActivity) => activity._id !== emailId);
      });

      return { previousActivities };
    },
    onError: (_err, _emailId, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const unscheduleMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/email-activities/scheduled/${emailId}/convert-to-draft`,
        'PUT',
        null
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.emailActivities.scheduled() });
      
      const previousActivities = queryClient.getQueryData(listKey);
      const previousScheduled = queryClient.getQueryData(queryKeys.emailActivities.scheduled());

      // Optimistically convert scheduled to draft
      queryClient.setQueryData(listKey, (old: EmailActivity[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((activity: EmailActivity) =>
          activity._id === emailId
            ? { ...activity, status: 'draft', scheduledDate: undefined }
            : activity
        );
      });

      return { previousActivities, previousScheduled };
    },
    onError: (_err, _emailId, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
      if (context?.previousScheduled) {
        queryClient.setQueryData(queryKeys.emailActivities.scheduled(), context.previousScheduled);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.emailActivities.scheduled() });
    },
  });

  // Wrapper functions following template pattern
  const saveDraft = async (emailData: EmailOperationData) => {
    setError(null);
    try {
      const data = await saveDraftMutation.mutateAsync(emailData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save draft";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const sendEmail = async (emailData: EmailOperationData) => {
    setError(null);
    try {
      const data = await sendEmailMutation.mutateAsync(emailData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send email";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const scheduleEmail = async (emailData: EmailOperationData) => {
    setError(null);
    try {
      const data = await scheduleEmailMutation.mutateAsync(emailData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to schedule email";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateDraft = async (emailData: EmailOperationData, isDraft: boolean) => {
    setError(null);
    try {
      const data = await updateDraftMutation.mutateAsync({ emailData, isDraft });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update draft";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteEmail = async (emailId: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(emailId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete email";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const unscheduleEmail = async (emailId: string) => {
    setError(null);
    try {
      const data = await unscheduleMutation.mutateAsync(emailId);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to unschedule email";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const fetchEmailActivity = async (emailId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.emailActivities.detail(emailId),
        queryFn: async () => requestWithAuth(`api/email-activities/${emailId}`, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      if (data && (data._id || (data.data && data.data._id))) {
        const emailData = data._id ? data : data.data;
        return { success: true, data: emailData };
      } else {
        return { success: false, error: "No email activity data found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load email activity details";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  // Attachment operations
  const uploadAttachmentsMutation = useMutation({
    mutationFn: async ({ files, organizationId }: { files: File[]; organizationId: string }) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('attachments', file);
      });
      formData.append('organizationId', organizationId);

      const { data, error: apiError } = await requestWithAuth(
        'api/email-activities/attachments/upload',
        'POST',
        formData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/email-activities/attachments/${attachmentId}`,
        'DELETE',
        null
      );
      if (apiError) throw new Error(apiError);
    },
  });

  const getAttachmentMetadataMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/email-activities/attachments/${activityId}`,
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
  });

  // Wrapper functions for attachment operations
  const uploadAttachments = async (files: File[], organizationId: string) => {
    setError(null);
    try {
      const data = await uploadAttachmentsMutation.mutateAsync({ files, organizationId });
      return { success: true, data: data.attachments || data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload attachments";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    setError(null);
    try {
      await deleteAttachmentMutation.mutateAsync(attachmentId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete attachment";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const getAttachmentMetadata = async (activityId: string) => {
    setError(null);
    try {
      const data = await getAttachmentMetadataMutation.mutateAsync(activityId);
      return { success: true, data: data.attachments || data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get attachment metadata";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states (single source of truth)
    emailActivities: emailActivitiesQuery.data || [],
    isLoadingEmailActivities: emailActivitiesQuery.isLoading,
    emailActivitiesError: emailActivitiesQuery.error,
    refetchEmailActivities: emailActivitiesQuery.refetch,
    
    // Mutation states
    isLoading,
    isSavingDraft: saveDraftMutation.isPending,
    isSendingEmail: sendEmailMutation.isPending,
    isSchedulingEmail: scheduleEmailMutation.isPending,
    isUpdatingDraft: updateDraftMutation.isPending,
    isDeletingEmail: deleteMutation.isPending,
    isUnschedulingEmail: unscheduleMutation.isPending,
    error,
    
    // Actions
    saveDraft,
    sendEmail,
    scheduleEmail,
    updateDraft,
    deleteEmail,
    unscheduleEmail,
    fetchEmailActivity,
    clearError,
    
    // Attachment operations
    uploadAttachments,
    deleteAttachment,
    getAttachmentMetadata,
    isUploadingAttachments: uploadAttachmentsMutation.isPending,
    isDeletingAttachment: deleteAttachmentMutation.isPending,
    isLoadingAttachmentMetadata: getAttachmentMetadataMutation.isPending,
  };
}; 