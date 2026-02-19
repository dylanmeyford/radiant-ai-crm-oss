import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';
import { 
  TeamMember, 
  Invitation,
  InvitationFormData, 
  InvitationResponse, 
  TeamMembersResponse,
  RemoveTeamMemberResponse 
} from '../types/team';

export function useTeamOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching team members and invitations (single source of truth)
  const teamDataQuery = useQuery({
    queryKey: queryKeys.team.members(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/team/members", "GET", null);
      if (apiError) throw new Error(apiError);
      
      // Process the response structure based on controller
      const responseData = data.data as TeamMembersResponse;
      
      // Process team members with date fields
      const processedMembers = (responseData.teamMembers || []).map((member: any) => ({
        ...member,
        createdAt: new Date(member.createdAt),
      }));
      
      // Process invitations with date fields
      const processedInvitations = (responseData.invitations || []).map((invitation: any) => ({
        ...invitation,
        createdAt: new Date(invitation.createdAt),
        expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : null,
      }));
      
      return {
        teamMembers: processedMembers,
        invitations: processedInvitations as Invitation[],
        count: responseData.count
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: async (invitationData: InvitationFormData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/team/invite",
        "POST",
        invitationData
      );
      if (apiError) throw new Error(apiError);
      return data as InvitationResponse;
    },
    onSuccess: () => {
      // Invalidate team members query to refresh the list
      queryClient.invalidateQueries({ queryKey: queryKeys.team.members() });
    },
  });

  // Remove team member mutation with optimistic updates
  const removeTeamMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/team/members/${userId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
      return data as RemoveTeamMemberResponse;
    },
    onMutate: async (userId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.team.members() });

      // Snapshot the previous value for rollback
      const previousMembers = queryClient.getQueryData(queryKeys.team.members());

      // Optimistically update the cache by removing the member
      queryClient.setQueryData(queryKeys.team.members(), (old: any) => {
        if (!old || !old.teamMembers) return old;
        
        return {
          ...old,
          teamMembers: old.teamMembers.filter((member: TeamMember) => member._id !== userId),
          count: old.count - 1
        };
      });

      // Return context for rollback
      return { previousMembers };
    },
    onError: (_, __, context) => {
      // Rollback on failure
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.team.members(), context.previousMembers);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.team.members() });
    },
  });

  // Wrapper functions for easier usage
  const createInvitation = async (invitationData: InvitationFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await createInvitationMutation.mutateAsync(invitationData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create invitation";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const removeTeamMember = async (userId: string) => {
    setError(null);

    try {
      const data = await removeTeamMemberMutation.mutateAsync(userId);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to remove team member";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states (single source of truth)
    teamMembers: teamDataQuery.data?.teamMembers || [],
    invitations: teamDataQuery.data?.invitations || [],
    isLoadingMembers: teamDataQuery.isLoading,
    membersError: teamDataQuery.error,
    refetchMembers: teamDataQuery.refetch,
    
    // Mutation states
    isLoading,
    isCreatingInvitation: createInvitationMutation.isPending,
    isRemovingMember: removeTeamMemberMutation.isPending,
    error,
    
    // Actions
    createInvitation,
    removeTeamMember,
    clearError,
  };
}
