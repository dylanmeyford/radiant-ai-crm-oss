import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { PlaybookItemType } from '../types/playbook';
import { queryKeys } from './queryKeys';

export function usePlaybookOperations(filterType?: PlaybookItemType | null) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching playbook items (single source of truth)
  const playbookItemsQuery = useQuery({
    queryKey: queryKeys.playbook.items(filterType ?? null),
    queryFn: async () => {
      const endpoint = filterType 
        ? `api/sales-playbook/?type=${filterType}`
        : `api/sales-playbook/`;

      const { data, error: apiError } = await requestWithAuth(endpoint, "GET", null);
      if (apiError) throw new Error(apiError);
      
      const itemsData = Array.isArray(data) ? data : (data?.data || []);
      return itemsData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Function to get a single playbook item by ID
  const getPlaybookItemQuery = (itemId: string | null) => {
    return useQuery({
      queryKey: queryKeys.playbook.detail(itemId || ''),
      queryFn: async () => {
        if (!itemId) throw new Error("No item ID provided");
        
        const { data, error: apiError } = await requestWithAuth(
          `api/sales-playbook/${itemId}`,
          "GET",
          null
        );
        if (apiError) throw new Error(apiError);
        
        return data.data || data;
      },
      enabled: !!itemId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  // Search query for playbook items
  const searchPlaybookItemsQuery = (searchQuery: string, selectedType?: PlaybookItemType | null) => {
    return useQuery({
      queryKey: queryKeys.playbook.searchItems({ query: searchQuery, type: selectedType ?? null }),
      queryFn: async () => {
        const queryParams = new URLSearchParams();
        queryParams.append("query", searchQuery);
        if (selectedType) {
          queryParams.append("type", selectedType);
        }

        const { data, error: apiError } = await requestWithAuth(
          `api/sales-playbook/search?${queryParams.toString()}`,
          "GET",
          null
        );
        if (apiError) throw new Error(apiError);
        
        const itemsData = Array.isArray(data) ? data : (data?.data || []);
        return itemsData;
      },
      enabled: !!searchQuery, // Only run query if searchQuery exists
      staleTime: 2 * 60 * 1000, // 2 minutes for search results
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  };

  // Files search query
  const searchPlaybookFilesQuery = (params: {
    keywords?: string;
    type?: string;
    tags?: string;
    playbookType?: string;
  }) => {
    return useQuery({
      queryKey: queryKeys.playbook.filesSearch(params),
      queryFn: async () => {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value) queryParams.append(key, value);
        });

        const { data, error: apiError } = await requestWithAuth(
          `api/sales-playbook/files?${queryParams.toString()}`,
          "GET",
          null
        );
        if (apiError) throw new Error(apiError);
        
        const filesData = Array.isArray(data) ? data : (data?.data || []);
        return filesData;
      },
      enabled: Object.values(params).some(value => !!value), // Only run if at least one param exists
      staleTime: 2 * 60 * 1000, // 2 minutes for search results
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  };

  const createItemMutation = useMutation({
    mutationFn: async (itemData: {
      type: PlaybookItemType;
      title: string;
      content: string;
      tags: string[];
      keywords: string[];
      useCase: string;
    }) => {
      const { data, error } = await requestWithAuth(
        "api/sales-playbook",
        "POST",
        itemData
      );
      if (error) throw new Error(error);
      return data.data || data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(null) });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(filterType ?? null) });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, itemData }: { itemId: string; itemData: {
      type: PlaybookItemType;
      title: string;
      content: string;
      tags: string[];
      keywords: string[];
      useCase: string;
    }}) => {
      const { data, error } = await requestWithAuth(
        `api/sales-playbook/${itemId}`,
        "PUT",
        itemData
      );
      if (error) throw new Error(error);
      return data.data || data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.playbook.items(null) });
      await queryClient.cancelQueries({ queryKey: queryKeys.playbook.items(filterType ?? null) });

      // Snapshot the previous values for rollback
      const previousItems = queryClient.getQueryData(queryKeys.playbook.items(filterType ?? null));
      const previousAllItems = queryClient.getQueryData(queryKeys.playbook.items(null));

      // Optimistically update the cache
      queryClient.setQueryData(queryKeys.playbook.items(filterType ?? null), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((item: any) =>
          item._id === variables.itemId
            ? { ...item, ...variables.itemData }
            : item
        );
      });

      // Also update the unfiltered list if it exists
      queryClient.setQueryData(queryKeys.playbook.items(null), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((item: any) =>
          item._id === variables.itemId
            ? { ...item, ...variables.itemData }
            : item
        );
      });

      return { previousItems, previousAllItems };
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure
      if (context?.previousItems) {
        queryClient.setQueryData(queryKeys.playbook.items(filterType ?? null), context.previousItems);
      }
      if (context?.previousAllItems) {
        queryClient.setQueryData(queryKeys.playbook.items(null), context.previousAllItems);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(null) });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(filterType ?? null) });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await requestWithAuth(
        `api/sales-playbook/${itemId}`,
        "DELETE",
        null
      );
      if (error) throw new Error(error);
    },
    onMutate: async (itemId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.playbook.items(null) });
      await queryClient.cancelQueries({ queryKey: queryKeys.playbook.items(filterType ?? null) });

      // Snapshot the previous values for rollback
      const previousItems = queryClient.getQueryData(queryKeys.playbook.items(filterType ?? null));
      const previousAllItems = queryClient.getQueryData(queryKeys.playbook.items(null));

      // Optimistically remove from cache
      queryClient.setQueryData(queryKeys.playbook.items(filterType ?? null), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((item: any) => item._id !== itemId);
      });

      // Also remove from unfiltered list if it exists
      queryClient.setQueryData(queryKeys.playbook.items(null), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((item: any) => item._id !== itemId);
      });

      return { previousItems, previousAllItems };
    },
    onError: (_err, _itemId, context) => {
      // Rollback on failure
      if (context?.previousItems) {
        queryClient.setQueryData(queryKeys.playbook.items(filterType ?? null), context.previousItems);
      }
      if (context?.previousAllItems) {
        queryClient.setQueryData(queryKeys.playbook.items(null), context.previousAllItems);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(null) });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbook.items(filterType ?? null) });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ playbookId, formData }: { playbookId: string; formData: FormData }) => {
      const { data, error } = await requestWithAuth(
        `api/sales-playbook/${playbookId}/files`,
        "POST",
        formData
      );
      if (error) throw new Error(error);
      return data.data || data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'playbook' }] });
    },
  });

  const updateFileMutation = useMutation({
    mutationFn: async ({ playbookId, fileId, formData }: { playbookId: string; fileId: string; formData: FormData }) => {
      const { data, error } = await requestWithAuth(
        `api/sales-playbook/${playbookId}/files/${fileId}`,
        "PUT",
        formData
      );
      if (error) throw new Error(error);
      return data.data || data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'playbook' }] });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async ({ playbookId, fileId }: { playbookId: string; fileId: string }) => {
      const { error } = await requestWithAuth(
        `api/sales-playbook/${playbookId}/files/${fileId}`,
        "DELETE",
        null
      );
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'playbook' }] });
    },
  });

  // Wrapper functions for easier usage following TanStack Query patterns

  const createPlaybookItem = async (itemData: {
    type: PlaybookItemType;
    title: string;
    content: string;
    tags: string[];
    keywords: string[];
    useCase: string;
  }) => {
    setError(null);
    try {
      const data = await createItemMutation.mutateAsync(itemData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create playbook item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updatePlaybookItem = async (itemId: string, itemData: {
    type: PlaybookItemType;
    title: string;
    content: string;
    tags: string[];
    keywords: string[];
    useCase: string;
  }) => {
    setError(null);
    try {
      const data = await updateItemMutation.mutateAsync({ itemId, itemData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update playbook item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deletePlaybookItem = async (itemId: string) => {
    setError(null);
    try {
      await deleteItemMutation.mutateAsync(itemId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete playbook item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const uploadFileToPlaybook = async (playbookId: string, file: File, name?: string, description?: string) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) formData.append('name', name);
      if (description) formData.append('description', description);

      const data = await uploadFileMutation.mutateAsync({ playbookId, formData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload file";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const addFileToSalesRoom = async (salesRoomId: string, documentId: string) => {
    setError(null);
    try {
      const { data, error } = await requestWithAuth(
        `api/sales-rooms/${salesRoomId}/files`,
        "POST",
        { documentId }
      );
      if (error) throw new Error(error);
      return { success: true, data: data.data || data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add file to sales room";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const downloadPlaybookFile = async (playbookId: string, fileId: string, fileName: string) => {
    setError(null);
    try {
      const { data, error } = await requestWithAuth(
        `api/sales-playbook/${playbookId}/files/${fileId}/download`,
        "GET",
        null
      );
      if (error) throw new Error(error);
      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download file";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updatePlaybookFile = async (playbookId: string, fileId: string, file: File, name?: string, description?: string) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) formData.append('name', name);
      if (description) formData.append('description', description);

      const data = await updateFileMutation.mutateAsync({ playbookId, fileId, formData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update file";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deletePlaybookFile = async (playbookId: string, fileId: string) => {
    setError(null);
    try {
      await deleteFileMutation.mutateAsync({ playbookId, fileId });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete file";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states (single source of truth)
    playbookItems: playbookItemsQuery.data || [],
    isLoadingPlaybookItems: playbookItemsQuery.isLoading,
    playbookItemsError: playbookItemsQuery.error,
    refetchPlaybookItems: playbookItemsQuery.refetch,
    
    // Query functions (return query hooks)
    getPlaybookItemQuery,
    searchPlaybookItemsQuery,
    searchPlaybookFilesQuery,
    
    // Mutation states
    isCreating: createItemMutation.isPending,
    isUpdating: updateItemMutation.isPending,
    isDeleting: deleteItemMutation.isPending,
    isUploadingFile: uploadFileMutation.isPending || updateFileMutation.isPending,
    error,
    
    // Actions
    createPlaybookItem,
    updatePlaybookItem,
    deletePlaybookItem,
    uploadFileToPlaybook,
    addFileToSalesRoom,
    downloadPlaybookFile,
    updatePlaybookFile,
    deletePlaybookFile,
    clearError,
  };
} 