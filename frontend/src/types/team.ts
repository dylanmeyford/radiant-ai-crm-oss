// Team-related types for team management functionality

export interface TeamMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface Invitation {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  token?: string;
  registrationLink?: string;
  organization?: string;
  inviter?: string;
  status?: 'pending' | 'accepted' | 'expired';
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface InvitationFormData {
  email: string;
  firstName: string;
  lastName: string;
}

export interface InvitationResponse {
  invitationId: string;
  email: string;
  firstName: string;
  lastName: string;
  registrationLink: string;
  expiresAt: Date;
}

export interface TeamMembersResponse {
  teamMembers: TeamMember[];
  invitations: Invitation[];
  count: number;
}

export interface RemoveTeamMemberResponse {
  removedUserId: string;
  removedUserEmail: string;
}
