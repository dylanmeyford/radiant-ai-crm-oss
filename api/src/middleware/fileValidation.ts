import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';

// Supported file types for playbook uploads (as specified in task requirements)
const ALLOWED_FILE_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.doc': 'application/msword',
  '.dot': 'application/msword',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.heif-sequence': 'image/heif-sequence',
  '.heic-sequence': 'image/heic-sequence',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
};

// Maximum file size (50MB as specified in requirements)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

/**
 * Middleware to validate file uploads for playbook documents
 * Validates file type and size according to task requirements
 */
export const validatePlaybookFile = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const file = req.file;

    // Check if file exists
    if (!file) {
      res.status(400).json({ 
        success: false, 
        message: 'No file uploaded. Please select a file to upload.' 
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      res.status(400).json({ 
        success: false, 
        message: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB. Please upload a smaller file.` 
      });
      return;
    }

    // Get file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Validate file extension
    if (!fileExtension) {
      res.status(400).json({ 
        success: false, 
        message: 'File must have a valid extension. Supported formats: PDF, DOCX, TXT, MD.' 
      });
      return;
    }

    if (!ALLOWED_FILE_TYPES[fileExtension as keyof typeof ALLOWED_FILE_TYPES]) {
      res.status(400).json({ 
        success: false, 
        message: `File type '${fileExtension}' is not supported. Supported formats: ${Object.keys(ALLOWED_FILE_TYPES).join(', ').toUpperCase()}.` 
      });
      return;
    }

    // Validate MIME type - some file types need flexible handling due to browser/system differences
    const isValidMimeType = (() => {
      switch (fileExtension) {
        case '.pdf':
          return file.mimetype === 'application/pdf';
        case '.docx':
          return file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 file.mimetype === 'application/octet-stream'; // Some systems send DOCX as octet-stream
        case '.doc':
        case '.dot':
          return file.mimetype === 'application/msword' ||
                 file.mimetype === 'application/octet-stream';
        case '.txt':
          return file.mimetype === 'text/plain' || 
                 file.mimetype === 'application/octet-stream';
        case '.csv':
          return file.mimetype === 'text/csv' ||
                 file.mimetype === 'application/csv' ||
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'application/octet-stream';
        case '.xls':
          return file.mimetype === 'application/vnd.ms-excel' ||
                 file.mimetype === 'application/octet-stream';
        case '.xlsx':
          return file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 file.mimetype === 'application/octet-stream';
        case '.ppt':
          return file.mimetype === 'application/vnd.ms-powerpoint' ||
                 file.mimetype === 'application/octet-stream';
        case '.pptx':
          return file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                 file.mimetype === 'application/octet-stream';
        case '.jpg':
        case '.jpeg':
          return file.mimetype === 'image/jpeg' ||
                 file.mimetype === 'application/octet-stream';
        case '.png':
          return file.mimetype === 'image/png' ||
                 file.mimetype === 'application/octet-stream';
        case '.gif':
          return file.mimetype === 'image/gif' ||
                 file.mimetype === 'application/octet-stream';
        case '.bmp':
          return file.mimetype === 'image/bmp' ||
                 file.mimetype === 'application/octet-stream';
        case '.tiff':
          return file.mimetype === 'image/tiff' ||
                 file.mimetype === 'application/octet-stream';
        case '.ico':
          return file.mimetype === 'image/x-icon' ||
                 file.mimetype === 'image/vnd.microsoft.icon' ||
                 file.mimetype === 'application/octet-stream';
        case '.webp':
          return file.mimetype === 'image/webp' ||
                 file.mimetype === 'application/octet-stream';
        case '.heic':
          return file.mimetype === 'image/heic' ||
                 file.mimetype === 'application/octet-stream';
        case '.heif':
          return file.mimetype === 'image/heif' ||
                 file.mimetype === 'application/octet-stream';
        case '.heif-sequence':
          return file.mimetype === 'image/heif-sequence' ||
                 file.mimetype === 'application/octet-stream';
        case '.heic-sequence':
          return file.mimetype === 'image/heic-sequence' ||
                 file.mimetype === 'application/octet-stream';
        case '.md':
          return file.mimetype === 'text/markdown' || 
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'application/octet-stream';
        case '.json':
          return file.mimetype === 'application/json' ||
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'application/octet-stream';
        case '.xml':
          return file.mimetype === 'application/xml' ||
                 file.mimetype === 'text/xml' ||
                 file.mimetype === 'application/octet-stream';
        case '.html':
          return file.mimetype === 'text/html' ||
                 file.mimetype === 'application/octet-stream';
        case '.css':
          return file.mimetype === 'text/css' ||
                 file.mimetype === 'application/octet-stream';
        case '.js':
          return file.mimetype === 'application/javascript' ||
                 file.mimetype === 'text/javascript' ||
                 file.mimetype === 'application/octet-stream';
        case '.ts':
          return file.mimetype === 'application/typescript' ||
                 file.mimetype === 'text/typescript' ||
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'application/octet-stream';
        default:
          return false;
      }
    })();

    if (!isValidMimeType) {
      res.status(400).json({ 
        success: false, 
        message: `File MIME type '${file.mimetype}' does not match expected type for ${fileExtension} files.` 
      });
      return;
    }

    // Validate filename
    if (!file.originalname || file.originalname.trim().length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'File must have a valid filename.' 
      });
      return;
    }

    // Check for potentially dangerous filename patterns
    const dangerousPatterns = [
      /\.\./,  // Path traversal attempts
      /[<>:"|?*]/,  // Invalid filename characters
      /^\./, // Hidden files starting with dot
    ];

    if (dangerousPatterns.some(pattern => pattern.test(file.originalname))) {
      res.status(400).json({ 
        success: false, 
        message: 'Filename contains invalid characters or patterns.' 
      });
      return;
    }

    // All validations passed, proceed to next middleware
    next();
  } catch (error) {
    console.error('File validation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error validating file upload.' 
    });
  }
};

/**
 * Multer configuration for playbook file uploads
 * Uses memory storage with size limits and error handling
 */
export const playbookFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow single file upload
    fieldSize: 1024 * 1024, // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    // Basic file type checking at multer level (additional validation in middleware)
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (ALLOWED_FILE_TYPES[fileExtension as keyof typeof ALLOWED_FILE_TYPES]) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${fileExtension}' is not supported.`));
    }
  }
});

/**
 * Error handler for multer file upload errors
 */
export const handleFileUploadError = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        res.status(400).json({ 
          success: false, 
          message: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.` 
        });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({ 
          success: false, 
          message: 'Only one file can be uploaded at a time.' 
        });
        return;
      case 'LIMIT_FIELD_VALUE':
        res.status(400).json({ 
          success: false, 
          message: 'Form field value too large.' 
        });
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        res.status(400).json({ 
          success: false, 
          message: 'Unexpected file field in upload.' 
        });
        return;
      default:
        res.status(400).json({ 
          success: false, 
          message: `File upload error: ${error.message}` 
        });
        return;
    }
  }

  // Handle custom file filter errors
  if (error.message && error.message.includes('not supported')) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
    return;
  }

  // Handle other upload errors
  console.error('File upload error:', error);
  res.status(500).json({ 
    success: false, 
    message: 'Error processing file upload.' 
  });
};

// Export file type configuration for use in other modules
export const SUPPORTED_FILE_TYPES = Object.keys(ALLOWED_FILE_TYPES);
export const MAX_UPLOAD_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024); 