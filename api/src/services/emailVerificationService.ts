import mongoose from 'mongoose';
import { Document as DocumentInterface, Schema } from 'mongoose';

// Interface for the verification code document
export interface IVerificationCode extends DocumentInterface {
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
  salesRoomId: string;
}

// Schema for verification codes
const VerificationCodeSchema = new Schema<IVerificationCode>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    salesRoomId: {
      type: String,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Create indexes for faster queries
VerificationCodeSchema.index({ email: 1, salesRoomId: 1 });
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Create the model
const VerificationCode = mongoose.model<IVerificationCode>('VerificationCode', VerificationCodeSchema);

/**
 * Generate a random numeric code of specified length
 */
export const generateVerificationCode = (length: number = 6): string => {
  const digits = '0123456789';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    code += digits[randomIndex];
  }
  
  return code;
};

/**
 * Create a new verification code for a visitor's email
 */
export const createVerificationCode = async (
  email: string,
  salesRoomId: string,
  expiresInMinutes: number = 15
): Promise<string> => {
  // Delete any existing unused codes for this email and sales room
  await VerificationCode.deleteMany({
    email,
    salesRoomId,
    used: false,
  });
  
  // Generate a new code
  const code = generateVerificationCode();
  
  // Calculate expiration time
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
  
  // Save the new code
  await VerificationCode.create({
    email,
    code,
    salesRoomId,
    expiresAt,
    used: false,
  });
  
  return code;
};

/**
 * Verify a code sent by a visitor
 */
export const verifyCode = async (
  email: string,
  code: string,
  salesRoomId: string
): Promise<boolean> => {
  // Find the verification code document
  const verificationCode = await VerificationCode.findOne({
    email,
    code,
    salesRoomId,
    used: false,
    expiresAt: { $gt: new Date() },
  });
  
  if (!verificationCode) {
    return false;
  }
  
  // Mark the code as used
  verificationCode.used = true;
  await verificationCode.save();
  
  return true;
};

export default {
  generateVerificationCode,
  createVerificationCode,
  verifyCode,
  VerificationCode,
}; 