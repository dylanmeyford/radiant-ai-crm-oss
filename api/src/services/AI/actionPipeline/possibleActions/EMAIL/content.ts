import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';
import { IEmailActivity } from '../../../../../models/EmailActivity.js';
import { serializeWorkflowRun } from '../../../../../utils/mastraWorkflowSerializer';

function buildEmailContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, contacts, recentActivities } = context;
  
  const sourceActivityIds = action.sourceActivityIds || [];
  
  const sourceActivities = recentActivities.filter(activity => 
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const toContacts = contacts.filter(({ contact }) => 
    action.details.to.includes(contact.emails?.[0]?.address)
  );

  const ccContacts = contacts.filter(({ contact }) => 
    action.details.cc?.includes(contact.emails?.[0]?.address)
  );

  const bccContacts = contacts.filter(({ contact }) => 
    action.details.bcc?.includes(contact.emails?.[0]?.address)
  );

  const isReply = !!action.details.replyToMessageId;
  const replyContext = isReply ? sourceActivities.find(activity => 
    'threadId' in activity && 
    (activity.messageId as string) === action.details.replyToMessageId
  ) : null;

  return `
  <role>
    You are an elite B2B AE, writing an high impact email to your prospect.
  </role>
  <todays_date>
    Today's Date: ${new Date().toISOString().split('T')[0]}. Time is ${new Date().toISOString().split('T')[1]}.
  </todays_date>
  <opportunity_context>
    <opportunity_name>
      ${opportunity.name || 'Unnamed Opportunity'}
    </opportunity_name>
    <opportunity_stage>
      ${opportunity.stage}
    </opportunity_stage>
    <opportunity_description>
      ${opportunity.description || 'No description available'}
    </opportunity_description>
    <opportunity_meddpicc>
      ${opportunity.meddpicc || 'No MEDDPICC available'}
    </opportunity_meddpicc>
  </opportunity_context>

  <email_content_context>
  <email_tone>
  - Email Tone: Friendly but professional. Optimise for low-friction replies that move the deal one step (schedule, intro, doc request) without sounding salesy.
  - We write like we are writing to a friend or collegue. We are never 'salesy' or 'pushy'. 
  - We avoid cliched sales/process phrases/jargon (for example, 'emailing with a quick ask', 'looping back around', 'technical gating points', 'synergy', 'Alignment', 'Move the Needle', 'Deliverables' etc. ).
  - Avoid all salesy/process jargon (blacklist: align/alignment, loop back, synergy, gating, leverage, artefacts, roadmap-y phrasing
  - Instead we write simple, friendly, clean and straight forward. For example, instead of saying 'I wanted to reconnect briefly on the BePrepared proposal and remove the two technical gating points you raised.', we say 'I wanted to see how you're progressing reviwing our proposal, and if you still had any questions regarding the technical aspects.'
  </email_tone>
  <recipients_and_context>
  <to>
  ${toContacts.map(({ contact, intelligence }) => `
  - **${contact.firstName} ${contact.lastName}** (${contact.emails?.[0]?.address})
    - Role: ${intelligence.roleAssignments?.slice(-1)[0]?.role || 'Unknown'}
    - Engagement: ${intelligence.engagementScore || 'Not specified'}
    - Relationship: ${intelligence.relationshipStory || 'New contact'}
  `).join('\n')}
  </to>
  <cc>
  ${ccContacts.map(({ contact, intelligence }) => `
  - **${contact.firstName} ${contact.lastName}** (${contact.emails?.[0]?.address})
    - Role: ${intelligence.roleAssignments?.slice(-1)[0]?.role || 'Unknown'}
    - Engagement: ${intelligence.engagementScore || 'Not specified'}
    - Relationship: ${intelligence.relationshipStory || 'New contact'}
  `).join('\n')}
  </cc>
  <bcc>
  ${bccContacts.map(({ contact, intelligence }) => `
  - **${contact.firstName} ${contact.lastName}** (${contact.emails?.[0]?.address})
    - Role: ${intelligence.roleAssignments?.slice(-1)[0]?.role || 'Unknown'}
    - Engagement: ${intelligence.engagementScore || 'Not specified'}
    - Relationship: ${intelligence.relationshipStory || 'New contact'}
  `).join('\n')}
  </bcc>
  </recipients_and_context>
  <previous_conversation_context>
  ${recentActivities.length > 0 ? recentActivities.map(activity => `
  - **${activity.date.toISOString()}**: ${activity.aiSummary?.summary || activity.title || 'Activity'}
  `).join('\n') : 'No specific source activities referenced'}
  </previous_conversation_context>
  <source_activities_context>
  ${sourceActivities.length > 0 ? sourceActivities.map(activity => `
  - **${activity.date.toISOString()}**: ${activity.aiSummary?.summary || activity.title || 'Activity'}
  `).join('\n') : 'No specific source activities referenced'}
  </source_activities_context>
  <reply_context>
  ${isReply ? `
  - This is a reply to: ${replyContext?.aiSummary?.summary || 'Previous email'}
  - This is a CONTINUATION of an existing conversation
  - DON'T repeat what's already been said
  - Address ONLY the new items
  - Keep the same tone as previous messages
  - Make sure we reply in a manner that is consistent with the previous messages, and how a friendly professional would.
  ` : ''}
  </reply_context>
  </email_content_context>

  <instructions>
  Our goal is to compose an email that achieves the following objectives:
    <objectives>
      <objective>
        - The reason/purpose for writing the email: ${action.reasoning}
      </objective>
      <objective>
        - Content guidance: ${action.actionStrategy}
        - If the guidance says NO_MATERIAL_NEEDED, write a direct conversational email without referencing or including any internal assets, collateral, or attachments. Focus purely on the message.
        - If material is referenced, incorporate it naturally only where it genuinely adds value. Do not force material into the email if the core message works without it.
      </objective>
      <objective>
        - The subject line of the email: ${isReply ? 'Subject line is ' + (replyContext as IEmailActivity)?.subject : 'A short, simple subject line'}
      </objective>
      <objective>
        - If a reply, responds naturally as part of the ongoing conversation. With the same tone and style as the previous messages.
      </objective>
      <objective>
        - Does not include a signature or sign off. Do NOT sign off the email with a name. Only write some variation of 'Best,' or 'Thanks,' or 'Regards,' or 'Kindest,' or 'Kind Regards,"
      </objective>
      <objective>
        - Only has ONE call to action. Do NOT offer multiple options (e.g., "call OR email OR schedule later"). Instead picks the most appropriate ask for this prospect's state.
      </objective>
      ${isReply ? `
      <objective>
        - This is a reply in an active thread. Continue the conversation naturally from the last message.
        - Do NOT include a personalization anchor — the context is already established.
        - Do NOT re-state information or context already discussed in the thread (e.g. their tech stack, previous agreements, product details).
        - The opener should directly address what the recipient last said or move the conversation forward (e.g. "Hi [Name], Thanks for confirming X" or "Hey All, Good question —").
        - NEVER use generic openers like "Hope you're well" without context.
      </objective>
      ` : `
      <objective>
        - Includes a personalization anchor. Before any pitch, include ONE sentence that connects the prospect's situation to the reason you're reaching out:
          - The anchor must bridge something specific about the prospect (what they said, their role, their business context) to why this email is relevant to them right now.
          - BAD: Name-dropping a factoid with no connection to the email's purpose (e.g. "Given [Company]'s focus on [unrelated topic]..." followed by an unrelated pitch)
          - GOOD: Connecting their context to your reason for emailing (e.g. "Since you mentioned [pain point], here's how we address that..." or "Given your team is scaling [area], this is relevant because...")
          - This proves you understand their situation, not just that you researched them.
      </objective>
      <objective>
      - Has a context appropriate opener. After the opener/greeting ('Hi [Name],', 'Hi All', Hey [name], etc.), we should have a context appropriate message.
        - For Closed Lost re-engagement: acknowledge the pause and lead with new value ("We parked this in [month] — since then [new relevant development]...")
        - For follow-ups awaiting reply: reference what you're following up on
        - NEVER use generic openers like "Hope you're well" without context
      </objective>
      `}
    </objectives>
  </instructions>
  `;
}
//do not include closing off information on content prompt as we insert this into larger prompts

export async function composeContent(
  action: MainAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  const run = await mastra.getWorkflow('contentCompositionWorkflow').createRunAsync();
  if (!run) {
    throw new Error('Content Composition Workflow not found in mastra configuration');
  }

  const prompt = buildEmailContentPrompt(action, context, parentAction);
  const isSubAction = !!parentAction;
  const mode = isSubAction ? 'lookup' : 'composition';

  // Gather all unique contact IDs from to, cc, and bcc fields
  const toContacts = context.contacts.filter(({ contact }) => 
    action.details.to?.includes(contact.emails?.[0]?.address)
  );
  const ccContacts = context.contacts.filter(({ contact }) => 
    action.details.cc?.includes(contact.emails?.[0]?.address)
  );
  const bccContacts = context.contacts.filter(({ contact }) => 
    action.details.bcc?.includes(contact.emails?.[0]?.address)
  );

  // Collect all unique contact IDs
  const allRecipientContacts = [...toContacts, ...ccContacts, ...bccContacts];
  const uniqueContactIds = [...new Set(allRecipientContacts.map(({ contact }) => 
    (contact._id as mongoose.Types.ObjectId).toString()
  ))];

  try {
    const result = await run.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        originalDraft: action.details.body,
        context: {
          contentType: 'email',
          audienceType: 'sales_prospect',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, About the Opportunity: ${context.opportunity.description || 'No description available'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: mode,
        // Add contact IDs and opportunity ID for tracking sent documents
        contactIds: uniqueContactIds,
        opportunityId: context.opportunity._id.toString()
      }
    });

    // Store workflow metadata in the result for later use during execution
    if (result && result.status === 'success' && uniqueContactIds.length > 0) {
      const workflowMetadata = {
        sourcesUsed: result.result.sourcesUsed || [],
        contactIds: uniqueContactIds,
        opportunityId: context.opportunity._id.toString(),
        workflowResult: serializeWorkflowRun(result)
      };
      
      // Add the metadata to the result so it gets stored in action.details
      if (result.result.result?.schemaResult) {
        result.result.result.schemaResult.workflowMetadata = workflowMetadata;
      } else if (result.result.result) {
        result.result.result.workflowMetadata = workflowMetadata;
      }
    }

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating email content:`), error);
    return null;
  }
}

