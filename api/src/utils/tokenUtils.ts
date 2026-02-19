/**
 * Token estimation and management utilities for AI model context limits
 */

/**
 * Rough token estimation for text content
 * Based on the rule of thumb: 1 token ≈ 4 characters for English text
 * This is a conservative estimate that works well for most content
 */
export function estimateTokenCount(text: string): number {
  // Remove extra whitespace and normalize
  const cleanText = text.trim().replace(/\s+/g, ' ');
  
  // Conservative estimate: 1 token per 3.5 characters on average
  // This accounts for JSON structure overhead and varying token sizes
  return Math.ceil(cleanText.length / 3.5);
}

/**
 * Estimate tokens for a JSON object
 */
export function estimateJsonTokenCount(obj: any): number {
  const jsonString = JSON.stringify(obj, null, 2);
  return estimateTokenCount(jsonString);
}

/**
 * Truncate text to fit within a target token count
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (estimateTokenCount(text) <= maxTokens) {
    return text;
  }
  
  // Conservative character limit based on token estimate
  const maxChars = Math.floor(maxTokens * 3.5);
  
  if (text.length <= maxChars) {
    return text;
  }
  
  // Truncate and add ellipsis
  const truncated = text.substring(0, maxChars - 3);
  
  // Try to truncate at word boundary if possible
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * O3 Model Context Limits
 */
export const O3_MODEL_LIMITS = {
  INPUT_TOKENS: 200000,
  OUTPUT_TOKENS: 100000,
  // Reserve tokens for system prompt, instructions, and response
  SAFE_INPUT_LIMIT: 180000,
  // Target limit for activity data to leave room for other content
  ACTIVITY_DATA_LIMIT: 150000
} as const;

/**
 * Check if content exceeds safe limits for o3 model
 */
export function exceedsSafeLimit(content: string): boolean {
  return estimateTokenCount(content) > O3_MODEL_LIMITS.SAFE_INPUT_LIMIT;
}

/**
 * Get token usage statistics for debugging
 */
export function getTokenStats(content: string) {
  const tokens = estimateTokenCount(content);
  return {
    estimatedTokens: tokens,
    percentOfLimit: (tokens / O3_MODEL_LIMITS.SAFE_INPUT_LIMIT * 100).toFixed(1),
    withinLimit: tokens <= O3_MODEL_LIMITS.SAFE_INPUT_LIMIT,
    charactersPerToken: (content.length / tokens).toFixed(2)
  };
}
