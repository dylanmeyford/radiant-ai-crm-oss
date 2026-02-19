import { IActivity, ActivityType } from './Activity';
import mongoose, { Schema } from 'mongoose';

export interface IEmailActivity extends IActivity {
  messageId: string;
  threadId: string;
  from: Array<{
    email: string;
    name?: string;
  }>;
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc?: Array<{
    email: string;
    name?: string;
  }>;
  bcc?: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: string[];
  emailAttachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    filePath?: string; // Path to file in storage (for drafts/scheduled emails)
    url?: string; // URL to access the file
    content_id?: string;
    content_disposition?: string;
    is_inline?: boolean;
    grant_id?: string; // For received emails from Nylas
  }>;
  receivedDate?: number;
  folders?: string[];
  headers?: Array<{
    name: string;
    value: string;
  }>;
  in_reply_to?: string;
  metadata?: Record<string, any>;
  reply_to?: Array<{
    email: string;
    name?: string;
  }>;
  snippet?: string;
  starred?: boolean;
  raw_mime?: string;
  isDraft: boolean;
  isSent: boolean;
  isRead: boolean;
  nylasGrantId: string;
  nylasMessageId: string;
  nylasThreadId: string;
  scheduledDate?: Date;
  failureReason?: string;
  replyToMessageId?: string;
  aiSummary?: {
    date: Date;
    summary: string;
  };
  humanSummary?: {
    date: Date;
    summary: string;
    createdBy: mongoose.Types.ObjectId;
  };
  receivedViaWebhookAt?: Date;
}

const EmailActivitySchema = new Schema<IEmailActivity>(
  {
    type: {
      type: String,
      enum: [ActivityType.EMAIL],
      default: ActivityType.EMAIL,
    },
    messageId: {
      type: String,
      required: true,
    },
    threadId: {
      type: String,
      required: true,
    },
    from: [{
      email: { type: String, required: true },
      name: String,
    }],
    to: [{
      email: { type: String, required: true },
      name: String,
    }],
    cc: [{
      email: { type: String, required: true },
      name: String,
    }],
    bcc: [{
      email: { type: String, required: true },
      name: String,
    }],
    subject: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    htmlBody: String,
    attachments: [String],
    emailAttachments: [{
      id: { type: String, required: true },
      filename: { type: String, required: true },
      contentType: { type: String, required: true },
      size: { type: Number, required: true },
      filePath: String, // Path to file in storage (for drafts/scheduled emails)
      url: String, // URL to access the file
      content_id: String,
      content_disposition: String,
      is_inline: Boolean,
      grant_id: String, // For received emails from Nylas
    }],
    receivedDate: Number,
    date: {
      type: Date,
      required: true,
    },
    folders: [String],
    headers: [{
      name: { type: String, required: true },
      value: { type: String, required: true },
    }],
    in_reply_to: String,
    metadata: Schema.Types.Mixed,
    reply_to: [{
      email: { type: String, required: true },
      name: String,
    }],
    snippet: String,
    starred: Boolean,
    raw_mime: String,
    isDraft: {
      type: Boolean,
      default: false,
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    nylasGrantId: {
      type: String,
      required: true,
    },
    nylasMessageId: {
      type: String,
      required: true,
    },
    nylasThreadId: {
      type: String,
      required: true,
    },
    scheduledDate: Date,
    failureReason: String,
    title: {
      type: String,
      required: true,
    },
    replyToMessageId: String,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'failed', 'draft'],
      default: 'completed',
    },
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    }],
    prospect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect',
      required: true,
    },
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
    aiSummary: {
      date: Date,
      summary: String,
    },
    humanSummary: {
      date: Date,
      summary: String,
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      }
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
    receivedViaWebhookAt:{
      type: Date,
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
EmailActivitySchema.index({ messageId: 1 });
EmailActivitySchema.index({ threadId: 1 });
EmailActivitySchema.index({ nylasMessageId: 1 });
EmailActivitySchema.index({ nylasThreadId: 1 });
EmailActivitySchema.index({ 'from.email': 1 });
EmailActivitySchema.index({ 'to.email': 1 });
EmailActivitySchema.index({ receivedDate: 1 });
EmailActivitySchema.index({ date: 1 });
EmailActivitySchema.index({ starred: 1 });
EmailActivitySchema.index({ emailAttachments: 1 });

const EmailActivity = mongoose.model<IEmailActivity>('EmailActivity', EmailActivitySchema);
export default EmailActivity; 