// Centralized query keys for TanStack Query
// Use objects to prevent accidental key collisions and to make invalidation easy

export const queryKeys = {
  auth: {
    me: () => [{ scope: 'auth', entity: 'me' }] as const,
  },
  actions: {
    proposed: (params: { limit?: number; skip?: number; status?: string | string[]; owner?: 'me' } = {}) =>
      [{ scope: 'actions', entity: 'proposed', params }] as const,
    byOpportunity: (opportunityId: string) =>
      [{ scope: 'actions', entity: 'opportunity', opportunityId }] as const,
  },
  activities: {
    list: () => [{ scope: 'activities', entity: 'list' }] as const,
    detail: (activityId: string) => [{ scope: 'activities', entity: 'detail', activityId }] as const,
    byOpportunity: (opportunityId: string) => [{ scope: 'activities', entity: 'byOpportunity', opportunityId }] as const,
    byProspect: (prospectId: string) => [{ scope: 'activities', entity: 'byProspect', prospectId }] as const,
    byContact: (contactId: string) => [{ scope: 'activities', entity: 'byContact', contactId }] as const,
    tasksByProspect: (prospectId: string) => [{ scope: 'activities', entity: 'tasks', prospectId }] as const,
  },
  calendars: {
    activities: () => [{ scope: 'calendars', entity: 'activities' }] as const,
    activitiesByRange: (params: { startDate?: string | null; endDate?: string | null; status?: string | null; calendarId?: string | null } = {}) =>
      [{ scope: 'calendars', entity: 'activitiesByRange', params }] as const,
    activity: (calendarId: string) => [{ scope: 'calendars', entity: 'activity', calendarId }] as const,
    recorded: (params: { page?: number; limit?: number } = {}) =>
      [{ scope: 'calendars', entity: 'recorded', params }] as const,
    byOpportunity: (opportunityId: string) => [{ scope: 'calendars', entity: 'byOpportunity', opportunityId }] as const,
    byProspect: (prospectId: string) => [{ scope: 'calendars', entity: 'byProspect', prospectId }] as const,
    byContact: (contactId: string) => [{ scope: 'calendars', entity: 'byContact', contactId }] as const,
    byConnection: (connectionId: string) => [{ scope: 'calendars', entity: 'connection', connectionId }] as const,
  },
  nylas: {
    connections: () => [{ scope: 'nylas', entity: 'connections' }] as const,
    oauthExchange: () => [{ scope: 'nylas', entity: 'oauth-exchange' }] as const,
  },
  notetaker: {
    setting: () => [{ scope: 'notetaker', entity: 'setting' }] as const,
    meetings: (params?: Record<string, unknown>) => [{ scope: 'notetaker', entity: 'meetings', params: params ?? {} }] as const,
    meeting: (meetingId: string) => [{ scope: 'notetaker', entity: 'meeting', meetingId }] as const,
    media: (activityId: string, mediaType: 'transcript' | 'recording') =>
      [{ scope: 'notetaker', entity: 'media', activityId, mediaType }] as const,
  },
  prospects: {
    list: () => [{ scope: 'prospects', entity: 'list' }] as const,
    detail: (prospectId: string) => [{ scope: 'prospects', entity: 'detail', prospectId }] as const,
  },
  contacts: {
    byProspect: (prospectId: string) => [{ scope: 'contacts', entity: 'byProspect', prospectId }] as const,
  },
  opportunities: {
    list: () => [{ scope: 'opportunities', entity: 'list' }] as const,
    detail: (opportunityId: string) => [{ scope: 'opportunities', entity: 'detail', opportunityId }] as const,
    processingStatus: (opportunityId: string) => [{ scope: 'opportunities', entity: 'processingStatus', opportunityId }] as const,
  },
  pipelines: {
    all: [{ scope: 'pipelines' }] as const,
    list: () => [{ scope: 'pipelines', entity: 'list' }] as const,
    detail: (pipelineId: string) => [{ scope: 'pipelines', entity: 'detail', pipelineId }] as const,
    default: () => [{ scope: 'pipelines', entity: 'default' }] as const,
  },
  pipelineStages: {
    all: [{ scope: 'pipelineStages' }] as const,
    list: () => [{ scope: 'pipelineStages', entity: 'list' }] as const,
    byPipeline: (pipelineId: string) => [{ scope: 'pipelineStages', entity: 'byPipeline', pipelineId }] as const,
  },
  intel: {
    list: (filters: { importance?: string; type?: string; prospect?: string; competitor?: string } = {}) =>
      [{ scope: 'intel', entity: 'list', filters }] as const,
  },
  playbook: {
    items: (filterType?: string | null) => [{ scope: 'playbook', entity: 'items', filterType: filterType ?? null }] as const,
    detail: (itemId: string) => [{ scope: 'playbook', entity: 'detail', itemId }] as const,
    searchItems: (params: { query: string; type?: string | null }) => [{ scope: 'playbook', entity: 'searchItems', params }] as const,
    filesSearch: (params: Record<string, string | undefined>) => [{ scope: 'playbook', entity: 'filesSearch', params }] as const,
  },
  salesRoom: {
    list: () => [{ scope: 'salesRoom', entity: 'list' }] as const,
    detail: (salesRoomId: string) => [{ scope: 'salesRoom', entity: 'detail', salesRoomId }] as const,
    byOpportunity: (opportunityId: string) => [{ scope: 'salesRoom', entity: 'byOpportunity', opportunityId }] as const,
    analytics: (salesRoomId: string) => [{ scope: 'salesRoom', entity: 'analytics', salesRoomId }] as const,
    publicDetail: (uniqueId: string) => [{ scope: 'salesRoom', entity: 'publicDetail', uniqueId }] as const,
  },
  competitors: {
    list: () => [{ scope: 'competitors', entity: 'list' }] as const,
    detail: (competitorId: string) => [{ scope: 'competitors', entity: 'detail', competitorId }] as const,
  },
  emailActivities: {
    list: () => [{ scope: 'email-activities', entity: 'list' }] as const,
    byOpportunity: (opportunityId: string) => [{ scope: 'email-activities', entity: 'byOpportunity', opportunityId }] as const,
    byProspect: (prospectId: string) => [{ scope: 'email-activities', entity: 'byProspect', prospectId }] as const,
    byContact: (contactId: string) => [{ scope: 'email-activities', entity: 'byContact', contactId }] as const,
    detail: (emailId: string) => [{ scope: 'email-activities', entity: 'detail', emailId }] as const,
    drafts: () => [{ scope: 'email-activities', entity: 'drafts' }] as const,
    scheduled: () => [{ scope: 'email-activities', entity: 'scheduled' }] as const,
  },
  pathways: {
    list: () => [{ scope: 'pathways', entity: 'list' }] as const,
    detail: (pathwayId: string) => [{ scope: 'pathways', entity: 'detail', pathwayId }] as const,
    progress: (salesRoomId: string) => [{ scope: 'pathways', entity: 'progress', salesRoomId }] as const,
    progressPublic: (salesRoomId: string) => [{ scope: 'pathways', entity: 'progressPublic', salesRoomId }] as const,
  },
  emailSignature: {
    detail: (connectionId: string) => [{ scope: 'emailSignature', entity: 'detail', connectionId }] as const,
  },
  team: {
    members: () => [{ scope: 'team', entity: 'members' }] as const,
    invitations: () => [{ scope: 'team', entity: 'invitations' }] as const,
  },
  billing: {
    status: () => [{ scope: 'billing', entity: 'status' }] as const,
    usage: () => [{ scope: 'billing', entity: 'usage' }] as const,
    liveUsage: () => [{ scope: 'billing', entity: 'liveUsage' }] as const,
    currentPeriod: () => [{ scope: 'billing', entity: 'currentPeriod' }] as const,
  },
  aiUsage: {
    current: () => [{ scope: 'aiUsage', entity: 'current' }] as const,
    month: (year: number, month: number) => [{ scope: 'aiUsage', entity: 'month', year, month }] as const,
    history: (months: number = 6) => [{ scope: 'aiUsage', entity: 'history', months }] as const,
  },
  activityStats: {
    current: () => [{ scope: 'activityStats', entity: 'current' }] as const,
  },
  apiKeys: {
    list: () => [{ scope: 'apiKeys', entity: 'list' }] as const,
    detail: (keyId: string) => [{ scope: 'apiKeys', entity: 'detail', keyId }] as const,
  },
  directory: {
    providers: () => [{ scope: 'directory', entity: 'providers' }] as const,
  },
  evals: {
    runs: (filters: { agentName?: string; status?: string; limit?: number; skip?: number } = {}) =>
      [{ scope: 'evals', entity: 'runs', filters }] as const,
    run: (runId: string) => [{ scope: 'evals', entity: 'run', runId }] as const,
    datasets: (filters: { agentName?: string; limit?: number; skip?: number } = {}) =>
      [{ scope: 'evals', entity: 'datasets', filters }] as const,
    dataset: (datasetId: string) => [{ scope: 'evals', entity: 'dataset', datasetId }] as const,
    templates: (filters: { agentName?: string } = {}) =>
      [{ scope: 'evals', entity: 'templates', filters }] as const,
    template: (templateId: string) => [{ scope: 'evals', entity: 'template', templateId }] as const,
    scorers: (filters: { agentName?: string; activityType?: string } = {}) =>
      [{ scope: 'evals', entity: 'scorers', filters }] as const,
    experiment: (experimentId: string) => [{ scope: 'evals', entity: 'experiment', experimentId }] as const,
  },
  minedDeals: {
    list: () => [{ scope: 'minedDeals', entity: 'list' }] as const,
    count: () => [{ scope: 'minedDeals', entity: 'count' }] as const,
  },
};


