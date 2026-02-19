// Load environment variables first
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.devcontainer/dev.env') });

import { Mastra } from '@mastra/core';
import { summariseActivityAgent } from './agents/summariseActivityAgent';
import { opportunityContextAgent } from './agents/generateOpportunityContextAgent';
import { nextActionAgent } from './agents/nextActionAgent';
import { evaluationAgent } from './agents/evaluationAgent';
import { titleMeetingAgent } from './agents/titleMeetingAgent';
import { activityImpactAgent } from './agents/activityImpactAgent';
import { scoreReasoningAgent } from './agents/scoreReasoningAgent';
import { behavioralSignalAgent } from './agents/behavioralSignalAgent';
import { communicationPatternAgent } from './agents/communicationPatternAgent';
import { relationshipStoryAgent } from './agents/relationshipStoryAgent';
import { dealSummaryAgent } from './agents/dealSummaryAgent';
import { roleExtractionAgent } from './agents/roleExtractionAgent';
import { responsivenessAgent } from './agents/responsivenessAgent';
import { meddpiccAgent } from './agents/meddpiccAgent';
import { actionEvaluationAgent } from './agents/actionEvaluationAgent';
import { fileProcessingAgent } from './agents/fileProcessingAgent';
import { enhancedContentAgent } from './agents/enhancedContentAgent';
import { contentCompositionWorkflow } from './workflows/contentCompositionWorkflow';
import { playbookSelectionAgent } from './agents/playbookSelectionAgent';
import { playbookSummaryAgent } from './agents/playbookSummaryAgent';
import { researchAgent } from './agents/researchAgent';
import { decideOnlineResearchAgent } from './agents/decideOnlineResearchAgent';
import { meetingPrepAgent } from './agents/meetingPrepAgent';
import { contactResearchAgent } from './agents/contactResearchAgent';
import { v4 as uuidv4 } from 'uuid';
import { basicAgent } from './agents/basicAgent';
import { domainValidationAgent } from './agents/domainValidationAgent';
import { dealQualificationAgent } from './agents/dealQualificationAgent';
import { wrapAgentWithTracking } from '../services/mastraUsageWrapper';


// // Import database connection
// import connectDB from '../config/database';

// // Import all models to register them with Mongoose
// // These need to be imported as the actual model exports to prevent tree-shaking
// import User from '../models/User';
// import Organization from '../models/Organization';
// import Contact from '../models/Contact';
// import Opportunity from '../models/Opportunity';
// import Activity from '../models/Activity';
// import EmailActivity from '../models/EmailActivity';
// import CalendarActivity from '../models/CalendarActivity';
// import PipelineStage from '../models/PipelineStage';
// import SalesPlaybook from '../models/SalesPlaybook';
// import { Pathway, PathwayStep, VisitorProgress, SalesRoomProgress } from '../models/Pathway';
// import Intel from '../models/Intel';
// import Competitor from '../models/Competitor';
// import Prospect from '../models/Prospect';
// import { ProposedAction } from '../models/ProposedAction';
// import NylasConnection from '../models/NylasConnection';
// import ApiKey from '../models/ApiKey';
// import AgentRates from '../models/AgentRates';
// import AIUsageTracking from '../models/AIUsageTracking';
// import { Invitation } from '../models/Invitation';
// import MediaProcessingQueue from '../models/MediaProcessingQueue';
// import ActivityProcessingQueue from '../models/ActivityProcessingQueue';
// import { DigitalSalesRoom, Document, DocumentAccess, LinkAccess, Visitor, Link, Version } from '../models/DigitalSalesRoom';

// // Reference all models to prevent tree-shaking by the Mastra compiler
// const MODELS = {
//   User,
//   Organization,
//   Contact,
//   Opportunity,
//   Activity,
//   EmailActivity,
//   CalendarActivity,
//   PipelineStage,
//   SalesPlaybook,
//   Pathway,
//   PathwayStep,
//   VisitorProgress,
//   SalesRoomProgress,
//   Intel,
//   Competitor,
//   Prospect,
//   ProposedAction,
//   NylasConnection,
//   ApiKey,
//   AgentRates,
//   AIUsageTracking,
//   Invitation,
//   MediaProcessingQueue,
//   ActivityProcessingQueue,
//   DigitalSalesRoom,
//   Document,
//   DocumentAccess,
//   LinkAccess,
//   Visitor,
//   Link,
//   Version,
// };

// // Log models to ensure they're referenced
// console.log(`Loaded ${Object.keys(MODELS).length} Mongoose models for Mastra`);

// // Establish database connection for Mastra playground
// connectDB().catch(err => {
//   console.error('Failed to connect to MongoDB in Mastra:', err);
// });

// Wrap all agents with usage tracking before creating Mastra instance
const mastra = new Mastra({
  agents: {
    summariseActivityAgent: wrapAgentWithTracking(summariseActivityAgent, 'summariseActivityAgent'),
    opportunityContextAgent: wrapAgentWithTracking(opportunityContextAgent, 'opportunityContextAgent'),
    nextActionAgent: wrapAgentWithTracking(nextActionAgent, 'nextActionAgent'),
    evaluationAgent: wrapAgentWithTracking(evaluationAgent, 'evaluationAgent'),
    titleMeetingAgent: wrapAgentWithTracking(titleMeetingAgent, 'titleMeetingAgent'),
    activityImpactAgent: wrapAgentWithTracking(activityImpactAgent, 'activityImpactAgent'),
    scoreReasoningAgent: wrapAgentWithTracking(scoreReasoningAgent, 'scoreReasoningAgent'),
    behavioralSignalAgent: wrapAgentWithTracking(behavioralSignalAgent, 'behavioralSignalAgent'),
    communicationPatternAgent: wrapAgentWithTracking(communicationPatternAgent, 'communicationPatternAgent'),
    relationshipStoryAgent: wrapAgentWithTracking(relationshipStoryAgent, 'relationshipStoryAgent'),
    dealSummaryAgent: wrapAgentWithTracking(dealSummaryAgent, 'dealSummaryAgent'),
    roleExtractionAgent: wrapAgentWithTracking(roleExtractionAgent, 'roleExtractionAgent'),
    responsivenessAgent: wrapAgentWithTracking(responsivenessAgent, 'responsivenessAgent'),
    meddpiccAgent: wrapAgentWithTracking(meddpiccAgent, 'meddpiccAgent'),
    actionEvaluationAgent: wrapAgentWithTracking(actionEvaluationAgent, 'actionEvaluationAgent'),
    fileProcessingAgent: wrapAgentWithTracking(fileProcessingAgent, 'fileProcessingAgent'),
    enhancedContentAgent: wrapAgentWithTracking(enhancedContentAgent, 'enhancedContentAgent'),
    playbookSelectionAgent: wrapAgentWithTracking(playbookSelectionAgent, 'playbookSelectionAgent'),
    playbookSummaryAgent: wrapAgentWithTracking(playbookSummaryAgent, 'playbookSummaryAgent'),
    researchAgent: wrapAgentWithTracking(researchAgent, 'researchAgent'),
    decideOnlineResearchAgent: wrapAgentWithTracking(decideOnlineResearchAgent, 'decideOnlineResearchAgent'),
    meetingPrepAgent: wrapAgentWithTracking(meetingPrepAgent, 'meetingPrepAgent'),
    contactResearchAgent: wrapAgentWithTracking(contactResearchAgent, 'contactResearchAgent'),
    basicAgent: wrapAgentWithTracking(basicAgent, 'basicAgent'),
    domainValidationAgent: wrapAgentWithTracking(domainValidationAgent, 'domainValidationAgent'),
    dealQualificationAgent: wrapAgentWithTracking(dealQualificationAgent, 'dealQualificationAgent'),
  },
  workflows: {
    contentCompositionWorkflow,
  },
  idGenerator: uuidv4, // for railway which was not running with crypto
});

export { mastra };

