import mongoose, { Document, Schema } from 'mongoose';

export type MinedDealStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'SNOOZED';

export interface IMinedDealParticipant {
  email: string;
  name?: string;
}

export interface IMinedDealRepresentativeThread {
  threadId: string;
  subject?: string;
  snippet?: string;
}

export interface IMinedDeal extends Document {
  _id: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  suggestedBy: mongoose.Types.ObjectId;
  
  // Company info
  companyName: string;
  domains: string[];
  
  // Evidence from email threads
  threadCount: number;
  totalMessages: number;
  lastActivityDate: Date;
  firstActivityDate: Date;
  participants: IMinedDealParticipant[];
  representativeThread: IMinedDealRepresentativeThread;
  
  // Status
  status: MinedDealStatus;
  
  // If accepted - links to created entities
  createdProspect?: mongoose.Types.ObjectId;
  createdOpportunity?: mongoose.Types.ObjectId;
  acceptedBy?: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  selectedStage?: mongoose.Types.ObjectId;
  
  // If dismissed/snoozed
  dismissedReason?: string;
  snoozeUntil?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const MinedDealParticipantSchema = new Schema<IMinedDealParticipant>({
  email: { type: String, required: true },
  name: { type: String },
}, { _id: false });

const MinedDealRepresentativeThreadSchema = new Schema<IMinedDealRepresentativeThread>({
  threadId: { type: String, required: true },
  subject: { type: String },
  snippet: { type: String },
}, { _id: false });

const MinedDealSchema = new Schema<IMinedDeal>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    suggestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // Company info
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    domains: [{
      type: String,
      required: true,
      trim: true,
    }],
    
    // Evidence from email threads
    threadCount: {
      type: Number,
      required: true,
      min: 1,
    },
    totalMessages: {
      type: Number,
      required: true,
      min: 1,
    },
    lastActivityDate: {
      type: Date,
      required: true,
    },
    firstActivityDate: {
      type: Date,
      required: true,
    },
    participants: [MinedDealParticipantSchema],
    representativeThread: {
      type: MinedDealRepresentativeThreadSchema,
      required: true,
    },
    
    // Status
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DISMISSED', 'SNOOZED'],
      default: 'PENDING',
      required: true,
    },
    
    // If accepted
    createdProspect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect',
    },
    createdOpportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    acceptedAt: {
      type: Date,
    },
    selectedStage: {
      type: Schema.Types.ObjectId,
      ref: 'PipelineStage',
    },
    
    // If dismissed/snoozed
    dismissedReason: {
      type: String,
      trim: true,
    },
    snoozeUntil: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for listing pending deals for an organization
MinedDealSchema.index({ organization: 1, status: 1 });

// Index for deduplication lookups (check if domain already mined/dismissed)
MinedDealSchema.index({ organization: 1, domains: 1 });

// Index for looking up by suggestedBy user
MinedDealSchema.index({ suggestedBy: 1, status: 1 });

// Partial unique index to prevent duplicate active suggestions for same domain in same org
// Only applies when status is PENDING or SNOOZED
MinedDealSchema.index(
  { organization: 1, 'domains': 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'SNOOZED'] } },
  }
);

const MinedDeal = mongoose.model<IMinedDeal>('MinedDeal', MinedDealSchema);

export default MinedDeal;
