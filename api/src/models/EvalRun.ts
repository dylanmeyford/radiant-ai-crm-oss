import mongoose, { Document, Schema } from 'mongoose';

export type EvalRunStatus = 'pending' | 'completed' | 'failed';

export interface IEvalRun extends Document {
  organization: mongoose.Types.ObjectId;
  agentName: string;
  status: EvalRunStatus;
  inputVariables?: Record<string, any>;
  promptTemplate?: mongoose.Types.ObjectId;
  promptTemplateVersion?: string;
  fullPrompt?: string;
  inputMessages?: Array<{ role: string; content: string }>;
  outputText?: string;
  parsedOutput?: any;
  expectedOutput?: any;
  expectedNotes?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  modelName?: string;
  error?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const EvalRunSchema = new Schema<IEvalRun>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    agentName: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    inputVariables: {
      type: Schema.Types.Mixed,
    },
    promptTemplate: {
      type: Schema.Types.ObjectId,
      ref: 'PromptTemplate',
    },
    promptTemplateVersion: {
      type: String,
    },
    fullPrompt: {
      type: String,
    },
    inputMessages: [
      {
        role: { type: String, required: true },
        content: { type: String, required: true },
      },
    ],
    outputText: {
      type: String,
    },
    parsedOutput: {
      type: Schema.Types.Mixed,
    },
    expectedOutput: {
      type: Schema.Types.Mixed,
    },
    expectedNotes: {
      type: String,
    },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    latencyMs: {
      type: Number,
    },
    modelName: {
      type: String,
    },
    error: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

EvalRunSchema.index({ organization: 1, agentName: 1, createdAt: -1 });

const EvalRun = mongoose.model<IEvalRun>('EvalRun', EvalRunSchema);

export default EvalRun;
