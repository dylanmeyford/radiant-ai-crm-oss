import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from "./queryKeys";
import { EmailEntry } from "@/types/prospect";

interface ContactFormData {
  firstName: string;
  lastName: string;
  phone?: string;
  role?: string;
  isPrimary: boolean;
  notes?: string;
  prospectId: string;
  emails: EmailEntry[];
}

export function useContactOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (contactData: ContactFormData) => {
      const { data, error } = await requestWithAuth("api/contacts/", "POST", contactData);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.byProspect(variables.prospectId) });
      queryClient.invalidateQueries({ queryKey: [{ scope: 'contacts' }] });
      // Invalidate opportunities cache since backend automatically adds contact to opportunities
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
      queryClient.invalidateQueries({ queryKey: [{ scope: 'opportunities', entity: 'detail' }] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ contactId, contactData }: { contactId: string; contactData: ContactFormData }) => {
      const { data, error } = await requestWithAuth(`api/contacts/${contactId}`, "PUT", contactData);
      if (error) throw new Error(error);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.byProspect(variables.contactData.prospectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });

      // Snapshot the previous values
      const previousContacts = queryClient.getQueryData(queryKeys.contacts.byProspect(variables.contactData.prospectId));
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());

      // Optimistically update the contacts cache
      queryClient.setQueryData(queryKeys.contacts.byProspect(variables.contactData.prospectId), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((contact: any) =>
          contact._id === variables.contactId
            ? { ...contact, ...variables.contactData }
            : contact
        );
      });

      // Optimistically update all opportunities that contain this contact
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((opp: any) => {
          if (!opp.contacts || !Array.isArray(opp.contacts)) return opp;
          
          const hasContact = opp.contacts.some((contact: any) => contact._id === variables.contactId);
          if (!hasContact) return opp;
          
          return {
            ...opp,
            contacts: opp.contacts.map((contact: any) =>
              contact._id === variables.contactId
                ? { ...contact, ...variables.contactData }
                : contact
            )
          };
        });
      });

      // Also update individual opportunity detail caches
      const opportunityQueries = queryClient.getQueriesData({ queryKey: [{ scope: 'opportunities', entity: 'detail' }] });
      const previousOpportunityDetails: Record<string, any> = {};
      
      opportunityQueries.forEach(([queryKey, data]) => {
        if (data && typeof data === 'object' && 'contacts' in data) {
          const oppData = data as any;
          if (oppData.contacts?.some((contact: any) => contact._id === variables.contactId)) {
            previousOpportunityDetails[JSON.stringify(queryKey)] = data;
            
            queryClient.setQueryData(queryKey, {
              ...oppData,
              contacts: oppData.contacts.map((contact: any) =>
                contact._id === variables.contactId
                  ? { ...contact, ...variables.contactData }
                  : contact
              )
            });
          }
        }
      });

      return { previousContacts, previousOpportunities, previousOpportunityDetails };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.byProspect(variables.contactData.prospectId), context.previousContacts);
      }
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
      if (context?.previousOpportunityDetails) {
        Object.entries(context.previousOpportunityDetails).forEach(([key, value]) => {
          queryClient.setQueryData(JSON.parse(key), value);
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.byProspect(variables.contactData.prospectId) });
      queryClient.invalidateQueries({ queryKey: [{ scope: 'contacts' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
      queryClient.invalidateQueries({ queryKey: [{ scope: 'opportunities', entity: 'detail' }] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ contactId }: { contactId: string; prospectId: string }) => {
      const { error } = await requestWithAuth(`api/contacts/${contactId}`, "DELETE", null);
      if (error) throw new Error(error);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.byProspect(variables.prospectId) });

      // Snapshot the previous values
      const previousContacts = queryClient.getQueryData(queryKeys.contacts.byProspect(variables.prospectId));

      // Optimistically remove from cache
      queryClient.setQueryData(queryKeys.contacts.byProspect(variables.prospectId), (old: any[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((contact: any) => contact._id !== variables.contactId);
      });

      return { previousContacts };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.byProspect(variables.prospectId), context.previousContacts);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.byProspect(variables.prospectId) });
      queryClient.invalidateQueries({ queryKey: [{ scope: 'contacts' }] });
    },
  });

  const updateOppContactsMutation = useMutation({
    mutationFn: async ({ opportunityId, contactIds }: { opportunityId: string; contactIds: string[] }) => {
      const { data, error } = await requestWithAuth(
        `api/opportunities/${opportunityId}/`,
        "PUT",
        { contacts: contactIds }
      );
      if (error) throw new Error(error);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list() });

      // Snapshot previous values for rollback
      const previousOpportunity = queryClient.getQueryData(queryKeys.opportunities.detail(variables.opportunityId));
      const previousOpportunities = queryClient.getQueryData(queryKeys.opportunities.list());

      // Fetch contacts data to populate the optimistic update
      const contactsData = await Promise.all(
        variables.contactIds.map(id => queryClient.getQueryData([{ scope: 'contacts', entity: 'detail', id }]))
      );

      // Optimistically update opportunity detail cache
      queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          contacts: contactsData.filter(Boolean) // Use actual contact objects if available
        };
      });

      // Optimistically update opportunities list cache
      queryClient.setQueryData(queryKeys.opportunities.list(), (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((opp: any) =>
          opp._id === variables.opportunityId
            ? { ...opp, contacts: contactsData.filter(Boolean) }
            : opp
        );
      });

      return { previousOpportunity, previousOpportunities };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOpportunity) {
        queryClient.setQueryData(queryKeys.opportunities.detail(variables.opportunityId), context.previousOpportunity);
      }
      if (context?.previousOpportunities) {
        queryClient.setQueryData(queryKeys.opportunities.list(), context.previousOpportunities);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.detail(variables.opportunityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
    },
  });

  // Query hook for fetching contacts by prospect
  const useContactsByProspect = (prospectId: string) => {
    return useQuery({
      queryKey: queryKeys.contacts.byProspect(prospectId),
      queryFn: async () => {
        const { data, error } = await requestWithAuth(
          `api/contacts/prospect/${prospectId}`,
          "GET", 
          null
        );
        
        if (error) throw new Error(error);
        
        // Handle different possible data structures from API
        if (Array.isArray(data)) {
          return data;
        } else if (data && Array.isArray(data.data)) {
          return data.data;
        } else if (data && Array.isArray(data.contacts)) {
          return data.contacts;
        } else {
          return [];
        }
      },
      enabled: !!prospectId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  // Simple fetch function for imperative use
  const fetchContactsForProspect = async (prospectId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await requestWithAuth(
        `api/contacts/prospect/${prospectId}`,
        "GET", 
        null
      );
      
      if (error) throw new Error(error);

      // Handle different possible data structures from API
      if (Array.isArray(data)) {
        return data;
      } else if (data && Array.isArray(data.data)) {
        return data.data;
      } else if (data && Array.isArray(data.contacts)) {
        return data.contacts;
      } else {
        return [];
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load contacts";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const createContact = async (contactData: ContactFormData) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await createMutation.mutateAsync(contactData);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create contact";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateContact = async (contactId: string, contactData: ContactFormData) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await updateMutation.mutateAsync({ contactId, contactData });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update contact";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteContact = async (contactId: string, prospectId: string) => {
    try {
      setIsDeleting(true);
      setError(null);
      
      await deleteMutation.mutateAsync({ contactId, prospectId });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete contact";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const updateOpportunityContacts = async (opportunityId: string, contactIds: string[]) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await updateOppContactsMutation.mutateAsync({ opportunityId, contactIds });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add contacts";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    // Legacy states (for backward compatibility)
    isLoading,
    isSubmitting,
    isDeleting,
    error,
    
    // Mutation states (preferred)
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeletingContact: deleteMutation.isPending,
    isUpdatingOpportunityContacts: updateOppContactsMutation.isPending,
    
    // Query hook
    useContactsByProspect,
    
    // Actions
    fetchContactsForProspect,
    createContact,
    updateContact,
    deleteContact,
    updateOpportunityContacts
  };
} 