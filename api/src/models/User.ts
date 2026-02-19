import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUserSession {
  token: string;
  device: string;
  createdAt: Date;
}

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  RadiantAdmin?: boolean;
  organization: mongoose.Types.ObjectId;
  sessions: IUserSession[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateRefreshToken(deviceInfo: string): Promise<string>;
  removeRefreshToken(token: string): Promise<void>;
  removeAllRefreshTokens(): Promise<void>;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
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
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    RadiantAdmin: {
      type: Boolean,
      default: false,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    sessions: [{
      token: {
        type: String,
        required: true
      },
      device: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to generate refresh token
UserSchema.methods.generateRefreshToken = async function(deviceInfo: string): Promise<string> {
  const refreshToken = await bcrypt.genSalt(10);
  
  // Retry logic to handle concurrent modifications
  let retries = 3;
  while (retries > 0) {
    try {
      // Reload the document to get the latest version
      const latestUser = await User.findById(this._id);
      if (!latestUser) {
        throw new Error('User not found during session generation');
      }
      
      // Add the new session to the latest version
      latestUser.sessions.push({
        token: refreshToken,
        device: deviceInfo,
        createdAt: new Date()
      });
      
      await latestUser.save();
      
      // Update this instance with the latest sessions
      this.sessions = latestUser.sessions;
      this.__v = latestUser.__v;
      
      return refreshToken;
    } catch (error: any) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--;
        console.log(`Retrying generateRefreshToken due to version conflict (${retries} attempts left)`);
        // Small delay to reduce collision probability
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to generate refresh token after multiple retries');
};

// Method to remove a specific refresh token
UserSchema.methods.removeRefreshToken = async function(token: string): Promise<void> {
  // Retry logic to handle concurrent modifications
  let retries = 3;
  while (retries > 0) {
    try {
      // Reload the document to get the latest version
      const latestUser = await User.findById(this._id);
      if (!latestUser) {
        throw new Error('User not found during session removal');
      }
      
      // Remove the session from the latest version
      latestUser.sessions = latestUser.sessions.filter((session: IUserSession) => session.token !== token);
      
      await latestUser.save();
      
      // Update this instance with the latest sessions
      this.sessions = latestUser.sessions;
      this.__v = latestUser.__v;
      
      return;
    } catch (error: any) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--;
        console.log(`Retrying removeRefreshToken due to version conflict (${retries} attempts left)`);
        // Small delay to reduce collision probability
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to remove refresh token after multiple retries');
};

// Method to remove all refresh tokens (logout from all devices)
UserSchema.methods.removeAllRefreshTokens = async function(): Promise<void> {
  // Retry logic to handle concurrent modifications
  let retries = 3;
  while (retries > 0) {
    try {
      // Reload the document to get the latest version
      const latestUser = await User.findById(this._id);
      if (!latestUser) {
        throw new Error('User not found during session clearing');
      }
      
      // Clear all sessions from the latest version
      latestUser.sessions = [];
      
      await latestUser.save();
      
      // Update this instance with the latest sessions
      this.sessions = latestUser.sessions;
      this.__v = latestUser.__v;
      
      return;
    } catch (error: any) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--;
        console.log(`Retrying removeAllRefreshTokens due to version conflict (${retries} attempts left)`);
        // Small delay to reduce collision probability
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to remove all refresh tokens after multiple retries');
};

const User = mongoose.model<IUser>('User', UserSchema);
export default User; 