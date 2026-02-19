import { EventEmitter } from 'events';
import SalesPlaybook from '../models/SalesPlaybook';
import { mastra } from '../mastra';

interface ContentSummaryJob {
  playbookId: string;
  organizationId: string;
  initiatedBy?: string;
  retryCount?: number;
}

/**
 * Lightweight async queue to generate playbook content summaries from the text body.
 * Designed for playbooks without attached files (file uploads already trigger a separate pipeline).
 */
class ContentSummaryQueue extends EventEmitter {
  private processing = new Set<string>();
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 5000;

  constructor() {
    super();
    this.on('process', this.processJob.bind(this));
    this.on('retry', this.retryJob.bind(this));
  }

  queue(job: ContentSummaryJob): void {
    setImmediate(() => this.emit('process', job));
  }

  private async processJob(job: ContentSummaryJob): Promise<void> {
    const { playbookId, organizationId, initiatedBy, retryCount = 0 } = job;
    const playbookSummaryAgent = mastra.getAgent('playbookSummaryAgent');

    if (this.processing.has(playbookId)) {
      return;
    }

    this.processing.add(playbookId);

    try {
      const playbook = await SalesPlaybook.findOne({
        _id: playbookId,
        organization: organizationId,
      }).lean();

      if (!playbook) {
        console.warn(`ContentSummaryQueue: playbook ${playbookId} not found for org ${organizationId}`);
        return;
      }

      // If files exist, skip: file pipeline owns summary generation.
      if (playbook.files && playbook.files.length > 0) {
        return;
      }

      const prompt = this.buildPrompt({
        title: playbook.title,
        type: playbook.type,
        tags: playbook.tags || [],
        keywords: playbook.keywords || [],
        content: playbook.content || '',
      });

      const result = await playbookSummaryAgent.generateLegacy(
        [{ content: prompt, role: 'user' }],
        {
          providerOptions: {
            openai: {
              metadata: {
                playbookId,
                agent: 'playbookSummaryAgent',
                orgId: organizationId,
                initiatedBy: initiatedBy || '',
              },
            },
          },
        }
      );

      const summary = this.extractSummary(result.text);

      await SalesPlaybook.findByIdAndUpdate(playbookId, {
        contentSummary: summary,
      });
    } catch (error) {
      console.error(`ContentSummaryQueue: failed for playbook ${playbookId}`, error);

      if (retryCount < this.maxRetries) {
        this.scheduleRetry({ ...job, retryCount: retryCount + 1 });
      }
    } finally {
      this.processing.delete(playbookId);
    }
  }

  private scheduleRetry(job: ContentSummaryJob): void {
    const delay = this.baseDelayMs * (job.retryCount || 1);
    setTimeout(() => this.emit('retry', job), delay);
  }

  private async retryJob(job: ContentSummaryJob): Promise<void> {
    await this.processJob(job);
  }

  private buildPrompt(input: {
    title: string;
    type: string;
    tags: string[];
    keywords: string[];
    content: string;
  }): string {
    const { title, type, tags, keywords, content } = input;
    const truncatedContent = content ? content.slice(0, 6000) : '';

    return `
You will summarize a sales playbook with no attached files.

Context:
- Type: ${type}
- Title: ${title}
- Tags: ${tags.join(', ') || 'None'}
- Keywords: ${keywords.join(', ') || 'None'}

Content:
${truncatedContent || 'No content provided.'}

Return JSON with "contentSummary" (2-3 sentences) and "confidence".
    `.trim();
  }

  private extractSummary(raw: string): string {
    if (!raw) return 'Summary unavailable.';

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.contentSummary === 'string' && parsed.contentSummary.trim()) {
        return parsed.contentSummary.trim();
      }
    } catch {
      // fall through to text fallback
    }

    const cleaned = raw.trim();
    return cleaned || 'Summary unavailable.';
  }
}

const contentSummaryQueue = new ContentSummaryQueue();

export const queueContentSummary = (job: ContentSummaryJob): void => {
  contentSummaryQueue.queue(job);
};

export default contentSummaryQueue;

