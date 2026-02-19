import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';

// Supported file types for email attachments (more permissive than playbook uploads)
const ALLOWED_EMAIL_ATTACHMENT_TYPES = {
  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  
  // Spreadsheets
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  
  // Presentations
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  
  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  
  // Audio/Video
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  
  // Other common formats
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.md': 'text/markdown',
  '.log': 'text/plain',
  '.ics': 'text/calendar',
  '.vcf': 'text/vcard'
};

// Maximum file size for email attachments (25MB as per Nylas documentation)
const MAX_EMAIL_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB in bytes

/**
 * Middleware to validate email attachment uploads
 */
export const validateEmailAttachment = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const file = req.file;

    // Check if file exists
    if (!file) {
      res.status(400).json({ 
        success: false, 
        message: 'No file uploaded. Please select a file to attach.' 
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_EMAIL_ATTACHMENT_SIZE) {
      res.status(400).json({ 
        success: false, 
        message: `File size exceeds the maximum limit of ${MAX_EMAIL_ATTACHMENT_SIZE / (1024 * 1024)}MB for email attachments.` 
      });
      return;
    }

    // Get file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Validate file extension
    if (!fileExtension) {
      res.status(400).json({ 
        success: false, 
        message: 'File must have a valid extension.' 
      });
      return;
    }

    if (!ALLOWED_EMAIL_ATTACHMENT_TYPES[fileExtension as keyof typeof ALLOWED_EMAIL_ATTACHMENT_TYPES]) {
      res.status(400).json({ 
        success: false, 
        message: `File type '${fileExtension}' is not supported for email attachments. Supported formats: ${Object.keys(ALLOWED_EMAIL_ATTACHMENT_TYPES).join(', ').toUpperCase()}.` 
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
      /[<>:"|?*]/,  // Invalid filename characters on Windows
      /^\./, // Hidden files starting with dot
      /\.(exe|bat|cmd|scr|pif|com|vbs|js|jar|app|deb|pkg|dmg)$/i // Executable files
    ];

    if (dangerousPatterns.some(pattern => pattern.test(file.originalname))) {
      res.status(400).json({ 
        success: false, 
        message: 'Filename contains invalid characters or is a potentially unsafe file type.' 
      });
      return;
    }

    // Filename length check
    if (file.originalname.length > 255) {
      res.status(400).json({ 
        success: false, 
        message: 'Filename is too long. Maximum length is 255 characters.' 
      });
      return;
    }

    // All validations passed, proceed to next middleware
    next();
  } catch (error) {
    console.error('Email attachment validation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error validating email attachment.' 
    });
  }
};

/**
 * Multer configuration for email attachment uploads
 */
export const emailAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EMAIL_ATTACHMENT_SIZE,
    files: 5, // Allow multiple files (up to 5 at once)
    fieldSize: 1024 * 1024, // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    // Basic file type checking at multer level
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (ALLOWED_EMAIL_ATTACHMENT_TYPES[fileExtension as keyof typeof ALLOWED_EMAIL_ATTACHMENT_TYPES]) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${fileExtension}' is not supported for email attachments.`));
    }
  }
});

/**
 * Error handler for email attachment upload errors
 */
export const handleEmailAttachmentUploadError = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        res.status(400).json({ 
          success: false, 
          message: `File size exceeds the maximum limit of ${MAX_EMAIL_ATTACHMENT_SIZE / (1024 * 1024)}MB for email attachments.` 
        });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({ 
          success: false, 
          message: 'Maximum of 5 files can be uploaded at once.' 
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
          message: `Email attachment upload error: ${error.message}` 
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
  console.error('Email attachment upload error:', error);
  res.status(500).json({ 
    success: false, 
    message: 'Error processing email attachment upload.' 
  });
};

// Export supported file types for reference
export const SUPPORTED_EMAIL_ATTACHMENT_TYPES = Object.keys(ALLOWED_EMAIL_ATTACHMENT_TYPES);
export const MAX_EMAIL_ATTACHMENT_SIZE_MB = MAX_EMAIL_ATTACHMENT_SIZE / (1024 * 1024);
