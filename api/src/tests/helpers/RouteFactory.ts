import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { IProspect } from '../../models/Prospect';
import { IContact } from '../../models/Contact';
import { IOpportunity } from '../../models/Opportunity';
import { INylasConnection } from '../../models/NylasConnection';
import { createNylasConnection } from './Factory';

const uniqueSuffix = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  accessToken: string;
  email: string;
}

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

const assertSuccess = <T>(
  response: request.Response,
  allowedStatuses: number[] = [200, 201]
): ApiResponse<T> => {
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(
      `Request failed with status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
  if (!response.body?.success) {
    throw new Error(`Request failed: ${JSON.stringify(response.body)}`);
  }
  return response.body as ApiResponse<T>;
};

export async function registerUser(options: {
  name?: string;
  email?: string;
  password?: string;
} = {}): Promise<AuthenticatedUser> {
  const unique = uniqueSuffix();
  const name = options.name ?? 'Test User';
  const email = options.email ?? `user-${unique}@org-${unique}.test`;
  const password = options.password ?? 'Password123!';

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name, email, password });

    if (response.body?.accessToken && response.body?.user?.organization) {
      return {
        userId: response.body.user.id,
        organizationId: response.body.user.organization,
        accessToken: response.body.accessToken,
        email,
      };
    }

    const shouldRetry = response.status >= 500 && attempt < maxAttempts;
    if (!shouldRetry) {
      throw new Error(`Registration failed: ${JSON.stringify(response.body)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 250 * attempt));
  }

  throw new Error('Registration failed after retries');
}

export async function createProspectViaRoute(
  auth: AuthenticatedUser,
  data: Partial<{ name: string; domains: string[] }> = {}
): Promise<IProspect> {
  const response = await request(app)
    .post('/api/prospects')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      name: data.name ?? `Prospect ${uniqueSuffix()}`,
      domains: data.domains ?? ['example.com'],
    });

  return assertSuccess<IProspect>(response).data;
}

export async function createContactViaRoute(
  auth: AuthenticatedUser,
  prospectId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    emails: Array<{ address: string; category: 'work' | 'personal' | 'other'; isPrimary: boolean }>;
    isPrimary: boolean;
  }> = {}
): Promise<IContact> {
  const response = await request(app)
    .post('/api/contacts')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      prospectId,
      firstName: data.firstName ?? 'Pat',
      lastName: data.lastName ?? 'Prospect',
      emails: data.emails ?? [
        { address: `pat-${uniqueSuffix()}@example.com`, category: 'work', isPrimary: true },
      ],
      isPrimary: data.isPrimary ?? true,
    });

  return assertSuccess<IContact>(response).data;
}

export async function createOpportunityViaRoute(
  auth: AuthenticatedUser,
  prospectId: string,
  data: Partial<{ name: string; amount: number }> = {}
): Promise<IOpportunity> {
  const response = await request(app)
    .post('/api/opportunities')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      name: data.name ?? `Opportunity ${uniqueSuffix()}`,
      amount: data.amount ?? 25000,
      prospect: prospectId,
    });

  return assertSuccess<IOpportunity>(response).data;
}

export async function createPipelineViaRoute(
  auth: AuthenticatedUser,
  data: Partial<{ name: string; isDefault: boolean }> = {}
): Promise<{ _id: string }> {
  const response = await request(app)
    .post('/api/pipelines')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      name: data.name ?? `Pipeline ${uniqueSuffix()}`,
      isDefault: data.isDefault ?? false,
    });

  return assertSuccess<{ _id: string }>(response).data;
}

export async function createPipelineStageViaRoute(
  auth: AuthenticatedUser,
  pipelineId: string,
  data: Partial<{ name: string; order: number }> = {}
): Promise<{ _id: string }> {
  const response = await request(app)
    .post(`/api/pipelines/${pipelineId}/stages`)
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      name: data.name ?? 'Qualification',
      order: data.order ?? 1,
    });

  return assertSuccess<{ _id: string }>(response).data;
}

export async function createNylasConnectionForUser(
  auth: AuthenticatedUser,
  overrides: { grantId: string; email: string }
): Promise<INylasConnection> {
  return createNylasConnection(
    new mongoose.Types.ObjectId(auth.organizationId),
    new mongoose.Types.ObjectId(auth.userId),
    {
      grantId: overrides.grantId,
      email: overrides.email,
    }
  );
}
