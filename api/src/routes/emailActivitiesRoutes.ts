import express from 'express';
import { protect } from '../middleware/auth';
import {
  createDraft,
  scheduleEmail,
  sendEmail,
  getUserDrafts,
  getScheduledEmails,
  deleteEmailActivity,
  updateDraft,
  convertScheduledToDraft,
  getOpportunityEmailActivities,
} from '../controllers/emailActivitiesController';
import {
  uploadAttachments,
  downloadAttachment,
  deleteAttachment,
  getAttachmentMetadata
} from '../controllers/emailAttachmentController';
import { 
  emailAttachmentUpload,  
  validateEmailAttachment, 
  handleEmailAttachmentUploadError 
} from '../middleware/emailAttachmentValidation';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get all email activities for an opportunity
router.get('/opportunity/:id', getOpportunityEmailActivities);

// Draft routes
router.post('/drafts', createDraft);
router.put('/drafts/:id', updateDraft);
router.get('/drafts', getUserDrafts);


// Scheduled email routes
router.post('/schedule', scheduleEmail);
router.get('/scheduled', getScheduledEmails);
router.put('/scheduled/:id/convert-to-draft', convertScheduledToDraft);

// Attachment routes
router.post('/attachments/upload', 
  emailAttachmentUpload.array('attachments', 5), 
  handleEmailAttachmentUploadError, 
  uploadAttachments
);
router.get('/attachments/:activityId/:attachmentId', downloadAttachment);
router.get('/attachments/:activityId', getAttachmentMetadata);
router.delete('/attachments/:attachmentId', deleteAttachment);

// Send email route
router.post('/send', sendEmail);

// Delete email activity
router.delete('/:id', deleteEmailActivity);

export default router; 