// Pipeline structure (matches backend model)
export interface Pipeline {
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Basic opportunity structure for pipeline views
export interface Opportunity {
  _id: string;
  name: string;
  description?: string;
  amount: number;
  stage: string | PipelineStage; // Can be either ID string or populated stage object
  probability: number;
  expectedCloseDate: Date;
  createdDate: Date;
  prospect: {
    _id: string;
    name: string;
  };
  contacts: Array<{
    _id: string;
    name: string;
    email: string;
  }>;
  tags?: string[];
}

// Comprehensive opportunity data structure for detailed views
export interface OpportunityData {
  _id: string;
  name: string;
  description?: string;
  latestDealNarrative?: string;
  dealHealthTrend?: string;
  dealTemperatureHistory?: Array<{
    temperature: number;
    date: string;
  }>;
  momentumDirection?: string;
  stage?: string;
  probability?: number;
  amount?: number;
  prospect?: {
    _id: string;
    name: string;
    domains?: string[];
  };
  contacts?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    emails: string[];
    isPrimary: boolean;
    opportunityIntelligence?: Array<{
      opportunity: string;
      engagementScore: number;
      roleAssignments?: Array<{
        role: string;
        assignedAt: string;
      }>;
    }>;
    contactResearch?: {
      backgroundInfo?: string;
      connectionOpportunities?: string[];
      contactScore?: number;
      debug?: {
        noInformationFound: boolean;
        [key: string]: any;
      };
      linkedInProfile?: string;
      personalSummary?: string;
      researchedAt?: string;
      roleAtCompany?: string;
    };
  }>;
  meddpicc?: {
    metrics?: Array<{
      metric: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    economicBuyer?: Array<{
      name: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    decisionCriteria?: Array<{
      criteria: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    decisionProcess?: Array<{
      process: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    identifiedPain?: Array<{
      pain: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    champion?: Array<{
      name: string;
      confidence: string;
      relevance: string;
      reason: string;
    }>;
    competition?: Array<any>;
  };
}

// Pipeline stage structure for pipeline views (matches backend model)
export interface PipelineStage {
  _id: string;
  name: string;
  order: number;
  description: string;
  organization: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Frontend-only props for display:
  color?: string;
  opportunities: Opportunity[];
} 