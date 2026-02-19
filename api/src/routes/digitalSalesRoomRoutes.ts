import express from 'express';
import * as digitalSalesRoomController from '../controllers/digitalSalesRoomController';
import { protect } from '../middleware/auth';
import multer from 'multer';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  }
});

// Admin routes (protected)
router.post('/', protect, digitalSalesRoomController.createSalesRoom);

// Pathway routes (protected) - must come before /:opportunityId to avoid conflict
router.post('/pathways', protect, digitalSalesRoomController.createPathway);
router.get('/pathways', protect, digitalSalesRoomController.getPathways);
router.post('/pathways/assign', protect, digitalSalesRoomController.assignPathwayToSalesRoom);
router.post('/pathways/default', protect, digitalSalesRoomController.setDefaultPathway);

// Routes with parameters - these come after specific routes
router.get('/:opportunityId', protect, digitalSalesRoomController.getSalesRoom);
router.post('/:salesRoomId/documents', protect, upload.single('file'), digitalSalesRoomController.uploadDocument);
router.post('/:salesRoomId/files', protect, digitalSalesRoomController.addPlaybookFileToSalesRoom);
router.post('/:salesRoomId/links', protect, digitalSalesRoomController.uploadLink);
router.delete('/:salesRoomId/links/:linkId', protect, digitalSalesRoomController.deleteLink);
router.delete('/:salesRoomId/documents/:documentId', protect, digitalSalesRoomController.deleteDocument);
router.get('/:salesRoomId/analytics', protect, digitalSalesRoomController.getSalesRoomAnalytics);

// Sales room level pathway progress routes
router.get('/:salesRoomId/sales-progress', protect, digitalSalesRoomController.getSalesRoomPathwayProgress);
router.post('/:salesRoomId/sales-progress', protect, digitalSalesRoomController.updateSalesRoomPathwayProgress);
router.post('/:salesRoomId/initialize-pathway', protect, digitalSalesRoomController.initializeSalesRoomPathwayProgress);

// Public routes (for visitors)
router.post('/public/:uniqueId/request-access', digitalSalesRoomController.requestAccess);
router.post('/public/:uniqueId/verify', digitalSalesRoomController.verifyAccess);
router.get('/public/:uniqueId', digitalSalesRoomController.getSalesRoomForVisitor);
router.get('/public/:salesRoomId/documents/:documentId', digitalSalesRoomController.getDocument);
router.post('/public/track/:documentAccessId', digitalSalesRoomController.trackDocumentInteraction);
router.post('/public/track/link/:linkId', digitalSalesRoomController.trackLinkInteraction);

// Pathway progress routes (for visitors)
router.get('/public/:salesRoomId/pathway-progress', digitalSalesRoomController.getSalesRoomPathwayProgressPublic);

export default router; 