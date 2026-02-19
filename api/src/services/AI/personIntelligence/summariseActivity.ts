import { mastra } from "../../../mastra";
import Activity, { ActivityType } from "../../../models/Activity";
import EmailActivity, { IEmailActivity } from "../../../models/EmailActivity";
import CalendarActivity from "../../../models/CalendarActivity";
import Organization from "../../../models/Organization";
import SalesPlaybook, { ContentType } from "../../../models/SalesPlaybook";
import Prospect from "../../../models/Prospect";
import Contact from "../../../models/Contact";
import {
  emailOutputSchema,
  meetingOutputSchema,
  messageActivityOutputSchema,
  digitalSalesRoomOutputSchema,
  getSummariseActivityOutputSchema,
} from '../schemas';
import User from "../../../models/User";
import Opportunity from "../../../models/Opportunity";
import chalk from 'chalk';
import { EvalCaptureService } from '../evals/EvalCaptureService';

// Utility function to clean placeholder entries from AI output
const cleanPlaceholderEntries = (obj: any): any => {
  if (Array.isArray(obj)) {
    // Filter out placeholder entries from arrays
    return obj
      .filter(item => {
        if (typeof item === 'string') {
          const upperItem = item.toUpperCase();
          return !['UNKNOWN', 'END', 'DONE', 'FINAL', 'STOP', 'NONE', 'N/A', 'TRIM', 'COMPLETE', 'FIN', 'TRUNCATED', 'PLACEHOLDER'].includes(upperItem);
        }
        if (typeof item === 'object' && item !== null) {
          // Check if it's a placeholder object (e.g., competition/name/metric contains placeholder text)
          const itemStr = JSON.stringify(item).toUpperCase();
          // Keep the entry if it doesn't look like pure placeholder noise
          const hasRealContent = Object.values(item).some(val => 
            typeof val === 'string' && 
            val.length > 3 && 
            !['UNKNOWN', 'END', 'DONE', 'FINAL', 'STOP', 'NONE', 'N/A', 'TRIM', 'COMPLETE', 'FIN', 'TRUNCATED', 'PLACEHOLDER', 'OK', 'BYE', 'GOODBYE'].includes(val.toUpperCase())
          );
          return hasRealContent;
        }
        return true;
      })
      .map(item => cleanPlaceholderEntries(item));
  } else if (typeof obj === 'object' && obj !== null) {
    // Recursively clean nested objects
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = cleanPlaceholderEntries(value);
    }
    return cleaned;
  }
  return obj;
};

export const summariseActivity = async (activityId: string) => {
  console.log(chalk.blue.bold(`[+] Starting activity summarization for ${activityId}...`));
  
    let activity = await Activity.findById(activityId)
    let user;
    let priorMessages = '';
    if (activity?.createdBy) {
      user = await User.findById(activity.createdBy);
    } 

    if (activity) {
      let fetchedActivities = await Activity.find({
        prospect: activity.prospect,
        createdBy: user?._id,
        createdAt: { $lt: activity.createdAt }
      })
      .sort({ createdAt: -1 })
      .limit(10);
      priorMessages = fetchedActivities.map((activity) => `Activity Date: ${activity.date}\nActivity Type: ${activity.type}\nActivity Summary: ${activity.aiSummary?.summary}`).join('\n');
    }
  
    if (!activity) {
      console.log(chalk.cyan(`  -> Activity not found in Activity collection, checking EmailActivity...`));
      activity = await EmailActivity.findById(activityId);
    }
  
    if (!activity) {
      console.log(chalk.cyan(`  -> Activity not found in EmailActivity collection, checking CalendarActivity...`));
      activity = await CalendarActivity.findById(activityId);
    }
    
    if (!activity) {
      console.error(chalk.red(`[!] Activity not found in any collection for ID: ${activityId}`));
      throw new Error('Activity not found');
    }
    
    console.log(chalk.cyan(`  -> Activity found, type: ${activity.type || 'unknown'}`));
  
    const organization = activity.organization ? await Organization.findById(activity.organization) : null;
    const contacts = await Contact.find({ _id: { $in: activity.contacts } }).populate('prospect');
    const prospect = contacts.length > 0 ? await Prospect.findById(contacts[0].prospect) : null;
    
    // Find the appropriate opportunity using the same logic as ContactIntelligenceService
    let opportunity = null;
    if (contacts.length > 0) {
      const allOpportunities = await Opportunity.find({ contacts: { $in: activity.contacts } }).populate('stage');
      
      if (allOpportunities.length === 1) {
        opportunity = allOpportunities[0];
      } else if (allOpportunities.length > 1) {
        const activeOpportunities = allOpportunities.filter(
          (opp) => {
            const stage = opp.stage as any;
            return !stage?.isClosedWon && !stage?.isClosedLost;
          }
        );

        if (activeOpportunities.length === 1) {
          opportunity = activeOpportunities[0];
        } else if (activeOpportunities.length > 1) {
          // If multiple are active, use the most recently updated one
          activeOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          opportunity = activeOpportunities[0];
          console.warn(chalk.yellow(`  -> Multiple active opportunities found for activity contacts. Using most recent: ${opportunity._id}`));
        } else {
          // No active opportunities. Use the most recently updated closed opportunity
          allOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          opportunity = allOpportunities[0];
          console.log(chalk.yellow(`  -> No active opportunities found. Using most recent closed: ${opportunity._id}`));
        }
      }
    }
    
    if (!organization) {
      console.error(chalk.red(`[!] Organization not found for activity ${activityId}`));
      throw new Error('Organization not found');
    }
    
    console.log(chalk.cyan(`  -> Found ${contacts.length} contacts and ${prospect ? 'prospect' : 'no prospect'}`));

    console.log(chalk.cyan(`  -> Fetching business context from playbooks...`));
    const businessInformation = await SalesPlaybook.find({ organization: organization._id, type: ContentType.BUSINESS_INFORMATION });
    const productInformation = await SalesPlaybook.find({ organization: organization._id, type: ContentType.PRODUCT_INFO });
    const productOverview = await SalesPlaybook.find({ organization: organization._id, type: ContentType.PRODUCT_OVERVIEW });
    const salesProcess = await SalesPlaybook.find({ organization: organization._id, type: ContentType.SALES_PROCESS });
    
    const summariseActivityAgent = mastra.getAgent('summariseActivityAgent');
    if (!summariseActivityAgent) {
      console.error(chalk.red(`[!] SummariseActivityAgent not found`));
      throw new Error('SummariseActivityAgent not found');
    }

    console.log(chalk.cyan(`  -> Generating prospect contact intelligence context...`));
    const prospectContactsWithIntelligence = (await Promise.all(contacts.map(async (contact) => {
      if (!opportunity) {
        return `- ${contact.firstName} ${contact.lastName} (${contact.emails?.find(e => e.isPrimary)?.address || contact.emails?.[0]?.address || 'No email'}). Contact Intelligence: No opportunity found.`;
      }
      const intel = await contact.getOrCreateOpportunityIntelligence(opportunity._id);
      return `- ${contact.firstName} ${contact.lastName} (${contact.emails?.find(e => e.isPrimary)?.address || contact.emails?.[0]?.address || 'No email'}). Contact Intelligence: ${JSON.stringify(intel)}. Contact Research: ${JSON.stringify(contact?.contactResearch)}`;
    }))).join('\n        ');

    console.log(chalk.cyan(`  -> Invoking AI agent for activity summarization...`));

    // Pre-compute all values for template interpolation (avoid TypeScript syntax in templates for eval compatibility)
    const todaysDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toISOString().split('T')[1];
    const businessInformationText = businessInformation.map((info) => info.content).join('\n');
    const productOverviewText = productOverview.map((info) => info.content).join('\n');
    const productInformationText = productInformation.map((info) => info.content).join('\n');
    const salesProcessText = salesProcess.map((info) => info.content).join('\n');
    const prospectName = prospect?.name || '';
    const prospectDescription = opportunity?.description || '';
    const prospectWebsite = prospect?.website || '';
    const prospectIndustry = prospect?.industry || '';
    const prospectSize = prospect?.size || '';
    
    // Clean activity object (remove AI/human summaries)
    const cleanActivityObj = (() => {
      const rawActivity = activity.toObject ? activity.toObject() : activity;
      const { aiSummary, humanSummary, ...cleanActivity } = rawActivity;
      return cleanActivity;
    })();
    const activityDataJson = JSON.stringify(cleanActivityObj);
    const opportunityJson = JSON.stringify(opportunity);
    
    // Email-specific fields (cast once, avoiding TypeScript in template)
    const emailActivity = activity as unknown as IEmailActivity;
    const emailFromJson = JSON.stringify(emailActivity.from);
    const emailToJson = JSON.stringify(emailActivity.to);
    const emailCcJson = JSON.stringify(emailActivity.cc);
    const emailBccJson = JSON.stringify(emailActivity.bcc);
    const activityDate = activity.date;

    const emailPrompt = `
        Today's date is: ${todaysDate}. Time is ${currentTime}.
        If this activity is in the future, you can simply say "This activity is in the future/scheduled for the future, so it can not impact the intelligence of the contacts etc."
        
        ## TASK
        I need you to summarise an activity for me, using the following context and instructions. Take time to think through each step carefully.

        ## CONTEXT
        ### OUR BUSINESS INFORMATION
        ${businessInformationText}

        ### OUR PRODUCT OVERVIEW
        ${productOverviewText}

        ### OUR PRODUCT INFORMATION
        ${productInformationText}

        ### OUR SALES PROCESS
        ${salesProcessText}

        ### PROSPECT INFORMATION
        Prospect Name: ${prospectName}
        Prospect Description: ${prospectDescription}
        Prospect Website: ${prospectWebsite}
        Prospect Industry: ${prospectIndustry}
        Prospect Size: ${prospectSize}
        Prospect Contacts:
        ${prospectContactsWithIntelligence}

        ### ACTIVITY DETAILS
        Activity type: ${activity.type}
        Activity data: ${activityDataJson}

        ### CURRENT OPPORTUNITY STATE
        Note: if there are multiple opportunities, use your best judgement to determine which one is most relevant to the activity.
        ${opportunityJson}
  
        ## ANALYSIS INSTRUCTIONS
        
        **ESCAPE HATCH INSTRUCTION**
        If at any point you cannot confidently determine a required field from the provided content, DO NOT guess. Instead:
        - For string fields: output the exact string "UNKNOWN" (or an empty string "" if the schema allows).
        - For array fields: output an EMPTY ARRAY [] with NO placeholder entries. Do NOT create entries with "UNKNOWN", "END", or any placeholder values.
        - Optionally, add an explanatory note in the "debug" field of the JSON output describing why the information was unavailable.
        
        CRITICAL: An empty array [] is the CORRECT response when there's no information. Do NOT fill arrays with placeholder objects.

        **Step 0: Topic Relevance Pre-Filter**
        CRITICAL: Before analyzing for sales signals, categorize each topic discussed as:
        - RELEVANT: Directly related to evaluating, purchasing, or using our product/service
        - IRRELEVANT: Side conversations, networking, personal recommendations, or unrelated tools
        
        For any tool, product, or company mentioned, determine:
        1. What category of product/service is it?
        2. Does it overlap with our product category?
        3. Is it being discussed as a requirement for OUR solution or just general conversation?
        
        ONLY analyze RELEVANT topics for sales signals in subsequent steps.
        
        **Step 0.5: Determine if this is an Automated Email**
        Before proceeding, carefully examine the email metadata and content to determine if this is an automated email from a booking system (e.g., Calendly, SavvyCal, HubSpot, Cal.com and so forth). Indicators include:
        - Sender email addresses like noreply@, invites@, or system-generated addresses.
        - Subjects like "Invitation:", "You've been invited to", "Meeting Confirmed", "Calendar Invite", or similar.
        - Body content that appears templated, such as automated confirmations, reminders, or invite acceptances without personalized messaging.
        If it is automated:
        - Do NOT infer strong sales signals, interest, or coordination from the automated content alone (e.g., one person accepting an invite does not imply they are coordinating meetings, even if other attendees are listed).
        - Extract only factual information like meeting details, attendees, and dates.
        - Pay special attention to any user-added notes or custom messages (e.g., "Booked on behalf of Managing Director") and analyze those for potential signals, but treat them cautiously.
        - Temper all inferences: automated actions like accepting an invite indicate basic engagement but not necessarily deep interest or decision-making authority.
        If it is NOT automated, proceed with standard analysis.

        **Step 1: Email Metadata Analysis**
        First, carefully extract the basic email information:
        - Who sent the email (name and email address): ${emailFromJson}
        - Who received it (including To): ${emailToJson}
        - Who CC'd it (including CC): ${emailCcJson}
        - Who BCC'd it (including BCC): ${emailBccJson}
        - When was it sent?: ${activityDate}
        
        **Step 2: Communication Context Analysis**
        Think about the broader communication context:
        - What is the primary purpose of this email?
        - What is the tone and urgency level?
        - Is this part of an ongoing conversation thread?
        - How does this fit into the sales cycle stage?
        
        **Step 3: Sales Signal Analysis from Email Body**
        Carefully analyze the email content for the following signals. For each, provide a direct quote and context.

        **A. Indicators of Interest:**
          - Identify statements or questions from the prospect that indicate positive interest, engagement, or buying signals.
          - Examples: "That's exactly what we're looking for.", "What are the next steps to get a proposal?", "This could solve a major problem for us."
          - For each indicator, provide the QUOTE, context, and rate its strength (High, Medium, Low).

        **B. Indicators of Disinterest/Concerns:**
          - Identify statements or questions from the prospect that indicate disinterest, objections, concerns, or potential roadblocks.
          - Treat hedges like "might", "maybe", "possibly" as potential disinterest unless balanced by strong positive language.
          - Examples: "That price seems high.", "I'm not sure this aligns with our strategy."
          - For each indicator, provide the QUOTE, context, and rate its strength (High, Medium, Low).
        
        **Step 4: MEDDPICC Sales Intelligence Extraction**
        For each MEDDPICC element, think critically about what the prospect has EXPLICITLY communicated. Use the following reasoning process:
        
        **CRITICAL INSTRUCTION**: Only capture information where you can draw a clear, direct line from the prospect's words to our product/solution. The prospect must have explicitly mentioned or clearly implied a connection to our type of solution.
        
        For each potential MEDDPICC element:
        1. Identify the specific text/quote from the email
        2. Ask: "Has the prospect explicitly connected this to needing our product/solution type?"
        3. Ask: "Is this a direct statement or am I inferring/assuming?"
        4. **RELEVANCE ASSESSMENT**: Ask: "How much of this signal is directly attributable to OUR solution versus other factors?"
        5. Only include if the answer to #2 is yes and #3 is "direct statement"

        **Relevance Guidelines:**
        - **High Relevance**: The signal is directly and primarily attributable to our solution (e.g., "Your product could save us 20% in processing time")
        - **Medium Relevance**: The signal is partially attributable to our solution but involves other factors (e.g., "This new process including your tool could reduce costs by 30%")  
        - **Low Relevance**: The signal is tangentially related or mostly attributable to other changes (e.g., "We could save £15k by switching PMS systems and adding your solution" - where most savings come from the PMS switch)
        
        **MEDDPICC Elements to Analyze:**
        
        - **Metrics**: Did the prospect explicitly mention quantifiable business outcomes they want to achieve? Look for specific numbers like "reduce costs by 20%", "increase revenue by $50k", "save 10 hours per week", "improve conversion rates by 15%", "cut processing time from 3 days to 1 day", or "reduce customer churn by 5%". Listen for KPIs or OKRs they're measured against. Did they agree or confirm that **OUR** solution could impact these metrics? Is it a "must-have" metric for them, or just a "nice-to-have"?
        
        - **Economic Buyer**: Who has the ultimate power to say "yes" and sign the contract? Listen for clues about who controls the budget. Did anyone use "I" when talking about the final decision (e.g., "I'll have to approve that", "I control the budget for this", "The final decision is mine")? Did we identify them by name and title? Do we understand what success looks like for them personally or for their department? Look for phrases like "my budget", "I need to see ROI", or "this comes out of my P&L".
        
        - **Decision Criteria**: What are the specific "must-haves" the prospect mentioned for a solution IN OUR PRODUCT CATEGORY? 
          CRITICAL: Requirements for unrelated tools (e.g., "Does Fireflies record video?" when we sell legal tech) are NOT decision criteria for our sale.
          Did they list specific technical requirements FOR OUR TYPE OF SOLUTION (e.g., "must integrate with Salesforce", "needs to handle 10,000 users", "requires SSO", "must be SOC 2 compliant", "needs mobile app", "must work on-premise")? 
          Listen for phrases like "We will choose a solution based on...", "For us, the most important thing is...", "Non-negotiables include...", or "Deal-breakers would be..."
          BUT ONLY when discussing our product category!
        
        - **Decision Process**: What are the specific steps the prospect will take to make a decision? Did they mention a technical review, a committee vote, a presentation to leadership, a trial period, or reference checks? Who are the people involved at each gate? Is there a clear timeline with dates? Listen for phrases like "First, my team will evaluate it, then it goes to the security committee...", "We need to present to the board in Q2", "There's a 30-day trial period", or "Legal reviews all contracts".
        
        - **Paper Process**: Once they decide 'yes', what happens next? Did they talk about legal review, security questionnaires, working with their procurement team, IT security approval, or compliance checks? Who are the contacts in those departments? Did they mention how long it usually takes to get a contract signed? Look for mentions like "procurement takes 6 weeks", "legal always redlines our MSA", "we need a security review", or "finance approves all purchases over $50k".
        
        - **Identified Pain**: Did the prospect describe a business problem in their own words that OUR SOLUTION SPECIFICALLY can solve? 
          CRITICAL FILTER: The pain must be directly addressable by our product category. General business frustrations or problems with unrelated tools are NOT relevant pains.
          Was it a vague issue or a specific, painful one? Listen for emotional language like "it's a nightmare", "we're struggling with", "this is so frustrating", "keeps me up at night", "our biggest challenge", or "costing us a fortune". 
          CRITICAL: Did they connect this pain to:
          1. A tangible business consequence (e.g., "Because of this issue, we are losing $10k per month")
          2. AND explicitly to needing OUR TYPE of solution?
          Look for phrases like:
          * "We need a [our product category] that can..."
          * "We're looking for a [our solution type] to..."
          * "This is why we're interested in your [specific product]..."
          * "We're struggling with [problem our product solves] and think your product could help..."
          IGNORE pains about unrelated tools, general IT issues, or problems outside our solution scope!
          
          - **Champion**: Is there someone in the email who is clearly advocating for OUR SPECIFIC SOLUTION (not just being helpful in general)? 
          CRITICAL: Someone making networking introductions or recommending unrelated tools is NOT a champion for our sale.
          Look for signs they're defending OUR solution, expressing personal excitement ABOUT OUR PRODUCT, or pushing internally FOR OUR SOLUTION. 
          A coach just tells you the plan; a Champion gets on the field and helps you win THE DEAL WITH US.
          Look for phrases like:
          * "I really think [our product] could work for us"
          * "Let me talk to the team about [implementing our solution]"
          * "I'll set up that meeting [to discuss our product further]"
          * "This [our solution] solves exactly what we discussed"
          IGNORE general helpfulness, networking assistance, or advocacy for unrelated topics!
        
        - **Competition**: Did the prospect mention any other vendors they are looking at? Did they talk about building a solution themselves or just sticking with their current process (the status quo)? How did they talk about these alternatives? Look for mentions like "We're also looking at [Competitor X]", "We might build this internally", "Our current process works okay", "We've been burned by [Previous Vendor]", or "Everyone uses [Market Leader]". Did we successfully explain how we are different and better for their specific problem?
        
        **Step 5: Quality Check**
        Before finalizing your analysis:
        - Review each MEDDPICC element you've identified
        - Ensure you can point to specific text that supports your analysis
        - Remove any items based on inference rather than explicit communication
        - Verify that pain points are clearly connected to needing our solution type
        
        **Step 6: Context and Key Message Summary**
        Synthesize the overall context and key messages, considering:
        - The prospect's current situation and needs
        - The stage of the sales process this represents
        - Any shifts in interest level or urgency
        - Important next steps or follow-up items mentioned
  
        ## OUTPUT FORMAT
        Respond in JSON only, no other text, with the following format: {
          "emailFrom": "<Name of the Sender <email address of the sender>>",
          "emailTo": [{"name": "<Name>", "email": "<email address>"}],
          "emailCc": [{"name": "<Name>", "email": "<email address>"}],
          "emailBcc": [{"name": "<Name>", "email": "<email address>"}],
          "keyMessage": "<Primary purpose and key takeaways from the email>",
          "context": "<Broader context including sales cycle stage, tone, urgency, and relationship dynamics>",
          "salesCycleStage": "<Assessment of where this prospect is in the sales process: Discovery, Qualification, Proposal, Negotiation, or Closed>",
          "sentimentAnalysis": "<Prospect's sentiment: Positive, Neutral, Negative, or Mixed - with brief reasoning>",
          "indicatorsOfInterest": [{"indicator": "<Description of interest signal>", "quoteOrContext": "<Relevant quote or context from email>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the interest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "indicatorsOfDisinterest": [{"indicator": "<Description of disinterest/concern>", "quoteOrContext": "<Relevant quote or context from email>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the disinterest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "filteredIrrelevantTopics": [{"topic": "<Description of topic>", "reason": "<Why this was filtered as irrelevant>", "quote": "<Relevant quote from email>"}],
          "MEDDPICC": {
            "Metrics": [{
              "metric": "<Specific quantifiable impact the prospect stated they're missing without our solution>",
              "reason": "<Direct quote and explanation of how this connects to our solution>",
              "confidence": "<High/Medium/Low based on explicitness of the connection>",
              "relevance": "<High/Medium/Low - how much of this metric is directly attributable to our solution vs other factors>"
            }],
            "Economic Buyer": [{
              "name": "<Name of the Economic Buyer>",
              "reason": "<Direct quote showing their budget authority for this type of solution>",
              "confidence": "<High/Medium/Low based on explicitness>",
              "relevance": "<High/Medium/Low - how directly this person relates to our solution decision>"
            }],
            "Decision Criteria": [{
              "criteria": "<Specific criteria for evaluating our solution>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how specifically this criteria relates to our solution>"
            }],
            "Decision Process": [{
              "process": "<Specific evaluation or approval process mentioned>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this process relates to our solution evaluation>"
            }], 
            "Paper Process": [{
              "process": "<Procurement or administrative process mentioned>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this process relates to purchasing our solution>"
            }],
            "Identified Pain": [{
              "pain": "<Pain point explicitly connected to needing our solution>",
              "reason": "<Direct quote showing explicit connection to our solution + explanation of how our product addresses this>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how much of this pain is specifically solvable by our solution>"
            }],
            "Champion": [{
              "name": "<Name of internal advocate>",
              "reason": "<Evidence of their advocacy for our solution>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how specifically they are championing our solution vs general change>"
            }],
            "Competition": [{
              "competition": "<Alternative solution or vendor mentioned>",
              "reason": "<Context of how they're being considered>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this competes with our solution>"
            }],
            "debug": "<Explanation of why the information was unavailable or the request could not be completed.>"
        }
`



    const meetingPrompt = `
        Today's date is: ${todaysDate}. Time is ${currentTime}.
        ## TASK
        I need you to summarise a meeting transcript, using the following context and instructions. Take time to think through each step carefully.
        If this meeting is in the future, you can simply say "This meeting is in the future, so there is no transcript to analyse."

        ## CONTEXT
        ### OUR BUSINESS INFORMATION
        ${businessInformationText}

        ### OUR PRODUCT OVERVIEW
        ${productOverviewText}

        ### OUR PRODUCT INFORMATION
        ${productInformationText}

        ### OUR SALES PROCESS
        ${salesProcessText}

        ### PROSPECT INFORMATION
        Prospect Name: ${prospectName}
        Prospect Description: ${prospectDescription}
        Prospect Website: ${prospectWebsite}
        Prospect Industry: ${prospectIndustry}
        Prospect Size: ${prospectSize}
        Prospect Contacts: 
        ${prospectContactsWithIntelligence}

        ### ACTIVITY DETAILS
        Activity type: ${activity.type}
        Activity data (transcript): ${activityDataJson}

        **IMPORTANT** IF THERE IS **NO TRANSCRIPT**, THE OUTPUT SHOULD BE:
        {
          "analyzed": false,
          "overallSummary": "(optional: This activity is in the future, so there is no transcript to analyse.). There is no information available to analyse this activity. No transcript provided."
          "meetingAttendees": [],
          "meetingPurpose": "",
          "meetingDate": "",
          "meetingDuration": "",
          "keyDiscussionPoints": [],
          "questionsAskedByProspect": [], 
          "questionsAskedBySalesTeam": [],
          "indicatorsOfInterest": [],
          "indicatorsOfDisinterest": [],
          "keyMessage": "",
          "context": "",
          "salesCycleStage": "",
          "sentimentAnalysis": "",
          "MEDDPICC": {
            "Metrics": [],
            "Economic Buyer": [],
            "Decision Criteria": [],
            "Decision Process": [],
            "Paper Process": [],
            "Identified Pain": [],
            "Champion": [],
            "Competition": []
          }
        }

        ### CURRENT OPPORTUNITY STATE
        Note: if there are multiple opportunities, use your best judgement to determine which one is most relevant to the activity.
        ${opportunityJson}
  
        ## ANALYSIS INSTRUCTIONS
        
        **ESCAPE HATCH INSTRUCTION**
        If at any point you cannot confidently determine a required field from the provided content, DO NOT guess. Instead:
        - For string fields: output the exact string "UNKNOWN" (or an empty string "" if the schema allows).
        - For array fields: output an EMPTY ARRAY [] with NO placeholder entries. Do NOT create entries with "UNKNOWN", "END", or any placeholder values.
        - Optionally, add an explanatory note in the "debug" field of the JSON output describing why the information was unavailable.
        
        CRITICAL: An empty array [] is the CORRECT response when there's no information. Do NOT fill arrays with placeholder objects.

        **Step 0: Topic Relevance Pre-Filter**
        CRITICAL: Before analyzing the transcript, categorize each topic discussed as:
        - RELEVANT: Directly related to evaluating, purchasing, or using our product/service
        - IRRELEVANT: Side conversations, networking, personal recommendations, or unrelated tools
        
        Examples of IRRELEVANT topics to filter out:
        - Discussing what meeting recording tool we use (unless we SELL meeting recording tools)
        - Networking introductions to people at other companies (unless they're potential buyers)
        - Recommendations for restaurants, travel, or personal productivity tools
        - General business advice unrelated to our solution
        - Questions about our internal tools/processes not related to the sale
        
        ONLY analyze RELEVANT topics for sales signals in subsequent steps.
        
        **Step 1: Meeting Overview & Participants**
        - Identify all participants. For each, note their name, role (e.g., 'Prospect Decision Maker', 'Sales Rep'), and organization if available.
        - What was the stated or apparent primary purpose of this meeting?
        - Note the meeting date and approximate duration if discernible from the transcript or metadata.
        
        **Step 2: Key Discussion Points & Outcomes**
        - Summarize the 3-5 main topics discussed during the meeting.
        - What were the key decisions made or outcomes achieved, if any?
        - List any clearly agreed-upon action items, specifying the item, who owns it (e.g., 'Prospect Team', 'Our Team', or a specific name), and any mentioned due date.
        
        **Step 3: Sales Signal Analysis from Transcript**
        Carefully analyze the transcript content for the following signals:

        **A. Questions Asked:**
          - **By Prospect:** List significant questions the prospect (or their team) asked about our company, product, services, pricing, implementation, etc. and who asked them. Include context if it helps understand the question's intent.
          - **By Sales Team:** List key discovery, qualifying, or clarifying questions asked by our team. Include context if important.

        **B. Indicators of Interest:**
          - Identify statements, questions, or reactions from the prospect that indicate positive interest, engagement, or buying signals and who said them.
          - Examples: "That's exactly what we're looking for.", "How does feature X work in more detail?", "What are the next steps to get a proposal?", "This could solve a major problem for us."
          - For each indicator, provide the QUOTE, plus a description of the context, and rate its strength (High, Medium, Low).
          - If a statement can plausibly be both an interest and a concern, list it in both sections with appropriate strength ratings.

        **C. Indicators of Disinterest/Concerns:**
          - Identify statements, questions, or reactions from the prospect that indicate disinterest, objections, concerns, or potential roadblocks and who said them.
          - Flag statements that restrict the solution to a subset of users (e.g. 'only some of our clients', 'could help some of our staff') as Scope/TAM Concerns and rate their strength.
          - Treat hedges such as "might", "maybe", "possibly", "some clients", "in certain cases" as potential disinterest unless balanced by strong positive language.
          - Examples: "That price seems high.", "We're already happy with our current solution.", "I'm not sure this aligns with our strategy.", "Implementation sounds complex."
          - For each indicator, provide a QUOTE plus a description of the context, and rate its strength (High, Medium, Low).
        
        **Step 4: MEDDPICC Sales Intelligence Extraction (from Transcript)**
        For each MEDDPICC element, think critically about what the prospect has EXPLICITLY communicated *during the meeting*. Use the following reasoning process:
        
        **CRITICAL INSTRUCTION**: Only capture information where you can draw a clear, direct line from the prospect's words in the transcript to our product/solution. The prospect must have explicitly mentioned or clearly implied a connection to our type of solution.
        
        For each potential MEDDPICC element:
        1. Identify the specific text/quote from the transcript.
        2. Ask: "Has the prospect explicitly connected this to needing our product/solution type?"
        3. Ask: "Is this a direct statement or am I inferring/assuming?"
        4. **RELEVANCE ASSESSMENT**: Ask: "How much of this signal is directly attributable to OUR solution versus other factors?"
        5. Only include if the answer to #2 is yes and #3 is "direct statement".

        **Relevance Guidelines:**
        - **High Relevance**: The signal is directly and primarily attributable to our solution (e.g., "Your product could save us 20% in processing time")
        - **Medium Relevance**: The signal is partially attributable to our solution but involves other factors (e.g., "This new process including your tool could reduce costs by 30%")  
        - **Low Relevance**: The signal is tangentially related or mostly attributable to other changes (e.g., "We could save £15k by switching PMS systems and adding your solution" - where most savings come from the PMS switch)
        
        **MEDDPICC Elements to Analyze:**
        - **Metrics**: Did the prospect explicitly mention quantifiable business outcomes they want to achieve (e.g., "reduce costs by 20%", "increase revenue by $50k", "save 10 hours per week")? Listen for specific numbers, KPIs, or OKRs they're measured against. Did they agree or confirm that **OUR** solution could impact these metrics? Is it a "must-have" metric for them, or just a "nice-to-have"?
        
        - **Economic Buyer**: Who has the ultimate power to say "yes" and sign the contract? Listen for clues about who controls the budget. Did anyone use "I" when talking about the final decision (e.g., "I'll have to approve that")? Did we identify them by name? Do we understand what success looks like for them personally or for their department?
        
        - **Decision Criteria**: What are the specific "must-haves" the prospect mentioned for a solution? Did they list specific technical requirements (e.g., "must integrate with Salesforce"), security needs, or key features? Listen for phrases like "We will choose a solution based on..." or "For us, the most important thing is...".
        
        - **Decision Process**: What are the specific steps the prospect will take to make a decision? Did they mention a technical review, a committee vote, a presentation to leadership, or a trial period? Who are the people involved at each gate? Is there a clear timeline with dates? Listen for phrases like "First, my team will evaluate it, then it goes to the security committee..."
        
        - **Paper Process**: Once they decide 'yes', what happens next? Did they talk about legal review, security questionnaires, or working with their procurement team? Who are the contacts in those departments? Did they mention how long it usually takes to get a contract signed?
        
        - **Identified Pain**: Did the prospect describe a business problem in their own words that our solution can solve? Was it a vague issue or a specific, painful one? Listen for emotional language like "it's a nightmare," "we're struggling with," or "this is so frustrating." CRITICAL: Did they connect this pain to a tangible business consequence (e.g., "Because of this issue, we are losing money/time")?
        
        - **Champion**: Is there someone in the meeting who is clearly on our side, selling on our behalf when we're not speaking? Did they answer a colleague's question for us, defend our solution, or express personal excitement? A coach just tells you the plan; a Champion gets on the field and helps you win. Did they offer to make introductions or set up next steps?
        
        - **Competition**: Did the prospect mention any other vendors they are looking at? Did they talk about building a solution themselves or just sticking with their current process (the status quo)? How did they talk about these alternatives? Did we successfully explain how we are different and better for their specific problem?
        
        **Step 5: Quality Check**
        Before finalizing your analysis:
        - Review each MEDDPICC element, question, and indicator you've identified.
        - Ensure you can point to specific text/discussion in the transcript that supports your analysis.
        - Remove any items based on inference rather than explicit communication from the transcript.
        
        **Step 6: Overall Summary & Next Steps**
        - **keyMessage**: What is the single most important takeaway or message from this meeting?
        - **context**: Describe the broader context: What was the overall tone? Was there a shift in urgency or interest? How does this meeting fit into the sales cycle?
        - **salesCycleStage**: Based on the meeting, assess the current sales cycle stage.
        - **sentimentAnalysis**: What was the prospect's overall sentiment during the meeting (Positive, Neutral, Negative, Mixed)? Briefly explain.
        - **overallSummary**: Provide a summary summary of the entire meeting, its outcomes, and significance, in the same way one might describe the meeting to their assistant.

        ## OUTPUT FORMAT
        Respond in JSON only, no other text, with the following format: {
          "meetingAttendees": [{"name": "<Participant Name>", "role": "<Participant Role (e.g., Prospect Engineer, Our Sales Lead)>", "organization": "<Participant Organization>"}],
          "meetingPurpose": "<Primary purpose of the meeting>",
          "meetingDate": "<Date of the meeting, e.g., YYYY-MM-DD, if known>",
          "meetingDuration": "<Approximate duration, e.g., 45 minutes, if known>",
          "keyDiscussionPoints": ["<Key topic 1>", "<Key topic 2>", "..."],
          "questionsAskedByProspect": [{"question": "<Full question asked by prospect>", "context": "<Brief context or relevant transcript snippet>", "person": "<Name of the person who asked the question>"}],
          "questionsAskedBySalesTeam": [{"question": "<Full question asked by our team>", "context": "<Brief context or relevant transcript snippet>", "person": "<Name of the person who asked the question>"}],
          "indicatorsOfInterest": [{"indicator": "<Description of interest signal>", "quoteOrContext": "<Relevant quote or context from transcript>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the interest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "indicatorsOfDisinterest": [{"indicator": "<Description of disinterest/concern>", "quoteOrContext": "<Relevant quote or context from transcript>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the disinterest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "filteredIrrelevantTopics": [{"topic": "<Description of topic>", "reason": "<Why this was filtered as irrelevant>", "quote": "<Relevant quote from transcript>"}],
          "keyMessage": "<Single most important takeaway from the meeting>",
          "context": "<Broader context including sales cycle stage, tone, urgency, and relationship dynamics>",
          "salesCycleStage": "<Discovery/Qualification/Proposal/Negotiation/Closed>",
          "sentimentAnalysis": "<Prospect's sentiment: Positive, Neutral, Negative, or Mixed - with brief reasoning>",
          "MEDDPICC": {
            "Metrics": [{"metric": "<Specific quantifiable impact>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>", "relevance": "<High/Medium/Low - how much of this metric is directly attributable to our solution vs other factors>"}],
            "Economic Buyer": [{"name": "<Name>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>"}],
            "Decision Criteria": [{"criteria": "<Specific criteria>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>"}],
            "Decision Process": [{"process": "<Specific process step>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>"}], 
            "Paper Process": [{"process": "<Procurement/legal step>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>"}], 
            "Identified Pain": [{"pain": "<Pain point explicitly connected to our solution type>", "reason": "<Direct quote/transcript context>", "confidence": "<High/Medium/Low>"}],
            "Champion": [{"name": "<Name>", "reason": "<Evidence from transcript>", "confidence": "<High/Medium/Low>"}],
            "Competition": [{"competition": "<Alternative mentioned>", "reason": "<Context from transcript>", "confidence": "<High/Medium/Low>"}]
          },
          "overallSummary": "<Concise 2-3 sentence summary of the meeting>",
        }
`
  
    // Pre-compute user name for message prompt
    const userName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User';
    
    const messageActivityPrompt = `
        Today's date is: ${todaysDate}. Time is ${currentTime}.
        If this activity is in the future, you can simply say "This activity is in the future/scheduled for the future, so it can not impact the intelligence of the contacts etc."
        ## TASK
        I (${userName}) need you to analyse an message/series of messages for me, using the following context and instructions. Take time to think through each step carefully.

        ## CONTEXT
        ### OUR BUSINESS INFORMATION
        ${businessInformationText}

        ### OUR PRODUCT OVERVIEW
        ${productOverviewText}

        ### OUR PRODUCT INFORMATION
        ${productInformationText}

        ### OUR SALES PROCESS
        ${salesProcessText}

        ### PROSPECT INFORMATION
        Prospect Name: ${prospectName}
        Prospect Description: ${prospectDescription}
        Prospect Website: ${prospectWebsite}
        Prospect Industry: ${prospectIndustry}
        Prospect Size: ${prospectSize}
        Prospect Contacts: 
        ${prospectContactsWithIntelligence}

        ### PRIOR MESSAGES (FOR CONTEXT)
        ${priorMessages}

        ### ACTIVITY DETAILS
        Activity type: ${activity.type}
        Activity data: ${activityDataJson}

        ### CURRENT OPPORTUNITY STATE
        Note: if there are multiple opportunities, use your best judgement to determine which one is most relevant to the activity.
        ${opportunityJson}
  
        ## ANALYSIS INSTRUCTIONS
        
        **ESCAPE HATCH INSTRUCTION**
        If at any point you cannot confidently determine a required field from the provided content, DO NOT guess. Instead:
        - For string fields: output the exact string "UNKNOWN" (or an empty string "" if the schema allows).
        - For array fields: output an EMPTY ARRAY [] with NO placeholder entries. Do NOT create entries with "UNKNOWN", "END", or any placeholder values.
        - Optionally, add an explanatory note in the "debug" field of the JSON output describing why the information was unavailable.
        
        CRITICAL: An empty array [] is the CORRECT response when there's no information. Do NOT fill arrays with placeholder objects.

        **Step 1: Message Metadata Analysis**
        First, carefully extract the basic message information:
        - Who sent the message (name)?
        - Who received it (name)?
        - When was it sent? (date and time)
        
        **Step 2: Communication Context Analysis**
        Think about the broader communication context:
        - What is the primary purpose of this message?
        - What is the tone and urgency level?
        - Is this part of an ongoing conversation thread?
        - How does this fit into the sales cycle stage?
        
        **Step 3: Sales Signal Analysis from Message Body**
        Carefully analyze the message content for the following signals. For each, provide a direct quote and context.

        **A. Indicators of Interest:**
          - Identify statements or questions from the prospect that indicate positive interest, engagement, or buying signals.
          - Examples: "That's exactly what we're looking for.", "What are the next steps to get a proposal?", "This could solve a major problem for us."
          - For each indicator, provide the QUOTE, context, and rate its strength (High, Medium, Low).

        **B. Indicators of Disinterest/Concerns:**
          - Identify statements or questions from the prospect that indicate disinterest, objections, concerns, or potential roadblocks.
          - Treat hedges like "might", "maybe", "possibly" as potential disinterest unless balanced by strong positive language.
          - Examples: "That price seems high.", "I'm not sure this aligns with our strategy."
          - For each indicator, provide the QUOTE, context, and rate its strength (High, Medium, Low).
        
        **Step 4: MEDDPICC Sales Intelligence Extraction**
        For each MEDDPICC element, think critically about what the prospect has EXPLICITLY communicated. Use the following reasoning process:
        
        **CRITICAL INSTRUCTION**: Only capture information where you can draw a clear, direct line from the prospect's words to our product/solution. The prospect must have explicitly mentioned or clearly implied a connection to our type of solution.
        
        For each potential MEDDPICC element:
        1. Identify the specific text/quote from the message
        2. Ask: "Has the prospect explicitly connected this to needing our product/solution type?"
        3. Ask: "Is this a direct statement or am I inferring/assuming?"
        4. **RELEVANCE ASSESSMENT**: Ask: "How much of this signal is directly attributable to OUR solution versus other factors?"
        5. Only include if the answer to #2 is yes and #3 is "direct statement"

        **Relevance Guidelines:**
        - **High Relevance**: The signal is directly and primarily attributable to our solution (e.g., "Your product could save us 20% in processing time")
        - **Medium Relevance**: The signal is partially attributable to our solution but involves other factors (e.g., "This new process including your tool could reduce costs by 30%")  
        - **Low Relevance**: The signal is tangentially related or mostly attributable to other changes (e.g., "We could save £15k by switching PMS systems and adding your solution" - where most savings come from the PMS switch)
        
        **MEDDPICC Elements to Analyze:**
        
        - **Metrics**: Did the prospect explicitly mention quantifiable business outcomes they want to achieve? Look for specific numbers like "reduce costs by 20%", "increase revenue by $50k", "save 10 hours per week", "improve conversion rates by 15%", "cut processing time from 3 days to 1 day", or "reduce customer churn by 5%". Listen for KPIs or OKRs they're measured against. Did they agree or confirm that our solution could impact these metrics? Is it a "must-have" metric for them, or just a "nice-to-have"?
        
        - **Economic Buyer**: Who has the ultimate power to say "yes" and sign the contract? Listen for clues about who controls the budget. Did anyone use "I" when talking about the final decision (e.g., "I'll have to approve that", "I control the budget for this", "The final decision is mine")? Did we identify them by name and title? Do we understand what success looks like for them personally or for their department? Look for phrases like "my budget", "I need to see ROI", or "this comes out of my P&L".
        
        - **Decision Criteria**: What are the specific "must-haves" the prospect mentioned for a solution IN OUR PRODUCT CATEGORY? 
          CRITICAL: Requirements for unrelated tools (e.g., "Does Fireflies record video?" when we sell legal tech) are NOT decision criteria for our sale.
          Did they list specific technical requirements FOR OUR TYPE OF SOLUTION (e.g., "must integrate with Salesforce", "needs to handle 10,000 users", "requires SSO", "must be SOC 2 compliant", "needs mobile app", "must work on-premise")? 
          Listen for phrases like "We will choose a solution based on...", "For us, the most important thing is...", "Non-negotiables include...", or "Deal-breakers would be..."
          BUT ONLY when discussing our product category!
        
        - **Decision Process**: What are the specific steps the prospect will take to make a decision? Did they mention a technical review, a committee vote, a presentation to leadership, a trial period, or reference checks? Who are the people involved at each gate? Is there a clear timeline with dates? Listen for phrases like "First, my team will evaluate it, then it goes to the security committee...", "We need to present to the board in Q2", "There's a 30-day trial period", or "Legal reviews all contracts".
        
        - **Paper Process**: Once they decide 'yes', what happens next? Did they talk about legal review, security questionnaires, working with their procurement team, IT security approval, or compliance checks? Who are the contacts in those departments? Did they mention how long it usually takes to get a contract signed? Look for mentions like "procurement takes 6 weeks", "legal always redlines our MSA", "we need a security review", or "finance approves all purchases over $50k".
        
        - **Identified Pain**: Did the prospect describe a business problem in their own words that OUR SOLUTION SPECIFICALLY can solve? 
          CRITICAL FILTER: The pain must be directly addressable by our product category. General business frustrations or problems with unrelated tools are NOT relevant pains.
          Was it a vague issue or a specific, painful one? Listen for emotional language like "it's a nightmare", "we're struggling with", "this is so frustrating", "keeps me up at night", "our biggest challenge", or "costing us a fortune". 
          CRITICAL: Did they connect this pain to:
          1. A tangible business consequence (e.g., "Because of this issue, we are losing $10k per month")
          2. AND explicitly to needing OUR TYPE of solution?
          Look for phrases like:
          * "We need a [our product category] that can..."
          * "We're looking for a [our solution type] to..."
          * "This is why we're interested in your [specific product]..."
          * "We're struggling with [problem our product solves] and think your product could help..."
          IGNORE pains about unrelated tools, general IT issues, or problems outside our solution scope!
          
        - **Champion**: Is there someone in the message who is clearly on our side, selling on our behalf when we're not speaking? Look for signs they're defending our solution, expressing personal excitement, or pushing internally. A coach just tells you the plan; a Champion gets on the field and helps you win. Look for phrases like "I really think this could work for us", "Let me talk to the team about this", "I'll set up that meeting", or "This solves exactly what we discussed".
        
        - **Competition**: Did the prospect mention any other vendors they are looking at? Did they talk about building a solution themselves or just sticking with their current process (the status quo)? How did they talk about these alternatives? Look for mentions like "We're also looking at [Competitor X]", "We might build this internally", "Our current process works okay", "We've been burned by [Previous Vendor]", or "Everyone uses [Market Leader]". Did we successfully explain how we are different and better for their specific problem?
        
        **Step 5: Quality Check**
        Before finalizing your analysis:
        - Review each MEDDPICC element you've identified
        - Ensure you can point to specific text that supports your analysis
        - Remove any items based on inference rather than explicit communication
        - Verify that pain points are clearly connected to needing our solution type
        
        **Step 6: Context and Key Message Summary**
        Synthesize the overall context and key messages, considering:
        - The prospect's current situation and needs
        - The stage of the sales process this represents
        - Any shifts in interest level or urgency
        - Important next steps or follow-up items mentioned
  
        ## OUTPUT FORMAT
        Respond in JSON only, no other text, with the following format: {
          "messageFrom": "<First Name> <Last Name>",
          "messageTo": [{"name": "<First Name> <Last Name>", "email": "<email address>"}],
          "keyMessage": "<Primary purpose and key takeaways from the email>",
          "context": "<Broader context including sales cycle stage, tone, urgency, and relationship dynamics>",
          "salesCycleStage": "<Assessment of where this prospect is in the sales process: Discovery, Qualification, Proposal, Negotiation, or Closed>",
          "sentimentAnalysis": "<Prospect's sentiment: Positive, Neutral, Negative, or Mixed - with brief reasoning>",
          "indicatorsOfInterest": [{"indicator": "<Description of interest signal>", "quoteOrContext": "<Relevant quote or context from message>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the interest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "indicatorsOfDisinterest": [{"indicator": "<Description of disinterest/concern>", "quoteOrContext": "<Relevant quote or context from message>", "strength": "<High/Medium/Low>", "person": "<Name of the person who expressed the disinterest>", "relevance": "<High/Medium/Low - how directly this relates to our solution>"}],
          "filteredIrrelevantTopics": [{"topic": "<Description of topic>", "reason": "<Why this was filtered as irrelevant>", "quote": "<Relevant quote from message>"}],
          "MEDDPICC": {
            "Metrics": [{
              "metric": "<Specific quantifiable impact the prospect stated they're missing without our solution>",
              "reason": "<Direct quote and explanation of how this connects to our solution>",
              "confidence": "<High/Medium/Low based on explicitness of the connection>",
              "relevance": "<High/Medium/Low - how much of this metric is directly attributable to our solution vs other factors>"
            }],
            "Economic Buyer": [{
              "name": "<Name of the Economic Buyer>",
              "reason": "<Direct quote showing their budget authority for this type of solution>",
              "confidence": "<High/Medium/Low based on explicitness>",
              "relevance": "<High/Medium/Low - how directly this person relates to our solution decision>"
            }],
            "Decision Criteria": [{
              "criteria": "<Specific criteria for evaluating our solution>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how specifically this criteria relates to our solution>"
            }],
            "Decision Process": [{
              "process": "<Specific evaluation or approval process mentioned>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this process relates to our solution evaluation>"
            }], 
            "Paper Process": [{
              "process": "<Procurement or administrative process mentioned>",
              "reason": "<Direct quote and context>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this process relates to purchasing our solution>"
            }],
            "Identified Pain": [{
              "pain": "<Pain point explicitly connected to needing our solution>",
              "reason": "<Direct quote showing explicit connection to our solution + explanation of how our product addresses this>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how much of this pain is specifically solvable by our solution>"
            }],
            "Champion": [{
              "name": "<Name of internal advocate>",
              "reason": "<Evidence of their advocacy for our solution>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how specifically they are championing our solution vs general change>"
            }],
            "Competition": [{
              "competition": "<Alternative solution or vendor mentioned>",
              "reason": "<Context of how they're being considered>",
              "confidence": "<High/Medium/Low>",
              "relevance": "<High/Medium/Low - how directly this competes with our solution>"
            }]
        }
`

    const digitalSalesRoomPrompt = `
        ## TASK
        I need you to analyse a digital sales room (DSR) activity for me, using the following context and instructions. Your goal is to extract meaningful sales intelligence from this user engagement data.

        ## CONTEXT
        ### OUR BUSINESS INFORMATION
        ${businessInformationText}

        ### OUR PRODUCT OVERVIEW
        ${productOverviewText}

        ### OUR PRODUCT INFORMATION
        ${productInformationText}

        ### OUR SALES PROCESS
        ${salesProcessText}

        ### PROSPECT INFORMATION
        Prospect Name: ${prospectName}
        Prospect Description: ${prospectDescription}
        Prospect Website: ${prospectWebsite}
        Prospect Industry: ${prospectIndustry}
        Prospect Size: ${prospectSize}
        Prospect Contacts: 
        ${prospectContactsWithIntelligence}

        ### ACTIVITY DETAILS
        Activity type: ${activity.type}
        Activity data: ${activityDataJson}

        ### CURRENT OPPORTUNITY STATE
        Note: if there are multiple opportunities, use your best judgement to determine which one is most relevant to the activity.
        ${opportunityJson}

        ## ANALYSIS INSTRUCTIONS
        
        **ESCAPE HATCH INSTRUCTION**
        If at any point you cannot confidently determine a required field from the provided content, DO NOT guess. Instead:
        - For string fields: output the exact string "UNKNOWN" (or an empty string "" if the schema allows).
        - For array fields: output an EMPTY ARRAY [] with NO placeholder entries. Do NOT create entries with "UNKNOWN", "END", or any placeholder values.
        - Optionally, add an explanatory note in the "debug" field of the JSON output describing why the information was unavailable.
        
        CRITICAL: An empty array [] is the CORRECT response when there's no information. Do NOT fill arrays with placeholder objects.

        **Step 1: Activity Identification & Details**
        - First, identify the specific type of DSR activity from the data: DSR_ACCESS, DSR_DOCUMENT_VIEW, or DSR_LINK_CLICK.
        - Extract the core details:
            - Who performed the action (Contact Name and Email)?
            - When did it happen (Timestamp)?
            - For DSR_DOCUMENT_VIEW: What is the name of the document viewed? Is there a view duration?
            - For DSR_LINK_CLICK: What is the URL of the link that was clicked?
        
        **Step 2: Contextual and Intent Analysis**
        - Based on the activity, what can you infer about the contact's intent and interests?
        - **For Document Views**: Analyze the document's title. A document named 'Pricing_Sheet.pdf' implies interest in cost, while 'Technical_Architecture.pdf' suggests technical evaluation. 'Case_Study_Acme.pdf' shows interest in social proof.
        - **For Link Clicks**: Analyze the link URL. A click to a competitor's comparison page, a specific feature page, or a sign-up link are all strong signals.
        - **For General Access**: Note this as a general sign of continued engagement. Check if it's the first access or a return visit, which might indicate higher interest.

        **Step 3: Engagement Scoring**
        - Assess the contact's engagement level based on this single activity. Rate it as High, Medium, or Low.
        - Justify your rating. For example:
            - **High**: Viewing pricing, viewing multiple technical documents, spending significant time on a key document, clicking a 'Request a Demo' link.
            - **Medium**: Viewing a case study, clicking a link to a blog post, return visits to the main DSR page.
            - **Low**: A single, brief access to the DSR with no further interaction.

        **Step 4: Inferring MEDDPICC Signals (Use with Caution)**
        This step requires careful inference. DSR activity provides BEHAVIORAL clues, not explicit statements. Frame your analysis accordingly.
        - **Decision Criteria**: Viewing a 'Security_Whitepaper.pdf' or 'Integration_Guide.pdf' may signal that security and integration are part of their decision criteria.
        - **Metrics / Identified Pain**: Viewing a case study or ROI calculator document may indicate they are researching the potential metrics and are trying to associate it with their pain points.
        - **Paper Process**: Viewing a 'Master_Service_Agreement.pdf' could signal they are investigating the paper process.
        - **Competition**: Clicking a link to a G2 comparison page or a page on our site titled 'vs-competitor-X' is a strong signal they are evaluating the competition.
        - For each inferred signal, you must state your reasoning and assign a confidence level (High, Medium, Low). High confidence should be reserved for very strong signals (e.g., viewing pricing AND the MSA document).

        **Step 5: Synthesize**
        - **keyTakeaway**: Write a single sentence that summarises the most important insight from this activity.

        ## OUTPUT FORMAT
        Respond in JSON only, no other text, with the following format: {
            "contact": { "name": "<Contact Name>", "email": "<Contact Email>" },
            "activityType": "<DSR_ACCESS | DSR_DOCUMENT_VIEW | DSR_LINK_CLICK>",
            "activityTimestamp": "<ISO 8601 Timestamp of the activity>",
            "details": {
              "documentName": "<Name of document viewed, or N/A>",
              "linkUrl": "<URL of link clicked, or N/A>",
              "viewDurationSeconds": "<Duration in seconds, or N/A>"
            },
            "keyTakeaway": "<A single sentence summarizing the key insight from this activity>",
            "engagementLevel": "<High | Medium | Low>",
            "engagementReasoning": "<Justification for the engagement level assessment>",
            "inferredInterest": "<What this activity suggests about the prospect's specific interests (e.g., 'Interest in pricing and technical specifications')>",
            "inferredMEDDPICCSignals": [{
              "category": "<Metrics | Economic Buyer | Decision Criteria | Decision Process | Paper Process | Identified Pain | Champion | Competition>",
              "signal": "<The inferred signal (e.g., 'Security is a key decision criterion')>",
              "reasoning": "<Why this activity suggests this signal (e.g., 'Viewed the Security Whitepaper for 120 seconds')>",
              "confidence": "<High | Medium | Low>"
            }],
        }
    `

    let prompt = '';
    switch (activity?.type) {
      case ActivityType.SMS:
      case ActivityType.LINKEDIN:
        prompt = messageActivityPrompt;
        break;
      case ActivityType.EMAIL:
        prompt = emailPrompt; 
        break;
      case ActivityType.MEETING_NOTES:
      case ActivityType.CALENDAR:
        prompt = meetingPrompt;
        break;
      case ActivityType.DSR_ACCESS:
      case ActivityType.DSR_DOCUMENT_VIEW:
      case ActivityType.DSR_LINK_CLICK:
        prompt = digitalSalesRoomPrompt;
        break;
      default:
        prompt = emailPrompt;
    }

    const outputSchema = getSummariseActivityOutputSchema(activity?.type);

    const inputVariables = {
      // Raw data (for reference/debugging)
      activityId,
      activity: activity.toObject ? activity.toObject() : activity,
      organization,
      contacts,
      prospect,
      opportunity,
      user,
      priorMessages,
      businessInformation,
      productInformation,
      productOverview,
      salesProcess,
      prospectContactsWithIntelligence,
      activityType: activity.type,
      // Pre-computed values for template interpolation (eval-compatible)
      todaysDate,
      currentTime,
      businessInformationText,
      productOverviewText,
      productInformationText,
      salesProcessText,
      prospectName,
      prospectDescription,
      prospectWebsite,
      prospectIndustry,
      prospectSize,
      activityDataJson,
      opportunityJson,
      emailFromJson,
      emailToJson,
      emailCcJson,
      emailBccJson,
      activityDate,
      userName,
    };

    const captureId = await EvalCaptureService.startCapture({
      organizationId: (organization as any)?._id?.toString() || '',
      agentName: 'summariseActivityAgent',
      inputVariables,
      promptTemplateVersion: 'v1.0',
      metadata: {
        activityId: (activity as any)?._id?.toString() || '',
        opportunityId: (opportunity as any)?._id?.toString() || '',
        activityType: activity.type,
      },
    });

    const context = await summariseActivityAgent.generateLegacy(
      [{content: prompt, role: 'user'}],
      {
        output: outputSchema,
        providerOptions: {
          openai: {
            metadata: {
              activityId: (activity as any)?._id?.toString() || '',
              opportunityId: (opportunity as any)?._id?.toString() || '',
              file: 'summarise-activity',
              agent: 'summariseActivityAgent',
              orgId: (organization as any)?._id?.toString() || (opportunity?.organization as any)?._id?.toString() || '',
              ...(captureId ? { evalCaptureId: captureId } : {}),
            }
          }
        }
      }
    );
    
    // Clean up any placeholder entries that might have slipped through
    const cleanedObject = cleanPlaceholderEntries(context.object);
    
    console.log(chalk.gray(`  -> AI Summary Result:`, JSON.stringify(cleanedObject, null, 2)));
  
    await activity.updateOne({ aiSummary: { date: activity.date, summary: JSON.stringify(cleanedObject) } });
    
    console.log(chalk.green.bold(`[+] Successfully summarized activity ${activityId}`));
  
    return { ...context, object: cleanedObject };
};