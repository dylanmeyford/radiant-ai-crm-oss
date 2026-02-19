import { Request, Response } from 'express';
import { uploadEmailAttachment, getEmailAttachment, deleteEmailAttachment } from '../services/emailAttachmentService';
import EmailActivity from '../models/EmailActivity';
import { ProposedAction } from '../models/ProposedAction';
import mongoose from 'mongoose';

/**
 * Upload email attachments
 * Supports single or multiple file uploads
 */
export const uploadAttachments = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: 'No files uploaded' });
      return;
    }

    const uploadResults = [];
    
    // Validate each file before processing
    for (const file of files) {
      // Perform the same validations as the middleware
      if (file.size > 25 * 1024 * 1024) {
        uploadResults.push({
          filename: file.originalname,
          error: 'File size exceeds 25MB limit'
        });
        continue;
      }

      const fileExtension = require('path').extname(file.originalname).toLowerCase();
      const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xls', '.xlsx', '.ppt', '.pptx', 
                           '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', 
                           '.zip', '.rar', '.7z', '.mp3', '.mp4', '.avi', '.mov', '.json', '.xml'];
      
      if (!allowedTypes.includes(fileExtension)) {
        uploadResults.push({
          filename: file.originalname,
          error: `File type '${fileExtension}' not supported`
        });
        continue;
      }

      try {
        const result = await uploadEmailAttachment(
          file.buffer,
          file.originalname,
          user.organization.toString()
        );
        
        uploadResults.push(result);
      } catch (error) {
        console.error(`Error uploading file ${file.originalname}:`, error);
        uploadResults.push({
          filename: file.originalname,
          error: 'Failed to upload file'
        });
      }
    }

    // Check if any uploads were successful
    const successfulUploads = uploadResults.filter(result => !('error' in result));
    const failedUploads = uploadResults.filter(result => 'error' in result);

    if (successfulUploads.length === 0) {
      res.status(500).json({ 
        success: false, 
        message: 'All file uploads failed',
        failures: failedUploads
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Successfully uploaded ${successfulUploads.length} file(s)`,
      attachments: successfulUploads,
      ...(failedUploads.length > 0 && { failures: failedUploads })
    });

  } catch (error) {
    console.error('Error in uploadAttachments:', error);
    res.status(500).json({ success: false, message: 'Server error uploading attachments' });
  }
};

/**
 * Download an email attachment
 * Can be used for both draft attachments and received email attachments
 */
export const downloadAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId, attachmentId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the email activity
    const emailActivity = await EmailActivity.findOne({
      _id: activityId,
      organization: user.organization
    });

    if (!emailActivity) {
      res.status(404).json({ success: false, message: 'Email activity not found' });
      return;
    }

    // Find the specific attachment
    const attachment = emailActivity.emailAttachments?.find(att => att.id === attachmentId);
    if (!attachment) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    // For received emails (from Nylas), we might need to fetch from Nylas API
    if (attachment.grant_id && !attachment.filePath) {
      // This is a received email attachment - would need to fetch from Nylas
      // For now, return an error as this requires Nylas API integration
      res.status(501).json({ 
        success: false, 
        message: 'Downloading received email attachments not yet implemented' 
      });
      return;
    }

    // For draft/scheduled email attachments, get from our storage
    if (!attachment.filePath) {
      res.status(404).json({ success: false, message: 'Attachment file not found' });
      return;
    }

    try {
      const fileData = await getEmailAttachment(
        attachment.filePath,
        user.organization.toString()
      );

      // Set appropriate headers
      res.setHeader('Content-Type', attachment.contentType || fileData.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      res.setHeader('Content-Length', fileData.buffer.length);

      // Send the file
      res.send(fileData.buffer);

    } catch (error) {
      console.error('Error retrieving attachment file:', error);
      res.status(404).json({ success: false, message: 'Attachment file not found' });
    }

  } catch (error) {
    console.error('Error in downloadAttachment:', error);
    res.status(500).json({ success: false, message: 'Server error downloading attachment' });
  }
};

/**
 * Delete a temporary attachment (only for drafts/scheduled emails)
 */
export const deleteAttachment = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { attachmentId } = req.params;
    const user = req.user;

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // First, try to find the attachment in email activities
    const emailActivities = await EmailActivity.find({
      'emailAttachments.id': attachmentId,
      organization: user.organization,
      createdBy: user._id, // Only allow deletion of own attachments
      $or: [
        { isDraft: true },
        { status: 'scheduled' }
      ]
    }).session(session);

    let attachmentToDelete = null;
    let foundInEmailActivities = false;

    // Remove the attachment from email activities if found
    if (emailActivities.length > 0) {
      foundInEmailActivities = true;
      
      for (const activity of emailActivities) {
        const attachmentIndex = activity.emailAttachments?.findIndex(att => att.id === attachmentId);
        if (attachmentIndex !== undefined && attachmentIndex >= 0 && activity.emailAttachments) {
          attachmentToDelete = activity.emailAttachments[attachmentIndex];
          
          // Remove from emailAttachments array
          activity.emailAttachments.splice(attachmentIndex, 1);
          
          // Remove from attachments array (just IDs)
          activity.attachments = activity.attachments?.filter(id => id !== attachmentId) || [];
          
          await activity.save({ session });
        }
      }
    }

    // If not found in email activities, search in proposed actions
    if (!foundInEmailActivities) {
      const proposedActions = await ProposedAction.find({
        organization: user.organization,
        'details.attachments.id': attachmentId,
        status: { $in: ['PROPOSED', 'APPROVED'] } // Only allow deletion from non-executed actions
      }).session(session);

      if (proposedActions.length > 0) {
        for (const action of proposedActions) {
          if (action.details && action.details.attachments && Array.isArray(action.details.attachments)) {
            const attachmentIndex = action.details.attachments.findIndex((att: any) => att.id === attachmentId);
            if (attachmentIndex >= 0) {
              attachmentToDelete = action.details.attachments[attachmentIndex];
              
              // Remove the attachment from the proposed action
              console.log(`Found attachment in main action at index ${attachmentIndex}, removing...`);
              action.details.attachments.splice(attachmentIndex, 1);
              // Mark the details field as modified for Mixed schema
              action.markModified('details');
              const saveResult = await action.save({ session });
              console.log(`Saved action ${action._id}, remaining attachments:`, saveResult.details.attachments?.length || 0);
            }
          }
          
          
        }
      } else {
        // Attachment not found in either email activities or proposed actions
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ 
          success: false, 
          message: 'Attachment not found or cannot be deleted' 
        });
        return;
      }
    }

    // Delete the physical file if we found the attachment
    if (attachmentToDelete && attachmentToDelete.filePath) {
      try {
        const result = await deleteEmailAttachment(
          attachmentToDelete.filePath,
          user.organization.toString()
        );
        console.log('result', result);
      } catch (error) {
        console.error('Error deleting physical attachment file:', error);
        // Continue - we've already removed it from the database
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ 
      success: true, 
      message: 'Attachment deleted successfully' 
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error in deleteAttachment:', error);
    res.status(500).json({ success: false, message: 'Server error deleting attachment' });
  }
};

/**
 * Get attachment metadata for a specific email activity
 */
export const getAttachmentMetadata = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const emailActivity = await EmailActivity.findOne({
      _id: activityId,
      organization: user.organization
    });

    if (!emailActivity) {
      res.status(404).json({ success: false, message: 'Email activity not found' });
      return;
    }

    // Return attachment metadata without file content
    const attachmentMetadata = emailActivity.emailAttachments?.map(att => ({
      id: att.id,
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      url: att.url,
      is_inline: att.is_inline || false,
      hasFile: !!att.filePath || !!att.grant_id
    })) || [];

    res.status(200).json({
      success: true,
      attachments: attachmentMetadata
    });

  } catch (error) {
    console.error('Error in getAttachmentMetadata:', error);
    res.status(500).json({ success: false, message: 'Server error getting attachment metadata' });
  }
};
