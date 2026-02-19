import mongoose, { Document, Schema } from 'mongoose';

export interface INylasConnection extends Document {
  user: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'other' | 'google' | 'microsoft';
  grantId: string;
  syncStatus: 'active' | 'error' | 'disconnected' | 'expired';
  lastSyncAt?: Date;
  lastKeepAliveAt?: Date;
  error?: {
    message: string;
    code?: string;
    timestamp: Date;
  };
  calendars: string[];
  emailSignature?: string;
  metadata?: Record<string, any>;
  notetaker_config?: {
    enabled: boolean;
    default_settings?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const NylasConnectionSchema = new Schema<INylasConnection>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    provider: {
      type: String,
      enum: ['gmail', 'outlook', 'yahoo', 'icloud', 'other', 'google', 'microsoft'],
      required: true,
    },
    grantId: {
      type: String,
      required: true,
    },
    syncStatus: {
      type: String,
      enum: ['active', 'error', 'disconnected', 'expired'],
      default: 'active',
    },
    lastSyncAt: Date,
    lastKeepAliveAt: Date,
    error: {
      message: String,
      code: String,
      timestamp: Date,
    },
    calendars: {
      type: [String],
      default: [],
    },
    emailSignature: {
      type: String,
      default: '',
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    notetaker_config: {
      enabled: { type: Boolean, default: false },
      default_settings: { type: Schema.Types.Mixed },
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
NylasConnectionSchema.index({ user: 1, organization: 1 });
NylasConnectionSchema.index({ email: 1, organization: 1 });
NylasConnectionSchema.index({ grantId: 1 }, { unique: true });
NylasConnectionSchema.index({ syncStatus: 1 });
NylasConnectionSchema.index({ lastKeepAliveAt: 1 });

// Note: Email fetch triggering has been moved to the service layer (createNylasConnectionWithEmailFetch)
// This follows better separation of concerns and avoids circular dependencies

const NylasConnection = mongoose.model<INylasConnection>('NylasConnection', NylasConnectionSchema);
export default NylasConnection; 