import request from 'supertest';

jest.mock('../../services/contactResearchService', () => ({
  executeContactResearch: jest.fn().mockResolvedValue(undefined),
  researchContact: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/opportunityResearchService', () => ({
  scheduleOpportunityResearch: jest.fn(),
  researchOpportunityProspect: jest.fn().mockResolvedValue(undefined),
}));

import { app } from '../../app';
import {
  registerUser,
  createProspectViaRoute,
  createOpportunityViaRoute,
  createContactViaRoute,
  createNylasConnectionForUser,
  AuthenticatedUser,
} from '../helpers/RouteFactory';

jest.setTimeout(120000);

const NYLAS_GRANT_ID = process.env.NYLAS_GRANT_ID;
const NYLAS_USER_EMAIL = process.env.NYLAS_USER_EMAIL ?? 'test-user@example.com';

if (!NYLAS_GRANT_ID) {
  throw new Error('NYLAS_GRANT_ID must be set in test.env');
}

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  description?: string;
};

type ProspectResponse = {
  success: boolean;
  data: {
    _id: string;
    contacts?: Array<{
      _id: string;
      emails?: Array<{ address: string }>;
    }>;
  };
};

const isSophiieEmail = (email: string) => email.toLowerCase().endsWith('@sophiie.ai');

async function waitForContacts(
  auth: AuthenticatedUser,
  prospectId: string,
  { timeoutMs = 60000, intervalMs = 2000, description = 'contacts to populate' }: WaitOptions = {}
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await request(app)
      .get(`/api/prospects/${prospectId}`)
      .set('Authorization', `Bearer ${auth.accessToken}`);

    if (response.status === 200 && response.body?.data?.contacts?.length) {
      return response.body.data.contacts;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForOpportunityContacts(
  auth: AuthenticatedUser,
  opportunityId: string,
  { timeoutMs = 60000, intervalMs = 2000, description = 'opportunity contacts to populate' }: WaitOptions = {}
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await request(app)
      .get(`/api/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${auth.accessToken}`);

    if (response.status === 200 && response.body?.data?.contacts?.length) {
      return response.body.data.contacts;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

describe('Opportunity Creation with real Nylas integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('auto-populates contacts for sophiie.ai domain', async () => {
    const auth = await registerUser();
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL,
    });

    const prospect = await createProspectViaRoute(auth, {
      name: 'Sophiie Prospect',
      domains: ['sophiie.ai'],
    });

    const contacts = await waitForContacts(auth, prospect._id.toString());
    expect(contacts.length).toBeGreaterThan(0);

    const matchingContacts = contacts.filter(contact =>
      contact.emails?.some(email => isSophiieEmail(email.address))
    );
    expect(matchingContacts.length).toBeGreaterThan(0);
    expect(matchingContacts.length).toBe(contacts.length);
  });

  test('opportunity includes auto-populated contacts', async () => {
    const auth = await registerUser();
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL,
    });

    const prospect = await createProspectViaRoute(auth, {
      name: 'Sophiie Opportunity Prospect',
      domains: ['sophiie.ai'],
    });

    const contacts = await waitForContacts(auth, prospect._id.toString());
    const contactIds = contacts.map(contact => contact._id.toString());

    const opportunity = await createOpportunityViaRoute(auth, prospect._id.toString(), {
      name: 'Sophiie Opportunity',
      amount: 50000,
    });

    const opportunityContactIds = (opportunity.contacts || []).map((contact: any) =>
      contact._id?.toString?.() ?? contact.toString()
    );

    expect(opportunityContactIds.length).toBeGreaterThan(0);
    contactIds.forEach(contactId => {
      expect(opportunityContactIds).toContain(contactId);
    });
  });

  test('auto-populated contacts attach to existing opportunity', async () => {
    const auth = await registerUser();
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL,
    });

    const prospect = await createProspectViaRoute(auth, {
      name: 'Sophiie Race Condition Prospect',
      domains: ['sophiie.ai'],
    });

    const opportunity = await createOpportunityViaRoute(auth, prospect._id.toString(), {
      name: 'Sophiie Early Opportunity',
      amount: 75000,
    });

    const contacts = await waitForContacts(auth, prospect._id.toString());
    const contactIds = contacts.map(contact => contact._id.toString());

    const opportunityContacts = await waitForOpportunityContacts(auth, opportunity._id.toString(), {
      description: 'auto-populated contacts to link to opportunity',
    });

    const opportunityContactIds = opportunityContacts.map((contact: any) =>
      contact._id?.toString?.() ?? contact.toString()
    );

    expect(opportunityContactIds.length).toBeGreaterThan(0);
    contactIds.forEach(contactId => {
      expect(opportunityContactIds).toContain(contactId);
    });
  });

  test('only contacts from valid domains are created', async () => {
    const auth = await registerUser();
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL,
    });

    const prospect = await createProspectViaRoute(auth, {
      name: 'Mixed Domain Prospect',
      domains: ['sophiie.ai', 'nonexistent.test'],
    });

    const contacts = await waitForContacts(auth, prospect._id.toString(), {
      description: 'contacts for valid domains to populate',
    });

    expect(contacts.length).toBeGreaterThan(0);

    const hasInvalidDomain = contacts.some(contact =>
      contact.emails?.some(email => email.address.toLowerCase().endsWith('@nonexistent.test'))
    );

    expect(hasInvalidDomain).toBe(false);
  });

  test('duplicate Nylas contact creation is handled', async () => {
    const auth = await registerUser();
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL,
    });

    const prospect = await createProspectViaRoute(auth, {
      name: 'Sophiie Duplicate Contact Prospect',
      domains: ['sophiie.ai'],
    });

    await createContactViaRoute(auth, prospect._id.toString(), {
      firstName: 'Luke',
      lastName: 'Kelleher',
      emails: [{ address: 'luke@sophiie.ai', category: 'work', isPrimary: true }],
    });

    const contacts = await waitForContacts(auth, prospect._id.toString(), {
      description: 'contacts to include pre-created nylas email',
    });

    const duplicateMatches = contacts.filter(contact =>
      contact.emails?.some(email => email.address.toLowerCase() === 'luke@sophiie.ai')
    );

    expect(duplicateMatches.length).toBe(1);
  });
});
