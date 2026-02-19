import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand, 
  GetObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';

interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

interface UploadResult {
  key: string;
  url: string;
  fileName: string;
}

interface FileUploadOptions {
  contentType?: string;
  expires?: number; // expiration time in seconds for pre-signed URLs
}

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  /**
   * Upload a file to S3
   * @param fileBuffer - The file buffer to upload
   * @param key - The S3 key (path) where the file should be stored
   * @param options - Upload options including content type
   * @returns Promise with upload result
   */
  async uploadFile(
    fileBuffer: Buffer, 
    key: string, 
    options: FileUploadOptions = {}
  ): Promise<UploadResult> {
    try {
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: options.contentType || 'application/octet-stream'
      });

      await this.s3Client.send(putCommand);

      // Generate a pre-signed URL for accessing the file
      const url = await this.generatePresignedUrl(key, 'get', options.expires);

      return {
        key,
        url,
        fileName: this.extractFileNameFromKey(key)
      };
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from S3
   * @param key - The S3 key of the file to delete
   * @returns Promise<boolean> - true if deletion was successful
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(deleteCommand);
      return true;
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a pre-signed URL for S3 operations
   * @param key - The S3 key for the file
   * @param operation - The operation type ('get', 'put', 'delete')
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   * @returns Promise<string> - The pre-signed URL
   */
  async generatePresignedUrl(
    key: string, 
    operation: 'get' | 'put' | 'delete' = 'get',
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      let command;
      
      switch (operation) {
        case 'put':
          command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          break;
        case 'delete':
          command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          break;
        case 'get':
        default:
          command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          break;
      }

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn
      });

      return presignedUrl;
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      throw new Error(`Failed to generate pre-signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a unique S3 key for file upload
   * @param orgId - Organization ID
   * @param folder - Folder type ('playbooks', 'salesrooms', etc.)
   * @param resourceId - Resource ID (playbookId, salesRoomId, etc.)
   * @param fileName - Original file name
   * @returns string - The generated S3 key
   */
  generateUniqueKey(orgId: string, folder: string, resourceId: string, fileName: string): string {
    const fileExtension = fileName.split('.').pop();
    const uniqueId = uuidv4();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    return `${orgId}/${folder}/${resourceId}/${uniqueId}_${sanitizedFileName}`;
  }

  /**
   * Extract file name from S3 key
   * @param key - The S3 key
   * @returns string - The extracted file name
   */
  private extractFileNameFromKey(key: string): string {
    const parts = key.split('/');
    const lastPart = parts[parts.length - 1];
    
    // Remove UUID prefix if present (format: uuid_filename.ext)
    if (lastPart.includes('_')) {
      return lastPart.substring(lastPart.indexOf('_') + 1);
    }
    
    return lastPart;
  }

  /**
   * Check if a file exists in S3
   * @param key - The S3 key to check
   * @returns Promise<boolean> - true if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   * @param key - The S3 key
   * @returns Promise with file metadata
   */
  async getFileMetadata(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag
      };
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * File processing pipeline service for playbook uploads
 * Orchestrates validation, upload, and metadata processing
 */
export class FileUploadService {
  private s3Service: S3Service;
  
  constructor(s3Service: S3Service) {
    this.s3Service = s3Service;
  }

  /**
   * Process a playbook file upload through the complete pipeline
   * @param file - Multer file object
   * @param orgId - Organization ID
   * @param playbookId - Playbook ID
   * @param options - Upload options
   * @returns Promise with processed file result
   */
  async processPlaybookFileUpload(
    file: Express.Multer.File,
    orgId: string,
    playbookId: string,
    options: FileUploadOptions = {}
  ): Promise<{
    s3Key: string;
    presignedUrl: string;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
    metadata: {
      contentType: string;
      uploadTimestamp: Date;
      fileExtension: string;
    };
  }> {
    try {
      // Step 1: Validate file (this should be done by middleware, but double-check)
      this.validateFileForPlaybook(file);

      // Step 2: Generate unique S3 key
      const s3Key = this.s3Service.generateUniqueKey(
        orgId, 
        'playbooks', 
        playbookId, 
        file.originalname
      );

      // Step 3: Determine content type
      const contentType = this.getContentTypeFromFile(file);

      // Step 4: Upload to S3
      const uploadResult = await this.s3Service.uploadFile(
        file.buffer,
        s3Key,
        {
          contentType,
          expires: options.expires || 3600 // 1 hour default
        }
      );

      // Step 5: Generate metadata
      const metadata = {
        contentType,
        uploadTimestamp: new Date(),
        fileExtension: path.extname(file.originalname).toLowerCase()
      };

      return {
        s3Key: uploadResult.key,
        presignedUrl: uploadResult.url,
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        metadata
      };
    } catch (error) {
      console.error('File upload pipeline error:', error);
      throw new Error(`Failed to process file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a playbook file and clean up associated resources
   * @param s3Key - The S3 key of the file to delete
   * @returns Promise<boolean> - true if deletion was successful
   */
  async deletePlaybookFile(s3Key: string): Promise<boolean> {
    try {
      return await this.s3Service.deleteFile(s3Key);
    } catch (error) {
      console.error('File deletion pipeline error:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a new presigned URL for an existing file
   * @param s3Key - The S3 key of the file
   * @param operation - The operation type
   * @param expiresIn - Expiration time in seconds
   * @returns Promise<string> - The presigned URL
   */
  async generateFileAccessUrl(
    s3Key: string, 
    operation: 'get' | 'put' | 'delete' = 'get',
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      return await this.s3Service.generatePresignedUrl(s3Key, operation, expiresIn);
    } catch (error) {
      console.error('Presigned URL generation error:', error);
      throw new Error(`Failed to generate access URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file metadata from S3
   * @param s3Key - The S3 key
   * @returns Promise with file metadata
   */
  async getFileMetadata(s3Key: string) {
    try {
      return await this.s3Service.getFileMetadata(s3Key);
    } catch (error) {
      console.error('File metadata retrieval error:', error);
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate file for playbook upload (backup validation)
   * @param file - Multer file object
   * @throws Error if file is invalid
   */
  private validateFileForPlaybook(file: Express.Multer.File): void {
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const maxFileSize = 50 * 1024 * 1024; // 50MB

    if (!file) {
      throw new Error('No file provided');
    }

    if (file.size > maxFileSize) {
      throw new Error(`File size exceeds maximum limit of 50MB`);
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      throw new Error(`File type '${fileExtension}' is not supported. Supported formats: PDF, DOCX, TXT, MD`);
    }
  }

  /**
   * Determine content type from file
   * @param file - Multer file object
   * @returns string - Content type
   */
  private getContentTypeFromFile(file: Express.Multer.File): string {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Map file extensions to content types
    const contentTypeMap: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    return contentTypeMap[fileExtension] || file.mimetype || 'application/octet-stream';
  }
}

/**
 * Multer configuration for playbook file uploads
 * Configured for memory storage with appropriate limits
 */
export const playbookMulterConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1, // Only allow single file upload
    fieldSize: 1024 * 1024, // 1MB for form fields
    fields: 10, // Maximum number of non-file fields
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${fileExtension}' is not supported. Supported formats: PDF, DOCX, TXT, MD.`));
    }
  }
});

// Create and export a configured S3Service instance
const createS3Service = (): S3Service => {
  const config: S3Config = {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucketName: process.env.NODE_ENV === 'production' 
      ? (process.env.S3_PRODUCTION_BUCKET || 'production-app-bucket')
      : (process.env.S3_LOCAL_BUCKET || 'local-app-bucket')
  };

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
  }

  return new S3Service(config);
};

// Export the configured instances
export const s3Service = createS3Service();
export const fileUploadService = new FileUploadService(s3Service);

// Export the class for custom configurations
export default FileUploadService; 