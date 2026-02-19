import { EventEmitter } from 'events';
import { fileContentExtractionService } from './fileContentExtractionService';
import SalesPlaybook from '../models/SalesPlaybook';
import { Document } from '../models/DigitalSalesRoom';

/**
 * Simple file processing job interface
 */
interface FileProcessingJob {
  documentId: string;
  playbookId: string;
  s3Key: string;
  originalFilename: string;
  mimeType: string;
  orgId: string;
  uploadedBy: string;
  retryCount?: number;
}

/**
 * Lightweight file processing queue using Node.js EventEmitter
 * Handles asynchronous file processing without complex job queue infrastructure
 */
export class FileProcessingQueue extends EventEmitter {
  private processingInProgress = new Set<string>();
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for file processing
   */
  private setupEventHandlers(): void {
    this.on('process-file', this.processFile.bind(this));
    this.on('retry-file', this.retryFile.bind(this));
  }

  /**
   * Queue a file for processing
   * @param job - File processing job details
   */
  queueFileProcessing(job: FileProcessingJob): void {
    console.log(`🔄 Queuing file processing for: ${job.originalFilename} (Document: ${job.documentId})`);
    
    // Use setImmediate to ensure async processing
    setImmediate(() => {
      this.emit('process-file', job);
    });
  }

  /**
   * Process a file using AI content extraction
   * @param job - File processing job
   */
  private async processFile(job: FileProcessingJob): Promise<void> {
    const { documentId, playbookId, s3Key, originalFilename, mimeType, retryCount = 0 } = job;

    // Prevent duplicate processing
    if (this.processingInProgress.has(documentId)) {
      console.log(`⏭️  File ${originalFilename} already being processed, skipping...`);
      return;
    }

    this.processingInProgress.add(documentId);

    try {
      console.log(`🤖 Starting AI processing for: ${originalFilename}`);

      // Step 1: Extract content using AI
      const extractedContent = await fileContentExtractionService.extractFileContent(
        s3Key,
        originalFilename,
        mimeType
      );

      console.log(`✅ AI extraction completed for: ${originalFilename}`, {
        keywordCount: extractedContent.keywords.length,
        tagCount: extractedContent.tags.length,
        confidence: extractedContent.confidence
      });

      // Step 2: Update the SalesPlaybook with extracted metadata
      await this.updatePlaybookWithMetadata(playbookId, extractedContent);

      // Step 3: Log successful processing
      console.log(`📝 Updated playbook ${playbookId} with metadata from: ${originalFilename}`);

      // Emit success event
      this.emit('file-processed', {
        documentId,
        playbookId,
        originalFilename,
        success: true,
        extractedContent
      });

    } catch (error) {
      console.error(`❌ File processing failed for: ${originalFilename}`, error);

      // Handle retry logic
      if (retryCount < this.maxRetries) {
        console.log(`🔄 Scheduling retry ${retryCount + 1}/${this.maxRetries} for: ${originalFilename}`);
        this.scheduleRetry({ ...job, retryCount: retryCount + 1 });
      } else {
        console.error(`💥 Max retries exceeded for: ${originalFilename}. Processing failed permanently.`);
        
        // Update playbook with failure notification
        await this.handleProcessingFailure(playbookId, originalFilename, error);

        // Emit failure event
        this.emit('file-processing-failed', {
          documentId,
          playbookId,
          originalFilename,
          error: error instanceof Error ? error.message : 'Unknown error',
          retryCount
        });
      }
    } finally {
      this.processingInProgress.delete(documentId);
    }
  }

  /**
   * Schedule a retry for failed file processing
   * @param job - File processing job with retry count
   */
  private scheduleRetry(job: FileProcessingJob): void {
    setTimeout(() => {
      console.log(`🔁 Retrying file processing for: ${job.originalFilename} (Attempt ${(job.retryCount || 0) + 1})`);
      this.emit('retry-file', job);
    }, this.retryDelay * (job.retryCount || 1)); // Exponential backoff
  }

  /**
   * Handle retry attempt
   * @param job - File processing job
   */
  private async retryFile(job: FileProcessingJob): Promise<void> {
    await this.processFile(job);
  }

  /**
   * Update SalesPlaybook with extracted metadata
   * @param playbookId - Playbook ID
   * @param extractedContent - AI-extracted content
   */
  private async updatePlaybookWithMetadata(
    playbookId: string,
    extractedContent: {
      keywords: string[];
      tags: string[];
      contentSummary: string;
      confidence: string;
      reasoning: string;
    }
  ): Promise<void> {
    try {
      const playbook = await SalesPlaybook.findById(playbookId);
      
      if (!playbook) {
        throw new Error(`Playbook ${playbookId} not found`);
      }

      // Merge new keywords and tags with existing ones (avoid duplicates)
      const existingKeywords = playbook.keywords || [];
      const existingTags = playbook.tags || [];

      const updatedKeywords = [...new Set([...existingKeywords, ...extractedContent.keywords])];
      const updatedTags = [...new Set([...existingTags, ...extractedContent.tags])];

      // Update the playbook with new metadata
      await SalesPlaybook.findByIdAndUpdate(playbookId, {
        keywords: updatedKeywords,
        tags: updatedTags,
        contentSummary: extractedContent.contentSummary,
        // Store processing metadata for debugging
        $push: {
          'metadata.processing_history': {
            timestamp: new Date(),
            confidence: extractedContent.confidence,
            reasoning: extractedContent.reasoning,
            keywords_added: extractedContent.keywords.length,
            tags_added: extractedContent.tags.length
          }
        }
      });

      console.log(`📊 Playbook metadata updated:`, {
        keywords: updatedKeywords.length,
        tags: updatedTags.length,
        confidence: extractedContent.confidence
      });

    } catch (error) {
      console.error('Failed to update playbook metadata:', error);
      throw error;
    }
  }

  /**
   * Handle processing failure by updating playbook with error info
   * @param playbookId - Playbook ID  
   * @param filename - Original filename
   * @param error - The error that occurred
   */
  private async handleProcessingFailure(
    playbookId: string, 
    filename: string, 
    error: any
  ): Promise<void> {
    try {
      await SalesPlaybook.findByIdAndUpdate(playbookId, {
        $push: {
          'metadata.processing_errors': {
            timestamp: new Date(),
            filename,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      });
    } catch (updateError) {
      console.error('Failed to log processing error to playbook:', updateError);
    }
  }

  /**
   * Get current queue status
   * @returns Queue status information
   */
  getQueueStatus(): {
    processingCount: number;
    processingFiles: string[];
  } {
    return {
      processingCount: this.processingInProgress.size,
      processingFiles: Array.from(this.processingInProgress)
    };
  }

  /**
   * Clear all processing locks (use with caution)
   */
  clearProcessingLocks(): void {
    console.log('🧹 Clearing all file processing locks');
    this.processingInProgress.clear();
  }
}

// Export singleton instance
export const fileProcessingQueue = new FileProcessingQueue();

// Helper function to queue file processing (for easy integration)
export const queueFileProcessing = (job: FileProcessingJob): void => {
  fileProcessingQueue.queueFileProcessing(job);
};

export default fileProcessingQueue; 