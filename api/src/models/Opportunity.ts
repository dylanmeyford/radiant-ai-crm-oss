import mongoose, { Document, Schema } from 'mongoose';
import { personRoleEnum } from '../types/contactIntelligence.types';

export enum OpportunityStage {
  LEAD = 'lead',
  DEMO = 'demo',
  DECISION_MAKER = 'decision_maker',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost'
}

export enum DealHealthTrend {
  IMPROVING = 'Improving',
  DECLINING = 'Declining',
  STABLE = 'Stable',
}

export enum MomentumDirection {
  ACCELERATING = 'Accelerating',
  DECELERATING = 'Decelerating',
  STABLE = 'Stable',
}

export enum ProcessingStatus {
  IDLE = 'idle',
  PROCESSING = 'processing', 
  COMPLETED = 'completed',
  FAILED = 'failed'
}

const MeddpiccItemSchema = {
  reason: { type: String, required: true },
  confidence: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
  relevance: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
};

const MetricItemSchema = new Schema({ ...MeddpiccItemSchema, metric: { type: String, required: true } }, { _id: false });
const EconomicBuyerItemSchema = new Schema({ ...MeddpiccItemSchema, name: { type: String, required: true } }, { _id: false });
const DecisionCriteriaItemSchema = new Schema({ ...MeddpiccItemSchema, criteria: { type: String, required: true } }, { _id: false });
const ProcessItemSchema = new Schema({ ...MeddpiccItemSchema, process: { type: String, required: true } }, { _id: false });
const IdentifiedPainItemSchema = new Schema({ ...MeddpiccItemSchema, pain: { type: String, required: true } }, { _id: false });
const ChampionItemSchema = new Schema({ ...MeddpiccItemSchema, name: { type: String, required: true } }, { _id: false });
const CompetitionItemSchema = new Schema({ ...MeddpiccItemSchema, competition: { type: String, required: true } }, { _id: false });

export interface MEDDPICC {
  metrics?: { metric: string; reason: string; confidence: string; relevance: string; }[];
  economicBuyer?: { name: string; reason: string; confidence: string; relevance: string; }[];
  decisionCriteria?: { criteria: string; reason: string; confidence: string; relevance: string; }[];
  decisionProcess?: { process: string; reason: string; confidence: string; relevance: string; }[];
  paperProcess?: { process: string; reason: string; confidence: string; relevance: string; }[];
  identifiedPain?: { pain: string; reason:string; confidence: string; relevance: string; }[];
  champion?: { name: string; reason: string; confidence: string; relevance: string; }[];
  competition?: { competition: string; reason: string; confidence: string; relevance: string; }[];
  nextUpdateTimestamp?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  opportunityStartDate?: Date;
  personRoles?: {
    contact: mongoose.Types.ObjectId;
    role: (typeof personRoleEnum)[number];
  }[];
  dealHealthTrend?: DealHealthTrend;
  momentumDirection?: MomentumDirection;
  dealTemperatureHistory?: {
    temperature: number;
    date: Date;
  }[];
}

export interface IOpportunity extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  amount: number;
  stage: mongoose.Types.ObjectId;
  pipeline: mongoose.Types.ObjectId;
  probability: number; // 0-100
  expectedCloseDate?: Date;
  actualCloseDate?: Date;
  prospect: mongoose.Types.ObjectId;
  contacts: mongoose.Types.ObjectId[];
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  salesRooms?: mongoose.Types.ObjectId[];
  tags?: string[];
  meddpicc?: MEDDPICC;
  opportunitySummary?: {
    summary: string;
    lastExaminedActivityId?: mongoose.Types.ObjectId;
  };
  latestDealNarrative?: string;
  dealNarrativeHistory?: {
    narrative: string;
    date: Date;
  }[];
  keyMilestones?: string[];
  riskFactors?: string[];
  stakeholders?: string[];
  nextSteps?: string;
  nextActions?: Array<{
    action: string;
    actionType: string;
    recipients: string[];
    date: Date;
    rationale: string;
    created: boolean;
  }>;
  lastUpdateTimestamp?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  opportunityStartDate?: Date;
  personRoles?: {
    contact: mongoose.Types.ObjectId;
    role: (typeof personRoleEnum)[number];
  }[];
  dealHealthTrend?: DealHealthTrend;
  momentumDirection?: MomentumDirection;
  dealTemperatureHistory?: {
    temperature: number;
    date: Date;
  }[];
  lastIntelligenceUpdateTimestamp?: Date;
  processingStatus?: {
    status: ProcessingStatus;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
    duration?: number; // in milliseconds
    processedActivities?: number;
    totalActivities?: number;
  };
}

const OpportunitySchema = new Schema<IOpportunity>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    opportunityStartDate: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    stage: {
      type: Schema.Types.ObjectId,
      ref: 'PipelineStage',
      required: true,
    },
    pipeline: {
      type: Schema.Types.ObjectId,
      ref: 'Pipeline',
      required: true,
    },
    probability: {
      type: Number,
      min: 0,
      max: 100,
    },
    expectedCloseDate: {
      type: Date,
    },
    actualCloseDate: {
      type: Date,
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
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    salesRooms: [{
      type: Schema.Types.ObjectId,
      ref: 'DigitalSalesRoom',
    }],
    tags: [{
      type: String,
      trim: true,
    }],
    meddpicc: {
      metrics: [MetricItemSchema],
      economicBuyer: [EconomicBuyerItemSchema],
      decisionCriteria: [DecisionCriteriaItemSchema],
      decisionProcess: [ProcessItemSchema],
      paperProcess: [ProcessItemSchema],
      identifiedPain: [IdentifiedPainItemSchema],
      champion: [ChampionItemSchema],
      competition: [CompetitionItemSchema]
    },
    opportunitySummary: {
      summary: { type: String, trim: true },
      lastExaminedActivityId: { type: Schema.Types.ObjectId, ref: 'Activity' }
    },
    latestDealNarrative: { type: String, trim: true },
    dealNarrativeHistory: [{
      narrative: { type: String, trim: true },
      date: { type: Date, default: Date.now },
      _id: false,
    }],
    keyMilestones: [{ type: String, trim: true }],
    riskFactors: [{ type: String, trim: true }],
    stakeholders: [{ type: String, trim: true }],
    nextSteps: { type: String, trim: true },
    nextActions: [{
      action: { type: String, required: true },
      actionType: { type: String, required: true },
      recipients: [{ type: String, required: true }],
      date: { type: Date, required: true },
      rationale: { type: String, required: true },
      created: { type: Boolean, default: false },
      linkedActivityId: { type: Schema.Types.ObjectId, ref: 'Activity' },
      linkedEmailActivityId: { type: Schema.Types.ObjectId, ref: 'EmailActivity' },
    }],
    lastUpdateTimestamp: { type: Date },
    metadata: {
      type: Schema.Types.Mixed,
    },
    personRoles: [
      {
        contact: {
          type: Schema.Types.ObjectId,
          ref: 'Contact',
        },
        role: {
          type: String,
          enum: personRoleEnum,
        },
        _id: false,
      },
    ],
    dealHealthTrend: {
      type: String,
      enum: Object.values(DealHealthTrend),
    },
    momentumDirection: {
      type: String,
      enum: Object.values(MomentumDirection),
    },
    dealTemperatureHistory: [{
      temperature: Number,
      date: Date,
      _id: false,
    }],
    lastIntelligenceUpdateTimestamp: {
      type: Date,
    },
    processingStatus: {
      status: {
        type: String,
        enum: Object.values(ProcessingStatus),
        default: ProcessingStatus.IDLE,
      },
      startedAt: {
        type: Date,
      },
      completedAt: {
        type: Date,
      },
      error: {
        type: String,
      },
      duration: {
        type: Number, // milliseconds
      },
      processedActivities: {
        type: Number,
      },
      totalActivities: {
        type: Number,
      },
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
OpportunitySchema.index({ prospect: 1, organization: 1 });
OpportunitySchema.index({ stage: 1, organization: 1 });
OpportunitySchema.index({ pipeline: 1, organization: 1 });
OpportunitySchema.index({ expectedCloseDate: 1, organization: 1 });
OpportunitySchema.index({ 'personRoles.contact': 1 });
OpportunitySchema.index({ 'processingStatus.status': 1 });

const Opportunity = mongoose.model<IOpportunity>('Opportunity', OpportunitySchema);
export default Opportunity; 