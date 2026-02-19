import mongoose, { Document, Schema } from 'mongoose';

export interface IIntel extends Document {
  type: 'prospect' | 'competitor';
  title: string;
  content: string;
  source?: string;
  url?: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'archived';
  prospect?: mongoose.Types.ObjectId;
  competitor?: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  aiSummary?: {
    date: Date;
    summary: string;
  };
}

const IntelSchema = new Schema<IIntel>(
  {
    type: {
      type: String,
      enum: ['prospect', 'competitor'],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    source: {
      type: String,
      trim: true
    },
    url: {
      type: String,
      trim: true
    },
    importance: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    },
    prospect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect'
    },
    competitor: {
      type: Schema.Types.ObjectId,
      ref: 'Competitor'
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    aiSummary: {
      date: Date,
      summary: String,
    }
  },
  { timestamps: true, virtuals: true }
);

// Index for faster queries
IntelSchema.index({ type: 1, organization: 1 });
IntelSchema.index({ prospect: 1, organization: 1 });
IntelSchema.index({ competitor: 1, organization: 1 });
IntelSchema.index({ importance: 1, organization: 1 });

const Intel = mongoose.model<IIntel>('Intel', IntelSchema);
export default Intel; 