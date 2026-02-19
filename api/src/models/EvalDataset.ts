import mongoose, { Document, Schema } from 'mongoose';

export interface IEvalDataset extends Document {
  organization: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  agentName: string;
  runIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const EvalDatasetSchema = new Schema<IEvalDataset>(
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
    description: {
      type: String,
    },
    agentName: {
      type: String,
      required: true,
      index: true,
    },
    runIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'EvalRun',
      },
    ],
  },
  {
    timestamps: true,
  }
);

EvalDatasetSchema.index({ organization: 1, agentName: 1, createdAt: -1 });

const EvalDataset = mongoose.model<IEvalDataset>('EvalDataset', EvalDatasetSchema);

export default EvalDataset;
