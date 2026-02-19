import mongoose, { Document, Schema } from 'mongoose';

export interface IPromptTemplate extends Document {
  organization: mongoose.Types.ObjectId;
  agentName: string;
  version: string;
  template: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PromptTemplateSchema = new Schema<IPromptTemplate>(
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
    version: {
      type: String,
      required: true,
    },
    template: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

PromptTemplateSchema.index({ organization: 1, agentName: 1, version: 1 }, { unique: true });
PromptTemplateSchema.index({ organization: 1, agentName: 1, isActive: 1 });

const PromptTemplate = mongoose.model<IPromptTemplate>('PromptTemplate', PromptTemplateSchema);

export default PromptTemplate;
