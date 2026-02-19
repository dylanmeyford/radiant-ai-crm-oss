export interface EmailEntry {
  _id?: string; // Optional for new contacts being created
  address: string;
  category?: string; // Optional for new contacts being created
  isPrimary: boolean;
}

export interface ResponsivenessInfo {
  status: 'Ghosting' | 'Delayed' | 'Engaged' | 'OOO' | 'Handed Off' | 'Disengaged';
  summary: string;
  isAwaitingResponse: boolean;
  activeRespondingContact?: string;
}

export interface DatedResponsivenessInfo extends ResponsivenessInfo {
  analyzedAt: string; // Using string for frontend compatibility
}

export interface OpportunityIntelligence {
  opportunity: string;
  engagementScore: number;
  scoreHistory: Array<{
    score: number;
    date: string;
    sourceActivity: string;
    reasoning: string;
  }>;
  relationshipStory: string;
  responsiveness: DatedResponsivenessInfo[];
  roleAssignments?: Array<{
    role: string;
    assignedAt: string;
  }>;
}

export interface ContactResearch {
  backgroundInfo?: string;
  connectionOpportunities?: string[];
  contactScore?: number;
  debug?: {
    noInformationFound: boolean;
    [key: string]: any;
  };
  linkedInProfile?: string;
  personalSummary?: string;
  researchedAt?: string;
  roleAtCompany?: string;
}

export interface Contact {
  _id: string;
  firstName: string;
  lastName: string;
  emails: EmailEntry[];
  phone?: string;
  role?: string;
  prospectId: string;
  isPrimary: boolean;
  lastContacted?: Date;
  notes?: string;
  opportunityIntelligence?: OpportunityIntelligence[];
  contactResearch?: ContactResearch;
}

export enum ActivityType {
  NOTE = 'note',
  CALL = 'call',
  SMS = 'sms',
  EMAIL = 'email',
  LINKEDIN = 'linkedin',
  MEETING_NOTES = 'meeting_notes',
  CALENDAR = 'calendar',
  TASK = 'task',
  DSR_ACCESS = 'dsr_access',
  DSR_DOCUMENT_VIEW = 'dsr_document_view',
  DSR_LINK_CLICK = 'dsr_link_click',
  OTHER = 'other'
}

export interface Activity {
  _id: string;
  type: ActivityType;
  title: string;
  description?: string;
  date: Date;
  duration?: number; // in minutes
  status: 'to_do' | 'scheduled' | 'completed' | 'cancelled' | 'draft';
  prospect: string;
  contacts: string[];
  organization: string;
  createdBy: string;
  attachments?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  aiSummary?: {
    date: Date;
    summary: string;
  };
  humanSummary?: {
    date: Date;
    summary: string;
    createdBy: string;
  };
  processedFor?: Array<{
    contactId: string;
    opportunityId: string;
    processedAt: Date;
  }>;
  handledByAction?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prospect {
  _id: string;
  name: string;
  industry?: string;
  website?: string;
  domains?: string[];
  size?: string;
  description?: string;
  status: 'lead' | 'qualified' | 'customer' | 'churned' | 'archived';
  createdAt: Date;
  lastActivity?: Date;
  contacts: Contact[];
  activities: Activity[];
  revenue?: number;
  notes?: string;
} 