import { Request, Response, NextFunction } from 'express';
import ApiKey from '../models/ApiKey';

// Minimal request augmentation without changing global types
export interface ApiKeyAuthedRequest extends Request {
  organizationId?: string;
  apiKeyId?: string;
}

export const apiKeyAuth = async (req: ApiKeyAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.header('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
      return;
    }

    // Iterate active keys and bcrypt-compare
    const activeKeys = await ApiKey.find({ isActive: true }).lean(false);

    let matched: InstanceType<typeof ApiKey> | null = null;
    for (const keyDoc of activeKeys) {
      if (typeof (keyDoc as any).compareKey === 'function') {
        const ok = await (keyDoc as any).compareKey(token);
        if (ok) {
          matched = keyDoc as any;
          break;
        }
      }
    }

    if (!matched) {
      res.status(401).json({ success: false, message: 'Invalid API key' });
      return;
    }

    // Attach org and key id to request
    req.organizationId = String((matched as any).organization);
    req.apiKeyId = String((matched as any)._id);

    // Best-effort update of lastUsedAt (non-blocking)
    ApiKey.updateOne({ _id: (matched as any)._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

    next();
    return;
  } catch (error) {
    console.error('apiKeyAuth error:', error);
    res.status(500).json({ success: false, message: 'Authentication error' });
    return;
  }
};

export default apiKeyAuth;


