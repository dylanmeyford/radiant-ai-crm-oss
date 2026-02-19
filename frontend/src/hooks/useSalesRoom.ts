import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { requestNoAuth } from './requestNoAuth';
import { DigitalSalesRoom, Document, SalesRoomAnalytics, TrackingData } from '../types/digitalSalesRoom';
import { queryKeys } from './queryKeys'; // Updated with byOpportunity

interface UseDigitalSalesRoomReturn {
  // Mutation states
  isCreating: boolean;
  isUploading: boolean;
  isDeleting: boolean;
  error: string | null;
  
  // Actions
  createSalesRoom: (name: string, description: string, opportunityId: string, expiresAt?: Date) => Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }>;
  getSalesRoom: (salesRoomId: string) => Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }>;
  getSalesRoomByOpportunity: (opportunityId: string) => Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }>;
  getSalesRoomForVisitor: (uniqueId: string) => Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }>;
  uploadDocument: (salesRoomId: string, file: File, name?: string, description?: string, opportunityId?: string) => Promise<{ success: boolean; data?: Document; error?: string }>;
  addLink: (salesRoomId: string, linkData: { name: string; url: string; description?: string }, opportunityId?: string) => Promise<{ success: boolean; data?: Document; error?: string }>;
  deleteDocument: (salesRoomId: string, documentId: string, opportunityId?: string) => Promise<{ success: boolean; error?: string }>;
  deleteLink: (salesRoomId: string, linkId: string, opportunityId?: string) => Promise<{ success: boolean; error?: string }>;
  addPlaybookFileToSalesRoom: (salesRoomId: string, documentId: string) => Promise<{ success: boolean; data?: Document; error?: string }>;
  getSalesRoomAnalytics: (salesRoomId: string) => Promise<{ success: boolean; data?: SalesRoomAnalytics; error?: string }>;
  requestAccess: (uniqueId: string, email: string) => Promise<{ success: boolean; message: string; code?: string }>;
  verifyAccess: (uniqueId: string, email: string, code: string) => Promise<{ success: boolean; message: string; salesRoom?: any }>;
  trackDocumentInteraction: (documentAccessId: string, trackingData: TrackingData) => Promise<boolean>;
  trackLinkInteraction: (linkId: string, trackingData: { durationMs: number; referrer?: string }) => Promise<boolean>;
  clearError: () => void;
}

// New hook specifically for querying sales room by opportunity
export function useSalesRoomByOpportunity(opportunityId: string) {
  return useQuery({
    queryKey: queryKeys.salesRoom.byOpportunity(opportunityId),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        `api/digital-sales-rooms/${opportunityId}`,
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      
      // The API returns the sales room for this opportunity directly
      return data?.data || data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!opportunityId,
  });
}

export function useDigitalSalesRoom(): UseDigitalSalesRoomReturn {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();



  const createSalesRoomMutation = useMutation({
    mutationFn: async ({ name, description, opportunityId, expiresAt }: { name: string; description: string; opportunityId: string; expiresAt?: Date }) => {
      const response = await requestWithAuth(
        'api/digital-sales-rooms',
        'POST',
        { name, description, opportunityId, expiresAt }
      );
      if (response.error) throw new Error(response.error);
      return response.data.data as DigitalSalesRoom;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches for the specific opportunity
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(variables.opportunityId) });

      // Snapshot the previous value
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(variables.opportunityId));

      // Optimistically set the new sales room for this opportunity
      const optimisticSalesRoom: DigitalSalesRoom = {
        _id: `temp-${Date.now()}`,
        name: variables.name,
        description: variables.description,
        opportunity: variables.opportunityId,
        createdBy: 'current-user', // Will be replaced with real data
        organization: 'current-org', // Will be replaced with real data
        uniqueId: `temp-unique-${Date.now()}`,
        documents: [],
        links: [],
        visitors: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: variables.expiresAt,
        isActive: true,
      };

      queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(variables.opportunityId), optimisticSalesRoom);

      return { previousSalesRoom, opportunityId: variables.opportunityId };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousSalesRoom && context?.opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(context.opportunityId), context.previousSalesRoom);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(variables.opportunityId) });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ salesRoomId, documentId }: { salesRoomId: string; documentId: string }) => {
      const response = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/documents/${documentId}`,
        'DELETE',
        null
      );
      if (response.error) throw new Error(response.error);
    },
    onMutate: async (variables) => {
      // Use provided opportunity ID or try to find it from cache
      let opportunityId = (variables as any).opportunityId;
      
      // If not provided, try to get it from the detail cache
      if (!opportunityId) {
        const currentSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId)) as any;
        opportunityId = currentSalesRoom?.opportunity;
      }
      
      // Cancel any outgoing refetches for both detail and byOpportunity queries
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      
      if (opportunityId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }

      // Snapshot the previous values
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId));
      const previousSalesRoomByOpportunity = opportunityId ? queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(opportunityId)) : null;

      // Optimistically remove document from both caches
      const updateFn = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          documents: old.documents?.filter((doc: any) => 
            (typeof doc === 'string' ? doc : doc._id) !== variables.documentId
          ) || []
        };
      };

      queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), updateFn);
      
      if (opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), updateFn);
      }

      return { previousSalesRoom, previousSalesRoomByOpportunity, opportunityId };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousSalesRoom) {
        queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), context.previousSalesRoom);
      }
      if (context?.previousSalesRoomByOpportunity && context?.opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(context.opportunityId), context.previousSalesRoomByOpportunity);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      if (context?.opportunityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(context.opportunityId) });
      }
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ salesRoomId, name, url, description }: { salesRoomId: string; name: string; url: string; description?: string }) => {
      const response = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/links`,
        'POST',
        {
          name,
          url,
          description,
          type: 'link'
        }
      );
      if (response.error) throw new Error(response.error);
      return response.data.data as Document;
    },
    onMutate: async (variables) => {
      // Use provided opportunity ID or try to find it from cache
      let opportunityId = (variables as any).opportunityId;
      
      // If not provided, try to get it from the detail cache
      if (!opportunityId) {
        const currentSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId)) as any;
        opportunityId = currentSalesRoom?.opportunity;
      }
      
      // Cancel any outgoing refetches for both detail and byOpportunity queries
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      
      if (opportunityId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }

      // Snapshot the previous values
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId));
      const previousSalesRoomByOpportunity = opportunityId ? queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(opportunityId)) : null;

      // Optimistically add link to both caches
      const optimisticLink: Document = {
        _id: `temp-link-${Date.now()}`,
        name: variables.name,
        url: variables.url,
        description: variables.description,
        fileType: 'link',
        fileSize: 0,
        uploadedBy: 'current-user', // Will be replaced with real data
        uploadedAt: new Date(),
        type: 'link',
      };

      const updateFn = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          links: [...(old.links || []), optimisticLink]
        };
      };

      queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), updateFn);
      
      if (opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), updateFn);
      }

      return { previousSalesRoom, previousSalesRoomByOpportunity, opportunityId };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousSalesRoom) {
        queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), context.previousSalesRoom);
      }
      if (context?.previousSalesRoomByOpportunity && context?.opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(context.opportunityId), context.previousSalesRoomByOpportunity);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      // Always refetch to ensure consistency
      console.log('Add link completed, invalidating caches for salesRoomId:', variables.salesRoomId, 'opportunityId:', context?.opportunityId);
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      if (context?.opportunityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(context.opportunityId) });
      }
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async ({ salesRoomId, linkId }: { salesRoomId: string; linkId: string }) => {
      const response = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/links/${linkId}`,
        'DELETE',
        null
      );
      if (response.error) throw new Error(response.error);
    },
    onMutate: async (variables) => {
      // Use provided opportunity ID or try to find it from cache
      let opportunityId = (variables as any).opportunityId;
      
      // If not provided, try to get it from the detail cache
      if (!opportunityId) {
        const currentSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId)) as any;
        opportunityId = currentSalesRoom?.opportunity;
      }
      
      // Cancel any outgoing refetches for both detail and byOpportunity queries
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      
      if (opportunityId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }

      // Snapshot the previous values
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId));
      const previousSalesRoomByOpportunity = opportunityId ? queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(opportunityId)) : null;

      // Optimistically remove link from both caches
      const updateFn = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          links: old.links?.filter((link: any) => 
            (typeof link === 'string' ? link : link._id) !== variables.linkId
          ) || []
        };
      };

      queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), updateFn);
      
      if (opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), updateFn);
      }

      return { previousSalesRoom, previousSalesRoomByOpportunity, opportunityId };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousSalesRoom) {
        queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), context.previousSalesRoom);
      }
      if (context?.previousSalesRoomByOpportunity && context?.opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(context.opportunityId), context.previousSalesRoomByOpportunity);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      if (context?.opportunityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(context.opportunityId) });
      }
    },
  });

  const addPlaybookFileMutation = useMutation({
    mutationFn: async ({ salesRoomId, documentId }: { salesRoomId: string; documentId: string }) => {
      const response = await requestWithAuth(
        `api/digital-sales-rooms/${salesRoomId}/files`,
        'POST',
        { documentId }
      );
      if (response.error) throw new Error(response.error);
      return response.data.data.addedDocument as Document;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches for both detail and byOpportunity queries
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      
      // Get the current sales room to find the opportunity ID
      const currentSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId)) as any;
      const opportunityId = currentSalesRoom?.opportunity;
      
      if (opportunityId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }

      // Snapshot the previous values
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(variables.salesRoomId));
      const previousSalesRoomByOpportunity = opportunityId ? queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(opportunityId)) : null;

      // Optimistically add document to both caches
      const optimisticDocument: Document = {
        _id: `temp-doc-${Date.now()}`,
        name: 'Loading...',
        fileType: 'document',
        fileSize: 0,
        uploadedBy: 'current-user', // Will be replaced with real data
        uploadedAt: new Date(),
        type: 'file',
      };

      const updateFn = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          documents: [...(old.documents || []), optimisticDocument]
        };
      };

      queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), updateFn);
      
      if (opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), updateFn);
      }

      return { previousSalesRoom, previousSalesRoomByOpportunity, opportunityId };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousSalesRoom) {
        queryClient.setQueryData(queryKeys.salesRoom.detail(variables.salesRoomId), context.previousSalesRoom);
      }
      if (context?.previousSalesRoomByOpportunity && context?.opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(context.opportunityId), context.previousSalesRoomByOpportunity);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.detail(variables.salesRoomId) });
      if (context?.opportunityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(context.opportunityId) });
      }
    },
  });

  const createSalesRoom = async (
    name: string,
    description: string,
    opportunityId: string,
    expiresAt?: Date
  ): Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }> => {
    setError(null);

    try {
      const data = await createSalesRoomMutation.mutateAsync({ name, description, opportunityId, expiresAt });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create sales room';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const getSalesRoom = async (salesRoomId: string): Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }> => {
    setError(null);
    
    try {
      const response = await queryClient.ensureQueryData({
        queryKey: queryKeys.salesRoom.detail(salesRoomId),
        queryFn: async () => {
          const { data, error: apiError } = await requestWithAuth(
            `api/digital-sales-rooms/${salesRoomId}`,
            'GET',
            null
          );
          if (apiError) throw new Error(apiError);
          return data.data || data;
        },
      });

      return { success: true, data: response as DigitalSalesRoom };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get sales room';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const getSalesRoomByOpportunity = async (opportunityId: string): Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }> => {
    setError(null);
    console.log('getSalesRoomByOpportunity', opportunityId);
    try {
      const response = await queryClient.ensureQueryData({
        queryKey: queryKeys.salesRoom.byOpportunity(opportunityId),
        queryFn: async () => {
          const { data, error: apiError } = await requestWithAuth(
            `api/digital-sales-rooms/${opportunityId}`,
            'GET',
            null
          );
          if (apiError) throw new Error(apiError);
          
          // The API returns the sales room for this opportunity directly
          return data?.data || data;
        },
      });

      return { success: true, data: response as DigitalSalesRoom };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get sales room for opportunity';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const uploadDocument = async (
    salesRoomId: string,
    file: File,
    name?: string,
    description?: string,
    providedOpportunityId?: string
  ): Promise<{ success: boolean; data?: Document; error?: string }> => {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (name) {
        formData.append('name', name);
      }
      
      if (description) {
        formData.append('description', description);
      }

      const token = localStorage.getItem('accessToken');
      const baseUrl = import.meta.env.VITE_API_URL;

      // Optimistically update the cache
      const optimisticDocument: Document = {
        _id: `temp-upload-${Date.now()}`,
        name: name || file.name,
        description,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: 'current-user', // Will be replaced with real data
        uploadedAt: new Date(),
        type: 'file',
      };

      // Use provided opportunity ID or try to find it from cache
      let opportunityId = providedOpportunityId;
      
      // If not provided, try to get it from the detail cache
      if (!opportunityId) {
        const currentSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(salesRoomId)) as any;
        opportunityId = currentSalesRoom?.opportunity;
      }
      
      // Cancel any outgoing refetches for both detail and byOpportunity queries
      await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.detail(salesRoomId) });
      
      if (opportunityId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }
      
      // Snapshot the previous values
      const previousSalesRoom = queryClient.getQueryData(queryKeys.salesRoom.detail(salesRoomId));
      const previousSalesRoomByOpportunity = opportunityId ? queryClient.getQueryData(queryKeys.salesRoom.byOpportunity(opportunityId)) : null;

      // Optimistically add document to both caches
      const updateFn = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          documents: [...(old.documents || []), optimisticDocument]
        };
      };

      queryClient.setQueryData(queryKeys.salesRoom.detail(salesRoomId), updateFn);
      
      if (opportunityId) {
        queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), updateFn);
      }

      const response = await fetch(`${baseUrl}/api/digital-sales-rooms/${salesRoomId}/documents`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        // Rollback on error for both caches
        if (previousSalesRoom) {
          queryClient.setQueryData(queryKeys.salesRoom.detail(salesRoomId), previousSalesRoom);
        }
        if (previousSalesRoomByOpportunity && opportunityId) {
          queryClient.setQueryData(queryKeys.salesRoom.byOpportunity(opportunityId), previousSalesRoomByOpportunity);
        }
        
        const errorData = await response.json();
        const errorMessage = errorData.message || 'Failed to upload document';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      const responseData = await response.json();
      
      // Update with real data for both caches
      console.log('Upload successful, invalidating caches for salesRoomId:', salesRoomId, 'opportunityId:', opportunityId);
      queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.detail(salesRoomId) });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoom.byOpportunity(opportunityId) });
      }
      
      return { success: true, data: responseData.data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload document';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDocument = async (salesRoomId: string, documentId: string, opportunityId?: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);

    try {
      await deleteDocumentMutation.mutateAsync({ salesRoomId, documentId, opportunityId } as any);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const getSalesRoomAnalytics = async (salesRoomId: string): Promise<{ success: boolean; data?: SalesRoomAnalytics; error?: string }> => {
    setError(null);

    try {
      const response = await queryClient.ensureQueryData({
        queryKey: queryKeys.salesRoom.analytics(salesRoomId),
        queryFn: async () => {
          const { data, error: apiError } = await requestWithAuth(
            `api/digital-sales-rooms/${salesRoomId}/analytics`,
            'GET',
            null
          );
          if (apiError) throw new Error(apiError);
          return data.data || data;
        },
      });

      return { success: true, data: response as SalesRoomAnalytics };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get analytics';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Visitor requests to the sales room
   * @param uniqueId - The unique ID of the sales room
   * @param email - The email of the visitor
   * @returns {success: boolean, message: string, code?: string} - The response from the server
   */
  const requestAccess = async (
    uniqueId: string, 
    email: string
  ): Promise<{ success: boolean; message: string; code?: string }> => {
    setError(null);

    try {
      const response = await requestNoAuth(
        `api/digital-sales-rooms/public/${uniqueId}/request-access`,
        'POST',
        { email },
      );

      if (response.error) {
        setError(response.error);
        return { success: false, message: response.error || 'Failed to request access' };
      }

      return response.data;
    } catch (err) {
      const errorMessage = 'Failed to request access';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const verifyAccess = async (
    uniqueId: string, 
    email: string, 
    code: string
  ): Promise<{ success: boolean; message: string; salesRoom?: any }> => {
    setError(null);

    try {
      const response = await requestNoAuth(
        `api/digital-sales-rooms/public/${uniqueId}/verify`,
        'POST',
        { email, code }
      );

      if (response.error) {
        setError(response.error);
        return { success: false, message: response.error || 'Failed to verify access' };
      }

      return response.data;
    } catch (err) {
      const errorMessage = 'Failed to verify access';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const trackDocumentInteraction = async (
    documentAccessId: string,
    trackingData: TrackingData
  ): Promise<boolean> => {
    try {
      const response = await requestNoAuth(
        `api/digital-sales-rooms/public/track/${documentAccessId}`,
        'POST',
        trackingData
      );

      if (response.error) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  };

  const trackLinkInteraction = async (
    linkId: string,
    trackingData: { durationMs: number; referrer?: string }
  ): Promise<boolean> => {
    try {
      const response = await requestNoAuth(
        `api/digital-sales-rooms/public/track/link/${linkId}`,
        'POST',
        trackingData
      );

      if (response.error) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  };

  const getSalesRoomForVisitor = async (uniqueId: string): Promise<{ success: boolean; data?: DigitalSalesRoom; error?: string }> => {
    setError(null);
    
    try {
      const response = await queryClient.ensureQueryData({
        queryKey: queryKeys.salesRoom.publicDetail(uniqueId),
        queryFn: async () => {
          const { data, error: apiError } = await requestNoAuth(
            `api/digital-sales-rooms/public/${uniqueId}`,
            'GET',
            null
          );
          if (apiError) throw new Error(apiError);
          return data.data || data;
        },
      });

      return { success: true, data: response as DigitalSalesRoom };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get sales room for visitor';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const addLink = async (
    salesRoomId: string,
    linkData: { name: string; url: string; description?: string },
    opportunityId?: string
  ): Promise<{ success: boolean; data?: Document; error?: string }> => {
    setError(null);

    try {
      const data = await addLinkMutation.mutateAsync({ 
        salesRoomId, 
        name: linkData.name, 
        url: linkData.url, 
        description: linkData.description,
        opportunityId 
      } as any);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add link';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteLink = async (salesRoomId: string, linkId: string, opportunityId?: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);

    try {
      await deleteLinkMutation.mutateAsync({ salesRoomId, linkId, opportunityId } as any);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete link';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const addPlaybookFileToSalesRoom = async (salesRoomId: string, documentId: string): Promise<{ success: boolean; data?: Document; error?: string }> => {
    setError(null);

    try {
      const data = await addPlaybookFileMutation.mutateAsync({ salesRoomId, documentId });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add playbook file to sales room';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Mutation states
    isCreating: createSalesRoomMutation.isPending,
    isUploading,
    isDeleting: deleteDocumentMutation.isPending || deleteLinkMutation.isPending,
    error,
    
    // Actions
    createSalesRoom,
    getSalesRoom,
    getSalesRoomByOpportunity,
    getSalesRoomForVisitor,
    uploadDocument,
    addLink,
    deleteDocument,
    deleteLink,
    addPlaybookFileToSalesRoom,
    getSalesRoomAnalytics,
    requestAccess,
    verifyAccess,
    trackDocumentInteraction,
    trackLinkInteraction,
    clearError,
  };
} 