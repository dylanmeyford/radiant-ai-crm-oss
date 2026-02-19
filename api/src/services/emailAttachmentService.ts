import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

// Configuration
const STORAGE_TYPE = process.env.STORAGE_TYPE || 's3';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// S3 Configuration
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
};

const S3_BUCKET = {
  local: process.env.S3_LOCAL_BUCKET || 'local-app-bucket',
  production: process.env.S3_PRODUCTION_BUCKET || 'production-app-bucket'
};

const BUCKET_NAME = isProduction ? S3_BUCKET.production : S3_BUCKET.local;
const s3Client = STORAGE_TYPE === 's3' ? new S3Client(s3Config) : null;

// Local storage configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  filePath?: string;
  url?: string;
  content_id?: string;
  content_disposition?: string;
  is_inline?: boolean;
  grant_id?: string;
}

export interface UploadAttachmentResult {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  filePath: string;
  url: string;
}

/**
 * Generate a unique filename while preserving the original extension
 */
const generateUniqueFilename = (originalFilename: string): string => {
  const ext = path.extname(originalFilename);
  const nameWithoutExt = path.basename(originalFilename, ext);
  const timestamp = Date.now();
  const uuid = uuidv4().substring(0, 8);
  return `${nameWithoutExt}_${timestamp}_${uuid}${ext}`;
};

/**
 * Get content type based on file extension
 */
const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: { [key: string]: string } = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Create directory for email attachments
 */
const createEmailAttachmentDirectory = async (orgId: string): Promise<string> => {
  if (STORAGE_TYPE === 'local') {
    const attachmentDir = path.join(UPLOAD_DIR, orgId, 'email-attachments');
    await fs.promises.mkdir(attachmentDir, { recursive: true });
    return attachmentDir;
  }
  // For S3, return the key prefix
  return `${orgId}/email-attachments`;
};

/**
 * Upload an email attachment to storage
 */
export const uploadEmailAttachment = async (
  fileBuffer: Buffer,
  filename: string,
  organizationId: string
): Promise<UploadAttachmentResult> => {
  try {
    const uniqueFilename = generateUniqueFilename(filename);
    const attachmentId = uuidv4();
    const contentType = getContentType(filename);

    if (STORAGE_TYPE === 'local') {
      // Local file storage
      const attachmentDir = await createEmailAttachmentDirectory(organizationId);
      const filePath = path.join(attachmentDir, uniqueFilename);
      
      await fs.promises.writeFile(filePath, fileBuffer);
      
      // Generate relative path for the database
      const dbPath = path.join(organizationId, 'email-attachments', uniqueFilename);
      
      // Generate URL for accessing the file
      const fileUrl = `/api/email-activities/attachments/${attachmentId}`;
      
      return {
        id: attachmentId,
        filename: filename,
        contentType: contentType,
        size: fileBuffer.length,
        filePath: dbPath,
        url: fileUrl
      };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Create S3 key (path)
      const s3Key = `${organizationId}/email-attachments/${uniqueFilename}`;
      
      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          attachmentId: attachmentId,
          originalFilename: filename,
          organizationId: organizationId
        }
      }));
      
      // Generate URL for accessing the file
      const fileUrl = `/api/email-activities/attachments/${attachmentId}`;
      
      return {
        id: attachmentId,
        filename: filename,
        contentType: contentType,
        size: fileBuffer.length,
        filePath: s3Key,
        url: fileUrl
      };
    }
  } catch (error) {
    console.error('Error uploading email attachment:', error);
    throw new Error('Failed to upload email attachment');
  }
};

/**
 * Get an email attachment from storage
 */
export const getEmailAttachment = async (
  filePath: string,
  organizationId: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> => {
  try {
    if (STORAGE_TYPE === 'local') {
      // Local file storage
      const fullPath = path.join(UPLOAD_DIR, filePath);
      const buffer = await readFile(fullPath);
      const filename = path.basename(filePath);
      const contentType = getContentType(filename);
      
      return {
        buffer,
        contentType,
        filename
      };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath
      }));
      
      if (!response.Body) {
        throw new Error('File not found in S3');
      }
      
      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      const filename = path.basename(filePath);
      const contentType = response.ContentType || getContentType(filename);
      
      return {
        buffer,
        contentType,
        filename
      };
    }
  } catch (error) {
    console.error('Error getting email attachment:', error);
    throw new Error('Failed to retrieve email attachment');
  }
};

/**
 * Delete an email attachment from storage
 */
export const deleteEmailAttachment = async (
  filePath: string,
  organizationId: string
): Promise<void> => {
  try {
    if (STORAGE_TYPE === 'local') {
      // Local file storage
      const fullPath = path.join(UPLOAD_DIR, filePath);
      await unlink(fullPath);
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath
      }));
    }
  } catch (error) {
    console.error('Error deleting email attachment:', error);
    // Don't throw error for cleanup operations - log and continue
  }
};

/**
 * Clean up multiple email attachments
 */
export const cleanupEmailAttachments = async (
  attachments: EmailAttachment[],
  organizationId: string
): Promise<void> => {
  const cleanupPromises = attachments
    .filter(att => att.filePath) // Only cleanup attachments with file paths (not received emails)
    .map(att => deleteEmailAttachment(att.filePath!, organizationId));
  
  await Promise.allSettled(cleanupPromises);
};

/**
 * Clean up attachments from a proposed action
 */
export const cleanupProposedActionAttachments = async (
  proposedAction: any,
  organizationId: string
): Promise<void> => {
  const attachmentsToCleanup: EmailAttachment[] = [];
  
  // Collect attachments from main action details
  if (proposedAction.details && proposedAction.details.attachments && Array.isArray(proposedAction.details.attachments)) {
    attachmentsToCleanup.push(...proposedAction.details.attachments);
  }
  
  // Collect attachments from sub-actions
  if (proposedAction.subActions && Array.isArray(proposedAction.subActions)) {
    for (const subAction of proposedAction.subActions) {
      if (subAction.details && subAction.details.attachments && Array.isArray(subAction.details.attachments)) {
        attachmentsToCleanup.push(...subAction.details.attachments);
      }
    }
  }
  
  // Clean up all collected attachments
  if (attachmentsToCleanup.length > 0) {
    console.log(`[ATTACHMENT-CLEANUP] Cleaning up ${attachmentsToCleanup.length} attachments from proposed action ${proposedAction._id}`);
    await cleanupEmailAttachments(attachmentsToCleanup, organizationId);
  }
};

export default {
  uploadEmailAttachment,
  getEmailAttachment,
  deleteEmailAttachment,
  cleanupEmailAttachments,
  cleanupProposedActionAttachments
};
