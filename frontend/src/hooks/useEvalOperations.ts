import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';
import {
  EvalDataset,
  EvalRun,
  PromptTemplate,
  EvalScorerDefinition,
  EvalExperiment,
} from '@/types/evals';

interface RunsFilters {
  agentName?: string;
  status?: string;
  limit?: number;
  skip?: number;
}

interface DatasetFilters {
  agentName?: string;
  limit?: number;
  skip?: number;
}

interface CreateDatasetPayload {
  name: string;
  description?: string;
  agentName: string;
  runIds: string[];
}

interface UpdateDatasetPayload {
  name?: string;
  description?: string;
  runIds?: string[];
}

interface CreateTemplatePayload {
  agentName: string;
  version: string;
  template: string;
  description?: string;
}

interface UpdateTemplatePayload {
  agentName?: string;
  version?: string;
  template?: string;
  description?: string;
}

interface MarkGoldenPayload {
  runId: string;
  expectedOutput: any;
  expectedNotes?: string;
}

interface RunExperimentPayload {
  name?: string;
  datasetId: string;
  variants: Array<{ name: string; templateId: string; modelName?: string }>;
  scorers?: string[];
  concurrency?: number;
}

interface ScorersFilters {
  agentName?: string;
  activityType?: string;
}

export function useEvalOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const getRunsQuery = (filters: RunsFilters = {}) => {
    return useQuery({
      queryKey: queryKeys.evals.runs(filters),
      queryFn: async () => {
        const params = new URLSearchParams();
        if (filters.agentName) params.append('agentName', filters.agentName);
        if (filters.status) params.append('status', filters.status);
        if (filters.limit) params.append('limit', String(filters.limit));
        if (filters.skip) params.append('skip', String(filters.skip));

        const endpoint = params.toString() ? `api/evals/runs?${params}` : 'api/evals/runs';
        const { data, error: apiError } = await requestWithAuth(endpoint, 'GET', null);
        if (apiError) throw new Error(apiError);

        // Handle both old format (array) and new format ({ runs, total })
        const responseData = data?.data || data;
        const runs = responseData?.runs || (Array.isArray(responseData) ? responseData : []);
        const total = responseData?.total ?? runs.length;
        return { runs: runs as EvalRun[], total };
      },
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getRunQuery = (runId: string | null) => {
    return useQuery({
      queryKey: queryKeys.evals.run(runId || ''),
      queryFn: async () => {
        if (!runId) throw new Error('No run id provided');
        const { data, error: apiError } = await requestWithAuth(`api/evals/runs/${runId}`, 'GET', null);
        if (apiError) throw new Error(apiError);
        return (data?.data || data) as EvalRun;
      },
      enabled: !!runId,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getDatasetsQuery = (filters: DatasetFilters = {}) => {
    return useQuery({
      queryKey: queryKeys.evals.datasets(filters),
      queryFn: async () => {
        const params = new URLSearchParams();
        if (filters.agentName) params.append('agentName', filters.agentName);
        if (filters.limit) params.append('limit', String(filters.limit));
        if (filters.skip) params.append('skip', String(filters.skip));

        const endpoint = params.toString() ? `api/evals/datasets?${params}` : 'api/evals/datasets';
        const { data, error: apiError } = await requestWithAuth(endpoint, 'GET', null);
        if (apiError) throw new Error(apiError);

        const responseData = data?.data || data;
        const datasets = responseData?.datasets || (Array.isArray(responseData) ? responseData : []);
        const total = responseData?.total ?? datasets.length;
        return { datasets: datasets as EvalDataset[], total };
      },
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getDatasetQuery = (datasetId: string | null) => {
    return useQuery({
      queryKey: queryKeys.evals.dataset(datasetId || ''),
      queryFn: async () => {
        if (!datasetId) throw new Error('No dataset id provided');
        const { data, error: apiError } = await requestWithAuth(`api/evals/datasets/${datasetId}`, 'GET', null);
        if (apiError) throw new Error(apiError);
        return (data?.data || data) as EvalDataset;
      },
      enabled: !!datasetId,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getTemplatesQuery = (filters: { agentName?: string } = {}) => {
    return useQuery({
      queryKey: queryKeys.evals.templates(filters),
      queryFn: async () => {
        const params = new URLSearchParams();
        if (filters.agentName) params.append('agentName', filters.agentName);

        const endpoint = params.toString() ? `api/evals/templates?${params}` : 'api/evals/templates';
        const { data, error: apiError } = await requestWithAuth(endpoint, 'GET', null);
        if (apiError) throw new Error(apiError);

        const templatesData = Array.isArray(data) ? data : (data?.data || []);
        return templatesData as PromptTemplate[];
      },
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getTemplateQuery = (templateId: string | null) => {
    return useQuery({
      queryKey: queryKeys.evals.template(templateId || ''),
      queryFn: async () => {
        if (!templateId) throw new Error('No template id provided');
        const { data, error: apiError } = await requestWithAuth(`api/evals/templates/${templateId}`, 'GET', null);
        if (apiError) throw new Error(apiError);
        return (data?.data || data) as PromptTemplate;
      },
      enabled: !!templateId,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getScorersQuery = (filters: ScorersFilters = {}) => {
    return useQuery({
      queryKey: queryKeys.evals.scorers(filters),
      queryFn: async () => {
        const params = new URLSearchParams();
        if (filters.agentName) params.append('agentName', filters.agentName);
        if (filters.activityType) params.append('activityType', filters.activityType);

        const endpoint = params.toString() ? `api/evals/scorers?${params}` : 'api/evals/scorers';
        const { data, error: apiError } = await requestWithAuth(endpoint, 'GET', null);
        if (apiError) throw new Error(apiError);

        const scorersData = Array.isArray(data) ? data : (data?.data || []);
        return scorersData as EvalScorerDefinition[];
      },
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const getExperimentQuery = (experimentId: string | null) => {
    return useQuery({
      queryKey: queryKeys.evals.experiment(experimentId || ''),
      queryFn: async () => {
        if (!experimentId) throw new Error('No experiment id provided');
        const { data, error: apiError } = await requestWithAuth(
          `api/evals/experiments/${experimentId}`,
          'GET',
          null
        );
        if (apiError) throw new Error(apiError);
        return (data?.data || data) as EvalExperiment;
      },
      enabled: !!experimentId,
      refetchInterval: (query) => {
        const status = (query.state.data as EvalExperiment | undefined)?.status;
        if (!status || status === 'pending' || status === 'running') {
          return 2000;
        }
        return false;
      },
      staleTime: 2 * 1000,
      gcTime: 10 * 60 * 1000,
    });
  };

  const createDatasetMutation = useMutation({
    mutationFn: async (payload: CreateDatasetPayload) => {
      const { data, error: apiError } = await requestWithAuth('api/evals/datasets', 'POST', payload);
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as EvalDataset;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });

      const previous = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });
      const optimisticDataset: EvalDataset = {
        _id: `optimistic-${Date.now()}`,
        organization: '',
        name: payload.name,
        description: payload.description,
        agentName: payload.agentName,
        runIds: payload.runIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'datasets' }] }, (old: any) => {
        if (!old) {
          return { datasets: [optimisticDataset], total: 1 };
        }
        if (Array.isArray(old)) {
          return [optimisticDataset, ...old];
        }
        const datasets = Array.isArray(old.datasets) ? old.datasets : [];
        return {
          ...old,
          datasets: [optimisticDataset, ...datasets],
          total: (old.total ?? datasets.length) + 1,
        };
      });

      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });
    },
  });

  const updateDatasetMutation = useMutation({
    mutationFn: async ({ datasetId, payload }: { datasetId: string; payload: UpdateDatasetPayload }) => {
      const { data, error: apiError } = await requestWithAuth(`api/evals/datasets/${datasetId}`, 'PUT', payload);
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as EvalDataset;
    },
    onMutate: async ({ datasetId, payload }) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });
      await queryClient.cancelQueries({ queryKey: queryKeys.evals.dataset(datasetId) });

      const previousDatasets = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });
      const previousDataset = queryClient.getQueryData(queryKeys.evals.dataset(datasetId));

      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'datasets' }] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((dataset: EvalDataset) =>
            dataset._id === datasetId ? { ...dataset, ...payload, updatedAt: new Date().toISOString() } : dataset
          );
        }
        const datasets = Array.isArray(old.datasets) ? old.datasets : [];
        return {
          ...old,
          datasets: datasets.map((dataset: EvalDataset) =>
            dataset._id === datasetId ? { ...dataset, ...payload, updatedAt: new Date().toISOString() } : dataset
          ),
        };
      });

      queryClient.setQueryData(queryKeys.evals.dataset(datasetId), (old: EvalDataset | undefined) => {
        if (!old) return old;
        return { ...old, ...payload, updatedAt: new Date().toISOString() };
      });

      return { previousDatasets, previousDataset };
    },
    onError: (_err, { datasetId }, context) => {
      if (context?.previousDatasets) {
        context.previousDatasets.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousDataset) {
        queryClient.setQueryData(queryKeys.evals.dataset(datasetId), context.previousDataset);
      }
    },
    onSettled: (_data, _error, { datasetId }) => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'datasets' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.evals.dataset(datasetId) });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (payload: CreateTemplatePayload) => {
      const { data, error: apiError } = await requestWithAuth('api/evals/templates', 'POST', payload);
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as PromptTemplate;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'templates' }] });

      const previous = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'templates' }] });
      const optimisticTemplate: PromptTemplate = {
        _id: `optimistic-${Date.now()}`,
        organization: '',
        agentName: payload.agentName,
        version: payload.version,
        template: payload.template,
        description: payload.description,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'templates' }] }, (old: any) => {
        if (!old || !Array.isArray(old)) return [optimisticTemplate];
        return [optimisticTemplate, ...old];
      });

      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'templates' }] });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, payload }: { templateId: string; payload: UpdateTemplatePayload }) => {
      const { data, error: apiError } = await requestWithAuth(`api/evals/templates/${templateId}`, 'PUT', payload);
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as PromptTemplate;
    },
    onMutate: async ({ templateId, payload }) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'templates' }] });
      await queryClient.cancelQueries({ queryKey: queryKeys.evals.template(templateId) });

      const previousTemplates = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'templates' }] });
      const previousTemplate = queryClient.getQueryData(queryKeys.evals.template(templateId));

      // Update templates list
      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'templates' }] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((t: PromptTemplate) =>
          t._id === templateId ? { ...t, ...payload, updatedAt: new Date().toISOString() } : t
        );
      });

      // Update individual template cache
      queryClient.setQueryData(queryKeys.evals.template(templateId), (old: PromptTemplate | undefined) => {
        if (!old) return old;
        return { ...old, ...payload, updatedAt: new Date().toISOString() };
      });

      return { previousTemplates, previousTemplate };
    },
    onError: (_err, { templateId }, context) => {
      if (context?.previousTemplates) {
        context.previousTemplates.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousTemplate) {
        queryClient.setQueryData(queryKeys.evals.template(templateId), context.previousTemplate);
      }
    },
    onSettled: (_data, _error, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'templates' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.evals.template(templateId) });
    },
  });

  const markGoldenMutation = useMutation({
    mutationFn: async (payload: MarkGoldenPayload) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/evals/runs/${payload.runId}/mark-golden`,
        'POST',
        {
          expectedOutput: payload.expectedOutput,
          expectedNotes: payload.expectedNotes,
        }
      );
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as EvalRun;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'runs' }] });
      await queryClient.cancelQueries({ queryKey: queryKeys.evals.run(payload.runId) });

      const previousRuns = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'runs' }] });
      const previousRun = queryClient.getQueryData(queryKeys.evals.run(payload.runId));

      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'runs' }] }, (old: any) => {
        if (!old) return old;
        // Handle new format { runs, total }
        if (old.runs && Array.isArray(old.runs)) {
          return {
            ...old,
            runs: old.runs.map((run: EvalRun) =>
              run._id === payload.runId
                ? { ...run, expectedOutput: payload.expectedOutput, expectedNotes: payload.expectedNotes }
                : run
            ),
          };
        }
        // Handle old format (array)
        if (Array.isArray(old)) {
          return old.map((run: EvalRun) =>
            run._id === payload.runId
              ? { ...run, expectedOutput: payload.expectedOutput, expectedNotes: payload.expectedNotes }
              : run
          );
        }
        return old;
      });

      queryClient.setQueryData(queryKeys.evals.run(payload.runId), (old: EvalRun | undefined) => {
        if (!old) return old;
        return { ...old, expectedOutput: payload.expectedOutput, expectedNotes: payload.expectedNotes };
      });

      return { previousRuns, previousRun };
    },
    onError: (_err, payload, context) => {
      if (context?.previousRuns) {
        context.previousRuns.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousRun) {
        queryClient.setQueryData(queryKeys.evals.run(payload.runId), context.previousRun);
      }
    },
    onSettled: (_data, _error, payload) => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'runs' }] });
      queryClient.invalidateQueries({ queryKey: queryKeys.evals.run(payload.runId) });
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/evals/runs/${runId}`,
        'DELETE',
        null
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (runId) => {
      await queryClient.cancelQueries({ queryKey: [{ scope: 'evals', entity: 'runs' }] });

      const previousRuns = queryClient.getQueriesData({ queryKey: [{ scope: 'evals', entity: 'runs' }] });

      queryClient.setQueriesData({ queryKey: [{ scope: 'evals', entity: 'runs' }] }, (old: any) => {
        if (!old) return old;
        // Handle new format { runs, total }
        if (old.runs && Array.isArray(old.runs)) {
          return {
            ...old,
            runs: old.runs.filter((run: EvalRun) => run._id !== runId),
            total: Math.max(0, (old.total || old.runs.length) - 1),
          };
        }
        // Handle old format (array)
        if (Array.isArray(old)) {
          return old.filter((run: EvalRun) => run._id !== runId);
        }
        return old;
      });

      return { previousRuns };
    },
    onError: (_err, _runId, context) => {
      if (context?.previousRuns) {
        context.previousRuns.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'evals', entity: 'runs' }] });
    },
  });

  const runExperimentMutation = useMutation({
    mutationFn: async (payload: RunExperimentPayload) => {
      const { data, error: apiError } = await requestWithAuth('api/evals/experiments', 'POST', payload);
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as { experimentId: string };
    },
  });

  const createDataset = async (payload: CreateDatasetPayload) => {
    setError(null);
    try {
      const data = await createDatasetMutation.mutateAsync(payload);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create dataset';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateDataset = async (datasetId: string, payload: UpdateDatasetPayload) => {
    setError(null);
    try {
      const data = await updateDatasetMutation.mutateAsync({ datasetId, payload });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update dataset';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const createTemplate = async (payload: CreateTemplatePayload) => {
    setError(null);
    try {
      const data = await createTemplateMutation.mutateAsync(payload);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create template';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateTemplate = async (templateId: string, payload: UpdateTemplatePayload) => {
    setError(null);
    try {
      const data = await updateTemplateMutation.mutateAsync({ templateId, payload });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update template';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const markGoldenRun = async (payload: MarkGoldenPayload) => {
    setError(null);
    try {
      const data = await markGoldenMutation.mutateAsync(payload);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to mark golden run';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteRun = async (runId: string) => {
    setError(null);
    try {
      await deleteRunMutation.mutateAsync(runId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete run';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const runExperiment = async (payload: RunExperimentPayload) => {
    setError(null);
    try {
      const data = await runExperimentMutation.mutateAsync(payload);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run experiment';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    getRunsQuery,
    getRunQuery,
    getDatasetsQuery,
    getDatasetQuery,
    getTemplatesQuery,
    getTemplateQuery,
    getScorersQuery,
    getExperimentQuery,
    isCreatingDataset: createDatasetMutation.isPending,
    isUpdatingDataset: updateDatasetMutation.isPending,
    isCreatingTemplate: createTemplateMutation.isPending,
    isUpdatingTemplate: updateTemplateMutation.isPending,
    isMarkingGolden: markGoldenMutation.isPending,
    isDeletingRun: deleteRunMutation.isPending,
    isRunningExperiment: runExperimentMutation.isPending,
    createDataset,
    updateDataset,
    createTemplate,
    updateTemplate,
    markGoldenRun,
    deleteRun,
    runExperiment,
    error,
    clearError: () => setError(null),
  };
}
