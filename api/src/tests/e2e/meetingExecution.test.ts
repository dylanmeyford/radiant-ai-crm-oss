import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import {
  registerUser,
  createProspectViaRoute,
  createContactViaRoute,
  createOpportunityViaRoute,
  createNylasConnectionForUser
} from '../helpers/RouteFactory';
import { createProposedAction } from '../helpers/Factory';
import CalendarActivity from '../../models/CalendarActivity';
import ActivityProcessingQueue from '../../models/ActivityProcessingQueue';
import { ProposedAction } from '../../models/ProposedAction';
import { rateLimitedNylas } from '../../services/NylasService';

jest.setTimeout(180000);

const NYLAS_GRANT_ID = process.env.NYLAS_GRANT_ID;
const NYLAS_USER_EMAIL = process.env.NYLAS_USER_EMAIL ?? 'test-user@example.com';
const TEST_ATTENDEE_EMAIL = process.env.TEST_ATTENDEE_EMAIL ?? 'meeting-attendee@example.com';

if (!NYLAS_GRANT_ID) {
  throw new Error('NYLAS_GRANT_ID must be set in test.env');
}

const toIsoSeconds = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

type TrackedEvent = {
  grantId: string;
  calendarId: string;
  eventId: string;
};

async function waitForInitialOpportunityReprocessing(opportunityId: string, timeoutMs = 5000, intervalMs = 100) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const queueItem = await ActivityProcessingQueue.findOne({
      opportunity: new mongoose.Types.ObjectId(opportunityId),
      queueItemType: 'opportunity_reprocessing'
    }).select('_id');

    if (queueItem) {
      // Give the async cancellation call a moment to complete before creating actions.
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

async function createScenario(includeNylasConnection: boolean = true) {
  const auth = await registerUser();

  if (includeNylasConnection) {
    await createNylasConnectionForUser(auth, {
      grantId: NYLAS_GRANT_ID!,
      email: NYLAS_USER_EMAIL
    });
  }

  const prospect = await createProspectViaRoute(auth, {
    name: `Meeting Prospect ${Date.now()}`,
    domains: ['thepreparedcompany.com']
  });

  const contact = await createContactViaRoute(auth, String(prospect._id), {
    firstName: 'Dylan',
    lastName: 'Attendee',
    emails: [{ address: TEST_ATTENDEE_EMAIL, category: 'work', isPrimary: true }]
  });

  const opportunity = await createOpportunityViaRoute(auth, String(prospect._id), {
    name: `Meeting Opportunity ${Date.now()}`,
    amount: 10000
  });

  await waitForInitialOpportunityReprocessing(String(opportunity._id));

  return { auth, prospect, contact, opportunity };
}

async function approveAction(authToken: string, actionId: string) {
  await request(app)
    .post(`/api/actions/${actionId}/approve`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ executeImmediately: false })
    .expect(200);
}

async function executeAction(authToken: string, actionId: string) {
  return request(app)
    .post(`/api/actions/${actionId}/execute`)
    .set('Authorization', `Bearer ${authToken}`)
    .send()
    .expect(200);
}

describe('MEETING action execution with real Nylas', () => {
  const trackedEvents: TrackedEvent[] = [];

  afterEach(async () => {
    for (const event of trackedEvents.splice(0, trackedEvents.length)) {
      try {
        await rateLimitedNylas.destroyEvent({
          identifier: event.grantId,
          eventId: event.eventId,
          queryParams: { calendarId: event.calendarId }
        });
      } catch {
        // Best-effort cleanup for sandbox resources.
      }
    }
  });

  test('creates a meeting event and links resulting CalendarActivity', async () => {
    const { auth, opportunity } = await createScenario(true);
    const scheduledFor = toIsoSeconds(new Date(Date.now() + 60 * 60 * 1000));

    const action = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'create',
          title: 'Test Meeting Create',
          attendees: [TEST_ATTENDEE_EMAIL],
          duration: 30,
          scheduledFor,
          agenda: 'Review next steps and confirm owners.'
        },
        reasoning: 'Create a meeting invite for the requested discussion.'
      }
    );

    await approveAction(auth.accessToken, String(action._id));
    const executeResponse = await executeAction(auth.accessToken, String(action._id));

    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data?.success).toBe(true);

    const updatedAction = await ProposedAction.findById(action._id);
    expect(updatedAction?.status).toBe('EXECUTED');
    expect(updatedAction?.resultingActivities?.length).toBeGreaterThan(0);
    expect(updatedAction?.resultingActivities?.[0]?.activityModel).toBe('CalendarActivity');

    const activity = await CalendarActivity.findOne({ 'metadata.sourceAction': action._id });
    expect(activity).toBeTruthy();
    expect(activity?.status).toBe('scheduled');
    expect(activity?.nylasEventId).toBeTruthy();
    expect(activity?.eventId.startsWith('action-')).toBe(false);

    trackedEvents.push({
      grantId: activity!.nylasGrantId,
      calendarId: activity!.nylasCalendarId || activity!.calendarId,
      eventId: activity!.nylasEventId || activity!.eventId
    });
  });

  test('updates an existing meeting event in Nylas and CalendarActivity', async () => {
    const { auth, opportunity } = await createScenario(true);
    const initialScheduledFor = toIsoSeconds(new Date(Date.now() + 90 * 60 * 1000));

    const createAction = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'create',
          title: 'Meeting To Update',
          attendees: [TEST_ATTENDEE_EMAIL],
          duration: 30,
          scheduledFor: initialScheduledFor,
          agenda: 'Initial agenda.'
        },
        reasoning: 'Create initial meeting before update.'
      }
    );

    await approveAction(auth.accessToken, String(createAction._id));
    await executeAction(auth.accessToken, String(createAction._id));

    const createdActivity = await CalendarActivity.findOne({ 'metadata.sourceAction': createAction._id });
    expect(createdActivity).toBeTruthy();

    const updatedScheduledFor = toIsoSeconds(new Date(Date.now() + 3 * 60 * 60 * 1000));
    const updateAction = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'update',
          existingCalendarActivityId: String(createdActivity!._id),
          title: 'Meeting Updated Title',
          attendees: [TEST_ATTENDEE_EMAIL],
          duration: 45,
          scheduledFor: updatedScheduledFor,
          agenda: 'Updated agenda.'
        },
        reasoning: 'Reschedule and update meeting details.'
      }
    );

    await approveAction(auth.accessToken, String(updateAction._id));
    const executeResponse = await executeAction(auth.accessToken, String(updateAction._id));

    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data?.success).toBe(true);

    const updatedActivity = await CalendarActivity.findById(createdActivity!._id);
    expect(updatedActivity?.title).toBe('Meeting Updated Title');
    expect(updatedActivity?.description).toBe('Updated agenda.');

    const fetchedEvent = await rateLimitedNylas.findEvent({
      identifier: updatedActivity!.nylasGrantId,
      eventId: updatedActivity!.nylasEventId || updatedActivity!.eventId,
      queryParams: { calendarId: updatedActivity!.nylasCalendarId || updatedActivity!.calendarId }
    });
    expect(fetchedEvent?.data?.id).toBeTruthy();

    trackedEvents.push({
      grantId: updatedActivity!.nylasGrantId,
      calendarId: updatedActivity!.nylasCalendarId || updatedActivity!.calendarId,
      eventId: updatedActivity!.nylasEventId || updatedActivity!.eventId
    });
  });

  test('cancels an existing meeting event in Nylas and marks CalendarActivity cancelled', async () => {
    const { auth, opportunity } = await createScenario(true);
    const scheduledFor = toIsoSeconds(new Date(Date.now() + 2 * 60 * 60 * 1000));

    const createAction = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'create',
          title: 'Meeting To Cancel',
          attendees: [TEST_ATTENDEE_EMAIL],
          duration: 30,
          scheduledFor,
          agenda: 'Agenda before cancellation.'
        },
        reasoning: 'Create meeting to validate cancel flow.'
      }
    );

    await approveAction(auth.accessToken, String(createAction._id));
    await executeAction(auth.accessToken, String(createAction._id));

    const createdActivity = await CalendarActivity.findOne({ 'metadata.sourceAction': createAction._id });
    expect(createdActivity).toBeTruthy();

    const cancelAction = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'cancel',
          existingCalendarActivityId: String(createdActivity!._id)
        },
        reasoning: 'Meeting is no longer required and should be cancelled.'
      }
    );

    await approveAction(auth.accessToken, String(cancelAction._id));
    const executeResponse = await executeAction(auth.accessToken, String(cancelAction._id));
    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data?.success).toBe(true);

    const cancelledActivity = await CalendarActivity.findById(createdActivity!._id);
    expect(cancelledActivity?.status).toBe('cancelled');

    const fetchedEvent = await rateLimitedNylas.findEvent({
      identifier: cancelledActivity!.nylasGrantId,
      eventId: cancelledActivity!.nylasEventId || cancelledActivity!.eventId,
      queryParams: { calendarId: cancelledActivity!.nylasCalendarId || cancelledActivity!.calendarId }
    });
    expect(fetchedEvent?.data?.status).toBe('cancelled');
  });

  test('fails execution when no active Nylas connection exists', async () => {
    const { auth, opportunity } = await createScenario(false);
    const scheduledFor = toIsoSeconds(new Date(Date.now() + 60 * 60 * 1000));

    const action = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'create',
          title: 'Create without Nylas connection',
          attendees: [TEST_ATTENDEE_EMAIL],
          duration: 30,
          scheduledFor,
          agenda: 'Should fail because no Nylas connection exists.'
        },
        reasoning: 'Test missing Nylas connection error.'
      }
    );

    await approveAction(auth.accessToken, String(action._id));
    const executeResponse = await executeAction(auth.accessToken, String(action._id));

    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data?.success).toBe(false);
    expect(executeResponse.body.data?.error).toContain('No active Nylas connection found');

    const updatedAction = await ProposedAction.findById(action._id);
    expect(updatedAction?.status).toBe('REJECTED');
  });

  test('fails cancel execution when existingCalendarActivityId does not exist', async () => {
    const { auth, opportunity } = await createScenario(true);
    const missingCalendarActivityId = new mongoose.Types.ObjectId().toString();

    const action = await createProposedAction(
      new mongoose.Types.ObjectId(auth.organizationId),
      new mongoose.Types.ObjectId(opportunity._id),
      [],
      {
        type: 'MEETING',
        status: 'PROPOSED',
        details: {
          mode: 'cancel',
          existingCalendarActivityId: missingCalendarActivityId
        },
        reasoning: 'Test invalid existingCalendarActivityId error.'
      }
    );

    await approveAction(auth.accessToken, String(action._id));
    const executeResponse = await executeAction(auth.accessToken, String(action._id));

    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data?.success).toBe(false);
    expect(executeResponse.body.data?.error).toContain('not found');

    const updatedAction = await ProposedAction.findById(action._id);
    expect(updatedAction?.status).toBe('REJECTED');
  });
});

