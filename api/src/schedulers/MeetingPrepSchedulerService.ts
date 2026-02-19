import cron from 'node-cron';
import chalk from 'chalk';
import CalendarActivity, { ICalendarActivity } from '../models/CalendarActivity';
import Opportunity from '../models/Opportunity';
import EmailActivity from '../models/EmailActivity';
import { mastra } from '../mastra';
import { ProposedAction } from '../models/ProposedAction';
import SalesPlaybook, { ContentType } from '../models/SalesPlaybook';
import { z } from 'zod';

/**
 * MeetingPrepSchedulerService
 * 
 * Handles scheduling meeting preparation by generating AI-powered agendas for upcoming meetings.
 * - Checks for CalendarActivity records with startTime in the next 24 hours
 * - Generates meeting agendas only if they don't already exist
 * - Uses MeetingPrepAgent to create comprehensive, context-aware meeting preparation content
 */

class MeetingPrepSchedulerService {
  private schedulerTask: cron.ScheduledTask;
  private isRunning: boolean = false;
  private isSchedulerRunning: boolean = false;

  constructor() {
    // Schedule a task to run every hour to check for meetings needing preparation
    // Running hourly provides good balance between responsiveness and resource usage
    this.schedulerTask = cron.schedule('0 * * * *', this.processMeetingPreparation.bind(this), {
      scheduled: false // Don't start automatically, will be started manually
    });
  }

  /**
   * Start the scheduler
   */
  public start(): void {
    console.log(chalk.blue.bold('[MEETING PREP SCHEDULER] Starting Meeting Preparation Scheduler Service...'));
    this.isSchedulerRunning = true;
    this.schedulerTask.start();
    console.log(chalk.green('[MEETING PREP SCHEDULER] Meeting Preparation Scheduler Service started successfully'));
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    console.log(chalk.yellow('[MEETING PREP SCHEDULER] Stopping Meeting Preparation Scheduler Service...'));
    this.isSchedulerRunning = false;
    this.schedulerTask.stop();
    console.log(chalk.red('[MEETING PREP SCHEDULER] Meeting Preparation Scheduler Service stopped'));
  }

  /**
   * Get scheduler status
   */
  public getStatus(): { running: boolean; processing: boolean } {
    return {
      running: this.isSchedulerRunning,
      processing: this.isRunning
    };
  }

  /**
   * Process meetings that need preparation in the next 24 hours
   */
  private processMeetingPreparation = async (): Promise<void> => {
    if (this.isRunning) {
      console.log(chalk.yellow('[MEETING PREP SCHEDULER] Meeting preparation process already running, skipping this iteration'));
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log(chalk.blue.bold('[MEETING PREP SCHEDULER] Starting meeting preparation process...'));

      // Find meetings in the next 24 hours that don't have agendas yet
      const now = new Date();
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const meetingsNeedingPrep = await CalendarActivity.find({
        startTime: {
          $gte: now,
          $lte: next24Hours
        },
        status: { $in: ['scheduled', 'to_do'] }, // Only scheduled meetings
        agenda: { $exists: false }, // No existing agenda
      }).populate([
        {
          path: 'contacts',
          populate: {
            path: 'prospect',
            populate: {
              path: 'opportunities'
            }
          }
        },
        { path: 'prospect' },
        { path: 'createdBy' }
      ]).lean();

      console.log(chalk.cyan(`[MEETING PREP SCHEDULER] Found ${meetingsNeedingPrep.length} meetings needing preparation`));

      if (meetingsNeedingPrep.length === 0) {
        console.log(chalk.green('[MEETING PREP SCHEDULER] No meetings need preparation at this time'));
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Process each meeting
      for (const meeting of meetingsNeedingPrep) {
        try {
          console.log(chalk.blue(`[MEETING PREP SCHEDULER] Processing meeting: ${meeting.title} (${meeting._id}) scheduled for ${new Date(meeting.startTime).toISOString()}`));
          
          await this.generateMeetingAgenda(meeting as any);
          successCount++;
          
          console.log(chalk.green(`[MEETING PREP SCHEDULER] Successfully generated agenda for meeting: ${meeting.title} (${meeting._id})`));
        } catch (error) {
          errorCount++;
          console.error(chalk.red(`[MEETING PREP SCHEDULER] Error processing meeting ${meeting._id}:`), error);
          // Continue with other meetings even if one fails
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(chalk.green.bold(`[MEETING PREP SCHEDULER] Meeting preparation process completed in ${processingTime}ms`));
      console.log(chalk.cyan(`[MEETING PREP SCHEDULER] Results - Success: ${successCount}, Errors: ${errorCount}, Total: ${meetingsNeedingPrep.length}`));

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(chalk.red.bold(`[MEETING PREP SCHEDULER] Error in meeting preparation process after ${processingTime}ms:`), error);
    } finally {
      this.isRunning = false;
    }
  };

  /**
   * Generate meeting agenda for a specific meeting using MeetingPrepAgent
   */
  private generateMeetingAgenda = async (meeting: ICalendarActivity & { contacts: any[]; prospect: any; createdBy: any }): Promise<void> => {
    try {
      // Gather context for the meeting
      const context = await this.gatherMeetingContext(meeting);
      
      // Prepare the prompt for MeetingPrepAgent
      const prompt = this.buildMeetingPrepPrompt(meeting, context);
      
      // Generate agenda using MeetingPrepAgent
      const meetingPrepAgent = mastra.getAgent('meetingPrepAgent');
      if (!meetingPrepAgent) {
        throw new Error('MeetingPrepAgent not found in mastra configuration');
      }
      
      const MeetingAgendaSchema = z.object({
        agendaHtml: z.string().describe('The agenda in HTML format')
          .min(50, 'Agenda must be reasonably detailed')
          .refine((s) => /<[^>]+>/.test(s) && /<\/[a-zA-Z]/.test(s), 'Agenda must be valid-looking HTML with tags')
      });

      const agentResponse = await meetingPrepAgent.generateLegacy([
        {
          role: 'user',
          content: prompt
        }
      ], {
        output: MeetingAgendaSchema,
        providerOptions: {
          openai: {
            metadata: {
              file: 'meeting-prep-scheduler-service',
              agent: 'meetingPrepAgent',
              orgId: (meeting?.organization as any)?._id?.toString() || '',
              activityId: (meeting as any)?._id?.toString() || '',
            }
          }
        } 
      });

      const agendaObject = (agentResponse as any).object as { agendaHtml: string } | undefined;
      if (!agendaObject?.agendaHtml) {
        throw new Error('MeetingPrepAgent did not return valid structured HTML agenda');
      }

      // Update the meeting with the generated agenda
      await CalendarActivity.findByIdAndUpdate(meeting._id, {
        agenda: {
          content: agendaObject.agendaHtml,
          generatedAt: new Date(),
          generatedBy: 'MeetingPrepAgent' as const,
          version: '1.0'
        }
      });

      console.log(chalk.green(`[MEETING PREP SCHEDULER] Generated agenda for meeting ${meeting._id}`));

    } catch (error) {
      console.error(chalk.red(`[MEETING PREP SCHEDULER] Error generating agenda for meeting ${meeting._id}:`), error);
      throw error;
    }
  };

  /**
   * Gather comprehensive context for meeting preparation
   */
  private gatherMeetingContext = async (meeting: ICalendarActivity & { contacts: any[]; prospect: any; createdBy: any }) => {
    const context: any = {
      meeting: {
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: Math.round((new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / (1000 * 60)), // minutes
        location: meeting.location,
        attendees: meeting.attendees || [],
        timezone: meeting.timezone
      },
      contacts: [],
      prospect: null,
      opportunity: null,
      opportunities: [],
      dealIntelligence: null,
      recentActivities: [],
      futureEvents: [],
      existingActions: [],
      businessInformation: [],
      productInformation: [],
      productOverview: []
    };

    // Add prospect information
    if (meeting.prospect) {
      context.prospect = {
        name: meeting.prospect.name,
        description: meeting.prospect.description,
        domains: meeting.prospect.domains,
        industry: meeting.prospect.industry,
        size: meeting.prospect.size,
        stage: meeting.prospect.stage
      };
    }

    // Add contact information and determine relevant opportunity following contact intelligence logic
    if (meeting.contacts && meeting.contacts.length > 0) {
      const contactIds = meeting.contacts.map((c: any) => c._id);

      // All opportunities across all meeting contacts
      const allOpportunities = await Opportunity.find({ contacts: { $in: contactIds } }).lean();

      // Choose the correct opportunity (similar to contact intelligence service)
      let selectedOpportunity: any | null = null;
      if (allOpportunities.length === 1) {
        selectedOpportunity = allOpportunities[0];
      } else if (allOpportunities.length > 1) {
        const activeOpportunities = allOpportunities.filter(
          (opp: any) => opp.stage !== 'CLOSED_WON' && opp.stage !== 'CLOSED_LOST'
        );

        if (activeOpportunities.length === 1) {
          selectedOpportunity = activeOpportunities[0];
        } else if (activeOpportunities.length > 1) {
          activeOpportunities.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          selectedOpportunity = activeOpportunities[0];
          console.warn(chalk.yellow(`  -> Meeting ${meeting._id} has multiple active opportunities across participants. Using most recent: ${selectedOpportunity._id}`));
        } else {
          allOpportunities.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          selectedOpportunity = allOpportunities[0];
          console.log(chalk.yellow(`  -> Meeting ${meeting._id} participants have no active opportunities. Using most recent closed: ${selectedOpportunity._id}`));
        }
      }

      context.opportunities = allOpportunities.map(opp => ({
        id: opp._id,
        name: opp.name,
        stage: opp.stage,
        value: opp.amount,
        closeDate: opp.expectedCloseDate,
        description: opp.description,
        meddpicc: opp.meddpicc,
        updatedAt: opp.updatedAt
      }));

      if (selectedOpportunity) {
        context.opportunity = {
          _id: selectedOpportunity._id,
          name: selectedOpportunity.name,
          stage: selectedOpportunity.stage,
          amount: selectedOpportunity.amount,
          description: selectedOpportunity.description,
          meddpicc: selectedOpportunity.meddpicc,
          organization: selectedOpportunity.organization,
          expectedCloseDate: selectedOpportunity.expectedCloseDate,
        };
      }

      // Enrich contacts with per-opportunity intelligence (role, engagement, responsiveness, relationship story)
      context.contacts = meeting.contacts.map((contact: any) => {
        const intel = context.opportunity ? (contact.opportunityIntelligence || []).find((oi: any) => oi.opportunity?.toString() === context.opportunity._id.toString()) : null;
        const latestResponsiveness = intel?.responsiveness?.length ? intel.responsiveness[intel.responsiveness.length - 1] : null;
        const latestRole = intel?.roleAssignments?.length ? intel.roleAssignments[intel.roleAssignments.length - 1]?.role : undefined;

        return {
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          title: contact.title,
          department: contact.department,
          emails: contact.emails?.map((e: any) => e.address) || [],
          phones: contact.phones?.map((p: any) => p.number) || [],
          intelligence: context.opportunity ? {
            engagementScore: intel?.engagementScore,
            responsiveness: latestResponsiveness?.status,
            relationshipStory: intel?.relationshipStory,
            roleAssignments: intel?.roleAssignments || [],
            latestRole: latestRole,
          } : undefined,
        };
      });
    }

    // Get recent email activities with the contacts
    if (meeting.contacts && meeting.contacts.length > 0) {
      const contactIds = meeting.contacts.map((c: any) => c._id);
      const recentEmails = await EmailActivity.find({
        contacts: { $in: contactIds },
        date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      })
      .sort({ date: -1 })
      .limit(10)
      .lean();

      context.recentActivities = recentEmails.map(email => ({
        type: 'email',
        date: email.date,
        subject: email.subject,
        snippet: email.snippet,
        from: email.from,
        to: email.to
      }));
    }

    // Get recent calendar activities with the same contacts
    if (meeting.contacts && meeting.contacts.length > 0) {
      const contactIds = meeting.contacts.map((c: any) => c._id);
      const recentMeetings = await CalendarActivity.find({
        contacts: { $in: contactIds },
        startTime: { 
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          $lt: new Date() // Only past meetings
        },
        _id: { $ne: meeting._id } // Exclude current meeting
      })
      .sort({ startTime: -1 })
      .limit(5)
      .lean();

      const recentMeetingActivities = recentMeetings.map(mtg => ({
        type: 'meeting',
        date: mtg.startTime,
        title: mtg.title,
        description: mtg.description,
        attendees: mtg.attendees,
        status: mtg.status
      }));

      context.recentActivities = [...context.recentActivities, ...recentMeetingActivities]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15); // Keep most recent 15 activities
    }

    // Future events with the same contacts (excluding this meeting)
    if (meeting.contacts && meeting.contacts.length > 0) {
      const contactIds = meeting.contacts.map((c: any) => c._id);
      const upcomingMeetings = await CalendarActivity.find({
        contacts: { $in: contactIds },
        startTime: { $gt: new Date(meeting.startTime) },
        _id: { $ne: meeting._id }
      })
      .sort({ startTime: 1 })
      .limit(5)
      .lean();

      context.futureEvents = upcomingMeetings.map(evt => ({
        _id: evt._id,
        title: evt.title,
        startTime: evt.startTime,
      }));
    }

    // Existing actions for the selected opportunity
    if (context.opportunity) {
      const actions = await ProposedAction.find({ opportunity: context.opportunity._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      context.existingActions = actions.map((a: any) => ({
        _id: a._id,
        type: a.type,
        status: a.status,
        reasoning: a.reasoning,
      }));
    }

    // Deal intelligence summary similar to ActionPipelineService
    if (context.opportunity) {
      context.dealIntelligence = {
        opportunity: {
          name: context.opportunity.name,
          stage: context.opportunity.stage,
          amount: context.opportunity.amount,
          expectedCloseDate: context.opportunity.expectedCloseDate,
        },
        meddpicc: {
          metrics: context.opportunity.meddpicc?.metrics || [],
          economicBuyer: context.opportunity.meddpicc?.economicBuyer || [],
          decisionCriteria: context.opportunity.meddpicc?.decisionCriteria || [],
          decisionProcess: context.opportunity.meddpicc?.decisionProcess || [],
          paperProcess: context.opportunity.meddpicc?.paperProcess || [],
          identifiedPain: context.opportunity.meddpicc?.identifiedPain || [],
          champion: context.opportunity.meddpicc?.champion || [],
          competition: context.opportunity.meddpicc?.competition || [],
        },
      };
    }

    // Business and product information from playbooks
    try {
      const orgId = context.opportunity?.organization;
      if (orgId) {
        const [businessInformation, productInformation, productOverview, salesProcess] = await Promise.all([
          SalesPlaybook.find({ organization: orgId, type: ContentType.BUSINESS_INFORMATION }).lean(),
          SalesPlaybook.find({ organization: orgId, type: ContentType.PRODUCT_INFO }).lean(),
          SalesPlaybook.find({ organization: orgId, type: ContentType.PRODUCT_OVERVIEW }).lean(),
          SalesPlaybook.find({ organization: orgId, type: ContentType.SALES_PROCESS }).lean(),
        ]);
        context.businessInformation = businessInformation.map((d: any) => d.content).filter(Boolean);
        context.productInformation = productInformation.map((d: any) => d.content).filter(Boolean);
        context.productOverview = productOverview.map((d: any) => d.content).filter(Boolean);
        context.salesProcess = salesProcess.map((d: any) => d.content).filter(Boolean);
      }
    } catch (err) {
      console.warn(chalk.yellow(`[MEETING PREP SCHEDULER] Could not fetch playbook content for meeting ${meeting._id}`));
    }

    return context;
  };

  /**
   * Build the prompt for MeetingPrepAgent
   */
  private buildMeetingPrepPrompt = (meeting: ICalendarActivity, context: any): string => {
    const contactsSummary = context.contacts.map((contact: any) => {
      return `- ${contact.name || 'Unknown'}${contact.emails?.[0] ? ` (${contact.emails[0]})` : ''} | Role: ${contact.intelligence?.latestRole || 'Unknown'} | Engagement: ${contact.intelligence?.engagementScore ?? 'N/A'} | Responsiveness: ${contact.intelligence?.responsiveness || 'Unknown'}${contact.intelligence?.relationshipStory ? ` | Story: ${contact.intelligence.relationshipStory}` : ''}`;
    }).join('\n');

    const recentActivitiesSummary = (context.recentActivities || []).slice(0, 10).reverse().map((activity: any) => {
      const activityType = activity.type === 'email' ? 'EMAIL' : activity.type === 'meeting' ? 'MEETING' : 'ACTIVITY';
      const dateStr = new Date(activity.date).toLocaleDateString();
      const summary = activity.subject || activity.title || activity.snippet || 'No summary';
      return `[${activityType}] ${dateStr}: ${summary}`;
    }).join('\n');

    const eventsSummary = (context.futureEvents || []).slice(0, 5).map((evt: any) => `- ${evt.title} on ${new Date(evt.startTime).toLocaleDateString()}`).join('\n');

    const existingActionsSummary = (context.existingActions || []).slice(0, 5).map((a: any) => `- [${a.type}] ${a.status}: ${a.reasoning || 'No details'}`).join('\n');

    const businessInfo = (context.businessInformation || []).join('\n');
    const productInfo = (context.productInformation || []).join('\n');
    const productOverview = (context.productOverview || []).join('\n');
    const salesProcess = (context.salesProcess || []).join('\n');
    
    // Analyze MEDDPICC for gaps (Known Unknowns)
    const meddpicc = context.dealIntelligence?.meddpicc || {};
    const meddpiccGaps: string[] = [];
    
    // Check each MEDDPICC element for missing or weak data
    if (!meddpicc.metrics?.length) meddpiccGaps.push('METRICS: No success metrics defined - what does "winning" look like for them?');
    if (!meddpicc.economicBuyer?.length) meddpiccGaps.push('ECONOMIC BUYER: Unknown - who signs the check and what do they care about?');
    if (!meddpicc.decisionCriteria?.length) meddpiccGaps.push('DECISION CRITERIA: Unknown - what are they evaluating solutions against?');
    if (!meddpicc.decisionProcess?.length) meddpiccGaps.push('DECISION PROCESS: Unknown - what steps do they need to take to buy?');
    if (!meddpicc.paperProcess?.length) meddpiccGaps.push('PAPER PROCESS: Unknown - what does procurement/legal review look like?');
    if (!meddpicc.identifiedPain?.length) meddpiccGaps.push('PAIN: No pain points captured - what problem are we actually solving?');
    if (!meddpicc.champion?.length) meddpiccGaps.push('CHAMPION: No internal champion identified - who will sell for us when we leave the room?');
    if (!meddpicc.competition?.length) meddpiccGaps.push('COMPETITION: Unknown - who else are they talking to or what is the status quo?');

    // Check stakeholder gaps
    const stakeholderGaps: string[] = [];
    const attendeeEmails = (context.meeting.attendees || []).map((a: any) => a.email?.toLowerCase());
    const knownContacts = context.contacts || [];
    
    for (const attendee of (context.meeting.attendees || [])) {
      const matchedContact = knownContacts.find((c: any) => 
        c.emails?.some((e: string) => e.toLowerCase() === attendee.email?.toLowerCase())
      );
      if (!matchedContact) {
        stakeholderGaps.push(`NEW FACE: ${attendee.name || attendee.email} - no intel. Discover: role, priorities, influence level.`);
      } else if (!matchedContact.intelligence?.latestRole || matchedContact.intelligence?.latestRole === 'Unknown') {
        stakeholderGaps.push(`${attendee.name || attendee.email}: Role in buying process unknown.`);
      }
    }

    const knownUnknownsSummary = [...meddpiccGaps, ...stakeholderGaps].join('\n') || 'No critical gaps identified.';

    return `
<context>
  <date>Today: ${new Date().toISOString().split('T')[0]}</date>
  
  <our_business>${businessInfo || 'Not specified'}</our_business>
  <our_products>${productOverview || ''} ${productInfo || ''}</our_products>
  <sales_process>${salesProcess || 'Not specified'}</sales_process>
</context>

<opportunity>
  <name>${context.opportunity?.name || 'Unknown Opportunity'}</name>
  <stage>${context.opportunity?.stage || 'Unknown'}</stage>
  <value>$${context.opportunity?.amount || 'Not specified'}</value>
  <description>${context.opportunity?.description || 'No description'}</description>
  
  <stakeholders>
${contactsSummary || 'No contacts listed'}
  </stakeholders>
  
  <recent_activity>
${recentActivitiesSummary || 'No recent activities'}
  </recent_activity>
  
  <upcoming_events>
${eventsSummary || 'None scheduled'}
  </upcoming_events>
  
  <pending_actions>
${existingActionsSummary || 'None'}
  </pending_actions>
  
  <meddpicc>
${context.dealIntelligence ? JSON.stringify(context.dealIntelligence.meddpicc, null, 2) : 'No MEDDPICC data'}
  </meddpicc>
  
  <known_unknowns>
    These are the critical gaps in our knowledge that MUST be filled to advance this deal.
    Use this meeting to discover the answers.
${knownUnknownsSummary}
  </known_unknowns>
</opportunity>

<meeting>
  <title>${context.meeting.title || 'Untitled Meeting'}</title>
  <when>${new Date(context.meeting.startTime).toLocaleString()} (${context.meeting.duration} min)</when>
  <location>${context.meeting.location || 'Not specified'}</location>
  ${context.meeting.description ? `<description>${context.meeting.description}</description>` : ''}
  <attendees>
${(context.meeting.attendees || []).map((a: any) => `- ${a.name || a.email} (${a.responseStatus || 'unknown'})`).join('\n') || 'No attendees listed'}
  </attendees>
</meeting>

<instructions>
  Create a SCANNABLE ONE-PAGER the rep can glance at during the live call.
  
  KNOWN UNKNOWNS PRINCIPLE (from Founding Sales):
  Before any call, identify what you DON'T know. These gaps are deal-killers if left unfilled.
  The <known_unknowns> section above shows the critical gaps. Your POWER QUESTIONS must be 
  designed to fill the HIGHEST PRIORITY gaps first.
  
  OUTPUT STRUCTURE (HTML format):
  
  1. **🎯 3 OBJECTIVES** — Must-achieve outcomes for this meeting
     - Bold bullets, <20 words each
     - Specific to THIS meeting and deal stage
     - At least ONE objective must be filling a Known Unknown
     
  2. **🔴 KNOWN UNKNOWNS** — Top 3 gaps we MUST fill in this meeting
     - Format: "[MEDDPICC Element]: What we don't know"
     - Prioritized by deal-killing potential
     - These drive the Power Questions below
     
  3. **❓ 3 POWER QUESTIONS** — Exact phrasing to read aloud
     - Each question MUST map to a Known Unknown above
     - Tailored to the attendees (use their names)
     - Format: "To fill [GAP]: 'Exact question to ask...'"
     - Designed to uncover blockers or get commitments
     
  4. **✅ 3 COMMITMENTS TO GET** — Specific asks
     - Format: "[Name] → [Action] by [Date]"
     - Real names, real dates (calculate from today)
     
  5. **👥 WHO'S IN THE ROOM** (collapsible <details> tag)
     - 1 line per person: Name | Role | What they care about | What we don't know about them
     - Flag any NEW FACES with ⚠️
     
  6. **📊 DEAL STATE** (collapsible <details> tag)
     - 2-3 sentences max: Where we are, what's blocking, why this meeting matters
     
  7. **💬 IF THEY SAY...** (collapsible <details> tag)
     - 3-4 likely objections with ready-to-use responses
     - Include rebuttals for common stalls: "Send me info", "Call me next quarter", "Need to think about it"
  
  RULES:
  - Total visible content (before expanding): ~350 words max
  - NO paragraphs in sections 1-4 — bullets only
  - Questions must be EXACT PHRASING ready to read aloud
  - Commitments must have NAME + ACTION + DATE
  - POWER QUESTIONS must directly address KNOWN UNKNOWNS — no generic discovery
  - If we don't know who the Economic Buyer is, one question MUST be designed to find out
  - Use the context to make this specific, not generic
  - The rep has 2 seconds to glance at this during the call — optimize for that
</instructions>`;
  };

  /**
   * Generate meeting agenda for a specific meeting by ID
   */
  public async generateMeetingAgendaById(meetingId: string): Promise<{ success: boolean; message: string; agenda?: string }> {
    try {
      console.log(chalk.blue(`[MEETING PREP SCHEDULER] Generating agenda for specific meeting: ${meetingId}`));

      // Find the specific meeting with populated data
      const meeting = await CalendarActivity.findById(meetingId).populate([
        {
          path: 'contacts',
          populate: {
            path: 'prospect',
            populate: {
              path: 'opportunities'
            }
          }
        },
        { path: 'prospect' },
        { path: 'createdBy' }
      ]).lean();

      if (!meeting) {
        return {
          success: false,
          message: `Meeting with ID ${meetingId} not found`
        };
      }

      // Check if meeting already has an agenda
      if (meeting.agenda) {
        return {
          success: false,
          message: `Meeting already has an agenda generated at ${meeting.agenda.generatedAt}`
        };
      }

      // Generate the agenda
      await this.generateMeetingAgenda(meeting as any);

      // Fetch the updated meeting to get the agenda
      const updatedMeeting = await CalendarActivity.findById(meetingId).lean();
      
      console.log(chalk.green(`[MEETING PREP SCHEDULER] Successfully generated agenda for meeting: ${meeting.title} (${meetingId})`));
      
      return {
        success: true,
        message: `Meeting agenda generated successfully for "${meeting.title}"`,
        agenda: updatedMeeting?.agenda?.content
      };

    } catch (error) {
      console.error(chalk.red(`[MEETING PREP SCHEDULER] Error generating agenda for meeting ${meetingId}:`), error);
      return {
        success: false,
        message: `Failed to generate meeting agenda: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Manual trigger for meeting preparation process
   */
  public async triggerMeetingPreparation(): Promise<{ success: boolean; message: string; processedCount?: number; errorCount?: number }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Meeting preparation process is already running'
      };
    }

    try {
      await this.processMeetingPreparation();
      return {
        success: true,
        message: 'Meeting preparation process completed successfully'
      };
    } catch (error) {
      console.error(chalk.red('[MEETING PREP SCHEDULER] Error in manual trigger:'), error);
      return {
        success: false,
        message: `Meeting preparation process failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Create and export a singleton instance
const meetingPrepSchedulerService = new MeetingPrepSchedulerService();
export default meetingPrepSchedulerService;
