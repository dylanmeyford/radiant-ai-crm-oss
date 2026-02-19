import { z } from 'zod';
import { ActivityType } from '../../../models/Activity';
import { NextBestActionsSchema } from '../actionPipeline/NextBestActionAgent';

export const emailOutputSchema = z.object({
  emailFrom: z.string(),
  emailTo: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })).default([]),
  emailCc: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })).default([]),
  emailBcc: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })).default([]),
  keyMessage: z.string(),
  context: z.string(),
  salesCycleStage: z.enum(['Discovery', 'Qualification', 'Proposal', 'Negotiation', 'Closed']),
  sentimentAnalysis: z.string(),
  indicatorsOfInterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  indicatorsOfDisinterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  filteredIrrelevantTopics: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
    quote: z.string(),
  })).default([]),
  MEDDPICC: z.object({
    Metrics: z.array(z.object({
      metric: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Economic Buyer': z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Criteria': z.array(z.object({
      criteria: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Paper Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Identified Pain': z.array(z.object({
      pain: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Champion: z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Competition: z.array(z.object({
      competition: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
  }),
  debug: z.string().default(''),
});

export const meetingOutputSchema = z.object({
  meetingAttendees: z.array(z.object({
    name: z.string(),
    role: z.string(),
    organization: z.string(),
  })).default([]),
  meetingPurpose: z.string().default(''),
  meetingDate: z.string().default(''),
  meetingDuration: z.string().default(''),
  keyDiscussionPoints: z.array(z.string()).default([]),
  questionsAskedByProspect: z.array(z.object({
    question: z.string(),
    context: z.string(),
    person: z.string(),
  })).default([]),
  questionsAskedBySalesTeam: z.array(z.object({
    question: z.string(),
    context: z.string(),
    person: z.string(),
  })).default([]),
  indicatorsOfInterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  indicatorsOfDisinterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  filteredIrrelevantTopics: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
    quote: z.string(),
  })).default([]),
  keyMessage: z.string().default(''),
  context: z.string().default(''),
  salesCycleStage: z.enum(['Discovery', 'Qualification', 'Proposal', 'Negotiation', 'Closed']).optional(),
  sentimentAnalysis: z.string().default(''),
  MEDDPICC: z.object({
    Metrics: z.array(z.object({
      metric: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Economic Buyer': z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Criteria': z.array(z.object({
      criteria: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Paper Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Identified Pain': z.array(z.object({
      pain: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Champion: z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Competition: z.array(z.object({
      competition: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
  }),
  overallSummary: z.string().default(''),
  analyzed: z.boolean().default(false),
  debug: z.string().default(''),
});

export const messageActivityOutputSchema = z.object({
  messageFrom: z.string(),
  messageTo: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })).default([]),
  keyMessage: z.string(),
  context: z.string(),
  salesCycleStage: z.enum(['Discovery', 'Qualification', 'Proposal', 'Negotiation', 'Closed']),
  sentimentAnalysis: z.string(),
  indicatorsOfInterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  indicatorsOfDisinterest: z.array(z.object({
    indicator: z.string(),
    quoteOrContext: z.string(),
    person: z.string(),
    strength: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  filteredIrrelevantTopics: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
    quote: z.string(),
  })).default([]),
  MEDDPICC: z.object({
    Metrics: z.array(z.object({
      metric: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Economic Buyer': z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Criteria': z.array(z.object({
      criteria: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Decision Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Paper Process': z.array(z.object({
      process: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    'Identified Pain': z.array(z.object({
      pain: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Champion: z.array(z.object({
      name: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
    Competition: z.array(z.object({
      competition: z.string(),
      reason: z.string(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      relevance: z.enum(['High', 'Medium', 'Low']),
    })).default([]),
  }),
  debug: z.string().default(''),
});

export const digitalSalesRoomOutputSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string(),
  }),
  activityType: z.enum(['DSR_ACCESS', 'DSR_DOCUMENT_VIEW', 'DSR_LINK_CLICK']),
  activityTimestamp: z.string(),
  details: z.object({
    documentName: z.string().optional().default('N/A'),
    linkUrl: z.string().optional().default('N/A'),
    viewDurationSeconds: z.number().optional(),
  }),
  keyTakeaway: z.string(),
  engagementLevel: z.enum(['High', 'Medium', 'Low']),
  engagementReasoning: z.string(),
  inferredInterest: z.string(),
  inferredMEDDPICCSignals: z.array(z.object({
    category: z.enum([
      'Metrics',
      'Economic Buyer',
      'Decision Criteria',
      'Decision Process',
      'Paper Process',
      'Identified Pain',
      'Champion',
      'Competition',
    ]),
    signal: z.string(),
    reasoning: z.string(),
    confidence: z.enum(['High', 'Medium', 'Low']),
  })).default([]),
  suggestedNextSteps: z.array(z.string()).default([]),
  debug: z.string().default(''),
});

export const getSummariseActivityOutputSchema = (activityType?: string) => {
  switch (activityType) {
    case ActivityType.SMS:
    case ActivityType.LINKEDIN:
      return messageActivityOutputSchema;
    case ActivityType.EMAIL:
      return emailOutputSchema;
    case ActivityType.MEETING_NOTES:
    case ActivityType.CALENDAR:
    case ActivityType.CALL:
      return meetingOutputSchema;
    case ActivityType.DSR_ACCESS:
    case ActivityType.DSR_DOCUMENT_VIEW:
    case ActivityType.DSR_LINK_CLICK:
      return digitalSalesRoomOutputSchema;
    default:
      return emailOutputSchema;
  }
};

export { NextBestActionsSchema };
