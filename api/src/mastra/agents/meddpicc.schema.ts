import { z } from 'zod';

// Note: All fields in these schemas must be required (not optional) for OpenAI strict JSON schema validation.
// When used with structured outputs, OpenAI requires all properties to be in the 'required' array.
// For priorValue, use empty string when not applicable (e.g., for ADD actions).

const MeddpiccMetricSchema = z.object({
  metric: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How much of this metric is directly attributable to our solution vs other factors'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccEconomicBuyerSchema = z.object({
  name: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How directly this person relates to our solution decision'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccDecisionCriteriaSchema = z.object({
  criteria: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How specifically this criteria relates to our solution'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccDecisionProcessSchema = z.object({
  process: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How directly this process relates to our solution evaluation'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccPaperProcessSchema = z.object({
  process: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How directly this process relates to purchasing our solution'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccIdentifiedPainSchema = z.object({
  pain: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How much of this pain is specifically solvable by our solution'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccChampionSchema = z.object({
  name: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How specifically they are championing our solution vs general change'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

const MeddpiccCompetitionSchema = z.object({
  competition: z.string(),
  reason: z.string().describe('Explanation for this action'),
  confidence: z.enum(['High', 'Medium', 'Low']),
  relevance: z.enum(['High', 'Medium', 'Low']).describe('How directly this competes with our solution'),
  action: z.enum(['add', 'update', 'remove']).describe('Whether to add new info, update existing, or remove outdated info'),
  priorValue: z.string().describe('For REMOVE: the exact current value of the key field to match and remove. For UPDATE: if changing the key field text, the exact current value to find and update. Use empty string for ADD or when updating in-place without changing the key.')
});

export const MeddpiccAgentOutputSchema = z.object({
  MEDDPICC: z.object({
    metrics: z.array(MeddpiccMetricSchema).optional(),
    economicBuyer: z.array(MeddpiccEconomicBuyerSchema).optional(),
    decisionCriteria: z.array(MeddpiccDecisionCriteriaSchema).optional(),
    decisionProcess: z.array(MeddpiccDecisionProcessSchema).optional(),
    paperProcess: z.array(MeddpiccPaperProcessSchema).optional(),
    identifiedPain: z.array(MeddpiccIdentifiedPainSchema).optional(),
    champion: z.array(MeddpiccChampionSchema).optional(),
    competition: z.array(MeddpiccCompetitionSchema).optional(),
  }).optional(),
  reasoning: z.string().describe('Overall reasoning for the MEDDPICC analysis and any changes made')
}); 