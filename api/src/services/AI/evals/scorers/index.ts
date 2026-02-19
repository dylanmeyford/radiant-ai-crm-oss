// Use require to avoid NodeNext resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { emailSummarySemanticScorer, emailSummarySemanticScorerMetadata } = require('./emailSummarySemanticScorer');

export interface EvalScorerResult {
  score: number;
  reason?: string;
  details?: Record<string, any>;
}

export interface ScorerMetadata {
  name: string;
  description: string;
  agentTypes?: string[];
  activityTypes?: string[];
  isLLMBased?: boolean;
}

export type EvalScorer = (params: { expected: any; output: any; orgId?: string }) =>
  EvalScorerResult | Promise<EvalScorerResult>;

export interface RegisteredScorer {
  scorer: EvalScorer;
  metadata: ScorerMetadata;
}

const normalizeActionType = (value: any) => (typeof value === 'string' ? value.toUpperCase() : null);

const actionTypeMatch: EvalScorer = ({ expected, output }) => {
  const expectedType = normalizeActionType(expected?.actions?.[0]?.type);
  const outputType = normalizeActionType(output?.actions?.[0]?.type);

  if (!expectedType) {
    return { score: 1, reason: 'No expected action type to compare' };
  }
  if (!outputType) {
    return { score: 0, reason: 'No output action type' };
  }
  return {
    score: expectedType === outputType ? 1 : 0,
    reason: expectedType === outputType
      ? `Action type matches (${outputType})`
      : `Expected ${expectedType} but got ${outputType}`,
  };
};

const outputPresent: EvalScorer = ({ output }) => {
  const hasOutput = output && Object.keys(output).length > 0;
  return { score: hasOutput ? 1 : 0, reason: hasOutput ? 'Output present' : 'No output' };
};

export const scorerRegistry: Record<string, RegisteredScorer> = {
  actionTypeMatch: {
    scorer: actionTypeMatch,
    metadata: {
      name: 'Action Type Match',
      description: 'Checks if the primary action type matches between expected and output',
      agentTypes: ['nextActionAgent'],
      isLLMBased: false,
    },
  },
  outputPresent: {
    scorer: outputPresent,
    metadata: {
      name: 'Output Present',
      description: 'Verifies that output exists and has content',
      isLLMBased: false,
    },
  },
  emailSummarySemantic: {
    scorer: emailSummarySemanticScorer,
    metadata: emailSummarySemanticScorerMetadata,
  },
};

export const getScorerList = (agentName?: string, activityType?: string) => {
  return Object.entries(scorerRegistry)
    .filter(([_, { metadata }]) => {
      if (agentName && metadata.agentTypes?.length) {
        if (!metadata.agentTypes.includes(agentName)) {
          return false;
        }
      }
      if (activityType && metadata.activityTypes?.length) {
        if (!metadata.activityTypes.includes(activityType)) {
          return false;
        }
      }
      return true;
    })
    .map(([key, { metadata }]) => ({
      key,
      ...metadata,
    }));
};

export type ScorerName = keyof typeof scorerRegistry;
