import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Determine if we're using S3 or local storage
const STORAGE_TYPE = process.env.STORAGE_TYPE || 's3'; // 's3' or 'local'

// S3 Configuration
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
};

// S3 bucket names for different environments
const S3_BUCKET = {
  local: process.env.S3_LOCAL_BUCKET || 'local-app-bucket',
  production: process.env.S3_PRODUCTION_BUCKET || 'production-app-bucket'
};

// Get current environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Select appropriate bucket based on environment
const BUCKET_NAME = isProduction ? S3_BUCKET.production : S3_BUCKET.local;

// Initialize S3 client if using S3
const s3Client = STORAGE_TYPE === 's3' ? new S3Client(s3Config) : null;

// Promisify the fs functions for local storage
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

// Base upload directory for local storage
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Create upload directory if it doesn't exist (for local storage)
const initializeStorage = async (): Promise<void> => {
  try {
    if (STORAGE_TYPE === 'local') {
    if (!fs.existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      }
    } else {
      // For S3, no initialization is needed, but we can validate the connection
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      console.log(`S3 storage initialized with bucket: ${BUCKET_NAME} (${isProduction ? 'production' : 'local'} environment)`);
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
    throw new Error('Failed to initialize storage system');
  }
};

// Generate a unique filename
const generateUniqueFilename = (originalName: string): string => {
  const ext = path.extname(originalName);
  const uniqueId = uuidv4();
  return `${uniqueId}${ext}`;
};

// Create a subdirectory for an organization (local storage only)
const createOrgDirectory = async (orgId: string): Promise<string> => {
  if (STORAGE_TYPE === 'local') {
  const orgDir = path.join(UPLOAD_DIR, orgId);
  if (!fs.existsSync(orgDir)) {
    await mkdir(orgDir, { recursive: true });
  }
  return orgDir;
  }
  return orgId; // For S3, just return the orgId as part of the key prefix
};

// Create a directory for a sales room (local storage only)
const createSalesRoomDirectory = async (orgId: string, salesRoomId: string): Promise<string> => {
  if (STORAGE_TYPE === 'local') {
  const orgDir = await createOrgDirectory(orgId);
  const salesRoomDir = path.join(orgDir, 'salesrooms', salesRoomId);
  if (!fs.existsSync(salesRoomDir)) {
    await mkdir(salesRoomDir, { recursive: true });
  }
  return salesRoomDir;
  }
  return `${orgId}/salesrooms/${salesRoomId}`; // For S3, return the key prefix
};

// Create a directory for a meeting's media (local storage only)
const createMeetingMediaDirectory = async (orgId: string, meetingId: string): Promise<string> => {
  if (STORAGE_TYPE === 'local') {
    const orgDir = await createOrgDirectory(orgId); // Ensures org directory exists
    const meetingMediaDir = path.join(orgDir, 'meetings', meetingId);
    if (!fs.existsSync(meetingMediaDir)) {
      await mkdir(meetingMediaDir, { recursive: true });
    }
    return meetingMediaDir;
  }
  return `${orgId}/meetings/${meetingId}`; // For S3, return the key prefix
};

// Create a directory for a playbook's files (local storage only)
const createPlaybookDirectory = async (orgId: string, playbookId: string): Promise<string> => {
  if (STORAGE_TYPE === 'local') {
    const orgDir = await createOrgDirectory(orgId); // Ensures org directory exists
    const playbookDir = path.join(orgDir, 'playbooks', playbookId);
    if (!fs.existsSync(playbookDir)) {
      await mkdir(playbookDir, { recursive: true });
    }
    return playbookDir;
  }
  return `${orgId}/playbooks/${playbookId}`; // For S3, return the key prefix
};

/**
 * Save a file to the storage system
 */
export const saveFile = async (
  fileBuffer: Buffer,
  fileName: string,
  orgId: string,
  salesRoomId: string
): Promise<{ filePath: string, url: string }> => {
  try {
    // Generate unique filename
    const uniqueFileName = generateUniqueFilename(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // Local file storage
      // Create target directory
      const salesRoomDir = await createSalesRoomDirectory(orgId, salesRoomId);
    
    // Create full file path
    const filePath = path.join(salesRoomDir, uniqueFileName);
    
    // Write file to storage
    await writeFile(filePath, fileBuffer);
    
    // Generate relative path for the database
    const dbPath = path.join(orgId, 'salesrooms', salesRoomId, uniqueFileName);
    
    // Generate URL for accessing the file
    const fileUrl = `/api/sales-rooms/${salesRoomId}/documents/${uniqueFileName}`;
    
    return {
      filePath: dbPath,
      url: fileUrl
    };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Create S3 key (path)
      const s3Key = `${orgId}/salesrooms/${salesRoomId}/${uniqueFileName}`;
      
      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: getContentType(fileName)
      }));
      
      // Generate URL for accessing the file
      // In a real implementation, you might use CloudFront or signed URLs
      const fileUrl = isProduction
        ? `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
        : `/api/sales-rooms/${salesRoomId}/documents/${uniqueFileName}`;
      
      return {
        filePath: s3Key,
        url: fileUrl
      };
    }
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
};

/**
 * Upload a file to the storage system (specifically for sales playbook files)
 */
export const upload = async (
  fileBuffer: Buffer,
  fileName: string,
  orgId: string,
  playbookId: string
): Promise<{ filePath: string, url: string, mimeType: string }> => {
  try {
    // Generate unique filename
    const uniqueFileName = generateUniqueFilename(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // Local file storage for playbooks
      // Create target directory for playbooks
      const playbookDir = await createPlaybookDirectory(orgId, playbookId);
    
      // Create full file path
      const filePath = path.join(playbookDir, uniqueFileName);
    
      // Write file to storage
      await writeFile(filePath, fileBuffer);
    
      // Generate relative path for the database
      const dbPath = path.join(orgId, 'playbooks', playbookId, uniqueFileName);
    
      // Generate URL for accessing the file
      const fileUrl = `/api/sales-playbook/${playbookId}/files/${uniqueFileName}`;
    
      return {
        filePath: dbPath,
        url: fileUrl,
        mimeType: getContentType(fileName)
      };
    } else {
      // S3 Storage for playbooks
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Create S3 key (path) for playbooks
      const s3Key = `${orgId}/playbooks/${playbookId}/${uniqueFileName}`;
      
      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: getContentType(fileName)
      }));
      
      // Generate URL for accessing the file
      const fileUrl = isProduction
        ? `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
        : `/api/sales-playbook/${playbookId}/files/${uniqueFileName}`;
      
      return {
        filePath: s3Key,
        url: fileUrl,
        mimeType: getContentType(fileName)
      };
    }
  } catch (error) {
    console.error('Error uploading playbook file:', error);
    throw new Error('Failed to upload playbook file');
  }
};

/**
 * Save a meeting media file (recording or transcript) to the storage system
 */
export const saveMeetingMedia = async (
  fileBuffer: Buffer,
  fileName: string, // Original filename, e.g., 'transcript.txt' or 'recording.mp3'
  orgId: string,
  meetingId: string 
): Promise<{ filePath: string, url: string }> => {
  try {
    const uniqueFileName = generateUniqueFilename(fileName);

    if (STORAGE_TYPE === 'local') {
      const meetingMediaDir = await createMeetingMediaDirectory(orgId, meetingId);
      const localFilePath = path.join(meetingMediaDir, uniqueFileName);
      await writeFile(localFilePath, fileBuffer);
      
      // Relative path for database
      const dbPath = path.join(orgId, 'meetings', meetingId, uniqueFileName);
      // For local, we might not serve these directly via a generic URL like sales room docs
      // The URL might be constructed differently or not used if files are only accessed via backend
      const fileUrl = `/uploads/${dbPath}`; // Example URL, adjust as needed

      return {
        filePath: dbPath,
        url: fileUrl 
      };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      const s3Key = `${orgId}/meetings/${meetingId}/${uniqueFileName}`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: getContentType(fileName) // Ensure getContentType handles audio/transcript types
      }));
      
      // Direct S3 URL
      const fileUrl = `https://${BUCKET_NAME}.s3.${s3Config.region}.amazonaws.com/${s3Key}`;
      
      return {
        filePath: s3Key, // Store the S3 key
        url: fileUrl
      };
    }
  } catch (error) {
    console.error('Error saving meeting media:', error);
    throw new Error('Failed to save meeting media');
  }
};

/**
 * Save a meeting media file using streaming (memory-efficient for large files)
 * Accepts a readable stream instead of a buffer to prevent memory issues
 * Uses proper multipart uploads for large files and buffering for small files
 * to avoid S3 InvalidChunkSizeError
 */
export const saveMeetingMediaStream = async (
  fileStream: Readable,
  fileName: string, // Original filename, e.g., 'transcript.txt' or 'recording.mp4'
  orgId: string,
  meetingId: string,
  contentLength?: number // Optional content length for logging
): Promise<{ filePath: string, url: string }> => {
  try {
    const uniqueFileName = generateUniqueFilename(fileName);
    
    if (contentLength) {
      const sizeInMB = contentLength / (1024 * 1024);
      console.log(`Streaming upload of ${fileName}: ${sizeInMB.toFixed(2)} MB`);
    }

    if (STORAGE_TYPE === 'local') {
      const meetingMediaDir = await createMeetingMediaDirectory(orgId, meetingId);
      const localFilePath = path.join(meetingMediaDir, uniqueFileName);
      
      // Stream directly to file system
      const writeStream = fs.createWriteStream(localFilePath);
      await pipeline(fileStream, writeStream);
      
      // Relative path for database
      const dbPath = path.join(orgId, 'meetings', meetingId, uniqueFileName);
      const fileUrl = `/uploads/${dbPath}`;

      return {
        filePath: dbPath,
        url: fileUrl 
      };
    } else {
      // S3 Storage with robust streaming
      if (!s3Client) throw new Error('S3 client not initialized');
      
      const s3Key = `${orgId}/meetings/${meetingId}/${uniqueFileName}`;
      
      // Use multipart upload for files larger than 10MB or when contentLength is unknown
      // This avoids chunk size issues with streaming
      const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB
      
      if (!contentLength || contentLength > MULTIPART_THRESHOLD) {
        console.log(`Using multipart upload for ${fileName} (size: ${contentLength ? `${(contentLength / 1024 / 1024).toFixed(2)}MB` : 'unknown'})`);
        return await uploadStreamMultipart(s3Client, BUCKET_NAME, s3Key, fileStream, getContentType(fileName));
      } else {
        // For smaller files, buffer the entire stream to avoid chunk size issues
        console.log(`Using buffered upload for ${fileName} (${(contentLength / 1024 / 1024).toFixed(2)}MB)`);
        const chunks: Buffer[] = [];
        
        for await (const chunk of fileStream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        
        const buffer = Buffer.concat(chunks);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: buffer,
          ContentType: getContentType(fileName),
          ContentLength: buffer.length
        }));
        
        const fileUrl = `https://${BUCKET_NAME}.s3.${s3Config.region}.amazonaws.com/${s3Key}`;
        
        return {
          filePath: s3Key,
          url: fileUrl
        };
      }
    }
  } catch (error) {
    console.error('Error saving meeting media with streaming:', error);
    throw new Error('Failed to save meeting media with streaming');
  }
};

/**
 * Read a file from storage - might be deprecated.
 */
export const getFile = async (
  orgId: string,
  salesRoomId: string,
  fileName: string
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> => {
  try {
    // Extract original file name from UUID filename if possible
    const originalName = fileName.includes('-') && fileName.includes('.') 
      ? fileName.substring(fileName.lastIndexOf('-') + 1) 
      : fileName;
    
    const contentType = getContentType(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // Local file storage
      const filePath = path.join(UPLOAD_DIR, orgId, 'salesrooms', salesRoomId, fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }
      
      const buffer = await readFile(filePath);
      return {
        buffer,
        fileName: originalName,
        contentType
      };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Construct S3 key
      const s3Key = `${orgId}/salesrooms/${salesRoomId}/${fileName}`;
      
      // Get file from S3
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      }));
      
      // Get content type from response or determine from filename
      const detectedContentType = response.ContentType || contentType;
      
      // Convert stream to buffer
      if (!response.Body) {
        throw new Error('File not found');
      }
      
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
      
      return {
        buffer,
        fileName: originalName,
        contentType: detectedContentType
      };
    }
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error('Failed to read file');
  }
};

/**
 * Read any file from storage using the exact filePath stored in the document
 * This is a generic method that works for files from any source (sales rooms, playbooks, etc.)
 */
export const getFileByPath = async (
  filePath: string
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> => {
  try {
    // Extract filename from path
    const fileName = path.basename(filePath);
    
    // Extract original file name from UUID filename if possible
    const originalName = fileName.includes('-') && fileName.includes('.') 
      ? fileName.substring(fileName.lastIndexOf('-') + 1) 
      : fileName;
    
    const contentType = getContentType(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // For local storage, construct full path
      const fullPath = path.join(UPLOAD_DIR, filePath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error('File not found');
      }
      
      const buffer = await readFile(fullPath);
      return {
        buffer,
        fileName: originalName,
        contentType
      };
    } else {
      // For S3 storage, use the filePath directly as the S3 key
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Get file from S3 using the stored filePath as the key
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath
      }));
      
      // Get content type from response or determine from filename
      const detectedContentType = response.ContentType || contentType;
      
      // Convert stream to buffer
      if (!response.Body) {
        throw new Error('File not found');
      }
      
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
      
      return {
        buffer,
        fileName: originalName,
        contentType: detectedContentType
      };
    }
  } catch (error) {
    console.error('Error reading file by path:', error);
    throw new Error('Failed to read file');
  }
};

/**
 * Read a meeting media file (recording or transcript) from storage
 */
export const getMeetingMediaFile = async (
  orgId: string,
  meetingId: string, // This corresponds to CalendarActivity._id
  fileName: string  // This is the unique filename stored (e.g., in CalendarActivity.transcriptFile)
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> => {
  try {
    // Extract original file name from UUID filename if possible - assuming it might be useful
    // This logic might need adjustment if original names aren't embedded or needed
    const originalName = fileName.includes('-') && fileName.includes('.') 
      ? fileName.substring(fileName.lastIndexOf('-') + 1) 
      : fileName;
    
    const contentType = getContentType(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // Local file storage
      const filePath = path.join(UPLOAD_DIR, orgId, 'meetings', meetingId, fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new Error('Meeting media file not found at path: ' + filePath);
      }
      
      const buffer = await readFile(filePath);
      return {
        buffer,
        fileName: originalName, // Return the original derived name or the unique name
        contentType
      };
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Construct S3 key
      const s3Key = `${fileName}`;
      
      // Get file from S3
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      }));
      
      // Get content type from response or determine from filename
      const detectedContentType = response.ContentType || contentType;
      
      if (!response.Body) {
        throw new Error('Meeting media file not found in S3');
      }
      
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any; // Assuming response.Body is a readable stream
      
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
      
      return {
        buffer,
        fileName: originalName, // Return the original derived name or the unique name
        contentType: detectedContentType
      };
    }
  } catch (error) {
    console.error('Error reading meeting media file:', error);
    if (error instanceof Error && error.message.includes('not found')) {
        throw error; // Re-throw not found errors to be handled by controller
    }
    throw new Error('Failed to read meeting media file');
  }
};

/**
 * Generate a pre-signed URL for meeting media files (recording or transcript)
 * @param orgId - Organization ID
 * @param meetingId - Meeting/CalendarActivity ID
 * @param fileName - The saved file path/name
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Promise<string> - The pre-signed URL or local URL
 */
export const generateMeetingMediaPresignedUrl = async (
  orgId: string,
  meetingId: string,
  fileName: string,
  expiresIn: number = 3600
): Promise<string> => {
  try {
    if (STORAGE_TYPE === 'local') {
      // For local storage, return a local URL path
      return `/uploads/${orgId}/meetings/${meetingId}/${fileName}`;
    } else {
      // S3 Storage - generate pre-signed URL
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // The fileName should already be the full S3 key
      const s3Key = fileName;
      
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });
      
      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn
      });
      
      return presignedUrl;
    }
  } catch (error) {
    console.error('Error generating pre-signed URL for meeting media:', error);
    throw new Error('Failed to generate pre-signed URL for meeting media');
  }
};

/**
 * Read a playbook file from storage
 */
export const getPlaybookFile = async (
  orgId: string,
  playbookId: string,
  fileName: string
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> => {
  try {
    // Extract original file name from UUID filename if possible
    const originalName = fileName.includes('-') && fileName.includes('.') 
      ? fileName.substring(fileName.lastIndexOf('-') + 1) 
      : fileName;
    
    const contentType = getContentType(fileName);
    
    if (STORAGE_TYPE === 'local') {
      // Local file storage for playbooks
      const filePath = path.join(UPLOAD_DIR, orgId, 'playbooks', playbookId, fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }
      
      const buffer = await readFile(filePath);
      return {
        buffer,
        fileName: originalName,
        contentType
      };
    } else {
      // S3 Storage for playbooks
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Construct S3 key for playbooks
      const s3Key = `${orgId}/playbooks/${playbookId}/${fileName}`;
      
      // Get file from S3
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      }));
      
      // Get content type from response or determine from filename
      const detectedContentType = response.ContentType || contentType;
      
      // Convert stream to buffer
      if (!response.Body) {
        throw new Error('File not found');
      }
      
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
      
      return {
        buffer,
        fileName: originalName,
        contentType: detectedContentType
      };
    }
  } catch (error) {
    console.error('Error reading playbook file:', error);
    throw new Error('Failed to read playbook file');
  }
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (
  orgId: string,
  salesRoomId: string,
  fileName: string
): Promise<boolean> => {
  try {
    if (STORAGE_TYPE === 'local') {
      // Local file storage
    const filePath = path.join(UPLOAD_DIR, orgId, 'salesrooms', salesRoomId, fileName);
    
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    await unlink(filePath);
    return true;
    } else {
      // S3 Storage
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Construct S3 key
      const s3Key = `${orgId}/salesrooms/${salesRoomId}/${fileName}`;
      
      // Delete from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      }));
      
      return true;
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Delete a playbook file from storage
 */
export const deletePlaybookFile = async (
  orgId: string,
  playbookId: string,
  fileName: string
): Promise<boolean> => {
  try {
    if (STORAGE_TYPE === 'local') {
      // Local file storage for playbooks
      const filePath = path.join(UPLOAD_DIR, orgId, 'playbooks', playbookId, fileName);
      
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      await unlink(filePath);
      return true;
    } else {
      // S3 Storage for playbooks
      if (!s3Client) throw new Error('S3 client not initialized');
      
      // Construct S3 key for playbooks
      const s3Key = `${orgId}/playbooks/${playbookId}/${fileName}`;
      
      // Delete from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      }));
      
      return true;
    }
  } catch (error) {
    console.error('Error deleting playbook file:', error);
    throw new Error('Failed to delete playbook file');
  }
};

/**
 * Helper function to determine content type from filename
 */
const getContentType = (fileName: string): string => {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    // Document types
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.dot': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    // Image types
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
    // Audio types (existing ones)
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.vtt': 'text/vtt'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Helper function for multipart upload to S3
 * Handles streaming uploads with proper chunk sizing to avoid InvalidChunkSizeError
 */
async function uploadStreamMultipart(
  s3Client: S3Client,
  bucket: string,
  key: string,
  stream: Readable,
  contentType: string
): Promise<{ filePath: string, url: string }> {
  const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum part size for multipart
  let uploadId: string | undefined;
  
  try {
    // Initialize multipart upload
    const createMultipartUploadResponse = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType
      })
    );
    
    uploadId = createMultipartUploadResponse.UploadId;
    if (!uploadId) {
      throw new Error('Failed to initialize multipart upload');
    }
    
    console.log(`Started multipart upload for ${key} with upload ID: ${uploadId}`);
    
    const parts: { ETag: string; PartNumber: number }[] = [];
    let partNumber = 1;
    let buffer = Buffer.alloc(0);
    
    // Process stream in chunks
    for await (const chunk of stream) {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, chunkBuffer]);
      
      // Upload when we have enough data (except for the last part)
      if (buffer.length >= MIN_CHUNK_SIZE) {
        console.log(`Uploading part ${partNumber} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
        
        const uploadPartResponse = await s3Client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: buffer
          })
        );
        
        if (!uploadPartResponse.ETag) {
          throw new Error(`Failed to upload part ${partNumber}`);
        }
        
        parts.push({
          ETag: uploadPartResponse.ETag,
          PartNumber: partNumber
        });
        
        partNumber++;
        buffer = Buffer.alloc(0);
      }
    }
    
    // Upload final part (can be smaller than MIN_CHUNK_SIZE)
    if (buffer.length > 0) {
      console.log(`Uploading final part ${partNumber} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
      
      const uploadPartResponse = await s3Client.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: buffer
        })
      );
      
      if (!uploadPartResponse.ETag) {
        throw new Error(`Failed to upload final part ${partNumber}`);
      }
      
      parts.push({
        ETag: uploadPartResponse.ETag,
        PartNumber: partNumber
      });
    }
    
    // Complete multipart upload
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
        }
      })
    );
    
    console.log(`Completed multipart upload for ${key} with ${parts.length} parts`);
    
    const fileUrl = `https://${bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
    
    return {
      filePath: key,
      url: fileUrl
    };
    
  } catch (error) {
    // Abort multipart upload on error
    if (uploadId) {
      try {
        await s3Client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId
          })
        );
        console.log(`Aborted multipart upload ${uploadId} for ${key}`);
      } catch (abortError) {
        console.error(`Failed to abort multipart upload ${uploadId}:`, abortError);
      }
    }
    
    console.error(`Multipart upload failed for ${key}:`, error);
    throw error;
  }
}

// Initialize storage on module load
initializeStorage().catch(console.error);

export default {
  saveFile,
  upload,
  saveMeetingMedia,
  getFile,
  getFileByPath,
  getMeetingMediaFile,
  getPlaybookFile,
  deleteFile,
  deletePlaybookFile,
  initializeStorage
}; 