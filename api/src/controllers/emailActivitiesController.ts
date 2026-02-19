import { Request, Response } from 'express';
import EmailActivity from '../models/EmailActivity';
import Contact from '../models/Contact';
import NylasConnection from '../models/NylasConnection';
import { nylasSendMessage, NylasSendMessageResponse } from '../services/NylasService';
import mongoose from 'mongoose';
import { IntelligenceProcessor } from '../services/AI/personIntelligence/intelligenceProcessor';
import Opportunity from '../models/Opportunity';
import { cleanupEmailAttachments } from '../services/emailAttachmentService';

// Get all email activities for an opportunity
export const getOpportunityEmailActivities = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, message: 'User not authenticated' });
    return;
  }

  const opportunity = await Opportunity.findOne({_id: id, organization: user.organization});
  if (!opportunity) {
    res.status(404).json({ success: false, message: 'Opportunity not found' });
    return;
  }

  const contacts = await Contact.find({ prospect: opportunity?.prospect, organization: opportunity?.organization, opportunities: opportunity?._id });
  const emailActivities = await EmailActivity.find({ 
    contacts: { $in: contacts.map((contact) => contact._id) },
    date: { $gte: opportunity.opportunityStartDate } 
  });
  res.status(200).json(emailActivities);
};

// Create a draft email (stored on our server)
export const createDraft = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    let {
      subject,
      body,
      htmlBody,
      to,
      cc,
      bcc,
      from,
      attachments: reqAttachments,
      threadId,
      replyToMessageId
    } = req.body;

    const userId = req.user?._id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({
      user: userId,
      organization: req.user?.organization
    }).session(session);

    if (!nylasConnection) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'No Nylas connection found' });
      return;
    }

    // Make sure we have required fields
    if (!subject || !body || !to || !from) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    // Initialize arrays if they don't exist
    cc = cc || [];
    bcc = bcc || [];
    to = Array.isArray(to) ? to : [to];
    
    // Validate attachment format if present (now expects attachment metadata from upload endpoint)
    let processedAttachments = reqAttachments;
    if (processedAttachments && processedAttachments.length > 0) {
      // Check each attachment has required fields (now expects metadata from upload)
      const invalidAttachments = processedAttachments.filter(
        (att: any) => !att.id || !att.filename || !att.contentType || !att.size || !att.filePath
      );
      
      if (invalidAttachments.length > 0) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Invalid attachment format. Each attachment must include id, filename, contentType, size, and filePath from the upload endpoint' 
        });
        return;
      }
      
      // Validate total attachment count (reasonable limit)
      if (processedAttachments.length > 10) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Maximum of 10 attachments allowed per email' 
        });
        return;
      }
      
      // Ensure each attachment has proper structure
      processedAttachments = processedAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        filePath: att.filePath,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    let recipientEmails = [...to, ...cc, ...bcc];
    const contacts = await Contact.find({
      'emails.address': { $in: recipientEmails.map((contact) => contact.email) },
      organization: req.user?.organization
    }).session(session);
    const contactIds = contacts.map((contact) => contact._id);

    // Generate a unique message ID for this draft
    const messageId = `draft-${new mongoose.Types.ObjectId().toString()}`;
    
    // Pre-inserts in the right thread if it exists, otherwise creates a new one
    threadId = threadId || `thread-${new mongoose.Types.ObjectId().toString()}`;

    // Create the draft email activity
    const draft = new EmailActivity({
      type: 'email',
      messageId,
      threadId,
      from,
      to,
      cc,
      bcc,
      subject,
      body,
      htmlBody,
      attachments: processedAttachments.map((att: any) => att.id), // Store attachment references (just IDs)
      emailAttachments: processedAttachments, // Store full attachment objects including content
      isDraft: true,
      isSent: false,
      isRead: true,
      nylasGrantId: nylasConnection.grantId,
      nylasMessageId: messageId,
      nylasThreadId: threadId,
      replyToMessageId: replyToMessageId,
      title: subject,
      status: 'draft',
      contacts: contactIds,
      organization: req.user?.organization,
      createdBy: userId,
      date: new Date(),
      prospect: contacts[0].prospect
    });

    await draft.save({ session });

    IntelligenceProcessor.processActivity(draft);

    // Update each contact with this draft
    for (const contactId of contactIds) {
      await Contact.findByIdAndUpdate(
        contactId,
        { $addToSet: { emailActivities: draft._id } },
        { session }
      );
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return the draft with attachment metadata (no content to reduce response size)
    const responseDraft = draft.toObject();
    if (responseDraft.emailAttachments && responseDraft.emailAttachments.length > 0) {
      responseDraft.emailAttachments = responseDraft.emailAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    res.status(201).json(responseDraft);
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating draft:', error);
    res.status(500).json({ success: false, message: 'Server error creating draft' });
  }
};

// Update an existing draft email
export const updateDraft = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const {
      subject,
      body,
      htmlBody,
      to,
      cc,
      bcc,
      from,
      attachments: reqAttachments,
      replyToMessageId
    } = req.body;

    const userId = req.user?._id;
    
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Find the draft by ID
    const draft = await EmailActivity.findById(id).session(session);
    
    if (!draft) {
      await session.abortTransaction();
      session.endSession();
      res.status(404).json({ success: false, message: 'Draft not found' });
      return;
    }

    // Verify ownership
    if (draft.createdBy.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      res.status(403).json({ success: false, message: 'Not authorized to update this draft' });
      return;
    }

    // Verify it's a draft
    if (!draft.isDraft) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Can only update draft emails' });
      return;
    }

    // Process attachments if provided (now expects attachment metadata from upload endpoint)
    let processedAttachments = reqAttachments;
    if (processedAttachments) {
      // Validate attachment format
      const invalidAttachments = processedAttachments.filter(
        (att: any) => !att.id || !att.filename || !att.contentType || typeof att.size !== 'number'
      );
      
      if (invalidAttachments.length > 0) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Invalid attachment format. Each attachment must include id, filename, contentType, and size from the upload endpoint.'
        });
        return;
      }
      
      // Validate total attachment count
      if (processedAttachments.length > 10) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Maximum of 10 attachments allowed per email' 
        });
        return;
      }
      
      // Ensure proper structure
      processedAttachments = processedAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        filePath: att.filePath,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    // Update contact IDs if recipients changed
    if (to || cc || bcc) {
      // Remove this draft from previous contacts
      for (const contactId of draft.contacts) {
        await Contact.findByIdAndUpdate(
          contactId,
          { $pull: { emailActivities: draft._id } },
          { session }
        );
      }

      // Get new contact IDs
      let newContactEmails = [
        ...(to || draft.to || []), 
        ...(cc || draft.cc || []), 
        ...(bcc || draft.bcc || [])
      ];
      let newContacts = await Contact.find({
        'emails.address': { $in: newContactEmails.map((contact) => contact.email) },
        organization: req.user?.organization
      }).session(session);
      
      // Create a properly typed array of ObjectIds
      const contactObjectIds: mongoose.Types.ObjectId[] = newContacts.map((contact: any) => contact._id);
      
      // Set the contacts
      draft.contacts = contactObjectIds;
      
      // Add the draft to the new contacts
      for (const contactId of contactObjectIds) {
        await Contact.findByIdAndUpdate(
          contactId,
          { $addToSet: { emailActivities: draft._id } },
          { session }
        );
      }
    }

    // Update draft fields
    if (subject) draft.subject = subject;
    if (body) draft.body = body;
    if (htmlBody) draft.htmlBody = htmlBody;
    if (to) draft.to = to;
    if (cc) draft.cc = cc;
    if (bcc) draft.bcc = bcc;
    if (from) draft.from = from;
    if (processedAttachments) {
      // Replace the attachments with the processed ones
      draft.emailAttachments = processedAttachments;
      draft.attachments = processedAttachments.map((att: any) => att.id);
    }
    if (replyToMessageId) draft.replyToMessageId = replyToMessageId;
    if (subject) draft.title = subject;

    // Save the updated draft
    await draft.save({ session });
    IntelligenceProcessor.processActivity(draft);

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return the draft with attachment metadata (no content to reduce response size)
    const responseDraft = draft.toObject();
    if (responseDraft.emailAttachments && responseDraft.emailAttachments.length > 0) {
      responseDraft.emailAttachments = responseDraft.emailAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    res.status(200).json(responseDraft);
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating draft:', error);
    res.status(500).json({ success: false, message: 'Server error updating draft' });
  }
};

// Schedule an email to be sent at a specific time
export const scheduleEmail = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    let {
      subject,
      body,
      htmlBody,
      to,
      cc,
      bcc,
      from,
      scheduledDate,
      attachments: reqAttachments,
      isDraft,
      replyToMessageId,
      id,
      threadId
    } = req.body;

    const userId = req.user?._id;
    
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({
      user: userId,
      organization: req.user?.organization
    }).session(session);

    if (!nylasConnection) { 
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'No Nylas connection found' });
      return;
    }

    // Initialize arrays if not present
    cc = cc || [];
    bcc = bcc || [];
    to = Array.isArray(to) ? to : (to ? [to] : []);

    // If scheduling from draft, get the draft first to use its data
    let existingDraft = null;
    if (isDraft && id) {
      existingDraft = await EmailActivity.findById(id).session(session);
      
      if (!existingDraft) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ success: false, message: 'Draft not found' });
        return;
      }

      // Use draft recipients if none provided in request
      if (!to.length && !cc.length && !bcc.length) {
        to = existingDraft.to || [];
        cc = existingDraft.cc || [];
        bcc = existingDraft.bcc || [];
      }
    }

    // Validate attachment format if present (now expects attachment metadata from upload endpoint)
    let processedAttachments = reqAttachments;
    if (processedAttachments && processedAttachments.length > 0) {
      // Validate attachment format
      const invalidAttachments = processedAttachments.filter(
        (att: any) => !att.id || !att.filename || !att.contentType || typeof att.size !== 'number'
      );
      
      if (invalidAttachments.length > 0) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Invalid attachment format. Each attachment must include id, filename, contentType, and size from the upload endpoint.' 
        });
        return;
      }
      
      // Validate total attachment count
      if (processedAttachments.length > 10) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ 
          success: false, message: 'Maximum of 10 attachments allowed per email' 
        });
        return;
      }
      
      // Ensure proper structure
      processedAttachments = processedAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        filePath: att.filePath,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    let contactIds: any[] = [];
    let contacts: any[] = [];
    
    // Only resolve contacts if we have recipients
    if (to.length > 0 || cc.length > 0 || bcc.length > 0) {
      let recipientEmails = [...to, ...cc, ...bcc];
      contacts = await Contact.find({
        'emails.address': { $in: recipientEmails.map((contact) => contact.email) },
        organization: req.user?.organization
      }).session(session);
      contactIds = contacts.map((contact) => contact._id);
    }

    // Make sure we have required fields
    if ((!subject || !body || !to.length || !from) && !isDraft) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    if (!scheduledDate) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Scheduled date is required' });
      return;
    }

    let scheduledEmail;

    // If updating an existing draft
    if (isDraft && existingDraft) {
      scheduledEmail = existingDraft;
      
      // Update the draft with scheduled information
      scheduledEmail.status = 'scheduled';
      scheduledEmail.scheduledDate = new Date(scheduledDate);
      
      if (subject) scheduledEmail.subject = subject;
      if (body) scheduledEmail.body = body;
      if (htmlBody) scheduledEmail.htmlBody = htmlBody;
      if (to.length > 0) scheduledEmail.to = to;
      if (cc.length > 0) scheduledEmail.cc = cc;
      if (bcc.length > 0) scheduledEmail.bcc = bcc;
      if (processedAttachments) {
        scheduledEmail.attachments = processedAttachments.map((att: any) => att.id);
        scheduledEmail.emailAttachments = processedAttachments;
      }
      scheduledEmail.isDraft = false;
      
      await scheduledEmail.save({ session });
    } else {
      // Generate a unique message ID for this email
      const messageId = `scheduled-${new mongoose.Types.ObjectId().toString()}`;
      
      // If no thread ID is provided, generate a new one
      threadId = threadId || `thread-${new mongoose.Types.ObjectId().toString()}`;

      // Create a new scheduled email
      scheduledEmail = new EmailActivity({
        type: 'email',
        messageId,
        threadId,
        from,
        to,
        cc,
        bcc,
        subject,
        body,
        htmlBody,
        attachments: processedAttachments ? processedAttachments.map((att: any) => att.id) : [],
        emailAttachments: processedAttachments,
        isDraft: false,
        isSent: false,
        isRead: true,
        nylasGrantId: nylasConnection.grantId,
        nylasMessageId: messageId,
        nylasThreadId: threadId,
        title: subject,
        status: 'scheduled',
        replyToMessageId: replyToMessageId,
        scheduledDate: new Date(scheduledDate),
        contacts: contactIds,
        organization: req.user?.organization,
        createdBy: userId,
        date: new Date(),
        prospect: contacts[0].prospect
      });

      await scheduledEmail.save({ session });

      IntelligenceProcessor.processActivity(scheduledEmail);

      // Update each contact with this scheduled email
      for (const contactId of contactIds) {
        await Contact.findByIdAndUpdate(
          contactId,
          { $addToSet: { emailActivities: scheduledEmail._id } },
          { session }
        );
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return with attachment metadata (no content to reduce response size)
    const responseEmail = scheduledEmail.toObject();
    if (responseEmail.emailAttachments && responseEmail.emailAttachments.length > 0) {
      responseEmail.emailAttachments = responseEmail.emailAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }

    res.status(201).json(responseEmail);
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error scheduling email:', error);
    res.status(500).json({ success: false, message: 'Server error scheduling email' });
  }
};

// Helper function to resolve recipients (supports both contact IDs and email addresses)
const resolveEmailRecipients = async (
  recipients: any[], 
  organizationId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
  emailOverrides?: { [contactId: string]: string }
): Promise<{ name: string; email: string }[]> => {
  if (!recipients || recipients.length === 0) return [];
  
  const emailRecipients: { name: string; email: string }[] = [];
  const contactIdsToResolve: string[] = [];
  
  // Separate contact IDs from email objects
  for (const recipient of recipients) {
    if (typeof recipient === 'string') {
      // This is a contact ID
      contactIdsToResolve.push(recipient);
    } else if (recipient.email) {
      // This is already an email object
      emailRecipients.push(recipient);
    }
  }
  
  // Resolve contact IDs to email addresses
  if (contactIdsToResolve.length > 0) {
    const contacts = await Contact.find({
      _id: { $in: contactIdsToResolve },
      organization: organizationId
    }).session(session);
    
    for (const contact of contacts) {
      const overrideEmail = emailOverrides?.[(contact as any)._id.toString()];
      const emailRecipient = (contact as any).toEmailRecipient(overrideEmail);
      if (emailRecipient.email) {
        emailRecipients.push(emailRecipient);
      }
    }
  }
  
  return emailRecipients;
};

// Send an email immediately using Nylas
export const sendEmail = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    let {
      subject,
      body,
      htmlBody,
      to,
      cc,
      bcc,
      grantId,
      contactIds,
      replyToMessageId,
      attachments,
      isDraft,
      id,
      threadId,
      emailOverrides // New: allows specific email selection per contact
    } = req.body;

    const userId = req.user?._id;

    
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({
      user: userId,
      organization: req.user?.organization
    }).session(session);

    if (!nylasConnection) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'No Nylas connection found' });
      return;
    }

    if (!grantId) {
      grantId = nylasConnection.grantId;
    }

    if (!req.user?.organization) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Organization not found' });
      return;
    }

    // Resolve recipients using the new helper function (supports both contact IDs and email objects)
    const resolvedTo = await resolveEmailRecipients(to || [], req.user.organization, session, emailOverrides);
    const resolvedCc = await resolveEmailRecipients(cc || [], req.user.organization, session, emailOverrides);
    const resolvedBcc = await resolveEmailRecipients(bcc || [], req.user.organization, session, emailOverrides);
    
    // Find all contacts for the resolved email addresses (for activity tracking)
    const allEmailAddresses = [
      ...resolvedTo.map(r => r.email),
      ...resolvedCc.map(r => r.email),
      ...resolvedBcc.map(r => r.email)
    ];
    
    const allContacts = await Contact.find({
      'emails.address': { $in: allEmailAddresses },
      organization: req.user.organization
    }).session(session);

    contactIds = allContacts.map((contact) => (contact as any)._id);

    // If sending from a draft, get the draft data
    let emailData;
    let emailActivity;

    if (isDraft) {
      const draft = await EmailActivity.findById(id).session(session);
      if (!draft) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ success: false, message: 'Draft not found' });
        return;
      }
      
      // Use draft attachments if none provided in request
      if (!attachments && draft.emailAttachments) {
        attachments = draft.emailAttachments;
      }
      
      emailData = {
        subject: subject || draft.subject,
        body: body || draft.body,
        htmlBody: htmlBody || draft.htmlBody,
        to: resolvedTo.length > 0 ? resolvedTo : (draft.to || []).map(r => ({ email: r.email, name: r.name || '' })),
        cc: resolvedCc.length > 0 ? resolvedCc : (draft.cc || []).map(r => ({ email: r.email, name: r.name || '' })),
        bcc: resolvedBcc.length > 0 ? resolvedBcc : (draft.bcc || []).map(r => ({ email: r.email, name: r.name || '' })),
        grantId: grantId || draft.nylasGrantId,
        contactIds: contactIds || draft.contacts,
        organizationId: req.user.organization || draft.organization,
        replyToMessageId,
        threadId: threadId || draft.threadId,
        attachments: attachments && attachments.length > 0 ? attachments : undefined
      };
    } else {
      // Ensure we have required fields for a new email
      if (!subject || !body || !resolvedTo.length || !grantId || !contactIds || !req.user.organization) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ success: false, message: 'Missing required fields' });
        return;
      }
      
      emailData = {
        subject,
        body,
        htmlBody,
        to: resolvedTo,
        cc: resolvedCc,
        bcc: resolvedBcc,
        grantId,
        contactIds,
        organizationId: req.user.organization,
        replyToMessageId,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        threadId: threadId || `thread-${new mongoose.Types.ObjectId().toString()}`,
      };
    }

    // Resolve the replyToMessageId to ensure we have the correct messageId
    let resolvedReplyToMessageId = emailData.replyToMessageId;
    if (resolvedReplyToMessageId) {
      // First, try to find an EmailActivity with the messageId matching replyToMessageId
      let emailActivity = await EmailActivity.findOne({ messageId: resolvedReplyToMessageId }).session(session);
      
      if (!emailActivity) {
        // If not found, try to find an EmailActivity with _id matching replyToMessageId
        try {
          emailActivity = await EmailActivity.findById(resolvedReplyToMessageId).session(session);
          if (emailActivity) {
            resolvedReplyToMessageId = emailActivity.messageId;
          }
        } catch (error) {
          // If the replyToMessageId is not a valid ObjectId, we'll keep the original value
          console.log(`Invalid ObjectId format for replyToMessageId: ${resolvedReplyToMessageId}`);
        }
      }
    }

    // Send the email via Nylas with updated parameter order
    const sentMessage: NylasSendMessageResponse = await nylasSendMessage(
      emailData.grantId,
      emailData.subject,
      emailData.to,
      emailData.cc,
      emailData.bcc,
      resolvedReplyToMessageId,
      emailData.attachments,
      emailData.htmlBody,
      emailData.body,
      emailData.organizationId?.toString()
    );

    if (!sentMessage.success || !sentMessage.data) {
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({ success: false, message: sentMessage.message || 'Failed to send email' });
      return;
    }

    // If sending from a draft, delete the draft
    // We don't need to create records for email activities as nylas will create them. This is best as we want the
    // email client to be the source of truth for email activities. (i.e. avoid showing one not sent that is, and vice versa)
    if (isDraft) {
      emailActivity = await EmailActivity.findById(id).session(session);
      if (!emailActivity) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ success: false, message: 'Email activity not found' });
        return;
      }

      await emailActivity.deleteOne({ session });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json(sentMessage);
    
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Server error sending email' });
  }
};

// Get all drafts for a user
export const getUserDrafts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const drafts = await EmailActivity.find({
      createdBy: userId,
      isDraft: true,
      isSent: false
    }).populate('contacts');

    // Strip attachment content from response to reduce payload size
    const responseDrafts = drafts.map(draft => {
      const draftObj = draft.toObject();
      if (draftObj.emailAttachments && draftObj.emailAttachments.length > 0) {
        draftObj.emailAttachments = draftObj.emailAttachments.map((att: any) => ({
          id: att.id,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          url: att.url,
          is_inline: att.is_inline || false
        }));
      }
      return draftObj;
    });

    res.status(200).json(responseDrafts);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ success: false, message: 'Server error fetching drafts' });
  }
};

// Get all scheduled emails for a user
export const getScheduledEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const scheduledEmails = await EmailActivity.find({
      createdBy: userId,
      status: 'scheduled',
      isSent: false
    }).populate('contacts');

    // Strip attachment content from response to reduce payload size
    const responseEmails = scheduledEmails.map(email => {
      const emailObj = email.toObject();
      if (emailObj.emailAttachments && emailObj.emailAttachments.length > 0) {
        emailObj.emailAttachments = emailObj.emailAttachments.map((att: any) => ({
          id: att.id,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          url: att.url,
          is_inline: att.is_inline || false
        }));
      }
      return emailObj;
    });

    res.status(200).json(responseEmails);
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    res.status(500).json({ success: false, message: 'Server error fetching scheduled emails' });
  }
};

// Delete a draft or scheduled email
export const deleteEmailActivity = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const emailActivity = await EmailActivity.findById(id).session(session);
    
    if (!emailActivity) {
      await session.abortTransaction();
      session.endSession();
      res.status(404).json({ success: false, message: 'Email activity not found' });
      return;
    }

    if (emailActivity.createdBy.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      res.status(403).json({ success: false, message: 'Not authorized to delete this email activity' });
      return;
    }

    // Check if it's already sent
    if (emailActivity.isSent && !emailActivity.isDraft) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Cannot delete an email that has already been sent' });
      return;
    }

    // Clean up attachments if this is a draft or scheduled email
    if ((emailActivity.isDraft || emailActivity.status === 'scheduled') && emailActivity.emailAttachments && req.user?.organization) {
      try {
        await cleanupEmailAttachments(
          emailActivity.emailAttachments,
          req.user.organization.toString()
        );
      } catch (error) {
        console.error('Error cleaning up attachments:', error);
        // Continue with deletion even if cleanup fails
      }
    }

    // Remove this email activity from contacts
    for (const contactId of emailActivity.contacts) {
      await Contact.findByIdAndUpdate(
        contactId,
        { $pull: { emailActivities: emailActivity._id } },
        { session }
      );
    }

    await emailActivity.deleteOne({ session });
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({ message: 'Email activity deleted successfully' });
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting email activity:', error);
    res.status(500).json({ success: false, message: 'Server error deleting email activity' });
  }
};

// Convert a scheduled email back to a draft
export const convertScheduledToDraft = async (req: Request, res: Response): Promise<void> => {
  // Start a new session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const scheduledEmail = await EmailActivity.findById(id).session(session);
    
    if (!scheduledEmail) {
      await session.abortTransaction();
      session.endSession();
      res.status(404).json({ success: false, message: 'Email activity not found' });
      return;
    }

    // Verify ownership
    if (scheduledEmail.createdBy.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      res.status(403).json({ success: false, message: 'Not authorized to modify this email activity' });
      return;
    }

    // Verify it's a scheduled email and not already sent
    if (scheduledEmail.isSent) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Cannot convert an email that has already been sent' });
      return;
    }

    if (scheduledEmail.isDraft) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'This email is already a draft' });
      return;
    }

    if (scheduledEmail.status !== 'scheduled') {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ success: false, message: 'Only scheduled emails can be converted to drafts' });
      return;
    }

    // Convert to draft
    scheduledEmail.isDraft = true;
    scheduledEmail.status = 'draft';
    scheduledEmail.scheduledDate = undefined;
    
    await scheduledEmail.save({ session });
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    
    // Return the draft with attachment metadata (no content to reduce response size)
    const responseDraft = scheduledEmail.toObject();
    if (responseDraft.emailAttachments && responseDraft.emailAttachments.length > 0) {
      responseDraft.emailAttachments = responseDraft.emailAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        url: att.url,
        is_inline: att.is_inline || false
      }));
    }
    
    res.status(200).json(responseDraft);
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error converting scheduled email to draft:', error);
    res.status(500).json({ success: false, message: 'Server error converting scheduled email to draft' });
  }
};

export const addHumanSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Check if request body is empty or has no meaningful content
    if (!req.body || Object.keys(req.body).length === 0) {
      res.status(400).json({ success: false, message: 'Summary is required' });
      return;
    }

    const summary = JSON.stringify(req.body);

    const humanSummary = {
      date: new Date(),
      summary: summary,
      createdBy: userId as mongoose.Types.ObjectId
    };

    await EmailActivity.findByIdAndUpdate(activityId, {
      $set: {
        humanSummary: humanSummary
      }
    });

    res.status(200).json({
      message: 'Human summary added successfully',
      activity: humanSummary
    });
  } catch (error) {
    console.error('Error adding human summary:', error);
    res.status(500).json({ success: false, message: 'Failed to add human summary' });
  }
}; 

