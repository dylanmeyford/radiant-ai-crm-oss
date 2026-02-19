import { Request, Response } from 'express';
import ApiKey from '../models/ApiKey';
import { generatePlainApiKey, hashApiKey } from '../utils/apiKey';

export const listApiKeys = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const keys = await ApiKey.find({ organization: user.organization })
    .select('_id name isActive lastUsedAt createdAt updatedAt')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: keys });
};

export const createApiKey = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const { name } = req.body as { name?: string };
  const plain = generatePlainApiKey();
  const keyHash = await hashApiKey(plain);

  const doc = await ApiKey.create({
    keyHash,
    organization: user.organization,
    name: name || '',
    isActive: true,
  });

  res.status(201).json({ success: true, data: { _id: doc._id, name: doc.name, isActive: doc.isActive }, apiKey: plain });
};

export const setApiKeyActive = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const { id } = req.params;
  const { isActive } = req.body as { isActive: boolean };

  const updated = await ApiKey.findOneAndUpdate(
    { _id: id, organization: user.organization },
    { $set: { isActive: !!isActive } },
    { new: true }
  ).select('_id name isActive lastUsedAt createdAt updatedAt');

  if (!updated) { res.status(404).json({ success: false, message: 'API key not found' }); return; }

  res.status(200).json({ success: true, data: updated });
};


