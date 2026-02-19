import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, ListChecks, Layers, FileCode, BarChart3 } from "lucide-react";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function EvalDashboardPage() {
  const { getRunsQuery, getDatasetsQuery, getTemplatesQuery } = useEvalOperations();

  const runsQuery = getRunsQuery({ limit: 10 });
  const datasetsQuery = getDatasetsQuery({ limit: 10 });
  const templatesQuery = getTemplatesQuery();

  const totalRuns = runsQuery.data?.total ?? 0;
  const totalDatasets = datasetsQuery.data?.total ?? 0;
  const totalTemplates = templatesQuery.data?.length ?? 0;

  const recentRun = useMemo(() => runsQuery.data?.runs?.[0], [runsQuery.data]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Eval Overview</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Track runs, datasets, and templates</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Captured Runs</p>
                {runsQuery.isLoading ? (
                  <Skeleton className="h-6 w-16 mt-1" />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">{totalRuns}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Datasets</p>
                {datasetsQuery.isLoading ? (
                  <Skeleton className="h-6 w-16 mt-1" />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">{totalDatasets}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Templates</p>
                {templatesQuery.isLoading ? (
                  <Skeleton className="h-6 w-16 mt-1" />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">{totalTemplates}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Runs</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Review captured agent runs</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-900">Inspect captured prompts and outputs.</p>
                <Button asChild className="bg-gray-900 text-white hover:bg-gray-800">
                  <Link to="/admin/evals/runs">View Runs</Link>
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Datasets</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Group runs into test sets</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-900">Create datasets to replay and compare.</p>
                <Button asChild className="bg-gray-900 text-white hover:bg-gray-800">
                  <Link to="/admin/evals/datasets">Manage Datasets</Link>
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Templates</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Version and test prompts</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-900">Create prompt versions for experiments.</p>
                <Button asChild className="bg-gray-900 text-white hover:bg-gray-800">
                  <Link to="/admin/evals/templates">Manage Templates</Link>
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Experiments</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Compare prompt variants</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-900">Run evals across datasets and scorers.</p>
                <Button asChild className="bg-gray-900 text-white hover:bg-gray-800">
                  <Link to="/admin/evals/experiments">Run Experiments</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Recent Activity</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Latest captured run</p>
            </div>
            <div className="p-4">
              {runsQuery.isLoading && <Skeleton className="h-6 w-full" />}
              {!runsQuery.isLoading && !recentRun && (
                <p className="text-sm text-gray-500">No eval runs captured yet.</p>
              )}
              {!runsQuery.isLoading && recentRun && (
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-gray-900">{recentRun.agentName}</p>
                    <p className="text-xs text-gray-500">
                      {recentRun.createdAt ? new Date(recentRun.createdAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">{recentRun.modelName || 'model unknown'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
