import { z } from 'zod';
import { mastra } from '../../../../mastra';
import type { EvalScorer, EvalScorerResult, ScorerMetadata } from './index';

// Schema for semantic comparison result
const SemanticComparisonSchema = z.object({
  score: z.number().min(0).max(1).describe('Semantic similarity score from 0.0 to 1.0'),
  reason: z.string().describe('Brief explanation of why the values match or do not match'),
});

export const emailSummarySemanticScorerMetadata: ScorerMetadata = {
  name: 'Email Summary Semantic Match',
  description: 'Uses LLM to determine if email summary properties are meaningfully the same',
  agentTypes: ['summariseActivityAgent'],
  activityTypes: ['EMAIL'],
  isLLMBased: true,
};

const PROPERTY_PATHS = [
  'emailFrom',
  'emailTo',
  'emailCc',
  'emailBcc',
  'keyMessage',
  'context',
  'salesCycleStage',
  'sentimentAnalysis',
  'indicatorsOfInterest',
  'indicatorsOfDisinterest',
  'filteredIrrelevantTopics',
  'MEDDPICC.Metrics',
  'MEDDPICC.Economic Buyer',
  'MEDDPICC.Decision Criteria',
  'MEDDPICC.Decision Process',
  'MEDDPICC.Paper Process',
  'MEDDPICC.Identified Pain',
  'MEDDPICC.Champion',
  'MEDDPICC.Competition',
];

const getValueAtPath = (obj: any, path: string) => {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
};

const comparePropertySemantically = async (propertyName: string, expected: any, actual: any, orgId?: string) => {
  if (expected == null && actual == null) {
    return { score: 1, reason: 'Both values are empty' };
  }
  if (expected == null || actual == null) {
    return {
      score: 0,
      reason: `One value is empty: expected=${expected == null ? 'empty' : 'present'}, actual=${actual == null ? 'empty' : 'present'}`,
    };
  }
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === 0 && actual.length === 0) {
    return { score: 1, reason: 'Both arrays are empty' };
  }

  const basicAgent = mastra.getAgent('basicAgent');
  if (!basicAgent) {
    throw new Error('Basic Agent not found in mastra configuration');
  }

  const prompt = `You are an evaluator comparing two outputs from an AI sales activity email summarization agent.

Compare these two values for the property "${propertyName}" and determine if they are MEANINGFULLY THE SAME.

EXPECTED OUTPUT:
${JSON.stringify(expected, null, 2)}

RUN OUTPUT:
${JSON.stringify(actual, null, 2)}

EVALUATION CRITERIA:
1. The MEANING and KEY INFORMATION must be equivalent.
2. Minor wording differences are OK if the meaning is preserved.
3. The actual output should NOT have additional information not in expected.
4. The actual output should NOT be missing key information from expected.
5. For arrays: item order does not matter, but the same items should be present with equivalent meaning.

Score guidelines:
- 1.0: Semantically identical or Minor differences in wording but same meaning
- 0.5-0.7: Some content matches but missing or extra information
- 0.0-0.4: Significantly different meaning or content`;

  const result = await basicAgent.generateLegacy(
    [{ role: 'user', content: prompt }],
    {
      output: SemanticComparisonSchema,
      providerOptions: {
        openai: {
          metadata: {
            file: 'email-summary-semantic-scorer',
            agent: 'basicAgent',
            propertyName,
            ...(orgId ? { orgId } : {}),
          },
        },
      },
    }
  );

  const score = typeof result.object?.score === 'number' ? result.object.score : 0;
  const reason = typeof result.object?.reason === 'string' ? result.object.reason : 'No reason provided';

  return { score, reason };
};

export const emailSummarySemanticScorer: EvalScorer = async ({ expected, output, orgId }): Promise<EvalScorerResult> => {
  if (!expected || !output) {
    return {
      score: 0,
      reason: 'Missing expected or output data',
      details: {},
    };
  }

  const details: Record<string, { score: number; reason: string }> = {};
  const scores: number[] = [];

  for (const path of PROPERTY_PATHS) {
    const expectedValue = getValueAtPath(expected, path);
    const outputValue = getValueAtPath(output, path);
    const { score, reason } = await comparePropertySemantically(path, expectedValue, outputValue, orgId);
    details[path] = { score, reason };
    scores.push(score);
  }

  const avgScore = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
  const mismatches = Object.entries(details)
    .filter(([_, value]) => value.score < 0.8)
    .map(([key, value]) => `${key}: ${value.reason}`);

  return {
    score: Math.round(avgScore * 100) / 100,
    reason: mismatches.length
      ? `${mismatches.length} properties differ: ${mismatches.slice(0, 3).join('; ')}${mismatches.length > 3 ? '...' : ''}`
      : 'All properties match semantically',
    details,
  };
};
