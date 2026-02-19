import mongoose, { Document, Schema } from 'mongoose';

export type DomainValidationConfidence = 'high' | 'medium' | 'low';
export type DomainValidationCategory =
  | 'business_domain'
  | 'personal_domain'
  | 'service_provider'
  | 'saas_platform'
  | 'spam_or_marketing'
  | 'forwarded_personal'
  | 'third_party_business'
  | 'unknown';

export interface IDomainValidationCache extends Document {
  domain: string;
  shouldInclude: boolean;
  confidence: DomainValidationConfidence;
  reasoning: string;
  category: DomainValidationCategory;
  organizationId?: mongoose.Types.ObjectId | null;
  prospectContext?: string;
  validatedAt: Date;
  expiresAt?: Date;
  source: 'hardcoded' | 'cache' | 'ai';
  createdAt: Date;
  updatedAt: Date;
}

const DomainValidationCacheSchema = new Schema<IDomainValidationCache>(
  {
    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    shouldInclude: {
      type: Boolean,
      required: true,
    },
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
    },
    reasoning: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      enum: [
        'business_domain',
        'personal_domain',
        'service_provider',
        'saas_platform',
        'spam_or_marketing',
        'forwarded_personal',
        'third_party_business',
        'unknown',
      ],
      default: 'unknown',
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    prospectContext: {
      type: String,
      trim: true,
    },
    validatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
    source: {
      type: String,
      enum: ['hardcoded', 'cache', 'ai'],
      default: 'ai',
    },
  },
  { timestamps: true }
);

// Unique per organization so decisions can be scoped
DomainValidationCacheSchema.index(
  { domain: 1, organizationId: 1 },
  { unique: true }
);

// TTL index if expiresAt is set
DomainValidationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DomainValidationCache = mongoose.model<IDomainValidationCache>(
  'DomainValidationCache',
  DomainValidationCacheSchema
);

export default DomainValidationCache;
