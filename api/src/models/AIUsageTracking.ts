import mongoose, { Document, Schema } from 'mongoose';

// Per-agent usage details
export interface IAgentUsage {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

// Category-level usage aggregation
export interface ICategoryUsage {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  agents: Map<string, IAgentUsage>;
}

export interface IAIUsageTracking extends Document {
  organization: mongoose.Types.ObjectId;
  year: number;
  month: number; // 1-12
  usage: {
    actions: ICategoryUsage;
    processing: ICategoryUsage;
    research: ICategoryUsage;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AgentUsageSchema = new Schema({
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  callCount: { type: Number, default: 0 },
}, { _id: false });

const CategoryUsageSchema = new Schema({
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  callCount: { type: Number, default: 0 },
  agents: {
    type: Map,
    of: AgentUsageSchema,
    default: () => new Map(),
  },
}, { _id: false });

const AIUsageTrackingSchema = new Schema<IAIUsageTracking>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true,
    },
    usage: {
      actions: {
        type: CategoryUsageSchema,
        default: () => ({
          inputTokens: 0,
          outputTokens: 0,
          callCount: 0,
          agents: new Map(),
        }),
      },
      processing: {
        type: CategoryUsageSchema,
        default: () => ({
          inputTokens: 0,
          outputTokens: 0,
          callCount: 0,
          agents: new Map(),
        }),
      },
      research: {
        type: CategoryUsageSchema,
        default: () => ({
          inputTokens: 0,
          outputTokens: 0,
          callCount: 0,
          agents: new Map(),
        }),
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups by organization and period
AIUsageTrackingSchema.index({ organization: 1, year: 1, month: 1 }, { unique: true });

// Index for querying historical data
AIUsageTrackingSchema.index({ organization: 1, year: -1, month: -1 });

const AIUsageTracking = mongoose.model<IAIUsageTracking>('AIUsageTracking', AIUsageTrackingSchema);

export default AIUsageTracking;

