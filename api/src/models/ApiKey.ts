import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IApiKey extends Document {
  keyHash: string;
  organization: mongoose.Types.ObjectId;
  name?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  compareKey(candidate: string): Promise<boolean>;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    keyHash: {
      type: String,
      required: true,
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

ApiKeySchema.methods.compareKey = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.keyHash);
};

ApiKeySchema.index({ organization: 1, isActive: 1 });

const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
export default ApiKey;


