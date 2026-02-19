import React, { useState } from 'react';
import { useTeamOperations } from '../../hooks/useTeamOperations';
import { InvitationFormData } from '../../types/team';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { 
  Loader2, 
  UserPlus, 
  UserMinus, 
  Copy, 
  Check,
  Users,
  Mail,
  Calendar,
  Crown,
  Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function TeamManagementPage() {
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [invitationForm, setInvitationForm] = useState<InvitationFormData>({
    email: '',
    firstName: '',
    lastName: '',
  });

  const { user } = useAuth();
  const {
    teamMembers,
    invitations,
    isLoadingMembers,
    membersError,
    isCreatingInvitation,
    isRemovingMember,
    error,
    createInvitation,
    removeTeamMember,
    clearError,
  } = useTeamOperations();


  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous invitation link
    setLastInviteLink(null);
    setCopiedInviteId(null);
    
    const result = await createInvitation(invitationForm);
    if (result.success) {
      // Reset form on success
      setInvitationForm({ email: '', firstName: '', lastName: '' });
      
      // Store the invitation link for copying
      if (result.data?.registrationLink) {
        setLastInviteLink(result.data.registrationLink);
        // Auto-copy to clipboard and show feedback
        try {
          await navigator.clipboard.writeText(result.data.registrationLink);
          setCopiedInviteId('last');
          // Clear the copied state after 3 seconds
          setTimeout(() => setCopiedInviteId(null), 3000);
        } catch (err) {
          console.error('Failed to auto-copy to clipboard:', err);
          // Don't set copied state if auto-copy failed
        }
      }
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId);
    try {
      await removeTeamMember(memberId);
    } finally {
      setRemovingMemberId(null);
    }
  };

  const copyInviteLink = async (link: string, inviteId: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(inviteId);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers or when clipboard API fails
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedInviteId(inviteId);
      setTimeout(() => setCopiedInviteId(null), 2000);
    }
  };

  const copyMemberId = async (memberId: string) => {
    try {
      await navigator.clipboard.writeText(memberId);
      setCopiedMemberId(memberId);
      setTimeout(() => setCopiedMemberId(null), 2000);
    } catch (err) {
      console.error('Failed to copy member ID to clipboard:', err);
      // Fallback for older browsers or when clipboard API fails
      const textArea = document.createElement('textarea');
      textArea.value = memberId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedMemberId(memberId);
      setTimeout(() => setCopiedMemberId(null), 2000);
    }
  };

  const isCurrentUser = (memberId: string) => user?.id === memberId || user?._id === memberId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-600" />
              <h1 className="text-sm font-medium text-gray-900">Team Management</h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">Invite and manage your team members</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-600">{error}</div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearError}
              className="mt-2"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Invite New Member */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlus className="h-4 w-4" />
              Create Team Invitation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateInvitation} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="First Name"
                  value={invitationForm.firstName}
                  onChange={(e) => setInvitationForm(prev => ({ ...prev, firstName: e.target.value }))}
                  required
                  className="text-sm"
                />
                <Input
                  placeholder="Last Name"
                  value={invitationForm.lastName}
                  onChange={(e) => setInvitationForm(prev => ({ ...prev, lastName: e.target.value }))}
                  required
                  className="text-sm"
                />
              </div>
              <Input
                type="email"
                placeholder="Email Address"
                value={invitationForm.email}
                onChange={(e) => setInvitationForm(prev => ({ ...prev, email: e.target.value }))}
                required
                className="text-sm"
              />
              <Button 
                type="submit" 
                disabled={isCreatingInvitation}
                size="sm"
                className="px-3 py-1.5"
              >
                {isCreatingInvitation && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                Create Invite
              </Button>
            </form>

            {/* Copy Invitation Link */}
            {lastInviteLink && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-green-800">Invitation Link Created!</div>
                      <div className="text-xs text-green-600 mt-1">Copy and share this link with the new team member to complete registration</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(lastInviteLink, 'last')}
                      className="text-green-700 border-green-300 hover:bg-green-100"
                    >
                      {copiedInviteId === 'last' ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy Link
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={lastInviteLink}
                      readOnly
                      className="text-xs bg-white border-green-200 text-green-800 font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members & Invitations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Overview
              </span>
              <Badge variant="secondary" className="text-xs">
                {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                {invitations.length > 0 && ` • ${invitations.length} pending`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMembers ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-md">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : membersError ? (
              <div className="text-center py-8">
                <div className="text-sm text-red-600 mb-2">Failed to load team data</div>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : teamMembers.length === 0 && invitations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <div className="text-sm">No team members found</div>
                <div className="text-xs text-gray-400 mt-1">Invite someone to get started!</div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Active Team Members */}
                {teamMembers.map((member) => {
                  const isCurrent = isCurrentUser(member._id);
                  const isRemoving = removingMemberId === member._id;
                  
                  return (
                    <div 
                      key={member._id}
                      className={`
                        flex items-center justify-between p-4 border rounded-md transition-all duration-200
                        ${isRemoving ? 'ring-2 ring-red-200 bg-red-50/30' : 'hover:border-gray-300'}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center relative">
                          <span className="text-xs font-medium text-gray-600">
                            {member.firstName[0]}{member.lastName[0]}
                          </span>
                          {isCurrent && (
                            <Crown className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {member.firstName} {member.lastName}
                            </span>
                            <Badge variant="default" className="text-xs px-1.5 py-0.5 bg-green-100 text-green-800">
                              Active
                            </Badge>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {member.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => copyMemberId(member._id)}
                              className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors group"
                              title={copiedMemberId === member._id ? "Copied!" : "Click to copy member ID"}
                            >
                              {copiedMemberId === member._id ? (
                                <>
                                  <Check className="h-3 w-3 text-green-500" />
                                  <span className="text-green-600 font-medium">ID Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 group-hover:text-gray-600" />
                                  <span className="font-mono">ID: {member._id}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveMember(member._id)}
                          disabled={isRemovingMember || isRemoving}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1"
                          title={isRemoving ? "Removing..." : "Remove team member"}
                        >
                          {isRemoving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserMinus className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* Pending Invitations */}
                {invitations.map((invitation) => {
                  const isExpired = invitation.expiresAt ? new Date(invitation.expiresAt) < new Date() : false;
                  
                  return (
                    <div 
                      key={invitation._id}
                      className="flex items-center justify-between p-4 border rounded-md hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-orange-600">
                            {invitation.firstName[0]}{invitation.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {invitation.firstName} {invitation.lastName}
                            </span>
                            <Badge 
                              variant={isExpired ? "destructive" : "outline"} 
                              className="text-xs px-1.5 py-0.5"
                            >
                              {isExpired ? "Expired" : "Pending"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {invitation.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Invited {new Date(invitation.createdAt).toLocaleDateString()}
                            </span>
                            {invitation.expiresAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invitation.registrationLink || `${import.meta.env.VITE_FRONTEND_URL || window.location.origin}/register?token=no-token`, invitation._id)}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1"
                          title={copiedInviteId === invitation._id ? "Copied!" : "Copy invitation link"}
                        >
                          {copiedInviteId === invitation._id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
