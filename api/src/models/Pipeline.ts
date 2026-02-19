import mongoose, { Document, Schema } from 'mongoose';

export interface IPipeline extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  organization: mongoose.Types.ObjectId;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineSchema = new Schema<IPipeline>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for unique pipeline names within an organization
PipelineSchema.index({ organization: 1, name: 1 }, { unique: true });

// Index for querying pipelines by organization
PipelineSchema.index({ organization: 1 });

// Index for finding default pipeline quickly
PipelineSchema.index({ organization: 1, isDefault: 1 });

const Pipeline = mongoose.model<IPipeline>('Pipeline', PipelineSchema);
export default Pipeline;
