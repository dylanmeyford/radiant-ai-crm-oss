export type EvalRunStatus = 'pending' | 'completed' | 'failed';

export interface EvalRun {
  _id: string;
  organization: string;
  agentName: string;
  status: EvalRunStatus;
  inputVariables?: Record<string, any>;
  promptTemplate?: string;
  promptTemplateVersion?: string;
  fullPrompt?: string;
  inputMessages?: Array<{ role: string; content: string }>;
  outputText?: string;
  parsedOutput?: any;
  expectedOutput?: any;
  expectedNotes?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  modelName?: string;
  error?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvalDataset {
  _id: string;
  organization: string;
  name: string;
  description?: string;
  agentName: string;
  runIds: Array<string | EvalRun>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptTemplate {
  _id: string;
  organization: string;
  agentName: string;
  version: string;
  template: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvalScorerResult {
  score: number;
  reason?: string;
  details?: Record<string, { score: number; reason: string }>;
}

export interface ExperimentVariantResult {
  avgScores: Record<string, number>;
  avgLatency: number;
  avgTokens: number;
  modelName?: string;
  templateId: string;
  perRun?: Array<{
    runId: string;
    expectedOutput: any;
    output: any;
    scores: Record<string, EvalScorerResult>;
  }>;
}

export interface ExperimentResult {
  experimentId: string;
  name: string;
  results: Record<string, ExperimentVariantResult>;
  comparison?: {
    winner?: string | null;
  };
}

export interface EvalScorerDefinition {
  key: string;
  name: string;
  description: string;
  agentTypes?: string[];
  activityTypes?: string[];
  isLLMBased?: boolean;
}

export type EvalExperimentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface EvalExperiment {
  _id: string;
  name: string;
  datasetId: string;
  variants: Array<{ name: string; templateId: string; modelName?: string }>;
  scorers: string[];
  status: EvalExperimentStatus;
  progress?: { current: number; total: number; currentVariant?: string };
  results?: Record<string, ExperimentVariantResult>;
  comparison?: { winner?: string | null };
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}
