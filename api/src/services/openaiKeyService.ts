import fetch from 'node-fetch';
import Organization from '../models/Organization';
import { decryptSecret, encryptSecret } from './encryptionService';

export interface OpenAIKeyStatus {
  enabled: boolean;
  hasKey: boolean;
  validatedAt?: Date;
  maskedKey?: string;
}

const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return apiKey;
  }
  return `${'*'.repeat(Math.max(0, apiKey.length - 4))}${apiKey.slice(-4)}`;
}

export async function validateOpenAIKey(apiKey: string): Promise<void> {
  const response = await fetch(OPENAI_MODELS_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI key validation failed: ${response.status} ${body}`);
  }
}

export async function setOrganizationOpenAIKey(organizationId: string, apiKey: string): Promise<void> {
  await validateOpenAIKey(apiKey);

  const encrypted = encryptSecret(apiKey);

  await Organization.findByIdAndUpdate(organizationId, {
    openaiApiKey: encrypted,
    openaiKeyEnabled: true,
    openaiKeyValidatedAt: new Date(),
  });
}

export async function clearOrganizationOpenAIKey(organizationId: string): Promise<void> {
  await Organization.findByIdAndUpdate(organizationId, {
    openaiApiKey: null,
    openaiKeyEnabled: false,
    openaiKeyValidatedAt: null,
  });
}

export async function getOrganizationOpenAIKey(organizationId: string): Promise<string | null> {
  const org = await Organization.findById(organizationId).select('openaiApiKey openaiKeyEnabled');
  if (!org || !org.openaiKeyEnabled || !org.openaiApiKey) {
    return null;
  }
  return decryptSecret(org.openaiApiKey);
}

export async function getOrganizationOpenAIKeyStatus(organizationId: string): Promise<OpenAIKeyStatus> {
  const org = await Organization.findById(organizationId).select('openaiApiKey openaiKeyEnabled openaiKeyValidatedAt');
  if (!org) {
    return { enabled: false, hasKey: false };
  }

  const hasKey = Boolean(org.openaiApiKey);
  const enabled = Boolean(org.openaiKeyEnabled);
  const validatedAt = org.openaiKeyValidatedAt || undefined;

  let maskedKey: string | undefined;
  if (hasKey) {
    try {
      const decrypted = decryptSecret(org.openaiApiKey as string);
      maskedKey = maskApiKey(decrypted);
    } catch {
      maskedKey = undefined;
    }
  }

  return {
    enabled,
    hasKey,
    validatedAt,
    maskedKey,
  };
}

export async function revalidateOrganizationOpenAIKey(organizationId: string): Promise<void> {
  const key = await getOrganizationOpenAIKey(organizationId);
  if (!key) {
    throw new Error('No OpenAI key configured');
  }

  await validateOpenAIKey(key);

  await Organization.findByIdAndUpdate(organizationId, {
    openaiKeyValidatedAt: new Date(),
  });
}
