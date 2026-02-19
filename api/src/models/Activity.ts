import mongoose, { Document, Schema } from 'mongoose';

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

export interface IActivity extends Document {
  type: ActivityType;
  title: string;
  description?: string;
  date: Date;
  duration?: number; // in minutes
  status: 'to_do' | 'scheduled' | 'completed' | 'cancelled' | 'draft';
  prospect: mongoose.Types.ObjectId;
  contacts: mongoose.Types.ObjectId[];
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
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
    createdBy: mongoose.Types.ObjectId;
  };
  processedFor?: Array<{
    contactId: mongoose.Types.ObjectId;
    opportunityId: mongoose.Types.ObjectId;
    processedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      enum: Object.values(ActivityType),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: ['to_do', 'scheduled', 'completed', 'cancelled'],
      default: 'completed',
    },
    prospect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect',
      required: true,
    },
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    }],
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attachments: [{
      type: String,
    }],
    tags: [{
      type: String,
      trim: true,
    }],
    metadata: {
      type: Schema.Types.Mixed,
    },
    aiSummary: {
      date: Date,
      summary: String,
    },
    humanSummary: {
      date: Date,
      summary: String,
      createdBy: Schema.Types.ObjectId,
    },
    processedFor: [{
      contactId: {
        type: Schema.Types.ObjectId,
        ref: 'Contact',
        required: true,
      },
      opportunityId: {
        type: Schema.Types.ObjectId,
        ref: 'Prospect',
        required: true,
      },
      processedAt: {
        type: Date,
        required: true,
      },
    }],
  },
  { timestamps: true },
);

// Indexes for faster queries
ActivitySchema.index({ prospect: 1, organization: 1 });
ActivitySchema.index({ contacts: 1, organization: 1 });
ActivitySchema.index({ date: 1, organization: 1 });
ActivitySchema.index({ type: 1, organization: 1 });

const Activity = mongoose.model<IActivity>('Activity', ActivitySchema);
export default Activity; 