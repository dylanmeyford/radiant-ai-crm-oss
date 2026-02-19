import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { playbookSelectionAgent } from '../agents/playbookSelectionAgent';
import { enhancedContentAgent } from '../agents/enhancedContentAgent';
import { researchAgent } from '../agents/researchAgent';
import { fetchPlaybookMetadata, fetchFullPlaybooks, prepareFilesForLLM } from '../../services/playbookService';
import { getSentPlaybooksByContact } from '../../services/sentPlaybookService';
import { ComposedEmailContentSchema } from '../../services/AI/actionPipeline/possibleActions/EMAIL/schema';
import { ComposedTaskContentSchema } from '../../services/AI/actionPipeline/possibleActions/TASK/schema';
import { ComposedCallContentSchema } from '../../services/AI/actionPipeline/possibleActions/CALL/schema';
import { ComposedMeetingContentSchema } from '../../services/AI/actionPipeline/possibleActions/MEETING/schema';
import { ComposedLinkedInMessageContentSchema } from '../../services/AI/actionPipeline/possibleActions/LINKEDIN MESSAGE/schema';
import { ComposedLookupContentSchema } from '../../services/AI/actionPipeline/possibleActions/LOOKUP/schema';
import { decideOnlineResearchAgent } from '../agents/decideOnlineResearchAgent';

// Define the input schema for the workflow
// *** This comes from the content file of the possible action handler that is calling this workflow ***
// Including the original prompt for what to compose!!!
const inputSchema = z.object({
  prompt: z.string().describe('The content creation request from the user'),
  organizationId: z.string().describe('Organization ID for scoping playbook searches'),
  originalDraft: z.string().optional().describe('The original draft from NBA agent to use as a reference/ceiling'),
  context: z.object({
    audienceType: z.string().optional().describe('Type of audience (e.g., technical, executive)'),
    contentType: z.string().optional().describe('Type of content (e.g., email, proposal, meeting_notes)'),
    dealStage: z.string().optional().describe('Current deal stage'),
    customerInfo: z.string().optional().describe('Additional customer context'),
    customerDescription: z.string().optional().describe('Additional customer description'),
  }).optional().describe('Additional context for content creation'),
  actionMode: z.enum(['lookup', 'composition']).optional().describe('Mode: lookup for info retrieval, composition for synthesis'),
  contactIds: z.array(z.string()).optional().describe('Array of contact IDs who are recipients of the content'),
  opportunityId: z.string().optional().describe('Opportunity ID for tracking sent documents'),
});

// Define dynamic output schemas that adjust to contentType
const baseMetaOutput = {
  searchPerformed: z.boolean().describe('Whether playbook search was performed'),
  sourcesUsed: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    relevanceScore: z.number().optional(),
  })).describe('Sources used in content creation'),
  downloadableFiles: z.array(z.object({
    filename: z.string(),
    downloadUrl: z.string(),
    mimeType: z.string(),
  })).describe('Files available for download'),

};

//******************** OUTPUT SCHEMAS *******************
// We dynamically determine the output schema based on the contentType of the request.
// ******************************************************//

const emailOutputSchema = z.object({
  schemaResult: ComposedEmailContentSchema,
  ...baseMetaOutput,
});

const taskOutputSchema = z.object({
  schemaResult: ComposedTaskContentSchema,
  ...baseMetaOutput,
});

const callOutputSchema = z.object({
  schemaResult: ComposedCallContentSchema,
  ...baseMetaOutput,
});

const meetingOutputSchema = z.object({
  schemaResult: ComposedMeetingContentSchema,
  ...baseMetaOutput,
});

const linkedInOutputSchema = z.object({
  schemaResult: ComposedLinkedInMessageContentSchema,
  ...baseMetaOutput,
});

const lookupOutputSchema = z.object({
  schemaResult: ComposedLookupContentSchema,
  ...baseMetaOutput,
});

const defaultOutputSchema = z.object({
  schemaResult: z.object({
    content: z.string().describe('Generic content when no specialized schema exists'),
  }),
  ...baseMetaOutput,
});

// Base workflow output schema (broad). At runtime we use a stricter schema for generation.
const outputSchema = z.object({
  result: z.any(),
  ...baseMetaOutput,
});

//******************** STEP 1: FETCH PLAYBOOK METADATA *******************
// This step fetches all available playbook metadata for the organization.
// It is used to populate the selection agent with the available playbooks.
// ***************************************************************//

const fetchMetadataStep = createStep({
  id: 'fetch-metadata',
  description: 'Fetch all available playbook metadata for the organization',
  inputSchema,
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
  }),
  execute: async ({ inputData }) => {
    const { prompt, organizationId, context, actionMode, contactIds, opportunityId, originalDraft } = inputData;
    const customerDescription = (context as { customerDescription?: string } | undefined)?.customerDescription;
    
    try {
      const metadata = await fetchPlaybookMetadata(organizationId);
      
      // Fetch sent playbooks if contactIds and opportunityId are provided
      let sentPlaybooksByContact = undefined;
      if (contactIds && contactIds.length > 0 && opportunityId) {
        sentPlaybooksByContact = await getSentPlaybooksByContact(contactIds, opportunityId);
      }
      
      return {
        originalRequest: { prompt, organizationId, originalDraft, context, actionMode, contactIds, opportunityId, customerDescription },
        playbookMetadata: metadata,
        totalPlaybooks: metadata.length,
        sentPlaybooksByContact,
      };
    } catch (error) {
      console.error('Error fetching playbook metadata:', error);
      throw new Error(`Failed to fetch playbook metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

//******************** STEP 2: FETCH SALES PROCESS AND TEMPLATE PLAYBOOKS *******************
// This step fetches the full content of playbooks that have type "sales_process" or "template"
// These are always fetched as they provide foundational guidance for content creation
// ***************************************************************//

const fetchSalesProcessAndTemplatesStep = createStep({
  id: 'fetch-sales-process-templates',
  description: 'Fetch full content for sales process and template playbooks',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, playbookMetadata, totalPlaybooks, sentPlaybooksByContact } = inputData;
    
    try {
      // Filter for sales_process and template type playbooks
      const salesProcessAndTemplateMetadata = playbookMetadata.filter(
        p => p.type === 'sales_process' || p.type === 'templates'
      );
      
      let salesProcessAndTemplatePlaybooks: any[] = [];
      
      // Fetch full content for these playbooks if any exist
      if (salesProcessAndTemplateMetadata.length > 0) {
        const playbookIds = salesProcessAndTemplateMetadata.map(p => p.id);
        salesProcessAndTemplatePlaybooks = await fetchFullPlaybooks(playbookIds);
        
        console.log(`Fetched ${salesProcessAndTemplatePlaybooks.length} sales process and template playbooks`);
      } else {
        console.log('No sales process or template playbooks found');
      }
      
      return {
        originalRequest,
        playbookMetadata,
        totalPlaybooks,
        sentPlaybooksByContact,
        salesProcessAndTemplatePlaybooks,
      };
    } catch (error) {
      console.error('Error fetching sales process and template playbooks:', error);
      throw new Error(`Failed to fetch sales process and template playbooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

//******************** STEP 3: CREATE DRAFT WITH PLACEHOLDERS *******************
// This step creates an initial draft using the enhanced content agent with sales process/template playbooks.
// It intelligently applies templates and processes based on context and creates placeholders
// with action strategies for missing information in the format: [option1 > option2 > fallback]
// ***************************************************************//

const createDraftWithPlaceholdersStep = createStep({
  id: 'create-draft-with-placeholders',
  description: 'Create initial draft with intelligent placeholders and action strategies',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any().describe('The draft content with dynamic schema based on content type'),
      placeholders: z.array(z.object({
        placeholder: z.string().describe('The placeholder text in square brackets'),
        actionStrategy: z.string().describe('The action strategy for filling this placeholder'),
        reasoning: z.string().describe('Why this placeholder is needed'),
      })).describe('List of placeholders and their action strategies'),
      templatesApplied: z.array(z.string()).describe('List of template IDs that were applied'),
      applicationReasoning: z.string().describe('Reasoning for which templates/processes were applied or not'),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, playbookMetadata, totalPlaybooks, sentPlaybooksByContact, salesProcessAndTemplatePlaybooks } = inputData;
    const baseDraft = (originalRequest as any)?.originalDraft?.toString().trim();

    // Determine dynamic output schema based on requested content type
    const requestedType = (originalRequest.context?.contentType || '').toString().toLowerCase();
    const dynamicOutput = requestedType === 'email'
      ? emailOutputSchema
      : requestedType === 'task'
        ? taskOutputSchema
        : requestedType === 'call_purpose'
          ? callOutputSchema
          : requestedType === 'meeting_agenda'
            ? meetingOutputSchema
            : requestedType === 'linkedin_message'
              ? linkedInOutputSchema
              : requestedType === 'lookup'
                ? lookupOutputSchema
                : defaultOutputSchema;
    
    // Prepare files for the content agent if any exist in sales process/template playbooks
    const allFiles = salesProcessAndTemplatePlaybooks.flatMap(playbook => playbook.files);
    const preparedFiles = await prepareFilesForLLM(allFiles);
    
    const contentParts: any[] = [];
    
    // Add the main prompt
    const draftPrompt = `
    ${originalRequest.prompt}
    ${baseDraft ? `
    <base_draft>
    ${baseDraft}
    </base_draft>
    ` : ''}
    <available_sales_processes_and_templates>
    ${JSON.stringify(salesProcessAndTemplatePlaybooks.map(p => ({
      id: p.id,
      type: p.type,
      title: p.title,
      content: p.content,
      summary: p.contentSummary,
      useCase: p.useCase,
    })), null, 2)}
    </available_sales_processes_and_templates>

    <composition_step_guidelines>
     1. Before writing ANYTHING, review the <previous_conversation_context> and <reply_context> sections above.
     2. Review what has been previously discussed and what has been previously sent to the recipients.
     3. Consider the history of the recipients and their engagement in the deal so far.
     4. If <base_draft> is provided, KEEP its tone/length/structure as the ceiling. Only add placeholders for genuinely missing info per the actionStrategy. Do not add extra offers, CTAs, or collateral unless explicitly missing and clearly value-add. Default to the base draft if unsure.
    <step_1>
    - Review the <available_sales_processes_and_templates> and understand the content and structure of the playbooks.
    - Intelligently decide which ones to apply and how based on the context
    - If you decide to use a template, use it as your base structure.
    - Explain your reasoning for applying or not applying each one
    </step_1>
    <step_2>
    - For any information you don't have but need (based on our our content strategy), create placeholders using square brackets.
    - Format: [option1 (best option) > option2 (good alternative) > option3 (fallback option)]
    - use our content strategy for writing the email depending on resource availablility as a guide to create the placeholders.
    - Create ONE placeholder per distinct piece of missing information
    - If multiple action strategies address the same concept, consolidate them into a SINGLE placeholder
    - Avoid creating adjacent placeholders that will result in repetitive text when filled
    - Examples:
    - - [Use ROI sheet > use general pricing sheet > tell them we'll speak to a manager]
    - - [get customer testimonial from automotive industry > get general testimonial > mention we'll provide references]
    - - [lookup specific product features > use general feature list > schedule technical deep dive]
    - Single CTA: The draft MUST contain exactly one call-to-action. If the action strategy mentions multiple options, pick the ONE most appropriate for the prospect's current state.
    - Personalization anchor and opener — these depend on whether this is a reply in an active thread:
      - If <reply_context> indicates this IS a reply in an active thread:
        - Do NOT include a personalization anchor. The context is already established in the thread.
        - Do NOT re-state information or context already discussed (e.g. their tech stack, previous agreements, product details).
        - The natural thread continuation IS the opener (e.g. "Thanks for confirming X", "Good question —"). No extra contextual sentence is needed.
      - If this is NOT a reply (new outreach, cold email, re-engagement):
        - Personalization anchor: The first 1-2 sentences MUST connect something specific about the prospect's situation to the reason you're reaching out — not just name-drop a factoid about their business. The anchor should bridge their context to why this email matters to them right now.
        - Context-aware opener after the greeting:
          - Closed Lost: Acknowledge the pause and lead with new value, not just permission-based language
          - Passive/awaiting: Reference what you're following up on
    </step_2>
    <step_3>
    - Create a complete draft with all placeholders clearly marked
    - Explain which templates/processes you applied and why
    - Explain exactly how each paragraph you write fulfills the reason/purpose for writing the ${requestedType} content.
    - Be thoughtful about when NOT to use a template if it doesn't fit
    - The draft should be in HTML body format with placeholders in square brackets and action strategies
    - The draft should be in the same tone and style as previous activities and messages.
    - If we are composing a message in a thread, or in response to a previous message, it should flow naturally as part of the ongoing conversation.
    </step_3>

    **Pre-Completion Checklist:**
    - [ ] Does my draft fulfill the reason/purpose for writing?
    - [ ] Have I used the <available_sales_processes_and_templates> to inform my approach?
    - [ ] Have I created placeholders for any information that is not available?
    - [ ] Does content sound natural and human-written?
    - [ ] If composing a message, have I not restated any information already contained in previous messages unless explicitly asked to do so in the most recent message?
    </instructions>
    `;

    contentParts.push({
      type: "text",
      text: draftPrompt
    });

    // Add any files from the sales process/template playbooks
    preparedFiles.forEach(file => {
      if (file.type === 'text') {
        contentParts.push({
          type: "text",
          text: `\n\n<file name="${file.originalFilename}">\n${file.data}\n</file>`
        });
      } else {
        contentParts.push({
          type: "file",
          data: file.data,
          mimeType: file.mimeType || 'application/octet-stream',
        });
      }
    });

    // Generate the draft using enhanced content agent
    const draftResponse = await enhancedContentAgent.generateLegacy([{
      content: contentParts,
      role: 'user',
    }], {
      output: z.object({
        draft: dynamicOutput,
        placeholders: z.array(z.object({
          placeholder: z.string().describe('The placeholder text exactly as it appears in square brackets'),
          actionStrategy: z.string().describe('The action strategy (option1 > option2 > option3)'),
          reasoning: z.string().describe('Why this placeholder is needed and what it will provide'),
        })),
        templatesApplied: z.array(z.string()).describe('List of template/process IDs that were applied in creating this draft'),
        applicationReasoning: z.string().describe('Detailed reasoning for which templates/processes were applied or not applied and why, and how each paragraph you write fulfills the reason/purpose for writing the content.'),
      }),
      providerOptions: {
        openai: {
          timeout: 300000, // 5 minutes for complex reasoning with large payloads
          metadata: {
            file: 'content-composition-workflow-create-draft',
            agent: 'enhancedContentAgent',
            orgId: originalRequest?.organizationId as string || '',
            opportunityId: originalRequest?.opportunityId as string || '',
          }
        }
      }
    });

    console.log('Draft created with placeholders:', draftResponse.object);

    return {
      originalRequest,
      playbookMetadata,
      totalPlaybooks,
      sentPlaybooksByContact,
      salesProcessAndTemplatePlaybooks,
      draftContent: draftResponse.object as any,
    };
  },
});

//******************** STEP 4: SELECT PLAYBOOKS TO FILL PLACEHOLDERS *******************
// This step uses an LLM to select playbooks that will fill the placeholders identified in the draft.
// It matches playbooks to placeholder action strategies (option1 > option2 > option3).
// We also check if any playbooks have already been sent to the recipients.
// If so, we exclude them from the selection.
// ***************************************************************//

const selectPlaybooksStep = createStep({
  id: 'select-playbooks',
  description: 'Select playbooks that match placeholder action strategies to fill draft gaps',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    playbookMetadata: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      contentSummary: z.string().optional(),
      content: z.string().optional(),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    totalPlaybooks: z.number(),
    sentPlaybooksByContact: z.record(z.string(), z.array(z.object({
      documentId: z.string(),
      documentType: z.string(),
      sentAt: z.date().optional(),
    }))).optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    totalAvailable: z.number(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, playbookMetadata, totalPlaybooks, sentPlaybooksByContact, salesProcessAndTemplatePlaybooks, draftContent } = inputData;
    
    if (playbookMetadata.length === 0) {
      return {
        originalRequest,
        selection: {
          selectionReasoning: "No playbooks available for this organization",
          selectedPlaybooks: [],
          totalSelected: 0,
          unfilledPlaceholders: draftContent.placeholders.map(p => p.placeholder),
          recommendations: "Content will be generated without organizational playbook support. All placeholders will remain unfilled.",
        },
        totalAvailable: 0,
        salesProcessAndTemplatePlaybooks,
        draftContent,
      };
    }

    // Create a list of playbooks that have been sent to ANY recipient
    let sentPlaybooksInfo = '';
    if (sentPlaybooksByContact && originalRequest.contactIds && originalRequest.contactIds.length > 0) {
      const allSentPlaybookIds = new Set<string>();
      const recipientDetails: string[] = [];
      
      for (const contactId of originalRequest.contactIds) {
        const sentDocs = sentPlaybooksByContact[contactId] || [];
        if (sentDocs.length > 0) {
          recipientDetails.push(`Contact ${contactId}: ${sentDocs.map(d => d.documentId).join(', ')}`);
          sentDocs.forEach(doc => allSentPlaybookIds.add(doc.documentId));
        }
      }
      
      if (allSentPlaybookIds.size > 0) {
        sentPlaybooksInfo = `
      
      PREVIOUSLY SENT PLAYBOOKS:
      The following playbooks have already been sent to one or more recipients of this email:
      ${recipientDetails.join('\n')}
      
      **IMPORTANT CONSTRAINT**: Playbooks containing 'collateral' or 'case_study' types are considered INELIGIBLE for selection if ANY of the intended recipients have already received them (as shown above). 
      Do NOT select these ineligible playbooks unless the user's request explicitly asks to 'resend' that specific information.
      Other playbook types (templates, guidelines, FAQs, battle cards, etc.) can be reused without restriction.
        `;
      }
    }

    // Create the prompt for the selection agent
    const selectionPrompt = `
      YOUR TASK:
      A draft has been created with placeholders marking where specific information is needed. Your job is to select playbooks that will provide the information to fill these placeholders according to their action strategies.

      DRAFT CONTENT:
      ${draftContent.draft.schemaResult.body}

      PLACEHOLDERS TO FILL (with action strategies):
      ${JSON.stringify(draftContent.placeholders, null, 2)}

      TEMPLATES ALREADY APPLIED:
      ${draftContent.templatesApplied.length > 0 ? draftContent.templatesApplied.join(', ') : 'None'}
      
      APPLICATION REASONING:
      ${draftContent.applicationReasoning}

      AVAILABLE PLAYBOOKS TO SELECT FROM (${totalPlaybooks} total):
      ${JSON.stringify(playbookMetadata.map(p => ({
        id: p.id,
        type: p.type,
        title: p.title,
        tags: p.tags,
        keywords: p.keywords,
        contentSummary: p.contentSummary,
        useCase: p.useCase,
      })), null, 2)}
      ${sentPlaybooksInfo}

      INSTRUCTIONS:
      Your ONLY goal is to select playbooks that will help fill the placeholders identified in the draft.

      For each placeholder, review its action strategy format: [option1 > option2 > option3]
      - option1 is the best/most specific option
      - option2 is a good alternative
      - option3 is the fallback

      Select playbooks that match these action strategies. For example:
      - If placeholder says [fetch ROI sheet > use general pricing sheet > tell them we'll speak to a manager], look for playbooks about ROI or pricing
      - If placeholder says [get automotive testimonial > get general testimonial > mention we'll provide references], look for testimonial playbooks

      IMPORTANT RULES:
      1. Focus ONLY on filling placeholders - don't select playbooks for general enhancement
      2. Match playbook types and content to the action strategies in the placeholders
      3. If a placeholder's action strategy can't be fulfilled by any available playbook, that's okay - don't select unrelated playbooks
      4. Explain which specific placeholder(s) each selected playbook will help fill
      5. Do NOT select playbooks that were already applied as templates (${draftContent.templatesApplied.join(', ')})

      Return your selection with clear reasoning for HOW each playbook will fill specific placeholders.
    `;

    // Generate selection using the playbook selection agent
    const selectionResponse = await playbookSelectionAgent.generateLegacy(selectionPrompt, {
      output: z.object({
        selectionReasoning: z.string().describe('Overall reasoning for the selection strategy'),
        selectedPlaybooks: z.array(z.object({
          playbookId: z.string().describe('The ID of the selected playbook'),
          title: z.string().describe('The title of the selected playbook'),
          selectionReason: z.string().describe('Why this playbook was selected'),
          placeholdersToFill: z.array(z.string()).describe('List of placeholder texts (from the square brackets) that this playbook will help fill'),
          actionStrategyMatch: z.string().describe('Which part of the action strategy this playbook fulfills (e.g., "option1 - best match" or "option2 - alternative")'),
          expectedContribution: z.string().describe('What specific information from this playbook will fill the placeholders'),
          relevanceScore: z.number().describe('Relevance score 0-10'),
        })),
        totalSelected: z.number(),
        unfilledPlaceholders: z.array(z.string()).describe('List of placeholder texts that could not be filled by any available playbook'),
        recommendations: z.string().describe('Recommendations for improving the content or finding missing information'),
      }),
      providerOptions: {
        openai: {
          timeout: 300000, // 5 minutes for complex reasoning with large payloads
          metadata: {
            opportunityId: originalRequest?.opportunityId as string || '',
            file: 'content-composition-workflow-select-playbooks',
            agent: 'playbookSelectionAgent',
            orgId: (originalRequest?.organizationId as string) || '',
          }
        }
      }
    });

  return {
      originalRequest,
      selection: selectionResponse.object!,
      totalAvailable: totalPlaybooks,
      salesProcessAndTemplatePlaybooks,
      draftContent,
    };
  },
});

//******************** STEP 5: FETCH FULL PLAYBOOKS *******************
// This step retrieves the full content and files for the selected playbooks.
// These playbooks contain the information needed to fill the placeholders in the draft.
// ***************************************************************//

const fetchPlaybooksStep = createStep({
  id: 'fetch-playbooks',
  description: 'Retrieve full content and files for selected playbooks that will fill placeholders',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    totalAvailable: z.number(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, selection, totalAvailable, salesProcessAndTemplatePlaybooks, draftContent } = inputData;
    
    if (selection.totalSelected === 0) {
      return {
        originalRequest,
        selection,
        fullPlaybooks: [],
        fetchSuccessful: true, // No error, just no playbooks to fetch
        salesProcessAndTemplatePlaybooks,
        draftContent,
      };
    }
    
    try {
      const playbookIds = selection.selectedPlaybooks
        .filter(p => p.playbookId !== 'web-search')
        .map(p => p.playbookId);
      const fullPlaybooks = await fetchFullPlaybooks(playbookIds);

      const webSearchPlaybook = selection.selectedPlaybooks.find(p => p.playbookId === 'web-search');
      if (webSearchPlaybook) {
        fullPlaybooks.push({
          id: 'web-search',
          title: 'Web Search For ' + webSearchPlaybook.title,
          content: webSearchPlaybook.expectedContribution,
          contentSummary: 'Web Search Results for ' + webSearchPlaybook.title,
          tags: [],
          keywords: [],
          useCase: '',
          lastUsed: new Date(),
          usageCount: 0,
          files: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'web-search',
        });
      }

      return {
        originalRequest,
        selection,
        fullPlaybooks,
        fetchSuccessful: true,
        salesProcessAndTemplatePlaybooks,
        draftContent,
      };
    } catch (error) {
      console.error('Error fetching full playbooks:', error);
      throw new Error(`Failed to fetch full playbooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});


//******************** STEP 6: ASSESS RESEARCH NEEDS *******************
// This step determines if web research is needed to fill unfilled placeholders.
// It checks if the fetched playbooks are sufficient to complete the draft.
// ***************************************************************//

const assessResearchStep = createStep({
  id: 'assess-research',
  description: 'Determine if web research is needed to fill remaining unfilled placeholders',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    needsResearch: z.boolean(),
    researchQuery: z.string().optional(),
    researchRationale: z.string().optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, selection, fullPlaybooks, fetchSuccessful, salesProcessAndTemplatePlaybooks, draftContent } = inputData;

    const decisionPrompt = `
    You are helping decide if we need to run a brief web research pass before composing content.

    <request_prompt>
    ${originalRequest.prompt}
    </request_prompt>

    <context>
    Customer Info: ${JSON.stringify(originalRequest.customerDescription) || 'Not specified'}
    </context>

    <selected_playbooks>
    ${JSON.stringify(fullPlaybooks.map(p => ({ id: p.id, title: p.title, type: p.type, summary: p.contentSummary })), null, 2)}
    </selected_playbooks>

    Determine if we are missing timely, externally verifiable information that is typically NOT inside internal playbooks, such as:
    - People at the company (leadership, relevant stakeholders)
    - Recent company news, funding, product launches
    - Market/industry stats, benchmarks, notable events

    Return JSON with:
    - needsResearch: boolean
    - researchQuery: concise web search query if true (e.g., "<Company> recent news" or "<Company> leadership team")
    - researchRationale: brief reason if true
    `;

    const decision = await decideOnlineResearchAgent.generateLegacy([
      { content: [{ type: 'text', text: decisionPrompt }], role: 'user' },
    ], {
      output: z.object({
        needsResearch: z.boolean(),
        researchQuery: z.string().optional(),
        researchRationale: z.string().optional(),
      }),
      providerOptions: {
        openai: {
          timeout: 300000, // 5 minutes for complex reasoning with large payloads
          metadata: {
            opportunityId: originalRequest?.opportunityId as string || '',
            file: 'content-composition-workflow-assess-research',
            agent: 'decideOnlineResearchAgent',
            orgId: originalRequest?.organizationId as string || '',
          }
        }
      }
    });

    const needsResearch = Boolean((decision.object as any)?.needsResearch);
    const researchQuery = (decision.object as any)?.researchQuery;
    const researchRationale = (decision.object as any)?.researchRationale;

    return {
      originalRequest,
      selection,
      fullPlaybooks,
      fetchSuccessful,
      needsResearch,
      researchQuery,
      researchRationale,
      salesProcessAndTemplatePlaybooks,
      draftContent,
    };
  },
});

//******************** STEP 7a: PERFORM WEB RESEARCH (IF NEEDED) *******************
// This step performs web research to fill unfilled placeholders when internal playbooks are insufficient.
// Web research results are appended to fullPlaybooks for use in placeholder filling.
// ***************************************************************//

const performResearchStep = createStep({
  id: 'perform-web-research',
  description: 'Perform web research to help fill unfilled placeholders and append results to playbooks',
  inputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      originalDraft: z.string().optional(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
      customerDescription: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    needsResearch: z.boolean(),
    researchQuery: z.string().optional(),
    researchRationale: z.string().optional(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, selection, fullPlaybooks, fetchSuccessful, researchQuery, researchRationale, salesProcessAndTemplatePlaybooks, draftContent } = inputData;

    const researchPrompt = `
You are assisting a sales content workflow. Conduct a quick web search and produce a concise, structured brief to inform messaging.

<request_prompt>
${originalRequest.prompt}
</request_prompt>

<query>
${researchQuery || ''}
</query>

<notes>
${researchRationale || ''}
</notes>

Return a well-structured summary with:
- Introduction
- Main Points (bulleted)
- Conclusion
- Sources (with URLs)
`;

    const researchResponse = await researchAgent.generateLegacy([
      { role: 'user', content: researchPrompt }],
    {
      providerOptions: {
        openai: {
          timeout: 300000, // 5 minutes for complex reasoning with large payloads
          metadata: {
            file: 'content-composition-workflow-perform-web-research',
            agent: 'researchAgent',
            orgId: originalRequest?.organizationId as string || '',
            opportunityId: originalRequest?.opportunityId as string || '',
          }
        }
      }
    });

    const webPlaybook = {
      id: 'web-search',
      type: 'web-search',
      title: `Web Research Results` + (researchQuery ? `: ${researchQuery}` : ''),
      content: researchResponse.text,
      contentSummary: `Web research summary${researchQuery ? ` for ${researchQuery}` : ''}`,
      tags: [] as string[],
      keywords: [] as string[],
      useCase: 'external-intelligence',
      lastUsed: new Date(),
      usageCount: 0,
      files: [] as any[],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    return {
      originalRequest,
      selection,
      fullPlaybooks: [...fullPlaybooks, webPlaybook],
      fetchSuccessful,
      salesProcessAndTemplatePlaybooks,
      draftContent,
    };
  },
});

//******************** STEP 7b: PASSTHROUGH (IF NO RESEARCH NEEDED) *******************
// This step is a no-op passthrough when web research is not needed.
// It simply passes the data forward to the final content generation step.
// ***************************************************************//

const passthroughStep = createStep({
  id: 'passthrough',
  description: 'No-op passthrough when research is not needed - forwards data to placeholder filling',
  inputSchema: assessResearchStep.outputSchema,
  outputSchema: z.object({
    originalRequest: z.object({
      prompt: z.string(),
      organizationId: z.string(),
      context: z.any().optional(),
      actionMode: z.enum(['lookup', 'composition']).optional(),
      contactIds: z.array(z.string()).optional(),
      opportunityId: z.string().optional(),
    }),
    selection: z.object({
      selectionReasoning: z.string(),
      selectedPlaybooks: z.array(z.object({
        playbookId: z.string(),
        title: z.string(),
        selectionReason: z.string(),
        placeholdersToFill: z.array(z.string()).optional(),
        actionStrategyMatch: z.string().optional(),
        expectedContribution: z.string(),
        relevanceScore: z.number(),
      })),
      totalSelected: z.number(),
      unfilledPlaceholders: z.array(z.string()).optional(),
      recommendations: z.string(),
    }),
    fullPlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    fetchSuccessful: z.boolean(),
    salesProcessAndTemplatePlaybooks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      content: z.string(),
      contentSummary: z.string().optional(),
      tags: z.array(z.string()),
      keywords: z.array(z.string()),
      useCase: z.string().optional(),
      lastUsed: z.date().optional(),
      usageCount: z.number(),
      files: z.array(z.object({
        documentId: z.string(),
        originalFilename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        downloadUrl: z.string(),
        uploadedAt: z.date(),
      })),
      createdAt: z.date(),
      updatedAt: z.date(),
    })),
    draftContent: z.object({
      draft: z.any(),
      placeholders: z.array(z.object({
        placeholder: z.string(),
        actionStrategy: z.string(),
        reasoning: z.string(),
      })),
      templatesApplied: z.array(z.string()),
      applicationReasoning: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { originalRequest, selection, fullPlaybooks, fetchSuccessful, salesProcessAndTemplatePlaybooks, draftContent } = inputData as any;
    return { originalRequest, selection, fullPlaybooks, fetchSuccessful, salesProcessAndTemplatePlaybooks, draftContent };
  },
});



//******************** STEP 8: FILL PLACEHOLDERS AND FINALIZE CONTENT *******************
// This step takes the draft and surgically fills in placeholders with information from fetched playbooks.
// It preserves the draft structure and only replaces placeholders with relevant information.
// Unfilled placeholders are converted to angle bracket format <> for manual completion.
// ***************************************************************//

// Shared schema for finalization steps (pruning + content generation)
const finalizeInputSchema = z.object({
  originalRequest: z.object({
    prompt: z.string(),
    organizationId: z.string(),
    originalDraft: z.string().optional(),
    context: z.any().optional(),
    actionMode: z.enum(['lookup', 'composition']).optional(),
    contactIds: z.array(z.string()).optional(),
    opportunityId: z.string().optional(),
  }),
  selection: z.object({
    selectionReasoning: z.string(),
    selectedPlaybooks: z.array(z.object({
      playbookId: z.string(),
      title: z.string(),
      selectionReason: z.string(),
      placeholdersToFill: z.array(z.string()).optional(),
      actionStrategyMatch: z.string().optional(),
      expectedContribution: z.string(),
      relevanceScore: z.number(),
    })),
    totalSelected: z.number(),
    unfilledPlaceholders: z.array(z.string()).optional(),
    recommendations: z.string(),
  }),
  fullPlaybooks: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string(),
    contentSummary: z.string().optional(),
    tags: z.array(z.string()),
    keywords: z.array(z.string()),
    useCase: z.string().optional(),
    lastUsed: z.date().optional(),
    usageCount: z.number(),
    files: z.array(z.object({
      documentId: z.string(),
      originalFilename: z.string(),
      fileSize: z.number(),
      mimeType: z.string(),
      downloadUrl: z.string(),
      uploadedAt: z.date(),
    })),
    createdAt: z.date(),
    updatedAt: z.date(),
  })),
  fetchSuccessful: z.boolean(),
  salesProcessAndTemplatePlaybooks: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string(),
    contentSummary: z.string().optional(),
    tags: z.array(z.string()),
    keywords: z.array(z.string()),
    useCase: z.string().optional(),
    lastUsed: z.date().optional(),
    usageCount: z.number(),
    files: z.array(z.object({
      documentId: z.string(),
      originalFilename: z.string(),
      fileSize: z.number(),
      mimeType: z.string(),
      downloadUrl: z.string(),
      uploadedAt: z.date(),
    })),
    createdAt: z.date(),
    updatedAt: z.date(),
  })).optional(),
  draftContent: z.object({
    draft: z.any(),
    placeholders: z.array(z.object({
      placeholder: z.string(),
      actionStrategy: z.string(),
      reasoning: z.string(),
    })),
    templatesApplied: z.array(z.string()),
    applicationReasoning: z.string(),
  }),
});

const generateContentStep = createStep({
  id: 'generate-content',
  description: 'Fill placeholders in draft with playbook information while preserving structure and style',
  inputSchema: finalizeInputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const { originalRequest, selection, fullPlaybooks, fetchSuccessful, draftContent } = inputData;

    // Create mapping of which playbooks fill which placeholders
    const placeholderToPlaybooks = new Map<string, any[]>();
    selection.selectedPlaybooks.forEach(selected => {
      if (selected.placeholdersToFill) {
        selected.placeholdersToFill.forEach(placeholder => {
          if (!placeholderToPlaybooks.has(placeholder)) {
            placeholderToPlaybooks.set(placeholder, []);
          }
          const fullPlaybook = fullPlaybooks.find(fp => fp.id === selected.playbookId);
          if (fullPlaybook) {
            placeholderToPlaybooks.get(placeholder)!.push({
              ...fullPlaybook,
              actionStrategyMatch: selected.actionStrategyMatch,
            });
          }
        });
      }
    });

    // Create comprehensive prompt for placeholder filling
    const contentPrompt = `

    <original_draft>
    ${Object.entries(draftContent.draft.schemaResult)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}
    </original_draft>

    <placeholders_to_fill>
    ${JSON.stringify(draftContent.placeholders, null, 2)}
    </placeholders_to_fill>

    <playbooks_for_filling_placeholders>
    ${JSON.stringify(fullPlaybooks.map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      content: p.content,
      contentSummary: p.contentSummary,
    })), null, 2)}
    </playbooks_for_filling_placeholders>

    <placeholder_to_playbook_mapping>
    ${JSON.stringify(Array.from(placeholderToPlaybooks.entries()).map(([placeholder, playbooks]) => ({
      placeholder,
      playbooks: playbooks.map(p => ({
        id: p.id,
        title: p.title,
        actionStrategyMatch: p.actionStrategyMatch,
      }))
    })), null, 2)}
    </placeholder_to_playbook_mapping>

    <unfilled_placeholders>
    ${selection.unfilledPlaceholders && selection.unfilledPlaceholders.length > 0 
      ? `These placeholders could not be filled because no suitable playbook was found:\n${selection.unfilledPlaceholders.join('\n')}` 
      : 'All placeholders have matching playbooks.'}
    </unfilled_placeholders>

    <instructions>
    **YOUR PRIMARY GOAL: Fill in the placeholders in the draft with information from the playbooks**

    CRITICAL RULES:
    1. **PRESERVE THE STRUCTURE**: Keep the draft's structure, formatting, paragraphs, and style as written.
    2. **ADAPT FOR FLOW**: You represent the sender. Write as if YOU are sending the email. You may adjust the immediate words surrounding a placeholder if necessary to ensure the sentence is grammatically correct and flows naturally. Prioritize natural flow over literal placeholder-by-placeholder replacement
    3. **DON'T BLINDLY PASTE**: Do not blindly copy-paste chunks of text. Adapt the playbook information to fit the specific context, grammar, and tone of the sentence.
    4. **FOLLOW ACTION STRATEGIES**: Each placeholder has an action strategy (option1 > option2 > option3). 
      - Fill the placeholder with the BEST available option from the playbooks
      - You may add ONE fallback if genuinely helpful, but don't list all three options in sequence
      - The goal is natural conversation, not exhaustive option listing
    5. **HANDLE UNFILLED PLACEHOLDERS**: For placeholders without matching playbooks, use angle bracket format: <description of needed info>
    6. **NEVER INVENT INFORMATION**: Only use information explicitly provided in the playbooks.
    7. **MAINTAIN TONE**: Keep the same tone and writing style as the original draft.

    STEP-BY-STEP INSTRUCTIONS FOR EACH PLACEHOLDER:
    1. Locate the placeholder in the draft (it's in square brackets: [...]).
    2. Check which playbooks can fill it, in order of priority (option1 > option2 > option3), and choose the best fit to insert.
    3. Extract the relevant information from those playbooks.
    4. Synthesize the information into the draft. If the placeholder assumes a specific sentence structure (e.g. "starts at [timestamp]") but your information is different (e.g. "we can do a walkthrough"), you MUST adjust the surrounding words (e.g. change "starts at" to "but") to make the sentence coherent.
    5. Ensure the result sounds like a natural, human-written email.

    EXAMPLES:
    - Draft: "The video [timestamp placeholder]."
    - If timestamp found: "The video starts at 12:30."
    - If fallback is live walkthrough: "The video doesn't capture it well, so let's do a live walkthrough." (Note how "starts at" was removed/changed to fit the new context).

    **DO NOT:**
    - Restructure paragraphs or sections widely.
    - Change the writing style or tone.
    - Add new content that wasn't indicated by placeholders.
    - Remove content that exists in the draft (except to fix grammar around a placeholder).
    - Make up information not in the playbooks.
    </instructions>

    <pre_finish_checklist>
    Before finishing, verify:
    - [ ] Have I kept the draft structure exactly as it was?
    - [ ] Have I replaced all placeholders where playbooks were available?
    - [ ] Have I used angle brackets <> for unfilled placeholders?
    - [ ] Have I only used information from the provided playbooks?
    - [ ] Does the content flow naturally after replacements?
    - [ ] I have re-read the email and made sure that it reads properly and is coherent.
    </pre_finish_checklist>
    `;

    const contentParts: any[] = [
      {
        type: "text",
        text: contentPrompt
      }
    ];


    // Prepare files for the content agent using the new helper
    const allPlaybookFiles = fullPlaybooks.flatMap(playbook => playbook.files);
    const preparedFiles = await prepareFilesForLLM(allPlaybookFiles);
    
    // Convert prepared files to the format expected by the agent
    const files = preparedFiles.map(file => {
      if (file.type === 'text') {
        contentParts.push({
          type: "text",
          text: file.data as string
        });
      } else {
        contentParts.push({
          type: "file",
          data: file.data,
          mimeType: file.mimeType || 'application/octet-stream',
        });
      }
    });

    // Determine dynamic output schema based on requested content type
    const requestedType = (originalRequest.context?.contentType || '').toString().toLowerCase();
    const dynamicOutput = requestedType === 'email'
      ? emailOutputSchema
      : requestedType === 'task'
        ? taskOutputSchema
        : requestedType === 'call_purpose'
          ? callOutputSchema
          : requestedType === 'meeting_agenda'
            ? meetingOutputSchema
            : requestedType === 'linkedin_message'
              ? linkedInOutputSchema
              : requestedType === 'lookup'
                ? lookupOutputSchema
                : defaultOutputSchema;

    // Generate content using the enhanced content agent with the dynamic schema
    const contentResponse = await enhancedContentAgent.generateLegacy([{
      content: contentParts,
      role: 'user',
    }],
      {
        output: dynamicOutput,
        providerOptions: {
          openai: {
            timeout: 300000, // 5 minutes for complex reasoning with large payloads
            metadata: {
              file: 'enhanced-content-agent',
              agent: 'enhancedContentAgent',
              orgId: originalRequest?.organizationId as string || '',
              opportunityId: originalRequest?.opportunityId as string || '',
            }
          }
        }
      }
    );

    // Extract downloadable files from selected playbooks
    const downloadableFiles = fullPlaybooks.flatMap(playbook => 
      playbook.files.map(file => ({
        filename: file.originalFilename,
        downloadUrl: file.downloadUrl,
        mimeType: file.mimeType,
      }))
    );

    // Extract sources used from selected playbooks
    const sourcesUsed = fullPlaybooks.map(playbook => {
      const selectedPlaybook = selection.selectedPlaybooks.find(sp => sp.playbookId === playbook.id);
      return {
        id: playbook.id,
        title: playbook.title,
        type: playbook.type,
        relevanceScore: selectedPlaybook?.relevanceScore || 0,
      };
    });

    console.log((contentResponse.object as any)?.schemaResult);

    // Build recommendations based on placeholder filling status
    let placeholderSummary = '';
    if (selection.unfilledPlaceholders && selection.unfilledPlaceholders.length > 0) {
      placeholderSummary = `\n\n⚠️ ${selection.unfilledPlaceholders.length} placeholder(s) could not be filled and need manual completion (marked with angle brackets <>).`;
    } else {
      placeholderSummary = `\n\n✓ All placeholders were successfully filled with information from playbooks.`;
    }

    const filledCount = draftContent.placeholders.length - (selection.unfilledPlaceholders?.length || 0);

    return {
      result: contentResponse.object || {},
      searchPerformed: selection.totalSelected > 0,
      sourcesUsed,
      downloadableFiles,
      recommendations: `${selection.recommendations}${placeholderSummary}\n\nDraft completed: ${filledCount}/${draftContent.placeholders.length} placeholders filled using ${selection.totalSelected} selected playbook(s).`,
    };
  },
});


// Create and export the redesigned workflow
export const contentCompositionWorkflow = createWorkflow({
  id: 'content-composition-workflow-v2',
  description: 'Intelligent content creation workflow: fetch metadata → fetch sales process/templates → create draft with placeholders → select playbooks → fetch content → generate content',
  inputSchema,
  outputSchema,
})
  .then(fetchMetadataStep)
  .then(fetchSalesProcessAndTemplatesStep)
  .then(createDraftWithPlaceholdersStep)
  .then(selectPlaybooksStep)
  .then(fetchPlaybooksStep)
  .then(assessResearchStep)
  .branch([
    [async ({ inputData }) => Boolean((inputData as any).needsResearch), performResearchStep],
    [async ({ inputData }) => !Boolean((inputData as any).needsResearch), passthroughStep],
  ])
  .map(({ inputData }) => {
    const data = (inputData as any)['perform-web-research'] ?? (inputData as any)['passthrough'] ?? inputData;
    return data;
  })
  .then(generateContentStep)
  .commit(); 