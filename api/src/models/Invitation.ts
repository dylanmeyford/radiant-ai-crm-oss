import mongoose, { Document, Schema } from 'mongoose';

/**
 * Interface for Invitation document
 */
export interface IInvitation extends Document {
  email: string;
  firstName: string;
  lastName: string;
  token: string;
  registrationLink: string;
  organization: mongoose.Types.ObjectId;
  inviter: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose schema for Invitation
 */
const InvitationSchema = new Schema<IInvitation>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    registrationLink: {
      type: String,
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    inviter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of pending invitations by token
InvitationSchema.index({ token: 1, status: 1 });

// Index for querying invitations by organization
InvitationSchema.index({ organization: 1, status: 1 });

// Method to check if invitation has expired
InvitationSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date();
};

/**
 * Export Invitation model
 */
export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);

