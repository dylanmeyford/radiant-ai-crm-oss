import mongoose, { Document, Schema } from 'mongoose';

export interface ICompetitor extends Document {
  name: string;
  website?: string;
  logo?: string;
  industry?: string;
  size?: string;
  description?: string;
  strengths?: string[];
  weaknesses?: string[];
  products?: string[];
  pricing?: string;
  status: 'active' | 'archived';
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  intel: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const CompetitorSchema = new Schema<ICompetitor>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    size: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    strengths: [{
      type: String,
      trim: true,
    }],
    weaknesses: [{
      type: String,
      trim: true,
    }],
    products: [{
      type: String,
      trim: true,
    }],
    pricing: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    intel: [{
      type: Schema.Types.ObjectId,
      ref: 'Intel',
    }],
  },
  { timestamps: true, virtuals: true }
);

// Index for faster queries
CompetitorSchema.index({ name: 1, organization: 1 });
CompetitorSchema.index({ industry: 1, organization: 1 });
CompetitorSchema.index({ status: 1, organization: 1 });

const Competitor = mongoose.model<ICompetitor>('Competitor', CompetitorSchema);
export default Competitor; 