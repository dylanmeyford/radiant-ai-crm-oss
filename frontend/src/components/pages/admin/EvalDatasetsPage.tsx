import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Layers, ChevronRight } from "lucide-react";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { usePageActions } from "@/context/PageActionsContext";
import { Skeleton } from "@/components/ui/skeleton";

export default function EvalDatasetsPage() {
  const navigate = useNavigate();
  const { setActions, clearActions } = usePageActions();
  const { getDatasetsQuery } = useEvalOperations();

  const datasetsQuery = getDatasetsQuery({ limit: 100 });

  useEffect(() => {
    setActions([
      {
        id: 'create-dataset',
        label: 'Create Dataset',
        icon: Plus,
        onClick: () => navigate('/admin/evals/datasets/new'),
        variant: 'default',
      },
    ]);

    return () => {
      clearActions();
    };
  }, [setActions, clearActions, navigate]);

  const datasets = datasetsQuery.data?.datasets || [];

  const agentOptions = useMemo(() => {
    const set = new Set(datasets.map((dataset) => dataset.agentName).filter(Boolean));
    return Array.from(set);
  }, [datasets]);

  const [agentFilter, setAgentFilter] = useState("");
  const filteredDatasets = useMemo(() => {
    if (!agentFilter) return datasets;
    return datasets.filter((dataset) => dataset.agentName === agentFilter);
  }, [datasets, agentFilter]);

  const openDataset = (datasetId: string) => {
    navigate(`/admin/evals/datasets/${datasetId}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Filters</h3>
              <p className="text-xs text-gray-500 mt-1">Filter datasets by agent</p>
            </div>
            <div className="p-4">
              <select
                className="w-full sm:w-56 border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              >
                <option value="">All agents</option>
                {agentOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {datasetsQuery.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {!datasetsQuery.isLoading && filteredDatasets.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">No datasets found.</p>
              </div>
            )}

            {!datasetsQuery.isLoading &&
              filteredDatasets.map((dataset) => {
                const runCount = dataset.runIds?.length || 0;
                return (
                  <div
                    key={dataset._id}
                    className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <button
                      className="w-full text-left hover:bg-gray-50 transition-colors"
                      onClick={() => openDataset(dataset._id)}
                    >
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-gray-600" />
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">{dataset.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{dataset.description || 'No description'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-xs text-gray-500">{dataset.agentName}</p>
                            <p className="text-xs text-gray-500">{runCount} runs</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
