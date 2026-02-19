import mongoose from 'mongoose';
import SalesPlaybook, { ISalesPlaybook } from '../models/SalesPlaybook';
import { s3Service } from './fileUploadService';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import path from 'path';

/**
 * Playbook metadata interface for the first step of content composition workflow
 */
export interface PlaybookMetadata {
  id: string;
  type: string;
  title: string;
  tags: string[];
  keywords: string[];
  contentSummary?: string;
  useCase?: string;
  lastUsed?: Date;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Full playbook interface with content and files
 */
export interface FullPlaybook {
  id: string;
  type: string;
  title: string;
  content: string;
  contentSummary?: string;
  tags: string[];
  keywords: string[];
  useCase?: string;
  lastUsed?: Date;
  usageCount: number;
  files: Array<{
    documentId: string;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
    downloadUrl: string;
    uploadedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Fetch all playbook metadata for an organization
 * Returns only basic information needed for LLM selection
 */
export async function fetchPlaybookMetadata(organizationId: string): Promise<PlaybookMetadata[]> {
  try {
    // Validate organization ID format
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      throw new Error('Invalid organization ID format');
    }

    const playbooks = await SalesPlaybook.find({
      organization: new mongoose.Types.ObjectId(organizationId)
    })
    .select('type title tags keywords contentSummary useCase lastUsed usageCount createdAt updatedAt')
    .sort({ lastUsed: -1, usageCount: -1, createdAt: -1 })
    .lean();

    return playbooks.map(playbook => ({
      id: playbook._id.toString(),
      type: playbook.type,
      title: playbook.title,
      tags: playbook.tags || [],
      keywords: playbook.keywords || [],
      contentSummary: playbook.contentSummary,
      content: playbook.content,
      useCase: playbook.useCase,
      lastUsed: playbook.lastUsed,
      usageCount: playbook.usageCount || 0,
      createdAt: playbook.createdAt,
      updatedAt: playbook.updatedAt,
    }));
  } catch (error) {
    console.error('Error fetching playbook metadata:', error);
    throw new Error(`Failed to fetch playbook metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Interface for populated document in playbook
 */
interface PopulatedDocument {
  _id: mongoose.Types.ObjectId;
  originalFilename?: string;
  name: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  uploadedAt: Date;
}

/**
 * Type guard to check if a file reference is a populated document
 */
function isPopulatedDocument(file: any): file is PopulatedDocument {
  return file && typeof file === 'object' && file.filePath && file._id;
}

/**
 * Fetch full content for selected playbooks including files
 */
export async function fetchFullPlaybooks(playbookIds: string[]): Promise<FullPlaybook[]> {
  try {
    // Validate all playbook IDs
    const validIds = playbookIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== playbookIds.length) {
      console.warn('Some invalid playbook IDs were filtered out');
    }

    if (validIds.length === 0) {
      return [];
    }

    const objectIds = validIds.map(id => new mongoose.Types.ObjectId(id));
    
    // Fetch playbooks with populated files in one efficient query
    const playbooks = await SalesPlaybook.find({
      _id: { $in: objectIds }
    })
    .populate({
      path: 'files',
      model: 'Document',
      select: '_id originalFilename mimeType fileType name fileSize filePath uploadedAt'
    })
    .lean();

    // Process results and generate file URLs
    const results: FullPlaybook[] = await Promise.all(
      playbooks.map(async (playbook) => {
        const files: FullPlaybook['files'] = [];
        
        // Handle populated files with proper type checking
        const fileReferences = playbook. files || [];
        
        for (const fileRef of fileReferences) {
          try {
            // Skip if file is not properly populated
            if (!isPopulatedDocument(fileRef)) {
              console.warn(`Skipping unpopulated file reference in playbook ${playbook._id}`);
              continue;
            }

            // Generate secure pre-signed URL (valid for 1 hour)
            const downloadUrl = await s3Service.generatePresignedUrl(
              fileRef.filePath,
              'get',
              3600 // 1 hour expiration
            );

            files.push({
              documentId: fileRef._id.toString(),
              originalFilename: fileRef.originalFilename || fileRef.name,
              mimeType: fileRef.mimeType || 'application/octet-stream',
              fileSize: fileRef.fileSize,
              downloadUrl,
              uploadedAt: fileRef.uploadedAt
            });
          } catch (error) {
            console.error(`Error generating presigned URL for file ${fileRef}:`, error);
            // Continue without this file rather than failing the entire operation
          }
        }

        return {
          id: playbook._id.toString(),
          type: playbook.type,
          title: playbook.title,
          content: playbook.content,
          contentSummary: playbook.contentSummary,
          tags: playbook.tags || [],
          keywords: playbook.keywords || [],
          useCase: playbook.useCase,
          lastUsed: playbook.lastUsed,
          usageCount: playbook.usageCount || 0,
          files,
          createdAt: playbook.createdAt,
          updatedAt: playbook.updatedAt,
        };
      })
    );

    // Update usage statistics for fetched playbooks (async, don't wait)
    if (validIds.length > 0) {
      SalesPlaybook.updateMany(
        { _id: { $in: objectIds } },
        { 
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date() }
        }
      ).catch(error => {
        console.error('Error updating playbook usage statistics:', error);
      });
    }

    return results;
  } catch (error) {
    console.error('Error fetching full playbooks:', error);
    throw new Error(`Failed to fetch full playbooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Interface for prepared file content ready for LLM consumption
 */
export interface PreparedFileContent {
  type: 'text' | 'file';
  data: string | Buffer;
  mimeType?: string;
  originalFilename: string;
  documentId: string;
}

/**
 * Download file buffer from a URL (presigned S3 URL)
 */
async function downloadFileBuffer(url: string): Promise<Buffer> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to download file: HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Download timeout');
      }
      throw error;
    }
    throw new Error('Unknown download error');
  }
}

/**
 * Extract text content from DOCX files
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.warn('Failed to extract DOCX text:', error);
    return 'Unable to extract text from DOCX file';
  }
}

/**
 * Extract text content from Excel/CSV files
 */
function extractExcelText(buffer: Buffer): string {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets: string[] = [];
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        sheets.push(`Sheet: ${sheetName}\n${csv}`);
      }
    });
    
    return sheets.join('\n\n');
  } catch (error) {
    console.warn('Failed to extract Excel text:', error);
    return 'Unable to extract text from Excel file';
  }
}

/**
 * Extract text content from PowerPoint files using pptx-text-parser
 */
async function extractPptxText(buffer: Buffer): Promise<string> {
  try {
    // Lazy-load officeparser to avoid pulling in heavy PDF/browser polyfills at startup
    const officeParser = await import('officeparser');
    const text = await officeParser.parseOfficeAsync(buffer);
    return text || 'No text content found in PowerPoint file';
  } catch (error) {
    console.warn('Failed to extract PPTX text:', error);
    return 'Unable to extract text from PowerPoint file';
  }
}

/**
 * Extract text content from PDF files using pdf-parse
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Use require instead of dynamic import to avoid module initialization issues
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text || 'No text content found in PDF file';
  } catch (error) {
    console.warn('Failed to extract PDF text:', error);
    return 'Unable to extract text from PDF file - manual review recommended';
  }
}

/**
 * Determine file type from filename and MIME type
 */
function getFileType(filename: string, mimeType: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  // Use extension first, fallback to MIME type
  if (ext) {
    return ext.substring(1); // Remove the dot
  }
  
  // Map common MIME types to extensions
  const mimeToExt: { [key: string]: string } = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/csv': 'csv',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  };
  
  return mimeToExt[mimeType] || 'unknown';
}

/**
 * Prepare a single file for LLM consumption by extracting text or preserving binary data
 */
export async function prepareFileContentForLLM(file: {
  downloadUrl: string;
  mimeType: string;
  originalFilename: string;
  documentId: string;
}): Promise<PreparedFileContent | null> {
  try {
    const fileType = getFileType(file.originalFilename, file.mimeType);

    // Download the file buffer for all types that require processing
    const buffer = await downloadFileBuffer(file.downloadUrl);

    // Handle different file types
    switch (fileType) {
      
      case 'pdf':
        // Extract text from PDF files
        const pdfText = await extractPdfText(buffer);
        return {
          type: 'text',
          data: pdfText,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        // Images sent as binary per user requirements
        return {
          type: 'file',
          data: buffer,
          mimeType: file.mimeType,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'txt':
      case 'md':
        // Text files - convert to string
        return {
          type: 'text',
          data: buffer.toString('utf-8'),
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'docx':
        // Extract text from DOCX
        const docxText = await extractDocxText(buffer);
        return {
          type: 'text',
          data: docxText,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'xlsx':
      case 'csv':
        // Extract text from Excel/CSV
        const excelText = extractExcelText(buffer);
        return {
          type: 'text',
          data: excelText,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'pptx':
        // Extract text from PowerPoint
        const pptxText = await extractPptxText(buffer);
        return {
          type: 'text',
          data: pptxText,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      case 'ppt':
        // Legacy PPT format - send as binary since pptx-text-parser only supports PPTX
        return {
          type: 'file',
          data: buffer,
          mimeType: file.mimeType,
          originalFilename: file.originalFilename,
          documentId: file.documentId
        };
      
      default:
        console.warn(`Unsupported file type: ${fileType} for file ${file.originalFilename}`);
        return null;
    }
  } catch (error) {
    console.error(`Failed to process file ${file.originalFilename}:`, error);
    return null;
  }
}

/**
 * Prepare multiple files for LLM consumption in parallel
 */
export async function prepareFilesForLLM(files: Array<{
  downloadUrl: string;
  mimeType: string;
  originalFilename: string;
  documentId: string;
}>): Promise<PreparedFileContent[]> {
  const results = await Promise.allSettled(
    files.map(file => prepareFileContentForLLM(file))
  );
  
  return results
    .filter((result): result is PromiseFulfilledResult<PreparedFileContent> => 
      result.status === 'fulfilled' && result.value !== null
    )
    .map(result => result.value);
} 