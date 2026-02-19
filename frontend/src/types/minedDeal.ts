// Mined Deal types matching backend model

export type MinedDealStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'SNOOZED';

export interface MinedDealParticipant {
  email: string;
  name?: string;
}

export interface MinedDealRepresentativeThread {
  threadId: string;
  subject?: string;
  snippet?: string;
}

export interface MinedDealSuggestedBy {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface MinedDeal {
  _id: string;
  organization: string;
  suggestedBy: MinedDealSuggestedBy;
  
  // Company info
  companyName: string;
  domains: string[];
  
  // Evidence from email threads
  threadCount: number;
  totalMessages: number;
  lastActivityDate: Date | string;
  firstActivityDate: Date | string;
  participants: MinedDealParticipant[];
  representativeThread: MinedDealRepresentativeThread;
  
  // Status
  status: MinedDealStatus;
  
  // If accepted - links to created entities
  createdProspect?: string;
  createdOpportunity?: string;
  acceptedBy?: string;
  acceptedAt?: Date | string;
  selectedStage?: string;
  
  // If dismissed/snoozed
  dismissedReason?: string;
  snoozeUntil?: Date | string;
  
  createdAt: Date | string;
  updatedAt: Date | string;
}

// API response types
export interface AcceptMinedDealPayload {
  stageId: string;
  pipelineId?: string;
  prospectName?: string;
  opportunityName?: string;
  amount?: number;
}

export interface AcceptMinedDealResponse {
  minedDeal: MinedDeal;
  prospect: {
    _id: string;
    name: string;
    domains: string[];
  };
  opportunity: {
    _id: string;
    name: string;
    amount: number;
    stage: string;
  };
}

export interface DismissMinedDealPayload {
  reason?: string;
}

export interface SnoozeMinedDealPayload {
  days: number;
}

export interface MinedDealCountResponse {
  count: number;
}
