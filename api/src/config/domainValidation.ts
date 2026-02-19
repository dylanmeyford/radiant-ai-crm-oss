export const DOMAIN_VALIDATION_CONFIG = {
  cacheTtlDays: 30,
  minConfidence: 'medium' as const,
  aiModel: 'gpt-4o-mini',
  batchSize: 5,
  orgInfoCacheTtlMs: 10 * 60 * 1000, // 10 minutes
};

export type DomainValidationConfidence =
  (typeof DOMAIN_VALIDATION_CONFIG)['minConfidence'] | 'high' | 'low';
