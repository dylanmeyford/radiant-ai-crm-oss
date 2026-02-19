import mongoose, { Document, Schema } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  industry?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  website?: string;
  about?: string;
  
  // Billing fields
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  billingEmail?: string;
  paymentMethodAdded: boolean;
  
  // OpenAI BYOK fields
  openaiApiKey?: string;
  openaiKeyEnabled?: boolean;
  openaiKeyValidatedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String },
    },
    about: {
      type: String,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    // Billing fields
    stripeCustomerId: {
      type: String,
      sparse: true,
      unique: true,
    },
    stripeSubscriptionId: {
      type: String,
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'incomplete', 'trialing'],
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    billingEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    paymentMethodAdded: {
      type: Boolean,
      default: false,
    },
    // OpenAI BYOK fields
    openaiApiKey: {
      type: String,
    },
    openaiKeyEnabled: {
      type: Boolean,
      default: false,
    },
    openaiKeyValidatedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
export default Organization; 