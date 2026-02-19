import mongoose from 'mongoose';

export const personRoleEnum = [
  'Economic Buyer',
  'Champion',
  'Influencer',
  'User',
  'Blocker',
  'Decision Maker',
  'Other',
  'Uninvolved'
] as const;

export interface ResponsivenessInfo {
  status: 'Ghosting' | 'Delayed' | 'Engaged' | 'OOO' | 'Handed Off' | 'Disengaged' | 'Uninvolved';
  summary: string;
  isAwaitingResponse: boolean;
  activeRespondingContact?: string; // email of contact who is responding
}

export interface DatedResponsivenessInfo extends ResponsivenessInfo {
  analyzedAt: Date;
}

export interface IOpportunityIntelligence {
  opportunity: mongoose.Types.ObjectId;
  engagementScore: number;
  scoreHistory: {
    score: number;
    date: Date;
    sourceActivity: mongoose.Types.ObjectId;
    reasoning?: string;
  }[];
  behavioralIndicators: {
    indicator: string;
    date: Date;
    sourceActivity: mongoose.Types.ObjectId;
    confidence?: 'High' | 'Medium' | 'Low';
    relevance: 'High' | 'Medium' | 'Low';
  }[];
  communicationPatterns: {
    responseSpeed?: number; // in hours
    initiationRatio?: number; // ratio of user initiated vs contact initiated
    messageDepth?: 'Deep' | 'Medium' | 'Shallow';
    tone?: 'Formal' | 'Informal' | 'Enthusiastic' | 'Hesitant' | 'Concerned' | 'Neutral';
    analyzedAt: Date;
    dsrTotalViews?: number;
    dsrTotalDuration?: number; // in seconds
    dsrTotalClicks?: number;
    dsrLastEngagement?: Date;
  }[];
  roleAssignments: {
    role: (typeof personRoleEnum)[number];
    assignedAt: Date;
  }[];
  relationshipStory?: string;
  responsiveness: DatedResponsivenessInfo[];
  sentDocuments: {
    documentId: mongoose.Types.ObjectId;
    documentType: string;
    sentAt: Date;
  }[];
} 