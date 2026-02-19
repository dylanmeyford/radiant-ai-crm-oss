import { IActivity, ActivityType } from './Activity';
import mongoose, { Document, Schema } from 'mongoose';

export interface ICalendarActivity extends IActivity {
  organization: mongoose.Types.ObjectId;
  calendarId: string;
  eventId: string;
  title: string;
  description?: string;
  status: 'to_do' | 'scheduled' | 'completed' | 'cancelled';
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string;
  attendees: Array<{
    email: string;
    name?: string;
    responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }>;
  contacts: mongoose.Types.ObjectId[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    until?: Date;
    count?: number;
    daysOfWeek?: number[];
  };
  nylasGrantId: string;
  nylasCalendarId?: string;
  nylasEventId?: string;
  busy?: boolean;
  htmlLink?: string;
  icalUid?: string;
  readOnly?: boolean;
  hideParticipants?: boolean;
  creator?: {
    email: string;
    name?: string;
  };
  organizer?: {
    email: string;
    name?: string;
  };
  conferencing?: {
    provider: string;
    details: any;
  };
  reminders?: any;
  transcriptionText?: string;
  aiSummary?: { date: Date; summary: string };
  humanSummary?: { date: Date; summary: string; createdBy: mongoose.Types.ObjectId };
  agenda?: {
    content: string;
    generatedAt: Date;
    generatedBy: 'MeetingPrepAgent';
    version?: string;
  };
  metadata?: {
    sourceAction?: mongoose.Types.ObjectId;
    sourceActionType?: string;
    [key: string]: any;
  };
  nylasNotetakerId?: string;
  mediaStatus?: 'available' | 'partial' | 'processing' | 'deleted' | 'error' | 'recorded' | 'failed' | 'scheduled' | 'completed' | 'cancelled';
  recordingUrl?: string;
  transcriptUrl?: string;
  savedRecordingPath?: string;
  savedTranscriptPath?: string;
  receivedViaWebhookAt?: Date;
}

const CalendarActivitySchema = new Schema<ICalendarActivity>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    type: {
      type: String,
      enum: [ActivityType.CALENDAR],
      default: ActivityType.CALENDAR,
    },
    calendarId: {
      type: String,
      required: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    status: {
      type: String,
      enum: ['to_do', 'scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      min: 0,
    },
    timezone: {
      type: String,
      required: true,
    },
    location: String,
    attendees: [{
      email: { type: String, required: true },
      name: String,
      responseStatus: {
        type: String,
        enum: ['accepted', 'declined', 'tentative', 'needsAction'],
        default: 'needsAction',
      },
    }],
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'Contact',
    }],
    prospect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recurrence: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
      },
      interval: Number,
      until: Date,
      count: Number,
      daysOfWeek: [Number],
    },
    nylasGrantId: {
      type: String,
      required: true,
    },
    nylasCalendarId: {
      type: String,
      required: false,
    },
    nylasEventId: {
      type: String,
      required: false,
    },
    busy: {
      type: Boolean,
      default: false,
    },
    htmlLink: String,
    icalUid: String,
    readOnly: {
      type: Boolean,
      default: false,
    },
    hideParticipants: {
      type: Boolean,
      default: false,
    },
    creator: {
      email: String,
      name: String,
    },
    organizer: {
      email: String,
      name: String,
    },
    conferencing: {
      provider: String,
      details: Schema.Types.Mixed,
    },
    reminders: Schema.Types.Mixed,
    transcriptionText: { type: String },
    aiSummary: { 
      date: Date, 
      summary: String,
    },
    humanSummary: {
      date: Date,
      summary: String,
      createdBy: mongoose.Types.ObjectId,
    },
    agenda: {
      content: { type: String },
      generatedAt: { type: Date },
      generatedBy: { 
        type: String, 
        enum: ['MeetingPrepAgent'],
      },
      version: { type: String },
    },
    metadata: {
      sourceAction: { type: Schema.Types.ObjectId, ref: 'ProposedAction' },
      sourceActionType: { type: String },
    },
    nylasNotetakerId: { type: String, index: true },
    mediaStatus: {
      type: String,
      enum: ['available', 'partial', 'processing', 'deleted', 'error', 'recorded', 'failed', 'scheduled', 'completed', 'cancelled'],
    },
    recordingUrl: { type: String },
    transcriptUrl: { type: String },
    savedRecordingPath: { type: String },
    savedTranscriptPath: { type: String },
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
    receivedViaWebhookAt:{
      type: Date,
    }
  },
  { timestamps: true }
);

// Indexes for faster queries
CalendarActivitySchema.index({ eventId: 1 }, { unique: true });
CalendarActivitySchema.index({ calendarId: 1 });
CalendarActivitySchema.index({ startTime: 1, endTime: 1 });
CalendarActivitySchema.index({ nylasEventId: 1 });
CalendarActivitySchema.index({ 'attendees.email': 1 });

const CalendarActivity = mongoose.model<ICalendarActivity>('CalendarActivity', CalendarActivitySchema);
export default CalendarActivity; 