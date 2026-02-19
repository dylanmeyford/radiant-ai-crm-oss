import cron from 'node-cron';
import EmailActivity from '../models/EmailActivity';
import { nylasSendMessage } from '../services/NylasService';
import mongoose from 'mongoose';

/**
 * EmailSchedulerService
 * 
 * Handles scheduling and sending emails at specified times.
 * Uses node-cron to periodically check for emails that need to be sent.
 */

class EmailSchedulerService {
  private schedulerTask: cron.ScheduledTask;

  constructor() {
    // Schedule a task to run every minute to check for emails to send
    this.schedulerTask = cron.schedule('* * * * *', this.processScheduledEmails);
  }

  /**
   * Process all scheduled emails that are due to be sent
   */
  private processScheduledEmails = async (): Promise<void> => {
    try {
      const now = new Date();
      
      // Find all scheduled emails that are due to be sent
      const emailsToSend = await EmailActivity.find({
        status: 'scheduled',
        isDraft: false,
        isSent: false,
        scheduledDate: { $lte: now }
      }).lean();

      if (emailsToSend.length !== 0) {
      console.log(`Found ${emailsToSend.length} emails to send at ${now}`);
      }

      // Process each email
      for (const email of emailsToSend) {
        await this.sendEmail(email);
      }
    } catch (error) {
      console.error('Error processing scheduled emails:', error);
    }
  };

  /**
   * Send a specific email using Nylas API
   */
  private sendEmail = async (email: any): Promise<void> => {
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Process attachments to prevent circular references
      const processedAttachments = email.emailAttachments && Array.isArray(email.emailAttachments) 
        ? email.emailAttachments.map((attachment: any) => {
            // If attachment is a string (ID), just return it
            if (typeof attachment === 'string') {
              return { id: attachment };
            }
            
            // Otherwise, extract all necessary fields for sending
            const { id, filename, content, contentType, size, filePath } = attachment;
            return { id, filename, content, contentType, size, filePath };
          })
        : undefined;
      
      // Send the email via Nylas
      const sentMessage = await nylasSendMessage(
        email.nylasGrantId,
        email.subject,
        email.to,
        email.cc,
        email.bcc,
        email.replyToMessageId,
        processedAttachments,
        email.htmlBody,
        email.body,
        email.organization?.toString() // Pass organization ID for attachment processing
      );

      if (sentMessage.success) {
        // Delete our record, as nylas will create one
        await EmailActivity.findByIdAndDelete(email._id).session(session);
        
        // Commit the transaction
        await session.commitTransaction();
        console.log(`Successfully sent scheduled email: ${email._id}`);
      } else {
        // Mark as failed if Nylas didn't return a sent message
        await EmailActivity.findByIdAndUpdate(email._id, {
          status: 'failed',
          failureReason: 'Failed to send via Nylas API'
        }).session(session);

        // Commit the transaction
        await session.commitTransaction();
        console.error(`Failed to send scheduled email: ${email._id}`);
      }
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      console.error(`Error sending scheduled email ${email._id}:`, error);
      
      // Update email status to failed (outside of the aborted transaction)
      try {
        await EmailActivity.findByIdAndUpdate(email._id, {
          status: 'failed',
          failureReason: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (updateError) {
        console.error(`Failed to update email status for ${email._id}:`, updateError);
      }
    } finally {
      // End the session
      session.endSession();
    }
  };

  /**
   * Start the email scheduler
   */
  public start(): void {
    console.log('Email scheduler service started');
    this.schedulerTask.start();
  }

  /**
   * Stop the email scheduler
   */
  public stop(): void {
    console.log('Email scheduler service stopped');
    this.schedulerTask.stop();
  }
}

// Create and export a singleton instance
const emailSchedulerService = new EmailSchedulerService();
export default emailSchedulerService; 