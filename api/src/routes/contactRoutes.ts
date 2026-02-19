import express from 'express';
import { 
  createContact, 
  getProspectContacts,
  getOrganizationContacts,
  getContact, 
  updateContact, 
  deleteContact,
  addContactEmail,
  updateContactEmail,
  deleteContactEmail,
  setContactPrimaryEmail
} from '../controllers/contactController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Contact routes
router.post('/', createContact);
router.get('/organization', getOrganizationContacts);
router.get('/prospect/:prospectId', getProspectContacts);
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);

// Email management routes
router.post('/:contactId/emails', addContactEmail);
router.put('/:contactId/emails/:emailId', updateContactEmail);
router.delete('/:contactId/emails/:emailId', deleteContactEmail);
router.post('/:contactId/emails/:emailId/set-primary', setContactPrimaryEmail);

export default router; 