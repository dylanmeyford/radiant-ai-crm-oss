import chalk from 'chalk';
import mongoose from 'mongoose';
import { ActionPipelineContext, MainAction } from '../index.js';
import { EmailActionDetailsSchema } from './schema';
import EmailActivity from '../../../../../models/EmailActivity';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>,
  validEmailActivityIds: Set<string>
): Promise<any | null> {
  
  // Normalize scheduledFor: if empty or missing, default to current time (send immediately)
  if (!action.details.scheduledFor) {
    const now = new Date();
    now.setUTCSeconds(0, 0); // Zero out seconds and milliseconds for clean ISO format
    action.details.scheduledFor = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    console.log(chalk.cyan(`          -> scheduledFor was empty, defaulting to now (send immediately): ${action.details.scheduledFor}`));
  }

  const validationResult = EmailActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid email details structure: ${validationResult.error.message}`));
    return null;
  }

  const details = validationResult.data;

  // Validate email recipients (TO field)
  const validRecipients = details.to.filter((email: string) => {
    const isValid = validContactEmails.has(email);
    if (!isValid) {
      console.log(chalk.yellow(`          -> Warning: Invalid recipient email ${email}`));
    }
    return isValid;
  });

  if (validRecipients.length === 0) {
    console.log(chalk.yellow(`          -> No valid recipients for email action`));
    return null;
  }

  // Validate CC recipients if provided
  let validCcRecipients: string[] = [];
  if (details.cc && details.cc.length > 0) {
    validCcRecipients = details.cc.filter((email: string) => {
      const isValid = validContactEmails.has(email);
      if (!isValid) {
        console.log(chalk.yellow(`          -> Warning: Invalid CC recipient email ${email}`));
      }
      return isValid;
    });
  }

  // Validate BCC recipients if provided
  let validBccRecipients: string[] = [];
  if (details.bcc && details.bcc.length > 0) {
    validBccRecipients = details.bcc.filter((email: string) => {
      const isValid = validContactEmails.has(email);
      if (!isValid) {
        console.log(chalk.yellow(`          -> Warning: Invalid BCC recipient email ${email}`));
      }
      return isValid;
    });
  }

  // Validate and normalize reply-to identifiers and thread consistency if provided
  if (details.replyToMessageId) {
    const normalized = await normalizeReplyToMessageId(details, context);
    if (normalized) {
      // replyToMessageId normalized to canonical messageId; ensure threadId consistency
      await validateThreadIdConsistency(details, context);
    } else {
      console.log(chalk.yellow(`          -> Warning: Could not resolve replyToMessageId ${details.replyToMessageId}, removing`));
      details.replyToMessageId = null;
      if (details.threadId) {
        console.log(chalk.yellow(`          -> Warning: Removing threadId due to unresolved replyToMessageId`));
        details.threadId = null;
      }
    }
  } else if (details.threadId) {
    // threadId provided without replyToMessageId - validate it exists
    await validateStandaloneThreadId(details, context);
  }

  // Build the validated details object
  const validatedDetails: any = { 
    ...details, 
    to: validRecipients 
  };

  // Only include CC/BCC if they have valid recipients
  if (validCcRecipients.length > 0) {
    validatedDetails.cc = validCcRecipients;
  }
  if (validBccRecipients.length > 0) {
    validatedDetails.bcc = validBccRecipients;
  }

  return validatedDetails;
}

/**
 * Normalizes details.replyToMessageId to the canonical EmailActivity.messageId.
 * Accepts either an EmailActivity _id or messageId as input. When resolvable,
 * sets details.replyToMessageId = messageId and ensures details.threadId is
 * present and correct if determinable.
 * Returns true if normalization succeeded, false otherwise.
 */
async function normalizeReplyToMessageId(
  details: any,
  context: ActionPipelineContext
): Promise<boolean> {
  try {
    if (!details.replyToMessageId) {
      return false;
    }

    const input = details.replyToMessageId as string;

    // 1) Try to resolve from context first (fast path)
    const contextEmail = context.recentActivities.find(activity =>
      'threadId' in activity && (
        (activity._id as mongoose.Types.ObjectId).toString() === input ||
        ('messageId' in activity && activity.messageId === input)
      )
    ) as any | undefined;

    if (contextEmail) {
      const canonicalMessageId = contextEmail.messageId as string | undefined;
      if (canonicalMessageId) {
        if (details.threadId && details.threadId !== contextEmail.threadId) {
          console.log(chalk.yellow(
            `          -> Warning: Provided threadId ${details.threadId} doesn't match context email threadId ${contextEmail.threadId}, correcting`
          ));
          details.threadId = contextEmail.threadId;
        } else if (!details.threadId) {
          details.threadId = contextEmail.threadId;
        }
        details.replyToMessageId = canonicalMessageId;
        return true;
      }
    }

    // 2) Try DB by messageId
    let emailActivity = await EmailActivity.findOne({ messageId: input });
    if (emailActivity) {
      if (details.threadId && details.threadId !== emailActivity.threadId) {
        console.log(chalk.yellow(
          `          -> Warning: Provided threadId ${details.threadId} doesn't match email's threadId ${emailActivity.threadId}, correcting`
        ));
        details.threadId = emailActivity.threadId;
      } else if (!details.threadId) {
        details.threadId = emailActivity.threadId;
      }
      details.replyToMessageId = emailActivity.messageId;
      return true;
    }

    // 3) Try DB by _id (ObjectId)
    try {
      emailActivity = await EmailActivity.findById(input);
      if (emailActivity) {
        if (details.threadId && details.threadId !== emailActivity.threadId) {
          console.log(chalk.yellow(
            `          -> Warning: Provided threadId ${details.threadId} doesn't match email's threadId ${emailActivity.threadId}, correcting`
          ));
          details.threadId = emailActivity.threadId;
        } else if (!details.threadId) {
          details.threadId = emailActivity.threadId;
        }
        details.replyToMessageId = emailActivity.messageId;
        return true;
      }
    } catch (error) {
      // Not a valid ObjectId format; ignore
    }

    return false;
  } catch (error) {
    console.log(chalk.red(`          -> Error normalizing replyToMessageId: ${error}`));
    return false;
  }
}

/**
 * Validates that if both replyToMessageId and threadId are provided,
 * the threadId matches the threadId of the email being replied to.
 */
async function validateThreadIdConsistency(
  details: any,
  context: ActionPipelineContext
): Promise<void> {
  if (!details.threadId || !details.replyToMessageId) {
    return; // Nothing to validate
  }

  try {
    // Find the EmailActivity being replied to
    const replyToActivity = context.recentActivities.find(activity => 
      (activity._id as mongoose.Types.ObjectId).toString() === details.replyToMessageId ||
      ('messageId' in activity && activity.messageId === details.replyToMessageId)
    );

    if (replyToActivity && 'threadId' in replyToActivity) {
      const existingThreadId = replyToActivity.threadId;
      
      if (details.threadId !== existingThreadId) {
        console.log(chalk.yellow(
          `          -> Warning: Provided threadId ${details.threadId} doesn't match reply-to email's threadId ${existingThreadId}, correcting`
        ));
        details.threadId = existingThreadId;
      } else {
        console.log(chalk.green(`          -> ThreadId ${details.threadId} correctly matches reply-to email's thread`));
      }
    } else {
      // Fallback: Query database if not found in context
      let emailActivity = await EmailActivity.findOne({ messageId: details.replyToMessageId });
      
      if (!emailActivity) {
        try {
          emailActivity = await EmailActivity.findById(details.replyToMessageId);
        } catch (error) {
          // Invalid ObjectId format
          console.log(chalk.yellow(`          -> Warning: Could not validate threadId consistency - invalid replyToMessageId format`));
          return;
        }
      }
      
      if (emailActivity && emailActivity.threadId !== details.threadId) {
        console.log(chalk.yellow(
          `          -> Warning: Provided threadId ${details.threadId} doesn't match reply-to email's threadId ${emailActivity.threadId}, correcting`
        ));
        details.threadId = emailActivity.threadId;
      }
    }
  } catch (error) {
    console.log(chalk.red(`          -> Error validating threadId consistency: ${error}`));
  }
}

/**
 * Validates that a standalone threadId (without replyToMessageId) exists in the system.
 */
async function validateStandaloneThreadId(
  details: any,
  context: ActionPipelineContext
): Promise<void> {
  if (!details.threadId) {
    return;
  }

  try {
    // Check if threadId exists in context activities
    const threadExists = context.recentActivities.some(activity => 
      'threadId' in activity && activity.threadId === details.threadId
    );

    if (!threadExists) {
      // Fallback: Query database to check if thread exists
      const emailInThread = await EmailActivity.findOne({ threadId: details.threadId });
      
      if (!emailInThread) {
        console.log(chalk.yellow(
          `          -> Warning: Provided threadId ${details.threadId} doesn't exist in the system, removing`
        ));
        details.threadId = null;
      } else {
        console.log(chalk.green(`          -> ThreadId ${details.threadId} exists in the system`));
      }
    } else {
      console.log(chalk.green(`          -> ThreadId ${details.threadId} found in context activities`));
    }
  } catch (error) {
    console.log(chalk.red(`          -> Error validating standalone threadId: ${error}`));
    details.threadId = null;
  }
}

