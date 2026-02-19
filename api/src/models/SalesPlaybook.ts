import mongoose, { Document, Schema } from 'mongoose';

export enum ContentType {
  BATTLE_CARD = 'battle_card',
  FAQ = 'faq',
  PRODUCT_INFO = 'product_info',
  SALES_PROCESS = 'sales_process',
  COLLATERAL = 'collateral',
  CASE_STUDY = 'case_study',
  BUSINESS_INFORMATION = 'business_information',
  PRODUCT_OVERVIEW = 'product_overview',
  TEMPLATES = 'templates',
}

export interface ISalesPlaybook extends Document {
  type: ContentType;
  title: string;
  content: string;
  contentSummary?: string; // AI-generated summary of uploaded files and content
  tags?: string[];
  keywords?: string[];
  useCase?: string;
  lastUsed?: Date;
  usageCount?: number;
  files?: mongoose.Types.ObjectId[];
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SalesPlaybookSchema = new Schema<ISalesPlaybook>(
  {
    type: {
      type: String,
      enum: Object.values(ContentType),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
    },
    contentSummary: {
      type: String,
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    keywords: [{
      type: String,
      trim: true,
    }],
    useCase: {
      type: String,
      trim: true,
    },
    lastUsed: {
      type: Date,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    files: [{
      type: Schema.Types.ObjectId,
      ref: 'Document',
    }],
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
  },
  { timestamps: true }
);

// Indexes for faster queries
SalesPlaybookSchema.index({ type: 1, organization: 1 });
SalesPlaybookSchema.index({ 
  title: 'text', 
  content: 'text', 
  contentSummary: 'text',
  tags: 'text',
  keywords: 'text'
}, {
  weights: {
    title: 10,          // Highest priority for title matches
    keywords: 8,        // High priority for keyword matches
    tags: 6,           // Medium-high priority for tag matches
    contentSummary: 4,  // Medium priority for summary matches
    content: 2         // Lower priority for full content matches
  }
});
SalesPlaybookSchema.index({ tags: 1, organization: 1 });
SalesPlaybookSchema.index({ keywords: 1, organization: 1 });
SalesPlaybookSchema.index({ organization: 1, type: 1, tags: 1 }); // Compound index for filtered searches

const SalesPlaybook = mongoose.model<ISalesPlaybook>('SalesPlaybook', SalesPlaybookSchema);
export default SalesPlaybook; 