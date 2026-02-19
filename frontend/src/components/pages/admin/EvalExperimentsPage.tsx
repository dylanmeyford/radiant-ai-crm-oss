import { useEffect, useMemo, useState } from "react";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EvalScorerResult, ExperimentResult, PromptTemplate } from "@/types/evals";
import { ScoredJsonViewer } from "@/components/admin/eval/ScoredJsonViewer";

const modelOptions = ['gpt-5', 'gpt-4o', 'gpt-4o-mini'];

export default function EvalExperimentsPage() {
  const {
    getDatasetsQuery,
    getTemplatesQuery,
    getScorersQuery,
    getExperimentQuery,
    runExperiment,
    isRunningExperiment,
  } = useEvalOperations();
  const datasetsQuery = getDatasetsQuery({ limit: 200 });
  const templatesQuery = getTemplatesQuery();

  const [datasetId, setDatasetId] = useState('');
  const [baselineTemplateId, setBaselineTemplateId] = useState('');
  const [experimentTemplateId, setExperimentTemplateId] = useState('');
  const [baselineModel, setBaselineModel] = useState('gpt-5');
  const [experimentModel, setExperimentModel] = useState('gpt-5');
  const [selectedScorers, setSelectedScorers] = useState<string[]>(['actionTypeMatch']);
  const [concurrency, setConcurrency] = useState(3);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const datasets = datasetsQuery.data?.datasets || [];
  const selectedDataset = datasets.find((dataset) => dataset._id === datasetId);
  const templates = templatesQuery.data || [];
  const scorersQuery = getScorersQuery({ agentName: selectedDataset?.agentName });
  const availableScorers = scorersQuery.data || [];
  const experimentQuery = getExperimentQuery(experimentId);
  const experiment = experimentQuery.data;

  useEffect(() => {
    if (!availableScorers.length) {
      setSelectedScorers([]);
      return;
    }
    setSelectedScorers((prev) => {
      const validSelections = prev.filter((id) => availableScorers.some((scorer) => scorer.key === id));
      if (validSelections.length) {
        return validSelections;
      }
      return [availableScorers[0].key];
    });
  }, [availableScorers]);

  useEffect(() => {
    if (!experiment) return;
    if (experiment.status === 'failed') {
      setError(experiment.error || 'Experiment failed');
      return;
    }
    if (experiment.status === 'completed') {
      setResult({
        experimentId: experiment._id,
        name: experiment.name,
        results: experiment.results || {},
        comparison: experiment.comparison,
      });
    }
  }, [experiment]);

  const availableTemplates = useMemo(() => {
    if (!selectedDataset) return templates;
    return templates.filter((template) => template.agentName === selectedDataset.agentName);
  }, [templates, selectedDataset]);

  const handleRun = async () => {
    if (!datasetId || !baselineTemplateId || !experimentTemplateId) {
      setError('Select a dataset and both templates.');
      return;
    }
    setError(null);
    setResult(null);
    const response = await runExperiment({
      name: 'Prompt Experiment',
      datasetId,
      variants: [
        { name: 'baseline', templateId: baselineTemplateId, modelName: baselineModel },
        { name: 'experiment', templateId: experimentTemplateId, modelName: experimentModel },
      ],
      scorers: selectedScorers,
      concurrency,
    });
    if (!response.success) {
      setError(response.error || 'Failed to run experiment');
      return;
    }
    setExperimentId((response.data as { experimentId: string }).experimentId);
  };

  const renderVariantCard = (variantName: string, variant: ExperimentResult['results'][string]) => {
    return (
      <div key={variantName} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 capitalize">{variantName}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Model: {variant.modelName || 'default'}
          </p>
        </div>
        <div className="p-4 space-y-2 text-sm text-gray-900">
          {Object.entries(variant.avgScores || {}).map(([scorer, score]) => (
            <div key={scorer} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{scorer}</span>
              <span>{(score * 100).toFixed(1)}%</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Avg latency</span>
            <span>{Math.round(variant.avgLatency)} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Avg tokens</span>
            <span>{Math.round(variant.avgTokens)}</span>
          </div>
        </div>
      </div>
    );
  };

  const getActionType = (value: any) => {
    const type = value?.actions?.[0]?.type;
    return typeof type === 'string' ? type : '—';
  };

  const getScoreDetails = (scores?: Record<string, EvalScorerResult>) => {
    if (!scores) return undefined;
    const scorerWithDetails = Object.values(scores).find((score) => score?.details);
    return scorerWithDetails?.details;
  };

  const comparisonRows = useMemo(() => {
    if (!result) return [];
    const variantNames = Object.keys(result.results || {});
    const rowsByRun: Record<string, any> = {};

    variantNames.forEach((variantName) => {
      const perRun = result.results[variantName]?.perRun || [];
      perRun.forEach((entry) => {
        if (!rowsByRun[entry.runId]) {
          rowsByRun[entry.runId] = {
            runId: entry.runId,
            expectedOutput: entry.expectedOutput,
            variants: {},
          };
        }
        rowsByRun[entry.runId].variants[variantName] = entry;
      });
    });

    return Object.values(rowsByRun);
  }, [result]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Run Experiment</h3>
              <p className="text-xs text-gray-500 mt-1">Compare prompt variants on a dataset</p>
            </div>
            <div className="p-4 space-y-4">
              {(datasetsQuery.isLoading || templatesQuery.isLoading) && (
                <Skeleton className="h-10 w-full" />
              )}
              {!datasetsQuery.isLoading && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Dataset</label>
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={datasetId}
                    onChange={(e) => {
                      setDatasetId(e.target.value);
                      setBaselineTemplateId('');
                      setExperimentTemplateId('');
                      setResult(null);
                      setExperimentId(null);
                    }}
                  >
                    <option value="">Select dataset</option>
                    {datasets.map((dataset) => (
                      <option key={dataset._id} value={dataset._id}>
                        {dataset.name} · {dataset.agentName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Baseline Template</label>
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={baselineTemplateId}
                    onChange={(e) => setBaselineTemplateId(e.target.value)}
                  >
                    <option value="">Select template</option>
                    {availableTemplates.map((template: PromptTemplate) => (
                      <option key={template._id} value={template._id}>
                        {template.version}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-gray-500">Baseline Model</label>
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={baselineModel}
                    onChange={(e) => setBaselineModel(e.target.value)}
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Experiment Template</label>
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={experimentTemplateId}
                    onChange={(e) => setExperimentTemplateId(e.target.value)}
                  >
                    <option value="">Select template</option>
                    {availableTemplates.map((template: PromptTemplate) => (
                      <option key={template._id} value={template._id}>
                        {template.version}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-gray-500">Experiment Model</label>
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={experimentModel}
                    onChange={(e) => setExperimentModel(e.target.value)}
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500">Scorers</label>
                <div className="flex flex-wrap gap-3">
                  {scorersQuery.isLoading && <Skeleton className="h-6 w-40" />}
                  {!scorersQuery.isLoading && availableScorers.length === 0 && (
                    <p className="text-xs text-gray-500">No scorers available for this agent.</p>
                  )}
                  {!scorersQuery.isLoading && availableScorers.map((scorer) => (
                    <label key={scorer.key} className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="checkbox"
                        checked={selectedScorers.includes(scorer.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedScorers((prev) => [...prev, scorer.key]);
                          } else {
                            setSelectedScorers((prev) => prev.filter((id) => id !== scorer.key));
                          }
                        }}
                      />
                      <span>{scorer.name}</span>
                      {scorer.isLLMBased && (
                        <span className="text-xs text-gray-500">(LLM)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              {(experiment?.status === 'pending' || experiment?.status === 'running') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Running {experiment.progress?.currentVariant || 'experiment'}...
                    </span>
                    <span>
                      {experiment.progress?.current || 0} / {experiment.progress?.total || 0}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-gray-900 transition-all"
                      style={{
                        width: experiment.progress?.total
                          ? `${Math.round((experiment.progress.current / experiment.progress.total) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleRun}
                disabled={isRunningExperiment || experiment?.status === 'running'}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                {isRunningExperiment || experiment?.status === 'running' ? 'Running...' : 'Run Experiment'}
              </Button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">Results</h3>
                <span className="text-xs text-gray-500">
                  Winner: {result.comparison?.winner || '—'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(result.results || {}).map(([variantName, variant]) =>
                  renderVariantCard(variantName, variant)
                )}
              </div>

              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Per-run comparison</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Expected output vs each prompt output and scorer results
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {comparisonRows.length === 0 && (
                    <p className="text-sm text-gray-500">No per-run results available.</p>
                  )}
                  {comparisonRows.length > 0 && (
                    <div className="space-y-2">
                      <div className="hidden md:grid grid-cols-5 gap-3 text-xs text-gray-500 border-b border-gray-200 pb-2">
                        <span>Run</span>
                        <span>Expected</span>
                        <span>Baseline</span>
                        <span>Experiment</span>
                        <span>Scores</span>
                      </div>
                      {comparisonRows.map((row: any) => {
                        const baseline = row.variants?.baseline;
                        const experiment = row.variants?.experiment;
                        const expectedType = getActionType(row.expectedOutput);
                        const baselineType = getActionType(baseline?.output);
                        const experimentType = getActionType(experiment?.output);
                        const baselineScore = baseline?.scores?.actionTypeMatch?.score;
                        const experimentScore = experiment?.scores?.actionTypeMatch?.score;
                        const baselineDetails = getScoreDetails(baseline?.scores);
                        const experimentDetails = getScoreDetails(experiment?.scores);

                        return (
                          <div key={row.runId} className="border border-gray-200 rounded-md p-3 space-y-2">
                            <div className="hidden md:grid grid-cols-5 gap-3 text-sm text-gray-900">
                              <span className="truncate">{row.runId}</span>
                              <span>{expectedType}</span>
                              <span>{baselineType}</span>
                              <span>{experimentType}</span>
                              <span>
                                baseline: {baselineScore != null ? `${(baselineScore * 100).toFixed(1)}%` : '—'} | experiment: {experimentScore != null ? `${(experimentScore * 100).toFixed(1)}%` : '—'}
                              </span>
                            </div>
                            <div className="md:hidden space-y-1 text-sm text-gray-900">
                              <div className="text-xs text-gray-500">Run</div>
                              <div className="truncate">{row.runId}</div>
                              <div className="text-xs text-gray-500">Expected</div>
                              <div>{expectedType}</div>
                              <div className="text-xs text-gray-500">Baseline</div>
                              <div>{baselineType}</div>
                              <div className="text-xs text-gray-500">Experiment</div>
                              <div>{experimentType}</div>
                            </div>

                            <details className="text-xs text-gray-700">
                              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                                View outputs
                              </summary>
                              <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-3">
                                <div className="bg-gray-50 rounded-md p-2">
                                  <p className="text-xs text-gray-500 mb-1">Expected</p>
                                  <ScoredJsonViewer value={row.expectedOutput || {}} />
                                </div>
                                <div className="bg-gray-50 rounded-md p-2">
                                  <p className="text-xs text-gray-500 mb-1">Baseline output</p>
                                  <ScoredJsonViewer value={baseline?.output || {}} scoreDetails={baselineDetails} />
                                </div>
                                <div className="bg-gray-50 rounded-md p-2">
                                  <p className="text-xs text-gray-500 mb-1">Experiment output</p>
                                  <ScoredJsonViewer value={experiment?.output || {}} scoreDetails={experimentDetails} />
                                </div>
                              </div>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
