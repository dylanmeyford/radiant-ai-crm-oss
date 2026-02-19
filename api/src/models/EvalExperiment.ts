import mongoose, { Document, Schema } from 'mongoose';

export type EvalExperimentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IEvalExperiment extends Document {
  organization: mongoose.Types.ObjectId;
  name: string;
  datasetId: mongoose.Types.ObjectId;
  variants: Array<{ name: string; templateId: mongoose.Types.ObjectId; modelName?: string }>;
  scorers: string[];
  status: EvalExperimentStatus;
  progress?: { current: number; total: number; currentVariant?: string };
  results?: Record<string, any>;
  comparison?: { winner?: string | null };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EvalExperimentSchema = new Schema<IEvalExperiment>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    datasetId: {
      type: Schema.Types.ObjectId,
      ref: 'EvalDataset',
      required: true,
    },
    variants: [
      {
        name: { type: String, required: true },
        templateId: { type: Schema.Types.ObjectId, ref: 'PromptTemplate', required: true },
        modelName: { type: String },
      },
    ],
    scorers: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    progress: {
      current: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      currentVariant: { type: String },
    },
    results: {
      type: Schema.Types.Mixed,
    },
    comparison: {
      winner: { type: String },
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

EvalExperimentSchema.index({ organization: 1, createdAt: -1 });

const EvalExperiment = mongoose.model<IEvalExperiment>('EvalExperiment', EvalExperimentSchema);

export default EvalExperiment;
