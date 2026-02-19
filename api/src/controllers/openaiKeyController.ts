import { Request, Response } from 'express';
import {
  clearOrganizationOpenAIKey,
  getOrganizationOpenAIKeyStatus,
  revalidateOrganizationOpenAIKey,
  setOrganizationOpenAIKey,
} from '../services/openaiKeyService';

function getOrganizationId(req: Request): string | null {
  const user = (req as any).user;
  if (!user || !user.organization) {
    return null;
  }
  return user.organization.toString();
}

export const getOpenAIKeyStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const status = await getOrganizationOpenAIKeyStatus(organizationId);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    console.error('[OpenAI Key] Error fetching status:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch OpenAI key status' });
  }
};

export const setOpenAIKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ success: false, message: 'apiKey is required' });
      return;
    }

    await setOrganizationOpenAIKey(organizationId, apiKey.trim());
    const status = await getOrganizationOpenAIKeyStatus(organizationId);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[OpenAI Key] Error setting key:', error);
    res.status(500).json({ success: false, message: 'Failed to set OpenAI key' });
  }
};

export const deleteOpenAIKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    await clearOrganizationOpenAIKey(organizationId);
    res.status(200).json({ success: true, data: { removed: true } });
  } catch (error) {
    console.error('[OpenAI Key] Error deleting key:', error);
    res.status(500).json({ success: false, message: 'Failed to delete OpenAI key' });
  }
};

export const validateOpenAIKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    await revalidateOrganizationOpenAIKey(organizationId);
    const status = await getOrganizationOpenAIKeyStatus(organizationId);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    console.error('[OpenAI Key] Error validating key:', error);
    res.status(500).json({ success: false, message: 'Failed to validate OpenAI key' });
  }
};
