import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, Loader2 } from "lucide-react";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function EvalRunsPage() {
  const { getRunsQuery, deleteRun } = useEvalOperations();
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [needsExpectedOutput, setNeedsExpectedOutput] = useState(true); // Default to showing runs that need review
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runsQuery = getRunsQuery({
    agentName: agentFilter || undefined,
    status: statusFilter || undefined,
    limit: 100, // Fetch more since we filter client-side
  });

  const allRuns = runsQuery.data?.runs || [];
  const totalCount = runsQuery.data?.total ?? allRuns.length;

  // Filter runs based on expectedOutput setting
  const runs = useMemo(() => {
    if (!needsExpectedOutput) return allRuns;
    return allRuns.filter((run) => run.expectedOutput === undefined || run.expectedOutput === null);
  }, [allRuns, needsExpectedOutput]);

  const agentOptions = useMemo(() => {
    const set = new Set(allRuns.map((run) => run.agentName).filter(Boolean));
    return Array.from(set);
  }, [allRuns]);

  const handleDeleteClick = (e: React.MouseEvent, runId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setRunToDelete(runId);
  };

  const handleConfirmDelete = async () => {
    if (!runToDelete) return;
    
    setDeletingRunId(runToDelete);
    setRunToDelete(null);
    
    try {
      const result = await deleteRun(runToDelete);
      if (!result.success) {
        setDeleteError(result.error || "Failed to delete run");
      }
    } finally {
      setDeletingRunId(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Filters</h3>
              <p className="text-xs text-gray-500 mt-1">Filter runs by agent and status</p>
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
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

              <select
                className="w-full sm:w-40 border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsExpectedOutput}
                  onChange={(e) => setNeedsExpectedOutput(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span>Needs expected output</span>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">Captured Runs</h3>
                {!runsQuery.isLoading && (
                  <span className="text-xs text-gray-500">
                    {needsExpectedOutput
                      ? `${runs.length} need review (${totalCount} total)`
                      : `${runs.length} runs`}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Click a run to inspect details</p>
            </div>
            <div className="p-4">
              {runsQuery.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}

              {!runsQuery.isLoading && runs.length === 0 && (
                <p className="text-sm text-gray-500">No eval runs found.</p>
              )}

              {!runsQuery.isLoading && runs.length > 0 && (
                <div className="space-y-2">
                  <div className="hidden md:grid grid-cols-7 gap-3 text-xs text-gray-500 border-b border-gray-200 pb-2">
                    <span>Captured</span>
                    <span>Agent</span>
                    <span>Status</span>
                    <span>Model</span>
                    <span>Tokens</span>
                    <span>Latency</span>
                    <span></span>
                  </div>
                  {runs.map((run) => (
                    <div key={run._id} className="group">
                      <Link
                        to={`/admin/evals/runs/${run._id}`}
                        className="w-full text-left block"
                      >
                        <div className="hidden md:grid grid-cols-7 gap-3 text-sm text-gray-900 py-2 hover:bg-gray-50 rounded-md px-2 items-center">
                          <span>{run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}</span>
                          <span>{run.agentName}</span>
                          <span className="capitalize">{run.status}</span>
                          <span>{run.modelName || '—'}</span>
                          <span>{run.usage?.totalTokens ?? '—'}</span>
                          <span>{run.latencyMs ? `${run.latencyMs} ms` : '—'}</span>
                          <span className="flex justify-end">
                            <button
                              onClick={(e) => handleDeleteClick(e, run._id)}
                              disabled={deletingRunId === run._id}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-100"
                              title="Delete run"
                            >
                              {deletingRunId === run._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </span>
                        </div>
                        <div className="md:hidden border border-gray-200 rounded-md p-3 hover:border-gray-300 transition-colors">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">{run.agentName}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 capitalize">{run.status}</span>
                              <button
                                onClick={(e) => handleDeleteClick(e, run._id)}
                                disabled={deletingRunId === run._id}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Delete run"
                              >
                                {deletingRunId === run._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                            <span>{run.modelName || '—'}</span>
                            <span>•</span>
                            <span>{run.usage?.totalTokens ?? '—'} tokens</span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!runToDelete} onOpenChange={(open) => !open && setRunToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Run</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this eval run? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog */}
      <AlertDialog open={!!deleteError} onOpenChange={(open) => !open && setDeleteError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Failed</AlertDialogTitle>
            <AlertDialogDescription>{deleteError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDeleteError(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
