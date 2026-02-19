import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import User from '../../../../../models/User';
import NylasConnection from '../../../../../models/NylasConnection';
import { nylasSendMessage, NylasSendMessageResponse } from '../../../../NylasService';
import EmailActivity, { IEmailActivity } from '../../../../../models/EmailActivity';
import { ActivityType } from '../../../../../models/Activity';
import Opportunity from '../../../../../models/Opportunity';
import { recordSentPlaybooks } from '../../../../sentPlaybookService';
import { IntelligenceProcessor } from '../../../personIntelligence/intelligenceProcessor';

/**
 * Resolves the replyToMessageId by checking the database for the EmailActivity.
 * First checks for an EmailActivity with messageId matching replyToMessageId.
 * If not found, checks for an EmailActivity with _id matching replyToMessageId,
 * and returns that EmailActivity's messageId.
 */
async function resolveReplyToMessageId(
  replyToMessageId: string,
  session: mongoose.ClientSession
): Promise<string | undefined> {
  if (!replyToMessageId) {
    return undefined;
  }

  console.log(chalk.cyan(`    -> Resolving replyToMessageId: ${replyToMessageId}`));

  // First, try to find an EmailActivity with the messageId matching replyToMessageId
  let emailActivity = await EmailActivity.findOne({ messageId: replyToMessageId }).session(session);
  
  if (emailActivity) {
    console.log(chalk.green(`    -> Found EmailActivity with messageId: ${replyToMessageId}`));
    return emailActivity.messageId;
  }

  // If not found, try to find an EmailActivity with _id matching replyToMessageId
  try {
    emailActivity = await EmailActivity.findById(replyToMessageId).session(session);
    
    if (emailActivity) {
      console.log(chalk.yellow(`    -> Found EmailActivity with _id: ${replyToMessageId}, using messageId: ${emailActivity.messageId}`));
      return emailActivity.messageId;
    }
  } catch (error) {
    // If the replyToMessageId is not a valid ObjectId, findById will throw an error
    console.log(chalk.yellow(`    -> Invalid ObjectId format for replyToMessageId: ${replyToMessageId}`));
  }

  console.log(chalk.red(`    -> No EmailActivity found for replyToMessageId: ${replyToMessageId}`));
  return undefined;
}

async function createScheduledEmailActivity(
  action: IProposedAction,
  user: any,
  details: any,
  nylasConnection: any,
  session: mongoose.ClientSession
): Promise<IEmailActivity> {
  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  const scheduledTime = new Date(details.scheduledFor);

  // Prepare sender information
  const fromInfo = details.from || { 
    email: user.email, 
    name: `${user.firstName} ${user.lastName}` 
  };

  // Resolve the replyToMessageId to ensure we have the correct messageId
  const resolvedReplyToMessageId = details.replyToMessageId 
    ? await resolveReplyToMessageId(details.replyToMessageId, session)
    : undefined;

  const messageId = `scheduled-${action._id}-${Date.now()}`;
  const threadId = details.threadId || `thread-${action._id}`;

  const emailActivity = new EmailActivity({
    type: ActivityType.EMAIL,
    messageId: messageId,
    threadId: threadId,
    from: [{ email: fromInfo.email, name: fromInfo.name || '' }],
    to: details.to.map((email: string) => ({ email, name: '' })),
    cc: details.cc?.map((email: string) => ({ email, name: '' })) || [],
    bcc: details.bcc?.map((email: string) => ({ email, name: '' })) || [],
    subject: details.subject,
    body: details.body,
    htmlBody: details.htmlBody,
    attachments: details.attachments?.map((att: any) => att.id || att.filename) || [],
    emailAttachments: details.attachments || [],
    date: scheduledTime,
    status: details.isDraft ? 'draft' : 'scheduled',
    isDraft: details.isDraft || false,
    isSent: false,
    isRead: false,
    nylasGrantId: nylasConnection.grantId,
    nylasMessageId: messageId,
    nylasThreadId: threadId,
    title: details.subject,
    prospect: opportunity.prospect,
    contacts: opportunity.contacts,
    organization: opportunity.organization,
    createdBy: user._id,
    scheduledDate: scheduledTime,
    replyToMessageId: resolvedReplyToMessageId,
    metadata: {
      sourceAction: action._id,
      sourceActionType: action.type,
      priority: details.priority || 'normal',
      trackingEnabled: details.trackingEnabled !== false
    }
  });

  await emailActivity.save({ session });
  return emailActivity;
}

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing email action via handler...`));

  const details = action.details as {
    to: string[];
    cc?: string[];
    bcc?: string[];
    from?: { name?: string; email: string; connectionId?: string };
    subject: string;
    body: string;
    htmlBody?: string;
    scheduledFor: string;
    replyToMessageId?: string;
    threadId?: string;
    attachments?: Array<{
      id?: string;
      filename: string;
      content: string;
      contentType: string;
    }>;
    isDraft?: boolean;
    priority?: 'low' | 'normal' | 'high';
    trackingEnabled?: boolean;
  };

  const user = await User.findById(executingUserId).session(session);
  if (!user) {
    throw new Error(`User ${executingUserId} not found`);
  }

  // Find the Nylas connection - prefer the one specified in from.connectionId, or find any active one
  let nylasConnection;
  
  if (details.from?.connectionId) {
    console.log(chalk.cyan(`    -> Using specified connection: ${details.from.connectionId}`));
    nylasConnection = await NylasConnection.findOne({ 
      _id: details.from.connectionId,
      user: executingUserId,
      syncStatus: 'active'
    }).session(session);
    
    if (!nylasConnection) {
      throw new Error(`Specified Nylas connection ${details.from.connectionId} not found or not active for user ${executingUserId}`);
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

  if (details.scheduledFor) {
    const scheduledTime = new Date(details.scheduledFor);
    if (scheduledTime > new Date()) {
      const emailActivity = await createScheduledEmailActivity(action, user, details, nylasConnection, session);
      console.log(chalk.yellow(`    -> Email scheduled for ${scheduledTime.toISOString()}`));
      IntelligenceProcessor.processActivity(emailActivity);
      return { 
        type: 'scheduled', 
        activityId: emailActivity._id, 
        activityModel: 'EmailActivity',
        scheduledFor: scheduledTime 
      };
    }
  }

  // Prepare recipients
  const recipients = details.to.map(email => ({ name: '', email }));
  const ccRecipients = details.cc?.map(email => ({ name: '', email })) || undefined;
  const bccRecipients = details.bcc?.map(email => ({ name: '', email })) || undefined;

  // Prepare attachments for Nylas format
  const nylasAttachments = details.attachments?.map((att: any) => ({
    id: att.id || `attachment-${Date.now()}`,
    filename: att.filename,
    filePath: att.filePath,
    contentType: att.contentType,
    size: att.size || 0
  }));

  // Resolve the replyToMessageId to ensure we have the correct messageId
  const resolvedReplyToMessageId = details.replyToMessageId 
    ? await resolveReplyToMessageId(details.replyToMessageId, session)
    : undefined;

  const sendResult: NylasSendMessageResponse = await nylasSendMessage(
    nylasConnection.grantId,
    details.subject,
    recipients,
    ccRecipients,
    bccRecipients,
    resolvedReplyToMessageId,
    nylasAttachments,
    details.htmlBody,
    details.body,
    user.organization?.toString()
  );

  if (!sendResult.success) {
    throw new Error(`Failed to send email: ${sendResult.error || sendResult.message}`);
  }

  console.log(chalk.green(`    -> Email sent successfully via handler`));
  
  // Record sent playbooks if metadata is available
  try {
    const workflowMetadata = action.details?.workflowMetadata;
    if (workflowMetadata?.sourcesUsed && workflowMetadata?.contactIds && workflowMetadata?.opportunityId) {
      const playbooksToRecord = workflowMetadata.sourcesUsed
        .filter((source: any) => source.type === 'collateral' || source.type === 'case_study')
        .map((source: any) => ({
          documentId: source.id,
          documentType: source.type,
        }));

      if (playbooksToRecord.length > 0) {
        await recordSentPlaybooks(
          workflowMetadata.contactIds,
          workflowMetadata.opportunityId,
          playbooksToRecord
        );
        console.log(chalk.green(`    -> Recorded ${playbooksToRecord.length} sent playbooks for ${workflowMetadata.contactIds.length} contacts`));
      }
    }
  } catch (error) {
    console.error(chalk.yellow(`    -> Warning: Failed to record sent playbooks:`), error);
    // Don't fail the email send if recording fails
  }

  return { type: 'sent', nylasResponse: sendResult.data };
}

