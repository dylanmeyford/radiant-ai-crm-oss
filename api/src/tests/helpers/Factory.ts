import mongoose from 'mongoose';
import Organization, { IOrganization } from '../../models/Organization';
import User, { IUser } from '../../models/User';
import Prospect, { IProspect } from '../../models/Prospect';
import Contact, { IContact } from '../../models/Contact';
import Opportunity, { IOpportunity } from '../../models/Opportunity';
import Pipeline, { IPipeline } from '../../models/Pipeline';
import PipelineStage, { IPipelineStage } from '../../models/PipelineStage';
import NylasConnection, { INylasConnection } from '../../models/NylasConnection';
import EmailActivity, { IEmailActivity } from '../../models/EmailActivity';
import { ProposedAction, IProposedAction } from '../../models/ProposedAction';
import { ActivityType } from '../../models/Activity';

const uniqueSuffix = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

const toIsoSeconds = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function createOrganization(
  overrides: Partial<IOrganization> = {}
): Promise<IOrganization> {
  const organization = new Organization({
    name: overrides.name || `Test Org ${uniqueSuffix()}`,
    paymentMethodAdded: false,
    ...overrides,
  });
  await organization.save();
  return organization;
}

export async function createUser(
  organizationId: mongoose.Types.ObjectId,
  overrides: Partial<IUser> = {}
): Promise<IUser> {
  const unique = uniqueSuffix();
  const user = new User({
    email: overrides.email || `user-${unique}@acme.test`,
    password: overrides.password || 'Password123!',
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    role: overrides.role || 'admin',
    organization: organizationId,
    sessions: [],
    ...overrides,
  });
  await user.save();
  return user;
}

export async function createPipeline(
  organizationId: mongoose.Types.ObjectId,
  overrides: Partial<IPipeline> = {}
): Promise<IPipeline> {
  const pipeline = new Pipeline({
    name: overrides.name || `Default Pipeline ${uniqueSuffix()}`,
    organization: organizationId,
    isDefault: overrides.isDefault ?? true,
    ...overrides,
  });
  await pipeline.save();
  return pipeline;
}

export async function createPipelineStage(
  organizationId: mongoose.Types.ObjectId,
  pipelineId: mongoose.Types.ObjectId,
  overrides: Partial<IPipelineStage> = {}
): Promise<IPipelineStage> {
  const stage = new PipelineStage({
    name: overrides.name || 'Qualification',
    order: overrides.order ?? 1,
    organization: organizationId,
    pipeline: pipelineId,
    description: overrides.description || '',
    isClosedLost: overrides.isClosedLost ?? false,
    isClosedWon: overrides.isClosedWon ?? false,
    ...overrides,
  });
  await stage.save();
  return stage;
}

export async function createProspect(
  organizationId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  overrides: Partial<IProspect> = {}
): Promise<IProspect> {
  const prospect = new Prospect({
    name: overrides.name || `Prospect ${uniqueSuffix()}`,
    organization: organizationId,
    owner: ownerId,
    domains: overrides.domains || ['example.com'],
    status: overrides.status || 'lead',
    contacts: overrides.contacts || [],
    activities: overrides.activities || [],
    opportunities: overrides.opportunities || [],
    ...overrides,
  });
  await prospect.save();
  return prospect;
}

export async function createContact(
  organizationId: mongoose.Types.ObjectId,
  prospectId: mongoose.Types.ObjectId,
  overrides: Partial<IContact> = {}
): Promise<IContact> {
  const unique = uniqueSuffix();
  const contact = new Contact({
    firstName: overrides.firstName || 'Pat',
    lastName: overrides.lastName || 'Prospect',
    emails: overrides.emails || [
      { address: `pat-${unique}@example.com`, category: 'work', isPrimary: true },
    ],
    prospect: prospectId,
    organization: organizationId,
    isPrimary: overrides.isPrimary ?? true,
    activities: overrides.activities || [],
    emailActivities: overrides.emailActivities || [],
    opportunities: overrides.opportunities || [],
    calendarActivities: overrides.calendarActivities || [],
    origin: overrides.origin || 'manual',
    domainExcluded: overrides.domainExcluded ?? false,
    ...overrides,
  });
  await contact.save();
  return contact;
}

export async function createOpportunity(
  organizationId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  prospectId: mongoose.Types.ObjectId,
  contactIds: mongoose.Types.ObjectId[],
  overrides: Partial<IOpportunity> = {}
): Promise<IOpportunity> {
  const pipeline = overrides.pipeline
    ? await Pipeline.findById(overrides.pipeline)
    : await createPipeline(organizationId);
  const stage = overrides.stage
    ? await PipelineStage.findById(overrides.stage)
    : await createPipelineStage(organizationId, pipeline!._id);

  const opportunity = new Opportunity({
    name: overrides.name || `Opportunity ${uniqueSuffix()}`,
    amount: overrides.amount ?? 25000,
    probability: overrides.probability ?? 25,
    stage: stage!._id,
    pipeline: pipeline!._id,
    prospect: prospectId,
    contacts: contactIds,
    organization: organizationId,
    owner: ownerId,
    createdBy: ownerId,
    lastIntelligenceUpdateTimestamp: overrides.lastIntelligenceUpdateTimestamp ?? new Date(),
    ...overrides,
  });
  await opportunity.save();
  return opportunity;
}

export async function createNylasConnection(
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  overrides: Partial<INylasConnection> = {}
): Promise<INylasConnection> {
  const unique = uniqueSuffix();
  const connection = new NylasConnection({
    user: userId,
    organization: organizationId,
    email: overrides.email || `user-${unique}@acme.test`,
    provider: overrides.provider || 'google',
    grantId: overrides.grantId || `grant-${unique}`,
    syncStatus: overrides.syncStatus || 'active',
    calendars: overrides.calendars || [],
    ...overrides,
  });
  await connection.save();
  return connection;
}

export async function createEmailActivity(
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  prospectId: mongoose.Types.ObjectId,
  contactIds: mongoose.Types.ObjectId[],
  overrides: Partial<IEmailActivity> = {}
): Promise<IEmailActivity> {
  const unique = uniqueSuffix();
  const emailActivity = new EmailActivity({
    type: ActivityType.EMAIL,
    messageId: overrides.messageId || `message-${unique}`,
    threadId: overrides.threadId || `thread-${unique}`,
    from: overrides.from || [{ email: `pat-${unique}@example.com`, name: 'Pat Prospect' }],
    to: overrides.to || [{ email: 'user@acme.test', name: 'Test User' }],
    subject: overrides.subject || 'Test email',
    body: overrides.body || 'Test email body',
    date: overrides.date || new Date(),
    status: overrides.status || 'completed',
    isDraft: overrides.isDraft ?? false,
    isSent: overrides.isSent ?? false,
    isRead: overrides.isRead ?? false,
    nylasGrantId: overrides.nylasGrantId || `grant-${unique}`,
    nylasMessageId: overrides.nylasMessageId || `nylas-message-${unique}`,
    nylasThreadId: overrides.nylasThreadId || `nylas-thread-${unique}`,
    title: overrides.title || 'Test email',
    contacts: contactIds,
    prospect: prospectId,
    organization: organizationId,
    createdBy: userId,
    ...overrides,
  });
  await emailActivity.save();
  return emailActivity;
}

export async function createProposedAction(
  organizationId: mongoose.Types.ObjectId,
  opportunityId: mongoose.Types.ObjectId,
  sourceActivityIds: Array<{ activityId: mongoose.Types.ObjectId; activityModel: 'EmailActivity' | 'CalendarActivity' | 'Activity' }>,
  overrides: Partial<IProposedAction> = {}
): Promise<IProposedAction> {
  const scheduledFor = toIsoSeconds(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const proposedAction = new ProposedAction({
    organization: organizationId,
    opportunity: opportunityId,
    sourceActivities: sourceActivityIds,
    type: overrides.type || 'EMAIL',
    status: overrides.status || 'PROPOSED',
    details: overrides.details || {
      to: ['pat-prospect@example.com'],
      subject: 'Following up',
      body: 'Checking in.',
      scheduledFor,
    },
    reasoning: overrides.reasoning || 'Test action reasoning.',
    createdBy: overrides.createdBy || { type: 'AI_AGENT' },
    resultingActivities: overrides.resultingActivities || [],
    ...overrides,
  });
  await proposedAction.save();
  return proposedAction;
}

export async function createScheduledEmailActivity(
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  prospectId: mongoose.Types.ObjectId,
  contactIds: mongoose.Types.ObjectId[],
  actionId: mongoose.Types.ObjectId,
  overrides: Partial<IEmailActivity> = {}
): Promise<IEmailActivity> {
  const scheduledDate = overrides.scheduledDate || new Date(Date.now() + 2 * 60 * 60 * 1000);
  const emailActivity = new EmailActivity({
    type: ActivityType.EMAIL,
    messageId: overrides.messageId || `scheduled-${actionId}-${uniqueSuffix()}`,
    threadId: overrides.threadId || `thread-${actionId}`,
    from: overrides.from || [{ email: 'user@acme.test', name: 'Test User' }],
    to: overrides.to || [{ email: 'pat-prospect@example.com', name: 'Pat Prospect' }],
    subject: overrides.subject || 'Scheduled follow-up',
    body: overrides.body || 'Following up as scheduled.',
    date: overrides.date || scheduledDate,
    scheduledDate,
    status: overrides.status || 'scheduled',
    isDraft: overrides.isDraft ?? false,
    isSent: overrides.isSent ?? false,
    isRead: overrides.isRead ?? false,
    nylasGrantId: overrides.nylasGrantId || `grant-${uniqueSuffix()}`,
    nylasMessageId: overrides.nylasMessageId || `nylas-message-${uniqueSuffix()}`,
    nylasThreadId: overrides.nylasThreadId || `nylas-thread-${uniqueSuffix()}`,
    title: overrides.title || 'Scheduled follow-up',
    contacts: contactIds,
    prospect: prospectId,
    organization: organizationId,
    createdBy: userId,
    metadata: {
      sourceAction: actionId,
      sourceActionType: 'EMAIL',
      ...(overrides.metadata || {}),
    },
    ...overrides,
  });
  await emailActivity.save();
  return emailActivity;
}
