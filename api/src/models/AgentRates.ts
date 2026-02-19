import mongoose, { Document, Schema } from 'mongoose';

export type AgentCategory = 'actions' | 'processing' | 'research';

export interface IAgentRate extends Document {
  agentName: string;
  category: AgentCategory;
  inputTokenRate: number; // Cost per 1M input tokens in dollars
  outputTokenRate: number; // Cost per 1M output tokens in dollars
  effectiveDate: Date;
  isActive: boolean;
  modelName?: string; // Optional: track which model the agent uses
  createdAt: Date;
  updatedAt: Date;
}

const AgentRateSchema = new Schema<IAgentRate>(
  {
    agentName: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['actions', 'processing', 'research'],
      required: true,
      index: true,
    },
    inputTokenRate: {
      type: Number,
      required: true,
      min: 0,
    },
    outputTokenRate: {
      type: Number,
      required: true,
      min: 0,
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    modelName: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding active rates by agent
AgentRateSchema.index({ agentName: 1, isActive: 1, effectiveDate: -1 });

const AgentRate = mongoose.model<IAgentRate>('AgentRate', AgentRateSchema);

export default AgentRate;

