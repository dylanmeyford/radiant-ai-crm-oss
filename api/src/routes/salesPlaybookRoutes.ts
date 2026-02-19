import express from 'express';
import { 
  createPlaybookItem, 
  getPlaybookItems, 
  getPlaybookItem, 
  updatePlaybookItem, 
  deletePlaybookItem,
  searchPlaybookItems,
  uploadFileToPlaybook,
  listPlaybookFiles,
  downloadPlaybookFile,
  updatePlaybookFile,
  deletePlaybookFile
} from '../controllers/salesPlaybookController';
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

// All routes are protected
router.use(protect);

// Sales Playbook routes
router.post('/', createPlaybookItem);
router.get('/', getPlaybookItems);
router.get('/search', searchPlaybookItems);
router.get('/files', listPlaybookFiles);
router.post('/:id/files', upload.single('file'), uploadFileToPlaybook);
router.get('/:playbookId/files/:fileId/download', downloadPlaybookFile);
router.put('/:playbookId/files/:fileId', upload.single('file'), updatePlaybookFile);
router.delete('/:playbookId/files/:fileId', deletePlaybookFile);
router.get('/:id', getPlaybookItem);
router.put('/:id', updatePlaybookItem);
router.delete('/:id', deletePlaybookItem);

export default router; 