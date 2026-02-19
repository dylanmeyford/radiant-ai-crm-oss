import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import CalendarActivity from '../../../../../models/CalendarActivity';
import { ActivityType } from '../../../../../models/Activity';
import NylasConnection from '../../../../../models/NylasConnection';
import {
  nylasCreateEvent,
  nylasUpdateEvent,
  nylasCancelEvent
} from '../../../../NylasService';

type MeetingActionDetails = {
  mode?: 'create' | 'update' | 'cancel';
  existingCalendarActivityId?: string;
  connectionId?: string;
  calendarId?: string;
  title?: string;
  attendees?: string[];
  duration?: number;
  scheduledFor?: string;
  agenda?: string | null;
  location?: string;
};

const getCalendarId = (connection: any): string => {
  return (
    connection?.metadata?.calendarId ||
    (Array.isArray(connection?.calendars) && connection.calendars.length > 0 ? connection.calendars[0] : undefined) ||
    'primary'
  );
};

const extractNylasEventId = (eventResponse: any): string | undefined => {
  return eventResponse?.data?.id || eventResponse?.id || eventResponse?.data?.data?.id;
};

const mapAttendees = (attendees: string[]) =>
  attendees.map((email) => ({
    email,
    name: '',
    responseStatus: 'needsAction' as const
  }));

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing meeting action via handler...`));

  const details = action.details as MeetingActionDetails;
  const mode = details.mode || 'create';

  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  // Find the Nylas connection - prefer the one specified in details.connectionId, or find any active one
  let nylasConnection;

  if (details.connectionId) {
    console.log(chalk.cyan(`    -> Using specified connection: ${details.connectionId}`));
    nylasConnection = await NylasConnection.findOne({
      _id: details.connectionId,
      user: executingUserId,
      syncStatus: 'active'
    }).session(session);

    if (!nylasConnection) {
      throw new Error(`Specified Nylas connection ${details.connectionId} not found or not active for user ${executingUserId}`);
    }
  } else {
    console.log(chalk.yellow(`    -> No connection specified, finding any active connection for user`));
    nylasConnection = await NylasConnection.findOne({
      user: executingUserId,
      syncStatus: 'active'
    }).session(session);

    if (!nylasConnection) {
      throw new Error(`No active Nylas connection found for user ${executingUserId}`);
    }
  }

  // Prefer user-specified calendarId, fall back to connection metadata / 'primary'
  const calendarId = details.calendarId || getCalendarId(nylasConnection);
  if (details.calendarId) {
    console.log(chalk.cyan(`    -> Using specified calendar: ${details.calendarId}`));
  }

  if (mode === 'cancel') {
    if (!details.existingCalendarActivityId) {
      throw new Error('existingCalendarActivityId is required for cancel mode');
    }

    const existingActivity = await CalendarActivity.findById(details.existingCalendarActivityId).session(session);
    if (!existingActivity) {
      throw new Error(`CalendarActivity ${details.existingCalendarActivityId} not found`);
    }
    if (!existingActivity.nylasEventId && !existingActivity.eventId) {
      throw new Error(`CalendarActivity ${details.existingCalendarActivityId} has no event ID to cancel`);
    }

    const cancelResult = await nylasCancelEvent(
      nylasConnection.grantId,
      existingActivity.nylasCalendarId || existingActivity.calendarId || calendarId,
      existingActivity.nylasEventId || existingActivity.eventId,
      true
    );
    if (!cancelResult.success) {
      throw new Error(`Failed to cancel meeting: ${cancelResult.message || cancelResult.error}`);
    }

    existingActivity.status = 'cancelled';
    await existingActivity.save({ session });

    console.log(chalk.green(`    -> Meeting cancelled via handler`));
    return {
      type: 'meeting_cancelled',
      activityId: existingActivity._id,
      activityModel: 'CalendarActivity'
    };
  }

  if (mode === 'update') {
    if (!details.existingCalendarActivityId) {
      throw new Error('existingCalendarActivityId is required for update mode');
    }
    if (!details.scheduledFor || !details.duration || !details.title || !details.attendees?.length) {
      throw new Error('title, attendees, duration, and scheduledFor are required for update mode');
    }

    const existingActivity = await CalendarActivity.findById(details.existingCalendarActivityId).session(session);
    if (!existingActivity) {
      throw new Error(`CalendarActivity ${details.existingCalendarActivityId} not found`);
    }
    if (!existingActivity.nylasEventId && !existingActivity.eventId) {
      throw new Error(`CalendarActivity ${details.existingCalendarActivityId} has no event ID to update`);
    }

    const scheduledTime = new Date(details.scheduledFor);
    const endTime = new Date(scheduledTime.getTime() + details.duration * 60 * 1000);
    const updateResult = await nylasUpdateEvent(
      nylasConnection.grantId,
      existingActivity.nylasCalendarId || existingActivity.calendarId || calendarId,
      existingActivity.nylasEventId || existingActivity.eventId,
      {
        title: details.title,
        description: details.agenda || undefined,
        location: details.location,
        startTime: Math.floor(scheduledTime.getTime() / 1000),
        endTime: Math.floor(endTime.getTime() / 1000),
        attendees: details.attendees.map((email) => ({ email })),
        notifyParticipants: true
      }
    );
    if (!updateResult.success) {
      throw new Error(`Failed to update meeting: ${updateResult.message || updateResult.error}`);
    }

    existingActivity.title = details.title;
    existingActivity.description = details.agenda || '';
    existingActivity.startTime = scheduledTime;
    existingActivity.endTime = endTime;
    existingActivity.date = scheduledTime;
    existingActivity.status = 'scheduled';
    existingActivity.attendees = mapAttendees(details.attendees);
    if (details.location) {
      existingActivity.location = details.location;
    }
    await existingActivity.save({ session });

    console.log(chalk.green(`    -> Meeting updated for ${scheduledTime.toISOString()} via handler`));
    return {
      type: 'meeting_updated',
      activityId: existingActivity._id,
      activityModel: 'CalendarActivity'
    };
  }

  if (!details.scheduledFor || !details.duration || !details.title || !details.attendees?.length) {
    throw new Error('title, attendees, duration, and scheduledFor are required for create mode');
  }

  const scheduledTime = new Date(details.scheduledFor);
  const endTime = new Date(scheduledTime.getTime() + details.duration * 60 * 1000);
  const createResult = await nylasCreateEvent(
    nylasConnection.grantId,
    calendarId,
    {
      title: details.title,
      description: details.agenda || undefined,
      location: details.location,
      startTime: Math.floor(scheduledTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
      attendees: details.attendees.map((email) => ({ email })),
      notifyParticipants: true
    }
  );
  if (!createResult.success) {
    throw new Error(`Failed to create meeting: ${createResult.message || createResult.error}`);
  }
  const nylasEventId = extractNylasEventId(createResult.data);

  const meetingActivity = new CalendarActivity({
    type: ActivityType.CALENDAR,
    calendarId,
    eventId: nylasEventId || `action-${action._id}-${Date.now()}`,
    title: details.title,
    description: details.agenda || '',
    status: 'scheduled',
    startTime: scheduledTime,
    endTime: endTime,
    date: scheduledTime,
    timezone: 'UTC',
    location: details.location,
    attendees: mapAttendees(details.attendees),
    contacts: opportunity.contacts,
    prospect: opportunity.prospect,
    organization: opportunity.organization,
    createdBy: executingUserId,
    nylasGrantId: nylasConnection.grantId,
    nylasCalendarId: calendarId,
    nylasEventId,
    metadata: {
      sourceAction: action._id,
      sourceActionType: action.type
    }
  });

  await meetingActivity.save({ session });

  console.log(chalk.green(`    -> Meeting scheduled for ${scheduledTime.toISOString()} via handler`));
  return {
    type: 'meeting_created',
    activityId: meetingActivity._id,
    activityModel: 'CalendarActivity',
    scheduledFor: scheduledTime
  };
}

