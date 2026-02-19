import { mastra } from '../mastra';
import { s3Service } from './fileUploadService';
import { prepareFileContentForLLM } from './playbookService';
import { z } from 'zod';

// Define the schema locally for the generate call
const FileProcessingOutputSchema = z.object({
  keywords: z.array(z.string()).describe('Array of relevant keywords extracted from the file content'),
  tags: z.array(z.string()).describe('Array of categorization tags for the file content'),
  contentSummary: z.string().describe('Concise summary of the file content and its relevance to sales'),
  confidence: z.enum(['High', 'Medium', 'Low']).describe('Confidence level in the extracted metadata'),
  reasoning: z.string().describe('Explanation of the extraction process and key insights')
});

/**
 * Service for extracting content from uploaded files using AI
 * This service coordinates between file storage and AI processing
 */
export class FileContentExtractionService {
  
  /**
   * Process a file and extract metadata using AI
   * @param s3Key - The S3 key of the uploaded file
   * @param originalFilename - Original filename for context
   * @param mimeType - MIME type of the file
   * @returns Promise with extracted metadata
   */
  async extractFileContent(
    s3Key: string, 
    originalFilename: string, 
    mimeType: string
  ): Promise<{
    keywords: string[];
    tags: string[];
    contentSummary: string;
    confidence: 'High' | 'Medium' | 'Low';
    reasoning: string;
  }> {
    const fileProcessingAgent = mastra.getAgent('fileProcessingAgent');
    try {
      // Step 1: Generate a presigned URL for the file
      const presignedUrl = await s3Service.generatePresignedUrl(
        s3Key, 
        'get', 
        3600 // 1 hour expiration
      );

      // Step 2: Prepare file content using the new helper
      const preparedFile = await prepareFileContentForLLM({
        downloadUrl: presignedUrl,
        mimeType: mimeType,
        originalFilename: originalFilename,
        documentId: s3Key // Use s3Key as documentId for processing context
      });

      if (!preparedFile) {
        console.warn(`Could not prepare file content for: ${originalFilename}`);
        return this.generateFallbackMetadata(originalFilename, mimeType, new Error('File preparation failed'));
      }

      // Step 3: Prepare context for the AI agent
      const fileContext = this.buildFileContext(originalFilename, mimeType);

      // Step 4: Call the file processing agent with the prepared content and schema
      const contentParts: any[] = [
        {
          type: "text",
          text: fileContext
        }
      ];

      // Add the file content in the correct format
      if (preparedFile.type === 'text') {
        contentParts.push({
          type: "text",
          text: preparedFile.data as string
        });
      } else {
        contentParts.push({
          type: "file",
          data: preparedFile.data,
          mimeType: preparedFile.mimeType || 'application/octet-stream',
        });
      }

      const result = await fileProcessingAgent.generateLegacy(
        [{
          content: contentParts,
          role: 'user',
        }],
        {
          output: FileProcessingOutputSchema,
          providerOptions: {
            openai: {
              metadata: {
                file: 'file-content-extraction-service',
                agent: 'fileProcessingAgent',
                documentId: s3Key,
              }
            }
          }
        },
      );

      // Step 5: The result should already be parsed by Mastra with the schema
      return result.object || this.generateFallbackMetadata(originalFilename, mimeType, new Error('No result from agent'));

    } catch (error) {
      console.error('File content extraction failed:', error);
      
      // Return fallback metadata on error
      return this.generateFallbackMetadata(originalFilename, mimeType, error);
    }
  }

  /**
   * Build context prompt for the AI agent
   * @param filename - Original filename
   * @param mimeType - File MIME type
   * @returns Formatted context string
   */
  private buildFileContext(filename: string, mimeType: string): string {
    return `
Please analyze the following file and extract sales-relevant metadata:

**FILE INFORMATION:**
- Filename: ${filename}
- Type: ${mimeType}

**ANALYSIS REQUIREMENTS:**
1. Read and analyze the complete file content
2. Extract 5-15 relevant keywords for sales teams
3. Generate 3-8 categorization tags
4. Create a 2-3 sentence summary focused on sales utility
5. Assess your confidence in the extraction quality

**IMPORTANT:** 
- Focus on business value and sales enablement
- Prioritize customer-facing information over technical details
- Consider how sales teams would use this content
- Be honest about extraction quality and confidence levels

Please analyze the provided file content and return the metadata in the specified JSON format.
    `.trim();
  }

  /**
   * Generate fallback metadata when processing fails
   * @param filename - Original filename
   * @param mimeType - File MIME type
   * @param error - The error that occurred
   * @returns Fallback metadata object
   */
  private generateFallbackMetadata(
    filename: string, 
    mimeType: string, 
    error: any
  ): {
    keywords: string[];
    tags: string[];
    contentSummary: string;
    confidence: 'High' | 'Medium' | 'Low';
    reasoning: string;
  } {
    // Extract basic info from filename and MIME type
    const fileExtension = filename.split('.').pop()?.toLowerCase() || 'unknown';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    
    // Generate basic keywords from filename
    const keywords = baseName
      .split(/[-_\s]+/)
      .filter(word => word.length > 2)
      .slice(0, 5);

    // Determine document type from MIME type
    const documentType = this.getDocumentTypeFromMimeType(mimeType);
    
    return {
      keywords: keywords.length > 0 ? keywords : ['document'],
      tags: [documentType, 'processing-failed'],
      contentSummary: `Document "${filename}" could not be processed automatically. Manual review recommended for proper categorization and content analysis.`,
      confidence: 'Low',
      reasoning: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}. Generated fallback metadata from filename and file type.`
    };
  }

  /**
   * Determine document type from MIME type
   * @param mimeType - File MIME type
   * @returns Document type tag
   */
  private getDocumentTypeFromMimeType(mimeType: string): string {
    const typeMap: { [key: string]: string } = {
      'application/pdf': 'pdf-document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word-document',
      'text/plain': 'text-document',
      'text/markdown': 'markdown-document',
      'application/msword': 'word-document'
    };

    return typeMap[mimeType] || 'unknown-document';
  }

  /**
   * Validate file size for processing
   * @param fileSize - Size in bytes
   * @param maxSize - Maximum allowed size in bytes
   * @returns True if file is within limits
   */
  isFileSizeValid(fileSize: number, maxSize: number = 50 * 1024 * 1024): boolean {
    return fileSize <= maxSize;
  }

  /**
   * Estimate token count for file processing
   * @param fileSize - File size in bytes
   * @returns Estimated token count
   */
  estimateTokenCount(fileSize: number): number {
    // Rough estimation: 1 token per 4 characters, assume average file density
    // This is a conservative estimate for planning purposes
    return Math.ceil(fileSize / 4);
  }

  /**
   * Check if file is within token processing limits
   * @param fileSize - File size in bytes
   * @param maxTokens - Maximum tokens allowed (default 2M as per PRD)
   * @returns True if file is within token limits
   */
  isWithinTokenLimits(fileSize: number, maxTokens: number = 2000000): boolean {
    const estimatedTokens = this.estimateTokenCount(fileSize);
    return estimatedTokens <= maxTokens;
  }
}

// Export configured service instance
export const fileContentExtractionService = new FileContentExtractionService(); 