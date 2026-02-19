import type { Prospect, Contact } from "@/types/prospect";

export interface Meeting {
  id: string;
  title: string;
  date?: Date;
  startTime: Date;
  endTime: Date;
  time: string;
  prospect: string; // Display string (location or attendee names)
  prospectRef?: any; // Actual prospect reference from backend (can be null)
  status?: 'to_do' | 'scheduled' | 'completed' | 'cancelled';
  conferencing?: {
    provider: string;
    details: any;
  };
  notetakerId?: string | null;
  agenda?: {
    content: string;
    generatedAt: Date;
    generatedBy: string;
    version?: string;
  };
  description?: string;
  attendees?: Array<{
    email: string;
    name: string;
    responseStatus: string;
  }>;
}

export interface OutgoingMessage {
  id: string;
  type: 'email' | 'text';
  prospect: string;
  subject?: string;
  preview: string;
}

export interface Win {
  id: string;
  type: 'deal' | 'meeting' | 'response' | 'task';
  description: string;
  value?: string;
  date: Date;
}

export interface Task {
  id:string;
  text: string;
  completed: boolean;
}

export interface CalendarActivity {
  _id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  description?: string;
  agenda?: {
    content: string;
    generatedAt: Date;
    generatedBy: string;
    version?: string;
  };
  attendees?: Array<{
    email: string;
    name: string;
    responseStatus: string;
  }>;
  conferencing?: {
    provider: string;
    details: any;
  };
  status: 'to_do' | 'scheduled' | 'completed' | 'cancelled';
  type: string;
  savedRecordingPath?: string;
  savedTranscriptPath?: string;
  transcriptionText?: string;
  aiSummary?: {
    date: Date;
    summary: string;
  };
  mediaStatus?: 'available' | 'processing' | 'deleted' | 'error' | 'recorded' | 'failed' | 'scheduled' | 'completed' | 'cancelled';
  prospect?: Prospect | null;
  contacts?: Contact[];
}

// New types for ProposedAction
export interface ProposedActionOpportunity {
  _id: string;
  name: string;
  stage: string;
  amount: number;
}

export interface ProposedActionActivity {
  _id: string;
  title: string;
  date: Date;
  type: string;
}

export interface SubAction {
    id: string;
    _id?: string; // Add optional _id property
    type: 'TASK' | 'CALL' | 'EMAIL' | 'MEETING' | 'LINKEDIN MESSAGE' | 'LOOKUP' | 'NO_ACTION' | 'UPDATE_PIPELINE_STAGE';
    details: {
        dueDate: string;
        description: string;
        status: string;
        steps: any;
        // Add all the properties that are being accessed in the component
        scheduledFor?: string;
        subject?: string;
        to?: string[];
        body?: string;
        title?: string;
        attendees?: string[];
        agenda?: string;
        contactEmail?: string;
        purpose?: string;
        // UPDATE_PIPELINE_STAGE specific
        targetStageId?: string;
        targetStageName?: string;
        // LOOKUP specific
        query?: string;
    };
    reasoning: string;
    dependsOn: string[];
    priority: number;
    status?: 'PROPOSED' | 'COMPLETED' | 'CANCELLED';
}

export interface ProposedAction {
  _id: string;
  opportunity: string; // Just the ID string in individual actions
  sourceActivities: {
    activityId: string | ProposedActionActivity;
    activityModel?: string;
    activityDetails?: {
      _id: string;
      aiSummary?: {
        summary: string;
      };
      [key: string]: any;
    };
  }[];
  createdAt: Date;
  type: 'TASK' | 'CALL' | 'EMAIL' | 'MEETING' | 'LINKEDIN MESSAGE' | 'LOOKUP' | 'NO_ACTION' | 'UPDATE_PIPELINE_STAGE';
  status: 'PROPOSED' | 'COMPLETED' | 'CANCELLED';
  reasoning: string;
  details?: {
    dueDate?: string;
    description?: string;
    status?: string;
    steps?: any;
    scheduledFor?: string;
    subject?: string;
    to?: string[];
    body?: string;
    title?: string;
    attendees?: string[];
    agenda?: string;
    mode?: 'create' | 'update' | 'cancel';
    existingCalendarActivityId?: string | null;
    connectionId?: string | null;
    calendarId?: string | null;
    location?: string | null;
    contactEmail?: string;
    purpose?: string;
    // UPDATE_PIPELINE_STAGE specific
    targetStageId?: string;
    targetStageName?: string;
    // LOOKUP specific
    query?: string;
    [key: string]: any; // Allow additional properties
  };
  subActions?: SubAction[];
  createdBy?: {
    type: string;
  };
  updatedAt?: Date;
  __v?: number;
}

// Response structure for fetching actions by opportunity
export interface ActionsOpportunityResponse {
  success: boolean;
  data: ProposedAction[];
  opportunity: any; // Full opportunity object with all MEDDPICC data
  contacts: any[]; // Array of contact objects
  count: number;
}
