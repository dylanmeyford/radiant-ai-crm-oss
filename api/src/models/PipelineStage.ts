import mongoose, { Document, Schema } from 'mongoose';

export interface IPipelineStage extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  order: number;
  description: string;
  organization: mongoose.Types.ObjectId;
  pipeline: mongoose.Types.ObjectId;
  isClosedWon: boolean;
  isClosedLost: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineStageSchema = new Schema<IPipelineStage>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    pipeline: {
      type: Schema.Types.ObjectId,
      ref: 'Pipeline',
      required: true,
    },
    isClosedWon: {
      type: Boolean,
      default: false,
    },
    isClosedLost: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound indexes for uniqueness within a pipeline
PipelineStageSchema.index({ pipeline: 1, order: 1 }, { unique: true });
PipelineStageSchema.index({ pipeline: 1, name: 1 }, { unique: true });

// Regular indexes for queries
PipelineStageSchema.index({ organization: 1 });
PipelineStageSchema.index({ pipeline: 1 });

const PipelineStage = mongoose.model<IPipelineStage>('PipelineStage', PipelineStageSchema);
export default PipelineStage;

