import request from 'supertest';
import mongoose from 'mongoose';

/**
 * AI Workflow Test File
 * 
 * This file is designed to test the AI WORKFLOWS of the application.
 * Specifically, we are testing that the following work:
 * 1. Next Best Action Agent
 * 2. ReEvaulate Actions
 * 3. Intelligence Processor
 * 4. Action Execution
 * 
 * We are NOT testing the following:
 * 1. Peripheral AI enrichment
 * 2. Evals
 * 3. Quality of intelligence outputs (this is the domain of our evals)
 * 
 * Our tests are designed to use the in-app routes to trigger the workflows, and as they run the pipeline end-to-end, consequently handle all person intelligence pipeline + action pipeline.
 * The outcome we are aiming for is certainty that in the real world, the workflows work as expected and will not fall apart.
 * 
 * We are also looking to make sure we are resistant to race conditions, resilient to api failures, and resilient to other edge cases.
 */

// Mock Nylas-related services to prevent real API calls during tests
// We are mocking these services for these aiWorkflow tests because these work flows are non-reliant on nylas.
// These mocks must be defined before importing app/models that have post-save hooks
jest.mock('../../services/NylasService', () => {
  const actual = jest.requireActual('../../services/NylasService');
  return {
    ...actual,
    fetchEmailsAndEventsForContact: jest.fn().mockResolvedValue(undefined),
    getEmailThreads: jest.fn().mockResolvedValue([]),
    getAllEmailThreads: jest.fn().mockResolvedValue([]),
  };
});

jest.mock('../../services/contactAutoPopulationService', () => ({
  searchAndPopulateContacts: jest.fn().mockResolvedValue({
    totalFound: 0,
    totalCreated: 0,
    totalErrors: 0,
  }),
}));

jest.mock('../../services/contactResearchService', () => ({
  executeContactResearch: jest.fn().mockResolvedValue(undefined),
  researchContact: jest.fn().mockResolvedValue(undefined),
}));

import { app } from '../../app';
import { QueueWorkerService } from '../../services/activityProcessingService/queueWorkerService';
import EmailActivity, { IEmailActivity } from '../../models/EmailActivity';
import { ProposedAction, IProposedAction } from '../../models/ProposedAction';
import Opportunity from '../../models/Opportunity';
import ActivityProcessingQueue from '../../models/ActivityProcessingQueue';
import {
  createNylasConnection,
  createProposedAction,
  createScheduledEmailActivity,
} from '../helpers/Factory';
import {
  registerUser,
  createProspectViaRoute,
  createContactViaRoute,
  createOpportunityViaRoute,
} from '../helpers/RouteFactory';

jest.setTimeout(240000); // 4 minutes

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  description?: string;
};

type EmailActivityDoc = mongoose.Document & IEmailActivity;
type ProposedActionDoc = mongoose.Document & IProposedAction;

async function waitFor<T>(
  check: () => Promise<T | null>,
  { timeoutMs = 60000, intervalMs = 2000, description = 'condition' }: WaitOptions = {}
): Promise<T> {
  const start = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error as Error;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  const reason = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${description}.${reason}`);
}

const asObjectId = (value: unknown): mongoose.Types.ObjectId => {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }
  return new mongoose.Types.ObjectId(value as mongoose.Types.ObjectId);
};

const asSchemaObjectId = (value: unknown): mongoose.Schema.Types.ObjectId => (
  asObjectId(value) as unknown as mongoose.Schema.Types.ObjectId
);

function buildWebhookPayload({
  grantId,
  messageId,
  threadId,
  fromEmail,
  toEmail,
  subject,
  body,
}: {
  grantId: string;
  messageId: string;
  threadId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
}) {
  return {
    type: 'message.created',
    data: {
      object: {
        id: messageId,
        grant_id: grantId,
        thread_id: threadId,
        nylasGrantId: grantId,
        nylasMessageId: messageId,
        nylasThreadId: threadId,
        from: [{ email: fromEmail, name: 'Pat Prospect' }],
        to: [{ email: toEmail, name: 'Test User' }],
        subject,
        title: subject,
        body,
        date: Math.floor(Date.now() / 1000),
        status: 'completed',
        is_draft: false,
        is_sent: false,
        unread: true,
      },
    },
  };
}

async function createBaseScenario() {
  const auth = await registerUser();
  const organizationId = asObjectId(auth.organizationId);
  const userId = asObjectId(auth.userId);
  const organization = { _id: organizationId };
  const user = { _id: userId, email: auth.email };
  const nylasConnection = await createNylasConnection(organizationId, userId, {
    email: auth.email,
  });
  const prospect = await createProspectViaRoute(auth, {
    domains: ['example.com'],
  });
  const prospectId = asObjectId(prospect._id);
  const contact = await createContactViaRoute(auth, prospectId.toString(), {
    emails: [{ address: 'pat-prospect@example.com', category: 'work', isPrimary: true }],
  });
  const opportunity = await createOpportunityViaRoute(auth, prospectId.toString(), {
    name: `Opportunity ${Date.now()}`,
  });

  return {
    organization,
    user,
    nylasConnection,
    prospect,
    contact,
    opportunity,
  };
}

describe('AI workflow (webhook → action pipeline)', () => {
  beforeAll(async () => {
    await QueueWorkerService.start();
  });

  afterAll(async () => {
    await QueueWorkerService.stop();
  });

  // Override global afterEach - clear queue items to prevent cross-test contamination
  // Queue items from failed/timed-out tests can interfere with subsequent test runs
  afterEach(async () => {
    await ActivityProcessingQueue.deleteMany({});
  });

  test('New email webhook generates new actions', async () => {
    const { user, nylasConnection, contact, opportunity, prospect } = await createBaseScenario();
    const messageId = `msg-${Date.now()}`;
    const threadId = `thread-${Date.now()}`;

    const payload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId,
      threadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Re: Next steps',
      body: 'Thanks for the info. Could you send a short summary of next steps?',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(payload)
      .expect(200);

    await waitFor(
      async () => EmailActivity.findOne({ messageId }),
      { description: 'email activity creation' }
    );

    const actions = await waitFor(
      async () => {
        const results = await ProposedAction.find({ opportunity: opportunity._id });
        return results.length > 0 ? results : null;
      },
      { description: 'proposed actions to be generated', timeoutMs: 180000 }
    );

    expect(actions.length).toBeGreaterThan(0);
    const action = actions[0];
    expect(action.opportunity.toString()).toEqual(opportunity._id.toString());
    expect(action.status).toBe('PROPOSED');
    expect(action.sourceActivities.length).toBeGreaterThan(0);
    expect(action.sourceActivities[0].activityModel).toBe('EmailActivity');
    expect(action.sourceActivities[0].activityId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(action.organization.toString()).toEqual(asObjectId(prospect.organization).toString());
  });

  test('Re-evaluation keeps existing action', async () => {
    const { user, nylasConnection, contact, opportunity } = await createBaseScenario();
    const organizationId = asObjectId(opportunity.organization);
    const prospectId = asObjectId(opportunity.prospect);
    const contactId = asObjectId(contact._id);
    const opportunityId = asObjectId(opportunity._id);
    const initialMessageId = `msg-${Date.now()}`;
    const initialThreadId = `thread-${Date.now()}`;
    const initialPayload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: initialMessageId,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Initial outreach',
      body: 'Initial email',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(initialPayload)
      .expect(200);

    const sourceEmail = await waitFor<EmailActivityDoc>(
      async () => EmailActivity.findOne({ messageId: initialMessageId }) as Promise<EmailActivityDoc | null>,
      { description: 'initial email activity creation' }
    );

    const existingAction = await createProposedAction(
      organizationId,
      opportunityId,
      [{ activityId: asObjectId(sourceEmail!._id), activityModel: 'EmailActivity' }],
      {
        details: {
          to: [contact.emails[0].address],
          subject: 'Following up',
          body: 'Checking in.',
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        },
      }
    );

    const payload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: `msg-${Date.now()}`,
      threadId: `thread-${Date.now()}`,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Re: Following up',
      body: 'Thanks for the note. I will review and get back to you.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(payload)
      .expect(200);

    const updatedAction = await waitFor<ProposedActionDoc>(
      async () => ProposedAction.findById(existingAction._id) as Promise<ProposedActionDoc | null>,
      { description: 'existing action re-evaluation', timeoutMs: 90000 }
    );
    expect(updatedAction).not.toBeNull();

    const actions = await ProposedAction.find({ opportunity: opportunityId });
    expect(actions.length).toBe(1);
    expect(updatedAction!.status).toBe('PROPOSED');
  });

  test('Re-evaluation cancels action and cleans up scheduled email', async () => {
    const { user, nylasConnection, contact, opportunity } = await createBaseScenario();
    const organizationId = asObjectId(opportunity.organization);
    const userId = asObjectId(user._id);
    const prospectId = asObjectId(opportunity.prospect);
    const contactId = asObjectId(contact._id);
    const opportunityId = asObjectId(opportunity._id);

    // Create initial email activity to prevent NextBestActionAgent retry loops during batch processing
    const initialMessageId = `msg-${Date.now()}`;
    const initialThreadId = `thread-${Date.now()}`;
    const initialPayload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: initialMessageId,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Initial inquiry',
      body: 'Initial email to start the conversation.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(initialPayload)
      .expect(200);

    const sourceEmail = await waitFor<EmailActivityDoc>(
      async () => EmailActivity.findOne({ messageId: initialMessageId }) as Promise<EmailActivityDoc | null>,
      { description: 'initial email activity creation' }
    );

    // Wait for initial batch processing from opportunity creation to complete
    // This ensures we don't trigger batch restart when we send the cancellation webhook
    await waitFor(
      async () => {
        const opp = await Opportunity.findById(opportunityId).select('processingStatus');
        return opp?.processingStatus?.status === 'completed' ? opp : null;
      },
      { description: 'initial batch processing completion', timeoutMs: 180000 }
    );

    // Create a proposed action that's already been executed with a scheduled email
    const action = await createProposedAction(
      organizationId,
      opportunityId,
      [], // No source activities needed for this test
      {
        status: 'EXECUTED',
        details: {
          to: [contact.emails[0].address],
          subject: 'Scheduled follow-up',
          body: 'Following up as scheduled.',
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        },
      }
    );

    const scheduledEmail = await createScheduledEmailActivity(
      organizationId,
      userId,
      prospectId,
      [contactId],
      asObjectId(action._id),
      { status: 'scheduled', isSent: false }
    );

    expect(scheduledEmail.metadata?.sourceAction?.toString()).toEqual(asObjectId(action._id).toString());

    action.resultingActivities = [{ activityId: asSchemaObjectId(scheduledEmail._id), activityModel: 'EmailActivity' }];
    await action.save();

    await waitFor(
      async () => {
        const persisted = await ProposedAction.findById(action._id);
        return persisted?.resultingActivities?.length ? persisted : null;
      },
      { description: 'persist scheduled email linkage', timeoutMs: 60000 }
    );

    // Small delay to ensure action is fully visible outside transaction boundaries
    await new Promise(resolve => setTimeout(resolve, 500));

    const payload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: `msg-${Date.now()}`,
      threadId: `thread-${Date.now()}`,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Update on vendor selection',
      body: 'We selected another vendor and this is closed-lost. Please cancel all scheduled follow-ups and do not contact us again.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(payload)
      .expect(200);

    const cancelledAction = await waitFor(
      async () => {
        const updated = await ProposedAction.findById(action._id);
        return updated?.status === 'CANCELLED' ? updated : null;
      },
      { description: 'action cancellation', timeoutMs: 480000 }
    );

    expect(cancelledAction.status).toBe('CANCELLED');

    await waitFor(
      async () => {
        const existing = await EmailActivity.findById(scheduledEmail._id);
        return existing ? null : scheduledEmail;
      },
      { description: 'scheduled email cleanup', timeoutMs: 240000 }
    );
  }, 600000); // 10 minutes - needs time for initial batch + activity processing + re-evaluation

  test('Re-evaluation resets scheduled email to proposed when modified', async () => {
    const { user, nylasConnection, contact, opportunity } = await createBaseScenario();
    const organizationId = asObjectId(opportunity.organization);
    const userId = asObjectId(user._id);
    const prospectId = asObjectId(opportunity.prospect);
    const contactId = asObjectId(contact._id);
    const opportunityId = asObjectId(opportunity._id);
    const initialThreadId = `thread-${Date.now()}`;

    // Create initial email activity to prevent NextBestActionAgent retry loops during batch processing
    const initialMessageId = `msg-${Date.now()}`;
    const initialPayload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: initialMessageId,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Initial inquiry',
      body: 'Initial email to start the conversation.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(initialPayload)
      .expect(200);

    const sourceEmail = await waitFor<EmailActivityDoc>(
      async () => EmailActivity.findOne({ messageId: initialMessageId }) as Promise<EmailActivityDoc | null>,
      { description: 'initial email activity creation' }
    );

    // Wait for initial batch processing from opportunity creation to complete
    // This ensures we don't trigger batch restart when we send the cancellation webhook
    await waitFor(
      async () => {
        const opp = await Opportunity.findById(opportunityId).select('processingStatus');
        return opp?.processingStatus?.status === 'completed' ? opp : null;
      },
      { description: 'initial batch processing completion', timeoutMs: 180000 }
    );

    // Create a proposed action that's already been executed with a scheduled email
    const action = await createProposedAction(
      organizationId,
      opportunityId,
      [], // No source activities needed for this test
      {
        status: 'EXECUTED',
        details: {
          to: [contact.emails[0].address],
          subject: 'Scheduled follow-up',
          body: 'Following up as scheduled.',
          threadId: initialThreadId,
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        },
      }
    );

    const scheduledEmail = await createScheduledEmailActivity(
      organizationId,
      userId,
      prospectId,
      [contactId],
      asObjectId(action._id),
      { status: 'scheduled', isSent: false, threadId: initialThreadId, nylasThreadId: initialThreadId }
    );

    expect(scheduledEmail.metadata?.sourceAction?.toString()).toEqual(asObjectId(action._id).toString());

    action.resultingActivities = [{ activityId: asSchemaObjectId(scheduledEmail._id), activityModel: 'EmailActivity' }];
    await action.save();

    await waitFor(
      async () => {
        const persisted = await ProposedAction.findById(action._id);
        return persisted?.resultingActivities?.length ? persisted : null;
      },
      { description: 'persist scheduled email linkage', timeoutMs: 60000 }
    );

    // Small delay to ensure action is fully visible outside transaction boundaries
    await new Promise(resolve => setTimeout(resolve, 500));

    const payload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: `msg-${Date.now()}`,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Re: Scheduled follow-up',
      body: 'Thanks for the note. Please reply in this thread with pricing details and next steps.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(payload)
      .expect(200);

    const modifiedAction = await waitFor(
      async () => {
        const updated = await ProposedAction.findById(action._id);
        if (!updated) {
          return null;
        }
        const resultingCount = updated.resultingActivities?.length ?? 0;
        return updated.status === 'PROPOSED' && resultingCount === 0 ? updated : null;
      },
      { description: 'action reset to proposed after modification', timeoutMs: 480000 }
    );

    expect(modifiedAction.status).toBe('PROPOSED');
    expect(modifiedAction.resultingActivities?.length ?? 0).toBe(0);

    await waitFor(
      async () => {
        const existing = await EmailActivity.findById(scheduledEmail._id);
        return existing ? null : scheduledEmail;
      },
      { description: 'scheduled email cleanup after modification', timeoutMs: 240000 }
    );
  }, 600000);

  test('Re-evaluation modifies action details', async () => {
    const { user, nylasConnection, contact, opportunity } = await createBaseScenario();
    const organizationId = asObjectId(opportunity.organization);
    const opportunityId = asObjectId(opportunity._id);
    const initialThreadId = `thread-${Date.now()}`;

    // Create initial email activity via webhook to prevent NextBestActionAgent retry loops during batch processing
    const initialMessageId = `msg-${Date.now()}`;
    const initialPayload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: initialMessageId,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Initial outreach',
      body: 'Initial email to start the conversation.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(initialPayload)
      .expect(200);

    await waitFor<EmailActivityDoc>(
      async () => EmailActivity.findOne({ messageId: initialMessageId }) as Promise<EmailActivityDoc | null>,
      { description: 'initial email activity creation' }
    );

    // Wait for initial batch processing from opportunity creation to complete
    await waitFor(
      async () => {
        const opp = await Opportunity.findById(opportunityId).select('processingStatus');
        return opp?.processingStatus?.status === 'completed' ? opp : null;
      },
      { description: 'initial batch processing completion', timeoutMs: 180000 }
    );

    // Create a proposed action that we expect to be modified
    const action = await createProposedAction(
      organizationId,
      opportunityId,
      [], // No source activities needed for this test
      {
        status: 'PROPOSED',
        details: {
          to: [contact.emails[0].address],
          subject: 'Original subject',
          body: 'Original body.',
          threadId: initialThreadId,
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        },
      }
    );

    // Small delay to ensure action is fully visible outside transaction boundaries
    await new Promise(resolve => setTimeout(resolve, 500));

    const payload = buildWebhookPayload({
      grantId: nylasConnection.grantId,
      messageId: `msg-${Date.now()}`,
      threadId: initialThreadId,
      fromEmail: contact.emails[0].address,
      toEmail: user.email,
      subject: 'Re: Original subject',
      body: 'Please update the subject to "Updated subject" and mention pricing details.',
    });

    await request(app)
      .post('/api/webhooks/nylas')
      .send(payload)
      .expect(200);

    const modifiedAction = await waitFor(
      async () => {
        const updated = await ProposedAction.findById(action._id);
        if (!updated) {
          return null;
        }
        const details = updated.details as { subject?: string; body?: string };
        const subjectChanged = details?.subject && details.subject !== 'Original subject';
        const bodyChanged = details?.body && details.body !== 'Original body.';
        return subjectChanged || bodyChanged ? updated : null;
      },
      { description: 'action modification', timeoutMs: 480000 }
    );

    expect(modifiedAction.status).not.toBe('CANCELLED');
    const modifiedDetails = modifiedAction.details as { subject?: string; body?: string };
    const subjectChanged = modifiedDetails?.subject !== 'Original subject';
    const bodyChanged = modifiedDetails?.body !== 'Original body.';
    expect(subjectChanged && bodyChanged).toBe(true);
  }, 600000);
});
