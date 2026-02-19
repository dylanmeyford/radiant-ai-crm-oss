import mongoose from 'mongoose';
import chalk from 'chalk';
import { z } from 'zod';
import User from '../../models/User';
import Organization, { IOrganization } from '../../models/Organization';
import Prospect from '../../models/Prospect';
import NylasConnection from '../../models/NylasConnection';
import MinedDeal, { IMinedDeal, IMinedDealParticipant } from '../../models/MinedDeal';
import { rateLimitedNylas } from '../NylasService';
import { EXCLUDED_DOMAINS, normalizeDomain } from '../../utils/domain';
import { mastra } from '../../mastra';

/**
 * Schema for AI deal qualification response
 */
const DealQualificationSchema = z.object({
  include: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().describe('Brief explanation for the qualification decision'),
});

/**
 * Configuration for deal mining scans
 */
const MINING_CONFIG = {
  // New connection: thorough scan for onboarding "wow" moment
  newConnection: {
    lookbackDays: 365,  // 12 months
    maxPages: 50,
  },
  // Weekly scan: catch new conversations
  weekly: {
    lookbackDays: 30,   // 1 month
    maxPages: 10,
  },
  // Filtering
  minMessagesInThread: 3,  // Require real engagement
  pageSize: 50,
  // Rate limiting
  delayBetweenPages: 500,  // 500ms between page fetches
  // AI qualification
  maxMessagesForAI: 10,  // Max messages to fetch per thread for AI context
};

/**
 * Context for AI qualification
 */
interface AIQualificationContext {
  organizationId: string;
  grantId: string;
  organization: {
    name: string;
    industry?: string;
    about?: string;
  };
  internalDomains: string[];  // Organization's own email domains
}

/**
 * Internal type for thread candidates during scanning
 */
interface ThreadCandidate {
  threadId: string;
  subject: string;
  snippet: string;
  lastMessageTimestamp: number;
  messageCount: number;
  externalDomain: string;
  externalParticipants: IMinedDealParticipant[];
}

/**
 * Internal type for grouped deals by domain
 */
interface DiscoveredDeal {
  companyDomain: string;
  companyName: string;
  threadCount: number;
  totalMessages: number;
  lastActivityDate: Date;
  firstActivityDate: Date;
  participants: IMinedDealParticipant[];
  representativeThread: {
    threadId: string;
    subject: string;
    snippet: string;
  };
}

export interface MineDealsOptions {
  isNewConnection?: boolean;
}

/**
 * DealMiningService
 * 
 * Scans connected email accounts for potential prospects the user hasn't tracked,
 * presenting them for easy one-click addition to the CRM.
 */
export class DealMiningService {
  
  /**
   * Main entry point - mine deals for a user
   * Called on: 1) weekly schedule, 2) new Nylas connection
   */
  public static async mineDealsForUser(
    userId: string,
    options: MineDealsOptions = {}
  ): Promise<IMinedDeal[]> {
    const startTime = Date.now();
    const isNewConnection = options.isNewConnection ?? false;
    
    console.log(chalk.blue.bold(`[DEAL-MINING] Starting mining for user ${userId}${isNewConnection ? ' (new connection)' : ''}`));
    
    try {
      // Get user
      const user = await User.findById(userId).lean();
      if (!user) {
        console.warn(chalk.yellow(`[DEAL-MINING] User ${userId} not found`));
        return [];
      }
      
      // Get user's active Nylas connections (users can have multiple)
      const connections = await NylasConnection.find({
        user: userId,
        syncStatus: 'active',
      }).lean();
      
      if (connections.length === 0) {
        console.warn(chalk.yellow(`[DEAL-MINING] No active Nylas connections for user ${userId}`));
        return [];
      }
      
      console.log(chalk.cyan(`[DEAL-MINING] Found ${connections.length} active Nylas connection(s) for user`));
      
      // Cast organization to string for mongoose queries
      const orgId = (user.organization as any).toString();
      
      // Fetch organization for business context
      const org = await Organization.findById(orgId).lean();
      if (!org) {
        console.warn(chalk.yellow(`[DEAL-MINING] Organization ${orgId} not found`));
        return [];
      }
      
      // 1. Get tracked domains from existing Prospects
      const trackedDomains = await this.getTrackedDomains(orgId);
      console.log(chalk.cyan(`[DEAL-MINING] Found ${trackedDomains.size} tracked domains`));
      
      // 2. Get internal domains from org's Nylas connections
      const internalDomains = await this.getInternalDomains(orgId);
      console.log(chalk.cyan(`[DEAL-MINING] Found ${internalDomains.size} internal domains`));
      
      // 3. Scan Nylas threads for external conversations across all connections
      const allThreadCandidates: ThreadCandidate[] = [];
      for (const connection of connections) {
        console.log(chalk.gray(`[DEAL-MINING] Scanning connection: ${connection.email || connection.grantId}`));
        const threadCandidates = await this.scanForExternalThreads(
          connection.grantId,
          trackedDomains,
          internalDomains,
          isNewConnection
        );
        allThreadCandidates.push(...threadCandidates);
      }
      
      // Deduplicate threads by threadId (same thread could appear if user has multiple connections)
      const uniqueThreads = this.deduplicateThreads(allThreadCandidates);
      console.log(chalk.cyan(`[DEAL-MINING] Found ${uniqueThreads.length} candidate threads (${allThreadCandidates.length} before dedup)`));
      
      if (uniqueThreads.length === 0) {
        console.log(chalk.yellow(`[DEAL-MINING] No candidate threads found for user ${userId}`));
        return [];
      }
      
      // 4. Group threads by company domain
      const groupedByDomain = this.groupThreadsByDomain(uniqueThreads);
      console.log(chalk.cyan(`[DEAL-MINING] Grouped into ${groupedByDomain.size} unique domains`));
      
      // 5. Filter against already-mined deals (PENDING, SNOOZED, or DISMISSED)
      const newDeals = await this.filterAlreadyMined(
        groupedByDomain,
        orgId
      );
      console.log(chalk.cyan(`[DEAL-MINING] ${newDeals.length} new deals after deduplication`));
      
      if (newDeals.length === 0) {
        console.log(chalk.yellow(`[DEAL-MINING] All found deals already mined or dismissed`));
        return [];
      }
      
      // 6. AI qualification - filter out non-sales conversations
      const aiContext: AIQualificationContext = {
        organizationId: orgId,
        grantId: connections[0].grantId, // Use first connection for fetching messages
        organization: {
          name: org.name,
          industry: org.industry,
          about: org.about,
        },
        internalDomains: Array.from(internalDomains),
      };
      const qualifiedDeals = await this.qualifyDealsWithAI(newDeals, aiContext);
      
      if (qualifiedDeals.length === 0) {
        console.log(chalk.yellow(`[DEAL-MINING] No deals passed AI qualification`));
        return [];
      }
      
      // 7. Save as pending mined deals
      const userIdStr = (user._id as any).toString();
      const savedDeals = await this.saveMinedDeals(qualifiedDeals, userIdStr, orgId);
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`[DEAL-MINING] Completed mining for user ${userId} in ${duration}ms. Found ${savedDeals.length} new deals.`));
      
      return savedDeals;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(chalk.red(`[DEAL-MINING] Error mining for user ${userId} after ${duration}ms:`), error);
      throw error;
    }
  }
  
  /**
   * Get all domains from existing Prospects in the organization
   */
  private static async getTrackedDomains(
    organizationId: mongoose.Types.ObjectId | string
  ): Promise<Set<string>> {
    const prospects = await Prospect.find({
      organization: organizationId,
    }).select('domains').lean();
    
    const domains = new Set<string>();
    for (const prospect of prospects) {
      if (prospect.domains) {
        for (const domain of prospect.domains) {
          domains.add(normalizeDomain(domain));
        }
      }
    }
    
    return domains;
  }
  
  /**
   * Get all internal domains from organization's Nylas connections
   */
  private static async getInternalDomains(
    organizationId: mongoose.Types.ObjectId | string
  ): Promise<Set<string>> {
    const connections = await NylasConnection.find({
      organization: organizationId,
    }).select('email').lean();
    
    const domains = new Set<string>();
    for (const connection of connections) {
      if (connection.email) {
        const domain = connection.email.split('@')[1];
        if (domain) {
          domains.add(normalizeDomain(domain));
        }
      }
    }
    
    return domains;
  }
  
  /**
   * Scan Nylas for threads with external participants
   */
  private static async scanForExternalThreads(
    grantId: string,
    trackedDomains: Set<string>,
    internalDomains: Set<string>,
    isNewConnection: boolean
  ): Promise<ThreadCandidate[]> {
    const config = isNewConnection ? MINING_CONFIG.newConnection : MINING_CONFIG.weekly;
    const now = Math.floor(Date.now() / 1000);
    const cutoffTimestamp = now - (config.lookbackDays * 24 * 60 * 60);
    
    const candidates: ThreadCandidate[] = [];
    let pageToken: string | undefined;
    let pagesScanned = 0;
    let reachedCutoff = false;
    
    console.log(chalk.gray(`[DEAL-MINING] Scanning threads from last ${config.lookbackDays} days (max ${config.maxPages} pages)`));
    
    do {
      try {
        // Note: Nylas threads.list doesn't support receivedAfter, so we fetch
        // threads (sorted by lastMessageTimestamp desc by default) and filter client-side
        const response = await rateLimitedNylas.listThreads({
          identifier: grantId,
          queryParams: {
            limit: MINING_CONFIG.pageSize,
            ...(pageToken ? { pageToken } : {}),
          },
        });
        
        for (const thread of response.data) {
          // Cast to any to access Nylas thread properties
          const threadData = thread as any;
          
          // Skip threads with less than minimum messages (no real engagement)
          const messageIds = threadData.messageIds || threadData.message_ids || [];
          if (messageIds.length < MINING_CONFIG.minMessagesInThread) {
            continue;
          }
          
          // Find external business participants
          const externalParticipants = this.findExternalParticipants(
            threadData.participants || [],
            internalDomains
          );
          
          if (externalParticipants.length === 0) {
            continue;
          }
          
          // Get the primary external domain
          const primaryDomain = externalParticipants[0].email.split('@')[1];
          const normalizedDomain = normalizeDomain(primaryDomain);
          
          // Skip if we already track this domain as a Prospect
          if (trackedDomains.has(normalizedDomain)) {
            continue;
          }
          
          // Get last message timestamp (Nylas v3 uses lastMessageTimestamp or last_message_timestamp)
          const lastMsgTimestamp = threadData.lastMessageTimestamp || threadData.last_message_timestamp || Date.now() / 1000;
          
          // Check if thread is older than our cutoff (threads are sorted by lastMessageTimestamp desc)
          if (lastMsgTimestamp < cutoffTimestamp) {
            reachedCutoff = true;
            break;
          }
          
          candidates.push({
            threadId: threadData.id,
            subject: threadData.subject || '(No subject)',
            snippet: threadData.snippet || '',
            lastMessageTimestamp: lastMsgTimestamp,
            messageCount: messageIds.length,
            externalDomain: normalizedDomain,
            externalParticipants,
          });
        }
        
        // If we found threads older than cutoff, stop pagination
        if (reachedCutoff) {
          console.log(chalk.gray(`[DEAL-MINING] Reached cutoff date, stopping pagination`));
          break;
        }
        
        pageToken = response.nextCursor;
        pagesScanned++;
        
        // Rate limit protection between pages
        if (pagesScanned < config.maxPages && pageToken) {
          await this.sleep(MINING_CONFIG.delayBetweenPages);
        }
        
      } catch (error) {
        console.error(chalk.red(`[DEAL-MINING] Error scanning page ${pagesScanned + 1}:`), error);
        break; // Stop scanning on error but don't fail completely
      }
      
    } while (pageToken && pagesScanned < config.maxPages);
    
    console.log(chalk.gray(`[DEAL-MINING] Scanned ${pagesScanned} pages`));
    return candidates;
  }
  
  /**
   * Find external business participants from thread participants
   * Filters out internal domains and known excluded domains (gmail, outlook, SaaS, etc.)
   */
  private static findExternalParticipants(
    participants: Array<{ email: string; name?: string }>,
    internalDomains: Set<string>
  ): IMinedDealParticipant[] {
    const external: IMinedDealParticipant[] = [];
    const seenEmails = new Set<string>();
    
    for (const participant of participants) {
      if (!participant.email) continue;
      
      const email = participant.email.toLowerCase().trim();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      
      const domain = email.split('@')[1];
      if (!domain) continue;
      
      const normalizedDomain = normalizeDomain(domain);
      
      // Skip internal domains (org's own email domains)
      if (internalDomains.has(normalizedDomain)) continue;
      
      // Skip public email providers and known SaaS platforms
      if (EXCLUDED_DOMAINS.has(normalizedDomain)) continue;
      
      external.push({
        email,
        name: participant.name,
      });
    }
    
    return external;
  }
  
  /**
   * Group thread candidates by company domain and create deal summaries
   */
  private static groupThreadsByDomain(
    threads: ThreadCandidate[]
  ): Map<string, DiscoveredDeal> {
    // Group threads by domain
    const byDomain = new Map<string, ThreadCandidate[]>();
    
    for (const thread of threads) {
      const existing = byDomain.get(thread.externalDomain) || [];
      existing.push(thread);
      byDomain.set(thread.externalDomain, existing);
    }
    
    // Create deal summaries for each domain
    const deals = new Map<string, DiscoveredDeal>();
    
    for (const [domain, domainThreads] of byDomain.entries()) {
      // Sort by most recent first
      domainThreads.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      
      const bestThread = domainThreads[0];
      const allParticipants = this.mergeParticipants(
        domainThreads.flatMap(t => t.externalParticipants)
      );
      
      // Derive company name from domain or participant names
      const companyName = this.deriveCompanyName(domain, allParticipants);
      
      // Calculate first activity date (oldest thread)
      const oldestTimestamp = Math.min(...domainThreads.map(t => t.lastMessageTimestamp));
      
      deals.set(domain, {
        companyDomain: domain,
        companyName,
        threadCount: domainThreads.length,
        totalMessages: domainThreads.reduce((sum, t) => sum + t.messageCount, 0),
        lastActivityDate: new Date(bestThread.lastMessageTimestamp * 1000),
        firstActivityDate: new Date(oldestTimestamp * 1000),
        participants: allParticipants,
        representativeThread: {
          threadId: bestThread.threadId,
          subject: bestThread.subject,
          snippet: bestThread.snippet,
        },
      });
    }
    
    return deals;
  }
  
  /**
   * Derive company name from domain or participant names
   */
  private static deriveCompanyName(
    domain: string,
    participants: IMinedDealParticipant[]
  ): string {
    // Try to find a participant with a name that might be company-ish
    // (Often signatures include company name)
    const withName = participants.find(p => p.name && !p.name.includes('@'));
    
    if (withName?.name) {
      // If name looks like "John Smith" (2 words, first is capitalized first name), use domain
      const nameParts = withName.name.trim().split(/\s+/);
      if (nameParts.length === 2 && /^[A-Z][a-z]+$/.test(nameParts[0])) {
        // Looks like a person's name, derive from domain instead
      } else if (nameParts.length > 2 || !/^[A-Z][a-z]+$/.test(nameParts[0])) {
        // Might be a company name or team name, use it
        return withName.name.trim();
      }
    }
    
    // Derive from domain: "acme-corp.com" → "Acme Corp"
    const domainName = domain.split('.')[0];
    return domainName
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Merge participants, dedupe by email, prefer entries with names
   */
  private static mergeParticipants(
    participants: IMinedDealParticipant[]
  ): IMinedDealParticipant[] {
    const byEmail = new Map<string, IMinedDealParticipant>();
    
    for (const p of participants) {
      const normalized = p.email.toLowerCase().trim();
      const existing = byEmail.get(normalized);
      
      // Keep the one with a name, or first seen
      if (!existing || (p.name && !existing.name)) {
        byEmail.set(normalized, { email: normalized, name: p.name });
      }
    }
    
    return Array.from(byEmail.values());
  }
  
  /**
   * Deduplicate threads by threadId (same thread could appear across multiple connections)
   * Keeps the thread with the highest message count if duplicates exist
   */
  private static deduplicateThreads(threads: ThreadCandidate[]): ThreadCandidate[] {
    const byThreadId = new Map<string, ThreadCandidate>();
    
    for (const thread of threads) {
      const existing = byThreadId.get(thread.threadId);
      
      // Keep the one with more messages, or first seen
      if (!existing || thread.messageCount > existing.messageCount) {
        byThreadId.set(thread.threadId, thread);
      }
    }
    
    return Array.from(byThreadId.values());
  }
  
  /**
   * Filter out domains that have already been mined (PENDING, SNOOZED, or DISMISSED)
   */
  private static async filterAlreadyMined(
    deals: Map<string, DiscoveredDeal>,
    organizationId: mongoose.Types.ObjectId | string
  ): Promise<DiscoveredDeal[]> {
    const domains = Array.from(deals.keys());
    
    if (domains.length === 0) {
      return [];
    }
    
    // Find existing mined deals (any status except ACCEPTED means we skip)
    // PENDING/SNOOZED = already suggested
    // DISMISSED = permanently excluded
    // ACCEPTED = already converted to prospect (also covered by trackedDomains check)
    const existingMined = await MinedDeal.find({
      organization: organizationId,
      domains: { $in: domains },
      status: { $in: ['PENDING', 'SNOOZED', 'DISMISSED'] },
    }).select('domains').lean();
    
    const alreadyMinedDomains = new Set<string>();
    for (const mined of existingMined) {
      for (const domain of mined.domains) {
        alreadyMinedDomains.add(normalizeDomain(domain));
      }
    }
    
    return Array.from(deals.values()).filter(
      deal => !alreadyMinedDomains.has(deal.companyDomain)
    );
  }
  
  /**
   * Result from fetching thread messages
   */
  private static threadMessageResult = {
    messages: [] as string[],
    fromInternal: 0,
    fromExternal: 0,
  };
  
  /**
   * Fetch thread messages from Nylas for AI context
   * Returns formatted email content and direction stats
   */
  private static async fetchThreadMessages(
    grantId: string,
    threadId: string,
    internalDomains: Set<string>,
    maxMessages: number = MINING_CONFIG.maxMessagesForAI
  ): Promise<{ messages: string[]; fromInternal: number; fromExternal: number }> {
    try {
      const response = await rateLimitedNylas.listMessages({
        identifier: grantId,
        queryParams: {
          threadId,
          limit: maxMessages,
        },
      });
      
      let fromInternal = 0;
      let fromExternal = 0;
      
      // Format messages for AI consumption and count direction
      const messages = response.data.map((msg: any) => {
        const from = msg.from?.[0]?.email || 'Unknown';
        const fromName = msg.from?.[0]?.name || '';
        const date = msg.date ? new Date(msg.date * 1000).toISOString().split('T')[0] : 'Unknown date';
        const subject = msg.subject || '(No subject)';
        
        // Count message direction
        const fromDomain = from.split('@')[1]?.toLowerCase();
        if (fromDomain && internalDomains.has(normalizeDomain(fromDomain))) {
          fromInternal++;
        } else {
          fromExternal++;
        }
        
        // Use body (plain text) or strip HTML from htmlBody, or fall back to snippet
        let content = msg.body || msg.snippet || '';
        // Truncate very long messages
        if (content.length > 1500) {
          content = content.substring(0, 1500) + '... [truncated]';
        }
        
        return `---
FROM: ${fromName ? `${fromName} <${from}>` : from}
DATE: ${date}
SUBJECT: ${subject}

${content}`;
      });
      
      return { messages, fromInternal, fromExternal };
    } catch (error) {
      console.warn(chalk.yellow(`[DEAL-MINING] Failed to fetch thread messages for ${threadId}:`), error);
      return { messages: [], fromInternal: 0, fromExternal: 0 };
    }
  }
  
  /**
   * Qualify deals using AI to filter out non-sales conversations
   * Uses gpt-4o-mini for speed and cost efficiency
   * Fetches full email content for better context
   */
  private static async qualifyDealsWithAI(
    deals: DiscoveredDeal[],
    context: AIQualificationContext
  ): Promise<DiscoveredDeal[]> {
    if (deals.length === 0) {
      return [];
    }
    
    const agent = mastra.getAgent('dealQualificationAgent');
    if (!agent) {
      console.warn(chalk.yellow('[DEAL-MINING] dealQualificationAgent not found, skipping AI qualification'));
      return deals; // Return all deals if agent not available
    }
    
    console.log(chalk.cyan(`[DEAL-MINING] AI qualifying ${deals.length} deals...`));
    
    // Build organization context section
    const orgContext = `
YOUR COMPANY CONTEXT:
- Company: ${context.organization.name}
${context.organization.industry ? `- Industry: ${context.organization.industry}` : ''}
${context.organization.about ? `- About: ${context.organization.about}` : ''}
- Company Email Domains: ${context.internalDomains.join(', ')}
  (Emails FROM these domains are from YOUR team, emails TO these domains are from external companies)
`.trim();
    
    const qualifiedDeals: DiscoveredDeal[] = [];
    
    // Convert to Set for the fetchThreadMessages call
    const internalDomainsSet = new Set(context.internalDomains.map(d => normalizeDomain(d)));
    
    for (const deal of deals) {
      try {
        // Fetch full thread messages for better context
        const { messages, fromInternal, fromExternal } = await this.fetchThreadMessages(
          context.grantId,
          deal.representativeThread.threadId,
          internalDomainsSet
        );
        
        // Build direction stats for AI
        const totalFetched = fromInternal + fromExternal;
        const directionStats = totalFetched > 0
          ? `- Messages from YOUR team: ${fromInternal} (${Math.round(fromInternal / totalFetched * 100)}%)
- Messages from PROSPECT: ${fromExternal} (${Math.round(fromExternal / totalFetched * 100)}%)`
          : '';
        
        // Build email content section
        const emailContent = messages.length > 0
          ? `EMAIL THREAD (${messages.length} most recent messages):\n${messages.join('\n\n')}`
          : `EMAIL SNIPPET: ${deal.representativeThread.snippet}`;
        
        // Build prompt with full context
        const prompt = `
${orgContext}

EVALUATE THIS POTENTIAL DEAL:

PROSPECT COMPANY: ${deal.companyName} (${deal.companyDomain})

THREAD SUBJECT: ${deal.representativeThread.subject}

ENGAGEMENT STATS:
- Total threads with this company: ${deal.threadCount}
- Total messages exchanged: ${deal.totalMessages}
- Last activity: ${deal.lastActivityDate.toISOString().split('T')[0]}
- First activity: ${deal.firstActivityDate.toISOString().split('T')[0]}
${directionStats}

PARTICIPANTS FROM PROSPECT:
${deal.participants.map(p => `- ${p.name || 'Unknown'} <${p.email}>`).join('\n')}

${emailContent}

Based on the email content and context, should this be tracked as a potential sales opportunity for ${context.organization.name}?

IMPORTANT: If the conversation is mostly one-way FROM the prospect with little/no response from your team, it may be:
- Vendors/salespeople trying to sell TO you (EXCLUDE)
- Inbound leads you haven't responded to yet (INCLUDE if genuine interest)
Analyze the content to determine which.
`;
        
        const result = await agent.generateLegacy(
          [{ content: prompt, role: 'user' }],
          {
            output: DealQualificationSchema,
            providerOptions: {
              openai: {
                metadata: {
                  file: 'deal-mining-service',
                  agent: 'dealQualificationAgent',
                  orgId: context.organizationId,
                }
              }
            }
          }
        );
        
        const qualification = result.object;
        
        if (qualification.include) {
          qualifiedDeals.push(deal);
          console.log(chalk.green(`  ✓ ${deal.companyName} - qualified (${qualification.confidence})`));
          console.log(chalk.green(`    → ${qualification.reasoning}`));
        } else {
          console.log(chalk.gray(`  ✗ ${deal.companyName} - filtered out (${qualification.confidence})`));
          console.log(chalk.gray(`    → ${qualification.reasoning}`));
        }
        
        // Small delay between AI calls to avoid rate limiting
        await this.sleep(100);
        
      } catch (error) {
        // On error, include the deal (false negatives are worse than false positives)
        console.warn(chalk.yellow(`[DEAL-MINING] AI qualification error for ${deal.companyDomain}, including by default:`), error);
        qualifiedDeals.push(deal);
      }
    }
    
    console.log(chalk.cyan(`[DEAL-MINING] AI qualified ${qualifiedDeals.length}/${deals.length} deals`));
    return qualifiedDeals;
  }
  
  /**
   * Save discovered deals as pending MinedDeal records
   */
  private static async saveMinedDeals(
    deals: DiscoveredDeal[],
    userId: mongoose.Types.ObjectId | string,
    organizationId: mongoose.Types.ObjectId | string
  ): Promise<IMinedDeal[]> {
    const savedDeals: IMinedDeal[] = [];
    
    for (const deal of deals) {
      try {
        const minedDeal = new MinedDeal({
          organization: organizationId,
          suggestedBy: userId,
          companyName: deal.companyName,
          domains: [deal.companyDomain],
          threadCount: deal.threadCount,
          totalMessages: deal.totalMessages,
          lastActivityDate: deal.lastActivityDate,
          firstActivityDate: deal.firstActivityDate,
          participants: deal.participants,
          representativeThread: deal.representativeThread,
          status: 'PENDING',
        });
        
        await minedDeal.save();
        savedDeals.push(minedDeal);
        
        console.log(chalk.green(`[DEAL-MINING] Saved mined deal: ${deal.companyName} (${deal.companyDomain})`));
        
      } catch (error: any) {
        // Handle duplicate key error (race condition - another process already mined this)
        if (error.code === 11000) {
          console.log(chalk.yellow(`[DEAL-MINING] Domain ${deal.companyDomain} already mined (duplicate key), skipping`));
        } else {
          console.error(chalk.red(`[DEAL-MINING] Error saving mined deal for ${deal.companyDomain}:`), error);
        }
      }
    }
    
    return savedDeals;
  }
  
  /**
   * Helper: sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
