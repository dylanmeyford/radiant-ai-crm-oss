import mongoose, { Document, Schema } from 'mongoose';

export interface IDirectoryProvider extends Document {
  name: string;
  description: string;
  website: string;
  link: string;
  linkText: string;
  image: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DirectoryProviderSchema = new Schema<IDirectoryProvider>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
    linkText: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true, virtuals: true }
);

DirectoryProviderSchema.index({ name: 1 });

const DirectoryProvider = mongoose.model<IDirectoryProvider>('DirectoryProvider', DirectoryProviderSchema);

export default DirectoryProvider;
